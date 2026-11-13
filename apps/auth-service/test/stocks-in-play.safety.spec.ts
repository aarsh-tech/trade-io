import { Logger } from '@nestjs/common';
import { sendAlert } from '../src/common/utils/alert';
import { OrderGateway } from '../src/order-gateway/order-gateway.service';
import { buildOrderTag } from '../src/order-gateway/order-rules';
import { getIstDateStr } from '../src/strategy/emavwap-signals';
import { StocksInPlayEngine } from '../src/strategy/stocks-in-play.engine';
import { registerSymbolHolder, unregisterSymbolHolder } from '../src/strategy/symbol-claims';

/**
 * Safety behaviour of the Stocks-in-Play engine against a fake Zerodha. The real engine and the real OrderGateway run;
 * only the broker and the database are replaced. Nothing here can reach a broker.
 */
jest.mock('../src/common/utils/alert', () => ({ sendAlert: jest.fn().mockResolvedValue(undefined) }));
// The engine's signal log goes to a temp folder, never into the app's logs/.
process.env.SIGNAL_LOG_DIR = require('path').join(require('os').tmpdir(), `sip-safety-spec-${process.pid}`);
jest.setTimeout(40_000);

const SID = 'strategyabc12345';
const ENTRY_TAG = buildOrderTag(SID, 'ENTRY');
const at = (hhmm: string) => new Date(`${getIstDateStr(new Date())}T${hhmm}:00.000+05:30`);
const TEN = () => at('10:00');
const FAR_FUTURE = Number.MAX_SAFE_INTEGER;

interface Opts {
  entryFill?: number;
  exitFill?: number;
  entryPartial?: number;
  entryStatus?: string;
  /** The order reaches Zerodha but the reply is lost. */
  replyLost?: boolean;
  /** The placement throws and nothing reaches Zerodha. */
  placeThrows?: string;
  /** A lost-reply entry stays resting, unfilled. */
  entryRests?: boolean;
  exitThrows?: boolean;
  cancelFails?: boolean;
  modifyFails?: boolean;
  slRejected?: boolean;
  slRejectOnce?: boolean;
  /** Order book reads fail. */
  ordersThrow?: boolean;
  /** Order book reads succeed but are empty. */
  hideBook?: boolean;
  positionsThrow?: boolean;
  marginThrows?: boolean;
  cash?: number;
  killSwitch?: boolean;
  config?: Record<string, unknown>;
}

function makeWorld(o: Opts = {}) {
  const b: any = { orders: [], net: {} as Record<string, number>, seq: 0, placed: [] as any[], cancels: 0, o };
  const mk = (p: any, status: string, filled: number, avg: number) => {
    b.seq++;
    return { order_id: `O${b.seq}`, tradingsymbol: p.symbol, exchange: 'NSE', product: 'MIS', order_type: p.orderType, transaction_type: p.side, status, quantity: p.qty, filled_quantity: filled, average_price: avg, price: p.price || 0, trigger_price: p.triggerPrice || 0, tag: p.tag, status_message: status === 'REJECTED' ? 'RMS rejected' : undefined };
  };
  const fill = (s: string, side: string, q: number) => {
    b.net[s] = (b.net[s] || 0) + (side === 'BUY' ? q : -q);
    if (b.net[s] === 0) delete b.net[s];
  };
  const client: any = {
    placeOrder: async (p: any) => {
      b.placed.push({ ...p });
      if (p.intent === 'ENTRY' && b.o.replyLost) {
        const rests = b.o.entryRests;
        b.orders.push(mk(p, rests ? 'OPEN' : 'COMPLETE', rests ? 0 : p.qty, rests ? 0 : b.o.entryFill || 100));
        if (!rests) fill(p.symbol, p.side, p.qty);
        throw new Error('timeout of 15000ms exceeded');
      }
      if (p.intent === 'ENTRY' && b.o.placeThrows) throw new Error(b.o.placeThrows);
      if (p.orderType === 'SL') {
        const rej = b.o.slRejected || (b.o.slRejectOnce && !b.rejectedOnce);
        if (b.o.slRejectOnce) b.rejectedOnce = true;
        const x = mk(p, rej ? 'REJECTED' : 'TRIGGER PENDING', 0, 0);
        b.orders.push(x);
        return x.order_id;
      }
      if (p.intent === 'EXIT') {
        if (b.o.exitThrows) throw new Error('exit refused');
        const x = mk(p, 'COMPLETE', p.qty, b.o.exitFill || 101);
        b.orders.push(x);
        fill(p.symbol, p.side, p.qty);
        return x.order_id;
      }
      const part = b.o.entryPartial;
      const qty = part != null ? part : p.qty;
      const status = b.o.entryStatus || (part != null ? 'OPEN' : 'COMPLETE');
      const rejected = status === 'REJECTED';
      const x = mk(p, status, rejected ? 0 : qty, rejected ? 0 : b.o.entryFill || 100);
      b.orders.push(x);
      if (!rejected) fill(p.symbol, p.side, qty);
      return x.order_id;
    },
    cancelOrder: async (id: string) => {
      b.cancels++;
      if (b.o.cancelFails) throw new Error('cancel refused');
      const x = b.orders.find((y: any) => y.order_id === id);
      if (x && x.status !== 'COMPLETE') x.status = 'CANCELLED';
    },
    modifyOrder: async (id: string, m: any) => {
      const x = b.orders.find((y: any) => y.order_id === id);
      if (b.o.modifyFails || !x || x.status === 'REJECTED') throw new Error('modify refused');
      if (m.triggerPrice) x.trigger_price = m.triggerPrice;
      if (m.quantity) x.quantity = m.quantity;
    },
    getLTP: async (keys: string[]) => Object.fromEntries(keys.map((k) => [k, 100])),
    getMargins: async () => {
      if (b.o.marginThrows) throw new Error('margins down');
      return { equity: { available: { live_balance: b.o.cash ?? 100000 } } };
    },
    getOrders: async () => {
      if (b.o.ordersThrow) throw new Error('orders down');
      return b.orders.map((x: any) => ({ orderId: x.order_id, symbol: x.tradingsymbol, exchange: 'NSE', type: x.order_type, side: x.transaction_type, product: 'MIS', status: x.status, qty: x.quantity, filledQty: x.filled_quantity, price: x.price, triggerPrice: x.trigger_price, avgPrice: x.average_price, tag: x.tag, orderTime: new Date().toISOString() }));
    },
    getTickSize: async () => 0.05,
    getInstruments: async () => { throw new Error('no instruments in tests'); },
  };
  client.kite = {
    getOrders: async () => {
      if (b.o.ordersThrow) throw new Error('orders down');
      return b.o.hideBook ? [] : b.orders;
    },
    getPositions: async () => {
      if (b.o.positionsThrow) throw new Error('positions down');
      return { net: Object.entries(b.net).map(([s, q]) => ({ tradingsymbol: s, quantity: q, exchange: 'NSE', product: 'MIS', average_price: b.o.entryFill || 100 })), day: [] };
    },
    getMargins: client.getMargins,
    getInstruments: client.getInstruments,
  };
  const rows: any[] = [];
  const user = { id: 'u1', maxOrderValue: null, maxOrderQty: null, killSwitchActive: !!o.killSwitch };
  const account = { id: 'acct1', userId: 'u1', accessToken: 'tok', broker: 'ZERODHA' };
  const strategy = { id: SID, userId: 'u1', name: 'SIP', brokerAccountId: 'acct1', isPaperTrade: false, config: JSON.stringify(o.config || { stopLossRs: 500, setup: 'FADE', maxPositions: 1 }), brokerAccount: account };
  const prisma: any = {
    user: { findUnique: async () => user },
    brokerAccount: { findUnique: async () => account, findFirst: async () => account },
    strategy: { findUnique: async () => strategy, update: async () => ({}) },
    strategyExecution: { updateMany: async () => ({}), create: async () => ({ id: 'exec1' }), update: async () => ({}), findFirst: async () => null, findMany: async () => [] },
    order: {
      findMany: async ({ where }: any) => rows.filter((r) => where.isPaperTrade === undefined || r.isPaperTrade === where.isPaperTrade),
      findFirst: async ({ where }: any) => rows.find((r) => r.isPaperTrade === where.isPaperTrade && (!where.side || r.side === where.side)) || null,
      upsert: async ({ create }: any) => { rows.push({ ...create, createdAt: new Date() }); return create; },
      create: async ({ data }: any) => { rows.push({ ...data, createdAt: new Date() }); return data; },
      updateMany: async () => ({}),
    },
  };
  const factory: any = { createClient: () => client };
  const gateway = new OrderGateway(prisma, factory);
  const orderListeners: ((accountId: string, u: any) => void)[] = [];
  const ticker: any = { subscribeSymbol: async () => undefined, registerListener: () => () => undefined, registerOrderListener: (cb: any) => { orderListeners.push(cb); return () => undefined; } };
  /** Sends a Kite websocket order postback to the engine. */
  const push = (u: any) => orderListeners.forEach((cb) => cb('acct1', u));
  const engine: any = new StocksInPlayEngine(prisma, factory, ticker, gateway);
  const stops = () => b.orders.filter((x: any) => x.order_type === 'SL');
  const workingStops = () => stops().filter((x: any) => x.status === 'TRIGGER PENDING');
  const exitOrders = () => b.placed.filter((x: any) => x.intent === 'EXIT');
  const entryOrders = () => b.placed.filter((x: any) => x.intent === 'ENTRY');
  return { b, client, rows, engine, user, mk, fill, stops, workingStops, exitOrders, entryOrders, push };
}

type World = ReturnType<typeof makeWorld>;

const cfg = (over: Record<string, unknown> = {}) => ({ setup: 'FADE', stopPct: 1.2, fixedStopPct: true, targetR: 3, breakevenAtR: 1, breakevenLockR: 0.2, skipNearPdlR: 0, profitLock: true, stopLossRs: 500, maxPositions: 1, perSideTrades: 1, minRvol: 10, stopAtrFraction: 0.2, minAvgValueCr: 10, minPrice: 50, allowLongs: true, allowShorts: true, leverage: 5, entryCutoffTime: '15:00', watchCount: 1, withGapOnly: true, ...over });
const makeState = (w: World, over: Record<string, unknown> = {}): any => ({ strategyId: SID, executionId: 'exec1', userId: 'u1', brokerAccountId: 'acct1', isPaperTrade: false, config: cfg(), baselines: null, baselineLoading: false, candidates: [], candidatesTriedAt: 0, tradedSymbols: new Set(), positions: [], enteringSymbol: null, uncertainEntry: null, alertedKeys: new Set(), tickErrors: 0, busySince: 0, margins: new Map(), marginCheck: null, surveillance: null, survLogged: false, tradesToday: 0, sideTrades: { LONG: 0, SHORT: 0 }, winsToday: 0, lossesToday: 0, realizedTodayRs: 0, logs: [], busy: false, stopping: false, completeReason: null, client: w.client, clientCheckedAt: Date.now(), subscribed: new Set(), lastPnlLog: FAR_FUTURE, loggedNoSession: false, loggedCutoff: false, oi: null, ...over });
const candidate = (over: Record<string, unknown> = {}): any => ({ symbol: 'ABC', side: 'SHORT', level: 100, stopDist: 0, rvol: 12, tick: 0.05, first: { o: 100, h: 101, l: 99, c: 100, v: 1 }, ltp: 100, ltpAt: Date.now(), done: false, candles: null, candlesAt: 0, checkedThrough: 0, armedUntil: 0, stopLevel: 0, crossSeen: new Set(), ...over });

/** Marks which periodic broker checks are due on the next managePosition. */
const due = (p: any, which: { orders?: boolean; pos?: boolean; entry?: boolean; resize?: boolean }) => {
  p.lastOrdersCheck = which.orders ? 0 : FAR_FUTURE;
  p.lastBrokerPosCheck = which.pos ? 0 : FAR_FUTURE;
  if (p.pendingEntry) {
    p.pendingEntry.lastCheck = which.entry ? 0 : FAR_FUTURE;
    p.pendingEntry.cancelAfter = 0;
  }
  p.lastStopResize = which.resize ? 0 : FAR_FUTURE;
  p.openedAt = 0;
};

async function enter(w: World, state: any, c = candidate()) {
  await w.engine.enterTrade(state, w.client, c, new Date());
  return state.positions[0];
}
const expired = (state: any) => { state.uncertainEntry.since = 0; };
const reconcile = (w: World, state: any) => w.engine.reconcileUncertainEntry(state, w.client, true);

beforeAll(() => {
  // Every case runs at 10:00 IST on a trading day, whatever the real clock says (the engine skips its work before 09:15).
  // Only Date is faked: timers stay real, and the fake clock advances with real time.
  jest.useFakeTimers({ now: at('10:00'), advanceTimers: true, doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'hrtime', 'performance'] });
  Logger.overrideLogger(false);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterAll(() => jest.useRealTimers());
beforeEach(() => (sendAlert as jest.Mock).mockClear());
const alerted = (re: RegExp) => (sendAlert as jest.Mock).mock.calls.some(([m]) => re.test(m));

describe('entry reply lost', () => {
  it('takes over and protects an order that filled at Zerodha', async () => {
    const w = makeWorld({ replyLost: true });
    const s = makeState(w);
    const p = await enter(w, s);
    expect(p).toBeDefined();
    expect(Math.abs(w.b.net.ABC)).toBe(p.qty);
    expect(w.workingStops()).toHaveLength(1);
    expect(w.workingStops()[0].quantity).toBe(p.qty);
    expect(s.uncertainEntry).toBeNull();
    expect(s.tradesToday).toBe(1);
    expect(w.rows.some((r) => r.brokerOrderId === 'O1')).toBe(true); // so a restart can re-adopt it
    expect(alerted(/reply to the entry order/)).toBe(true);
  });

  it('blocks new entries while the outcome is unknown, then releases them when the order never appears', async () => {
    const w = makeWorld({ placeThrows: 'socket hang up' });
    const s = makeState(w);
    await enter(w, s);
    expect(s.uncertainEntry?.symbol).toBe('ABC');
    expect(w.entryOrders()).toHaveLength(1);

    w.b.o.placeThrows = undefined;
    const other = candidate({ symbol: 'DEF' });
    await w.engine.enterTrade(s, w.client, other, new Date());
    expect(w.entryOrders()).toHaveLength(1);
    expect(other.done).toBe(false);

    await reconcile(w, s);
    expect(s.uncertainEntry).not.toBeNull(); // inside the waiting window

    expired(s);
    await reconcile(w, s);
    expect(s.uncertainEntry).toBeNull();

    await w.engine.enterTrade(s, w.client, other, new Date());
    expect(s.positions[0].symbol).toBe('DEF');
  });

  it('takes over an order that shows up after the first look', async () => {
    const w = makeWorld({ placeThrows: 'socket hang up' });
    const s = makeState(w);
    await enter(w, s);
    w.b.orders.push(w.mk({ symbol: 'ABC', orderType: 'MARKET', side: 'SELL', qty: 416, tag: ENTRY_TAG }, 'COMPLETE', 416, 100));
    w.fill('ABC', 'SELL', 416);
    await reconcile(w, s);
    expect(s.uncertainEntry).toBeNull();
    expect(s.positions[0].qty).toBe(416);
    expect(w.workingStops()[0].quantity).toBe(416);
  });

  it('takes over a position the order book does not explain', async () => {
    const w = makeWorld({ placeThrows: 'socket hang up' });
    const s = makeState(w);
    await enter(w, s);
    w.fill('ABC', 'SELL', 50);
    await reconcile(w, s);
    expect(s.positions[0].qty).toBe(50);
    expect(w.workingStops()).toHaveLength(1);
  });

  it('stays blocked, past the waiting window, while the order book cannot be read', async () => {
    const w = makeWorld({ placeThrows: 'socket hang up' });
    const s = makeState(w);
    await enter(w, s);
    w.b.o.ordersThrow = true;
    expired(s);
    await reconcile(w, s);
    expect(s.uncertainEntry).not.toBeNull();
  });

  it('cancels a working order that has no fill yet', async () => {
    const w = makeWorld({ replyLost: true, entryRests: true, cancelFails: true });
    const s = makeState(w);
    await enter(w, s);
    expect(s.positions).toHaveLength(0);
    expect(s.uncertainEntry?.orderId).toBe('O1');
    w.b.o.cancelFails = false;
    await reconcile(w, s);
    expect(w.b.orders[0].status).toBe('CANCELLED');
    await reconcile(w, s);
    expect(s.uncertainEntry).toBeNull();
    expect(s.positions).toHaveLength(0);
  });

  it('watches an accepted order the books do not show, instead of forgetting it', async () => {
    const w = makeWorld({ hideBook: true, entryStatus: 'OPEN', entryPartial: 0 });
    const s = makeState(w);
    await enter(w, s);
    expect(s.positions).toHaveLength(0);
    expect(s.uncertainEntry?.orderId).toBe('O1');
    expect(alerted(/could not be confirmed/)).toBe(true);
  });

  it('does not end the day or free the stock while an entry is unknown', async () => {
    const w = makeWorld({ placeThrows: 'socket hang up' });
    const s = makeState(w);
    await enter(w, s);
    s.completeReason = 'done';
    s.baselines = new Map();
    w.engine.running.set(SID, s);
    const stop = jest.spyOn(w.engine, 'stopWithStatus').mockResolvedValue(undefined);
    await w.engine.tick(SID);
    expect(stop).not.toHaveBeenCalled();

    s.uncertainEntry = null; // resolved: now the day may end
    s.completeReason = 'done';
    await w.engine.tick(SID);
    expect(stop).toHaveBeenCalledTimes(1);
    w.engine.running.delete(SID);
  });

  it('treats a refusal from our own guards as final', async () => {
    const w = makeWorld({ killSwitch: true });
    const s = makeState(w);
    await enter(w, s);
    expect(s.uncertainEntry).toBeNull();
    expect(w.entryOrders()).toHaveLength(0);
  });

  it('OI: a lost pre-open reply is followed up, and no second order is sent', async () => {
    const w = makeWorld({ replyLost: true, entryRests: true });
    const oi = { picks: [{ symbol: 'ABC', close: 100, priceChg: -0.04, oiChg: 0.2 }], signalDay: 'x', triedAt: 0, loggedWait: false, orderId: null, pick: null, symbol: null, limit: 0, qty: 0, tick: 0.05, lastCheck: 0, resolved: false, doneReason: null };
    const s = makeState(w, { oi, config: cfg({ setup: 'OI', stopPct: 1 }) });
    await w.engine.placeOiOrder(s, w.client, at('09:02'));
    expect(s.uncertainEntry?.candidate).toBeNull();
    expect(oi.resolved).toBe(false);

    oi.lastCheck = 0;
    await w.engine.tickOi(s, w.client, at('09:03'));
    expect(w.entryOrders()).toHaveLength(1);

    await reconcile(w, s);
    expect(s.uncertainEntry).toBeNull();
    expect(oi.orderId).toBe('O1');
    expect(w.rows.some((r) => r.brokerOrderId === 'O1')).toBe(true);
  });
});

describe('stop-loss left behind on exit', () => {
  it('sends no exit while the stop may still be working, then exits once it is gone', async () => {
    const w = makeWorld({ exitFill: 99 });
    const s = makeState(w);
    const p = await enter(w, s);
    w.b.o.cancelFails = true;

    await w.engine.exitPosition(s, w.client, p, 'TARGET', 99);
    expect(w.exitOrders()).toHaveLength(0);
    expect(s.positions).toHaveLength(1);
    expect(p.retryExit).toBe('TARGET');
    expect(w.workingStops()).toHaveLength(1);
    expect(alerted(/could not be confirmed cancelled/)).toBe(true);

    w.b.o.cancelFails = false;
    await w.engine.exitPosition(s, w.client, p, 'TARGET', 99);
    expect(w.exitOrders()).toHaveLength(1);
    expect(s.positions).toHaveLength(0);
    expect(w.workingStops()).toHaveLength(0);
    expect(w.b.net.ABC).toBeUndefined();
  });

  it('books the stop fill as the exit when the stop filled during the cancel', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    const sl = w.stops()[0];
    sl.status = 'COMPLETE'; sl.filled_quantity = sl.quantity; sl.average_price = 101.25;
    w.fill('ABC', 'BUY', sl.quantity);
    w.b.o.cancelFails = true;
    await w.engine.exitPosition(s, w.client, p, 'TARGET', 99);
    expect(w.exitOrders()).toHaveLength(0);
    expect(s.positions).toHaveLength(0);
    expect(s.logs.some((l: string) => l.includes('101.25'))).toBe(true);
  });

  it('sends no exit when the order book cannot be read', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    w.b.o.ordersThrow = true;
    await w.engine.exitPosition(s, w.client, p, 'SQUARE_OFF', 100);
    expect(w.exitOrders()).toHaveLength(0);
    expect(s.positions).toHaveLength(1);
  });

  it('exits when the stop id is not in a readable book', async () => {
    const w = makeWorld({ exitFill: 99 });
    const s = makeState(w);
    const p = await enter(w, s);
    w.stops()[0].status = 'CANCELLED';
    p.slOrderId = 'GHOST';
    await w.engine.exitPosition(s, w.client, p, 'TARGET', 99);
    expect(w.exitOrders()).toHaveLength(1);
    expect(s.positions).toHaveLength(0);
  });

  it('keeps a flat position open until its stop is confirmed cancelled', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    delete w.b.net.ABC;
    w.b.o.cancelFails = true;
    due(p, { pos: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(s.positions).toHaveLength(1);
    expect(alerted(/could not be cancelled and could open a new position/)).toBe(true);

    w.b.o.cancelFails = false;
    due(p, { pos: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(s.positions).toHaveLength(0);
    expect(w.workingStops()).toHaveLength(0);
  });

  it('does not start more broker calls on every tick while an exit waits for its retry', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    p.retryExit = 'TARGET';
    p.lastExitAttempt = FAR_FUTURE;
    p.ltp = p.target - 1;
    const cancels = w.b.cancels;
    due(p, {});
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(w.b.cancels).toBe(cancels);
    expect(w.exitOrders()).toHaveLength(0);
  });

  it('puts exactly one stop back when the exit order fails', async () => {
    const w = makeWorld({ exitThrows: true });
    const s = makeState(w);
    const p = await enter(w, s);
    await w.engine.exitPosition(s, w.client, p, 'TARGET', 99);
    expect(s.positions).toHaveLength(1);
    expect(p.retryExit).toBe('TARGET');
    expect(w.workingStops()).toHaveLength(1);
    expect(w.workingStops()[0].quantity).toBe(p.qty);
  });
});

describe('unfilled remainder of an entry', () => {
  async function stuckPartial() {
    const w = makeWorld({ entryPartial: 10, cancelFails: true });
    const s = makeState(w);
    const p = await enter(w, s);
    return { w, s, p, entry: w.b.orders[0] };
  }

  it('extends the stop to later fills without moving its price', async () => {
    const { w, s, p, entry } = await stuckPartial();
    expect(p.qty).toBe(10);
    expect(p.pendingEntry).toBeTruthy();
    const trigger = w.stops()[0].trigger_price;

    entry.filled_quantity = entry.quantity; entry.status = 'COMPLETE';
    w.fill('ABC', 'SELL', entry.quantity - 10);
    due(p, { entry: true });
    await w.engine.managePosition(s, w.client, p, TEN());

    expect(p.qty).toBe(entry.quantity);
    expect(w.stops()).toHaveLength(1);
    expect(w.stops()[0].quantity).toBe(entry.quantity);
    expect(w.stops()[0].trigger_price).toBe(trigger);
    expect(p.pendingEntry).toBeNull();
  });

  it('alerts when the remainder cannot be cancelled', async () => {
    const { w, s, p } = await stuckPartial();
    due(p, { entry: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(p.pendingEntry).toBeTruthy();
    expect(alerted(/could not be cancelled/)).toBe(true);
  });

  it('stops following once the remainder is finally cancelled', async () => {
    const { w, s, p, entry } = await stuckPartial();
    w.b.o.cancelFails = false;
    due(p, { entry: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(entry.status).toBe('CANCELLED');
    expect(p.pendingEntry).toBeNull();
    expect(p.qty).toBe(10);
  });

  it('delays the exit until the remainder is dead, keeping the stop', async () => {
    const { w, s, p } = await stuckPartial();
    await w.engine.exitPosition(s, w.client, p, 'TARGET', 99);
    expect(w.exitOrders()).toHaveLength(0);
    expect(w.workingStops()).toHaveLength(1);
    expect(p.retryExit).toBe('TARGET');

    w.b.o.cancelFails = false;
    await w.engine.exitPosition(s, w.client, p, 'TARGET', 99);
    expect(w.exitOrders()[0].qty).toBe(10);
    expect(s.positions).toHaveLength(0);
  });

  it('retries a failed stop resize, then flattens', async () => {
    const { w, s, p, entry } = await stuckPartial();
    w.b.o.modifyFails = true;
    entry.filled_quantity = 30;
    w.fill('ABC', 'SELL', 20);
    due(p, { entry: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(p.qty).toBe(30);
    expect(p.stopQtyDirty).toBe(true);
    expect(s.positions).toHaveLength(1);

    entry.status = 'COMPLETE'; // nothing further can fill, so the exit is not held up
    w.b.o.cancelFails = false;
    due(p, { resize: true, entry: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(s.positions).toHaveLength(1);
    due(p, { resize: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(s.positions).toHaveLength(0);
    expect(w.exitOrders()).toHaveLength(1);
    expect(w.b.net.ABC).toBeUndefined();
  });
});

describe('broker quantity differs from the engine', () => {
  it('ignores one read, then shrinks the position and stop when it persists', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    const full = p.qty;
    w.b.net.ABC = -100;

    due(p, { pos: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(p.qty).toBe(full);

    due(p, { pos: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(p.qty).toBe(100);
    expect(w.stops()[0].quantity).toBe(100);
  });

  it('leaves the quantity alone when a part-filled stop explains the difference', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    const full = p.qty;
    const sl = w.stops()[0];
    sl.filled_quantity = 100; sl.status = 'OPEN';
    w.fill('ABC', 'BUY', 100);
    for (let i = 0; i < 2; i++) {
      due(p, { pos: true });
      await w.engine.managePosition(s, w.client, p, TEN());
    }
    expect(p.qty).toBe(full);
    expect(sl.quantity).toBe(full);
  });

  it('does not act on the position book right after an entry', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    const full = p.qty;
    w.b.net.ABC = -100;
    for (let i = 0; i < 2; i++) {
      due(p, { pos: true });
      p.openedAt = TEN().getTime();
      await w.engine.managePosition(s, w.client, p, TEN());
    }
    expect(p.qty).toBe(full);
  });

  it('only alerts about extra shares it did not buy', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    const full = p.qty;
    w.b.net.ABC = -(full + 50);
    for (let i = 0; i < 2; i++) {
      due(p, { pos: true });
      await w.engine.managePosition(s, w.client, p, TEN());
    }
    expect(p.qty).toBe(full);
    expect(w.stops()[0].quantity).toBe(full);
    expect(alerted(/extra 50/)).toBe(true);
  });

  it('alerts when the broker shows the opposite side, and sends nothing', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    const sent = w.b.placed.length;
    w.b.net.ABC = 25;
    for (let i = 0; i < 2; i++) {
      due(p, { pos: true });
      await w.engine.managePosition(s, w.client, p, TEN());
    }
    expect(w.b.placed).toHaveLength(sent);
    expect(alerted(/OPPOSITE/)).toBe(true);
  });
});

describe('stop-loss rejected after being accepted', () => {
  it('replaces it and alerts', async () => {
    const w = makeWorld({ slRejectOnce: true });
    const s = makeState(w);
    const p = await enter(w, s);
    expect(w.stops()[0].status).toBe('REJECTED');
    p.ltp = 100;
    due(p, { orders: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(w.workingStops()).toHaveLength(1);
    expect(p.slOrderId).toBe(w.workingStops()[0].order_id);
    expect(s.positions).toHaveLength(1);
    expect(alerted(/is REJECTED/)).toBe(true);
  });

  it('exits at market when the price is already through the stop', async () => {
    const w = makeWorld({ slRejected: true });
    const s = makeState(w);
    const p = await enter(w, s);
    p.ltp = 101.5;
    due(p, { orders: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(w.stops()).toHaveLength(1);
    expect(w.exitOrders()).toHaveLength(1);
    expect(s.positions).toHaveLength(0);
  });

  it('flattens after repeated rejections', async () => {
    const w = makeWorld({ slRejected: true });
    const s = makeState(w);
    const p = await enter(w, s);
    p.ltp = 100;
    for (let i = 0; i < 3 && s.positions.length > 0; i++) {
      due(p, { orders: true });
      await w.engine.managePosition(s, w.client, p, TEN());
    }
    expect(w.stops()).toHaveLength(3); // the original and two replacements
    expect(s.positions).toHaveLength(0);
    expect(w.b.net.ABC).toBeUndefined();
  });

  it('places no new stop when the position is already flat', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    w.stops()[0].status = 'CANCELLED';
    delete w.b.net.ABC;
    p.ltp = 100;
    due(p, { orders: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(w.stops()).toHaveLength(1);
    expect(s.positions).toHaveLength(0);
  });

  it('does nothing while the position book cannot be read', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    const id = p.slOrderId;
    w.stops()[0].status = 'REJECTED';
    w.b.o.positionsThrow = true;
    p.ltp = 100;
    due(p, { orders: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(p.slOrderId).toBe(id);
    expect(w.stops()).toHaveLength(1);
  });
});

describe('restart', () => {
  const row = (status: string, filledQty: number, side = 'SELL') => ({ symbol: 'ABC', side, status, filledQty, isPaperTrade: false, createdAt: new Date(), brokerOrderId: 'R1', tag: ENTRY_TAG });

  async function started(w: World) {
    await w.engine.start(SID);
    const s = w.engine.running.get(SID);
    const out = { side: s.sideTrades.SHORT, traded: s.tradedSymbols.has('ABC'), s };
    return out;
  }
  const finish = async (w: World, s: any) => { s.positions.length = 0; await w.engine.stop(SID); };

  it('does not use up the side for a rejected entry', async () => {
    const w = makeWorld();
    w.rows.push(row('REJECTED', 0));
    const r = await started(w);
    expect(r.side).toBe(0);
    expect(r.traded).toBe(true); // that stock is still not retried today
    await finish(w, r.s);
  });

  it('does not use up the side for an entry cancelled with no fill', async () => {
    const w = makeWorld();
    w.rows.push(row('CANCELLED', 0));
    const r = await started(w);
    expect(r.side).toBe(0);
    await finish(w, r.s);
  });

  it('counts an entry that may have filled, once per stock', async () => {
    const w = makeWorld({ config: { stopLossRs: 500, setup: 'FADE', maxPositions: 3 } });
    w.rows.push(row('CANCELLED', 5), row('OPEN', 0, 'BUY'));
    const r = await started(w);
    expect(r.side).toBe(1);
    expect(r.s.sideTrades.LONG).toBe(0);
    await finish(w, r.s);
  });

  it('re-adopts an open position and its stop without a second stop', async () => {
    const w = makeWorld();
    w.rows.push({ symbol: 'ABC', side: 'SELL', status: 'OPEN', isPaperTrade: false, createdAt: new Date(), brokerOrderId: 'O1', tag: ENTRY_TAG });
    w.b.orders.push(w.mk({ symbol: 'ABC', orderType: 'MARKET', side: 'SELL', qty: 10, tag: ENTRY_TAG }, 'COMPLETE', 10, 100));
    w.fill('ABC', 'SELL', 10);
    w.b.orders.push(w.mk({ symbol: 'ABC', orderType: 'SL', side: 'BUY', qty: 10, triggerPrice: 101.2, price: 101.7, tag: 'x' }, 'TRIGGER PENDING', 0, 0));
    const r = await started(w);
    expect(r.s.positions[0].qty).toBe(10);
    expect(r.s.positions[0].slOrderId).toBe('O2');
    expect(w.stops()).toHaveLength(1);
    await finish(w, r.s);
  });

  it('refuses to start when the position book cannot be read', async () => {
    const w = makeWorld({ positionsThrow: true });
    w.rows.push(row('OPEN', 0));
    await expect(w.engine.start(SID)).rejects.toThrow();
    expect(w.engine.isRunning(SID)).toBe(false);
  });
});

describe('existing behaviour stays', () => {
  it('places one protective stop for the full fill', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    const sl = w.stops()[0];
    expect(sl.transaction_type).toBe('BUY');
    expect(sl.quantity).toBe(p.qty);
    expect(sl.trigger_price).toBe(101.2);
    expect(w.b.placed.find((x: any) => x.orderType === 'SL').intent).toBe('PROTECTIVE');
    expect(p.pendingEntry).toBeNull();
  });

  it('sizes the stop to a partial fill, counted as one trade', async () => {
    const w = makeWorld({ entryPartial: 10 });
    const s = makeState(w);
    const p = await enter(w, s);
    expect(p.qty).toBe(10);
    expect(w.stops()[0].quantity).toBe(10);
    expect(s.tradesToday).toBe(1);
  });

  it('does not count a rejected entry and places no stop', async () => {
    const w = makeWorld({ entryStatus: 'REJECTED' });
    const s = makeState(w);
    await enter(w, s);
    expect(s.tradesToday).toBe(0);
    expect(s.uncertainEntry).toBeNull();
    expect(w.stops()).toHaveLength(0);
  });

  it('reuses a working stop instead of duplicating it', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    const first = p.slOrderId;
    p.slOrderId = null;
    await w.engine.armStopLoss(s, p);
    expect(w.stops()).toHaveLength(1);
    expect(p.slOrderId).toBe(first);
  });

  it('closes on a broker stop fill at its real price', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    const sl = w.stops()[0];
    sl.status = 'COMPLETE'; sl.filled_quantity = sl.quantity; sl.average_price = 101.25;
    w.fill('ABC', 'BUY', sl.quantity);
    p.ltp = 101;
    due(p, { orders: true });
    await w.engine.managePosition(s, w.client, p, TEN());
    expect(s.positions).toHaveLength(0);
    expect(s.realizedTodayRs).toBeCloseTo(-1.25 * sl.quantity, 2);
  });

  it('sends no reversing order when the broker is already flat', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    delete w.b.net.ABC;
    await w.engine.exitPosition(s, w.client, p, 'TARGET', 99);
    expect(w.exitOrders()).toHaveLength(0);
    expect(s.positions).toHaveLength(0);
  });

  it('squares off at 15:05 with no price available', async () => {
    const w = makeWorld({ exitFill: 100.5 });
    const s = makeState(w);
    const p = await enter(w, s);
    p.ltp = null;
    due(p, {});
    await w.engine.managePosition(s, w.client, p, at('15:05'));
    expect(s.positions).toHaveLength(0);
    expect(w.b.net.ABC).toBeUndefined();
  });

  it('skips the entry when the margin cannot be read', async () => {
    const w = makeWorld({ marginThrows: true });
    const s = makeState(w);
    await enter(w, s);
    expect(w.b.placed).toHaveLength(0);
  });

  it('holds the daily cap from the broker order book', async () => {
    const w = makeWorld();
    w.b.orders.push(w.mk({ symbol: 'OLD', orderType: 'MARKET', side: 'SELL', qty: 5, tag: ENTRY_TAG }, 'COMPLETE', 5, 50));
    const s = makeState(w);
    await enter(w, s);
    expect(w.b.placed).toHaveLength(0);
    expect(s.tradesToday).toBe(1);
  });

  it('lets stops and exits through the kill switch and the daily cap', async () => {
    const w = makeWorld({ exitFill: 99 });
    const s = makeState(w);
    const p = await enter(w, s);
    w.user.killSwitchActive = true;
    s.tradesToday = 99;
    w.stops()[0].status = 'CANCELLED';
    p.slOrderId = null;
    await w.engine.armStopLoss(s, p);
    expect(p.slOrderId).toBeTruthy();
    await w.engine.exitPosition(s, w.client, p, 'TARGET', 99);
    expect(s.positions).toHaveLength(0);
    expect(w.b.net.ABC).toBeUndefined();
  });

  it('skips a stock held by another live strategy', async () => {
    const w = makeWorld();
    const s = makeState(w);
    registerSymbolHolder('other', 'acct1', 'Stock Picker', (x) => x === 'ABC');
    try {
      await enter(w, s);
      expect(w.b.placed).toHaveLength(0);
    } finally {
      unregisterSymbolHolder('other');
    }
  });

  it('leaves paper trading off the broker', async () => {
    const w = makeWorld();
    const s = makeState(w, { isPaperTrade: true });
    const p = await enter(w, s);
    await w.engine.exitPosition(s, w.client, p, 'TARGET', 99);
    expect(w.b.placed).toHaveLength(0);
    expect(s.realizedTodayRs).toBeCloseTo(p.qty, 2);
  });
});

describe('FADE structural stop (default, fixedStopPct off)', () => {
  const structural = (w: World, over: Record<string, unknown> = {}) => makeState(w, { config: cfg({ fixedStopPct: false }), ...over });

  it('puts the stop past the first-candle high, sizes on it, and measures the target in that risk', async () => {
    const w = makeWorld();
    const s = structural(w);
    const p = await enter(w, s);
    // No ATR known: 1% past the high 101 = 102.01, rounded up to the tick.
    expect(p.sl).toBe(102.05);
    expect(w.stops()[0].trigger_price).toBe(102.05);
    expect(p.qty).toBeLessThanOrEqual(Math.floor(500 / (102.05 - 100)));
    expect((p.sl - p.entryPrice) * p.qty).toBeLessThanOrEqual(500);
    // 1R = the distance to the structural stop, so targetR 3 = 3x the max loss.
    expect(p.stopDist).toBeCloseTo(p.sl - p.entryPrice, 6);
    expect(p.target).toBeCloseTo(p.entryPrice - 3 * (p.sl - p.entryPrice), 1);
  });

  it('re-adopts a structural position with 1R from its saved stop', async () => {
    // No fixedStopPct in the saved config = structural.
    const w = makeWorld({ config: { stopLossRs: 500, setup: 'FADE', maxPositions: 1, targetR: 1.5 } });
    w.rows.push({ symbol: 'ABC', side: 'SELL', status: 'OPEN', isPaperTrade: false, createdAt: new Date(), brokerOrderId: 'O1', tag: ENTRY_TAG });
    w.b.orders.push(w.mk({ symbol: 'ABC', orderType: 'MARKET', side: 'SELL', qty: 10, tag: ENTRY_TAG }, 'COMPLETE', 10, 100));
    w.fill('ABC', 'SELL', 10);
    w.b.orders.push(w.mk({ symbol: 'ABC', orderType: 'SL', side: 'BUY', qty: 10, triggerPrice: 104, price: 104.5, tag: 'x' }, 'TRIGGER PENDING', 0, 0));
    await w.engine.start(SID);
    const s = w.engine.running.get(SID);
    const p = s.positions[0];
    expect(p.stopDist).toBeCloseTo(4, 6);
    expect(p.target).toBe(94);
    s.positions.length = 0;
    await w.engine.stop(SID);
  });

  it('uses the highest price seen today and an ATR buffer capped at 1.5%', async () => {
    const w = makeWorld();
    const s = structural(w, { baselines: new Map([['ABC', { avgFirstVol: 1, atr: 8, avgValueCr: 50, prevClose: 98, tick: 0.05 }]]) });
    // 0.3 x 8% ATR = 2.4% -> capped at 1.5%; the 09:20 quote saw 103.
    const p = await enter(w, s, candidate({ seenHigh: 103 }));
    expect(p.sl).toBe(104.55);
  });

  it('keeps the buffer at least 0.8% on a quiet stock', async () => {
    const w = makeWorld();
    const s = structural(w, { baselines: new Map([['ABC', { avgFirstVol: 1, atr: 1, avgValueCr: 50, prevClose: 98, tick: 0.05 }]]) });
    const p = await enter(w, s);
    // 0.3 x 1% = 0.3% -> 0.8%: 101 x 1.008 = 101.808 -> 101.85.
    expect(p.sl).toBe(101.85);
  });

  it('skips the trade when the stop order would sit past the upper circuit', async () => {
    const w = makeWorld();
    const s = structural(w);
    await w.engine.enterTrade(s, w.client, candidate({ upperCircuit: 102.5 }), new Date());
    expect(s.positions).toHaveLength(0);
    expect(w.b.placed).toHaveLength(0);
    expect(s.logs.some((l: any) => /past the upper circuit/.test(typeof l === 'string' ? l : l.message))).toBe(true);
  });
});


describe('entry speed', () => {
  it('sends the entry without a second price lookup when the order-value limit is on', async () => {
    const w = makeWorld();
    w.user.maxOrderValue = 10_000_000 as any;
    let ltpCalls = 0;
    const orig = w.client.getLTP;
    w.client.getLTP = async (k: string[]) => { ltpCalls++; return orig(k); };
    const s = makeState(w);
    const p = await enter(w, s);
    expect(p).toBeDefined();
    expect(w.entryOrders()).toHaveLength(1);
    expect(ltpCalls).toBe(0);
  });

  it('still blocks an entry over the order-value limit, using the engine price', async () => {
    const w = makeWorld();
    w.user.maxOrderValue = 1_000 as any;
    const s = makeState(w);
    await enter(w, s);
    expect(w.entryOrders()).toHaveLength(0);
    expect(s.positions).toHaveLength(0);
  });

  it('takes the fill from the websocket postback without waiting for the order book', async () => {
    const w = makeWorld();
    const place = w.client.placeOrder;
    w.client.placeOrder = async (p: any) => {
      const id = await place(p);
      if (p.intent === 'ENTRY') {
        w.b.o.hideBook = true; // the order book has not caught up yet
        setTimeout(() => w.push({ orderId: id, status: 'COMPLETE', filledQuantity: p.qty, averagePrice: 99.5 }), 20);
      }
      return id;
    };
    const s = makeState(w);
    const t0 = Date.now();
    const p = await enter(w, s);
    expect(p.entryPrice).toBe(99.5);
    expect(s.logs.some((l: string) => /fill seen after \d+ ms \(websocket\)/.test(l))).toBe(true);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it('keeps a final postback when a late non-final one arrives', () => {
    const w = makeWorld();
    w.push({ orderId: 'X1', status: 'COMPLETE', filledQuantity: 10, averagePrice: 101 });
    w.push({ orderId: 'X1', status: 'OPEN', filledQuantity: 0, averagePrice: 0 });
    expect(w.engine.pushedOrder('X1')).toMatchObject({ status: 'COMPLETE', filledQty: 10, avgPrice: 101 });
  });

  it('ignores a COMPLETE postback with no price and reads the order book instead', async () => {
    const w = makeWorld({ entryFill: 100 });
    const place = w.client.placeOrder;
    w.client.placeOrder = async (p: any) => {
      const id = await place(p);
      if (p.intent === 'ENTRY') w.push({ orderId: id, status: 'COMPLETE', filledQuantity: p.qty, averagePrice: 0 });
      return id;
    };
    const s = makeState(w);
    const p = await enter(w, s);
    expect(p.entryPrice).toBe(100);
  });
});

describe('alerts', () => {
  it('alerts once when ticks keep failing, and once when they recover', () => {
    const w = makeWorld();
    const s = makeState(w);
    for (let i = 0; i < 8; i++) w.engine.tickFailed(s, new Error('kite down'));
    expect((sendAlert as jest.Mock).mock.calls.filter(([m]) => /failed \d+ times in a row/.test(m))).toHaveLength(1);
    w.engine.tickSucceeded(s);
    w.engine.tickSucceeded(s);
    expect((sendAlert as jest.Mock).mock.calls.filter(([m]) => /running normally again/.test(m))).toHaveLength(1);
  });

  it('alerts when one tick hangs', async () => {
    const w = makeWorld();
    const s = makeState(w, { busy: true, busySince: Date.now() - 61_000 });
    w.engine.running.set(SID, s);
    await w.engine.tick(SID);
    await w.engine.tick(SID);
    expect((sendAlert as jest.Mock).mock.calls.filter(([m]) => /stuck on one step/.test(m))).toHaveLength(1);
    w.engine.running.delete(SID);
  });

  it('alerts once about a missing Zerodha login after 09:05, and when it is back', async () => {
    const w = makeWorld();
    const s = makeState(w);
    w.engine.running.set(SID, s);
    const getClient = jest.spyOn(w.engine, 'getClient').mockResolvedValue(null);
    await w.engine.tick(SID);
    await w.engine.tick(SID);
    expect((sendAlert as jest.Mock).mock.calls.filter(([m]) => /Not logged in to Zerodha/.test(m))).toHaveLength(1);
    getClient.mockResolvedValue(w.client);
    jest.spyOn(w.engine, 'refreshPrices').mockResolvedValue(undefined);
    await w.engine.tick(SID);
    expect(alerted(/login is back/)).toBe(true);
    w.engine.running.delete(SID);
  });

  it('alerts once when an open position gets no prices', async () => {
    const w = makeWorld();
    const s = makeState(w);
    const p = await enter(w, s);
    p.openedAt = 0;
    p.ltpAt = Date.now() - 60_000;
    w.engine.tickSucceeded(s);
    w.engine.tickSucceeded(s);
    expect((sendAlert as jest.Mock).mock.calls.filter(([m]) => /No price for ABC/.test(m))).toHaveLength(1);
    p.ltpAt = Date.now();
    w.engine.tickSucceeded(s);
    expect(alerted(/Prices for ABC are back/)).toBe(true);
  });

  it('sends nothing to Telegram for a paper strategy', () => {
    const w = makeWorld();
    const s = makeState(w, { isPaperTrade: true });
    for (let i = 0; i < 8; i++) w.engine.tickFailed(s, new Error('x'));
    expect(sendAlert).not.toHaveBeenCalled();
  });
});

describe('09:20 quote-vs-candle check (log only)', () => {
  const dayOpen = at('09:15').getTime();
  const history = (n: number, last: { o: number; h: number; l: number; c: number; v: number }) => {
    const k: any[] = [];
    for (let i = n; i > 0; i--) {
      const c = 100 + Math.sin(i) * 2;
      k.push({ t: dayOpen - i * 300_000, o: c, h: c + 1, l: c - 1, c, v: 1000 });
    }
    k.push({ t: dayOpen, ...last });
    return k;
  };

  it('compares both candles without touching the candidates', () => {
    const w = makeWorld();
    const s = makeState(w, { baselines: new Map([['ABC', { avgFirstVol: 1000, prevClose: 95, avgValueCr: 50, tick: 0.05 }]]) });
    const first = { o: 100, h: 104, l: 99, c: 101, v: 20_000 };
    const firsts = new Map([['ABC', first]]);
    const quotes = new Map([['ABC', { ...first, at: dayOpen + 300_000 + 2000 }]]);
    const histories = new Map([['ABC', { candles: history(60, first), at: Date.now() }]]);
    const spy = jest.spyOn((w.engine as any).logger, 'log').mockImplementation(() => undefined);
    w.engine.logQuoteCandleCheck(s, ['ABC'], firsts, quotes, histories, at('09:20'));
    expect(spy.mock.calls.some(([m]: any) => /1\/1 shortlisted stocks get the same decision/.test(m))).toBe(true);
    expect(s.candidates).toEqual([]);
  });

  it('counts a stock whose quote volume would change the in-play decision', () => {
    const w = makeWorld();
    const s = makeState(w, { baselines: new Map([['ABC', { avgFirstVol: 1000, prevClose: 95, avgValueCr: 50, tick: 0.05 }]]) });
    const first = { o: 100, h: 104, l: 99, c: 101, v: 9_500 }; // 9.5x: not in play at 10x
    const spy = jest.spyOn((w.engine as any).logger, 'log').mockImplementation(() => undefined);
    w.engine.logQuoteCandleCheck(s, ['ABC'], new Map([['ABC', first]]), new Map([['ABC', { ...first, v: 10_500, at: dayOpen + 302_000 }]]), new Map([['ABC', { candles: history(60, first), at: 0 }]]), at('09:20'));
    expect(spy.mock.calls.some(([m]: any) => /0\/1 shortlisted stocks/.test(m))).toBe(true);
  });
});
