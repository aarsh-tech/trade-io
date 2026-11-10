jest.mock('../src/strategy/signal-logger', () => ({ logSignal: jest.fn() }));

import { GeneralKiteException, InputException, NetworkException, OrderException, TokenException } from '../src/brokers/kite-errors';
import {
  classifyMarginError, isIntradayBlockedError, leverageText, MARGIN_CHECK_NOTIONAL, MarginInfo, marginInfoFromRow, marginRequest, qtyByCapital,
} from '../src/strategy/sip-margin';
import { logSignal } from '../src/strategy/signal-logger';
import { StocksInPlayEngine } from '../src/strategy/stocks-in-play.engine';

describe('sip-margin helpers', () => {
  test('marginRequest asks about a ~₹50k LIMIT order at a tick-rounded price', () => {
    const r = marginRequest('FINCABLES', 'SELL', 1273.53, 0.05);
    expect(r).toEqual({ symbol: 'FINCABLES', side: 'SELL', price: 1273.55, qty: Math.floor(MARGIN_CHECK_NOTIONAL / 1273.55) });
    expect(marginRequest('MRF', 'BUY', 150000).qty).toBe(1); // never 0 shares
  });

  test('leverage = notional / margin, kept within 1x..5x', () => {
    const r = { symbol: 'X', side: 'SELL' as const, qty: 100, price: 500 }; // ₹50,000
    expect(marginInfoFromRow(r, { symbol: 'X', total: 10000, leverage: 5 })).toMatchObject({ kind: 'OK', leverage: 5, zerodhaLeverage: 5, marginRs: 10000, notionalRs: 50000 });
    expect(marginInfoFromRow(r, { symbol: 'X', total: 20000, leverage: null })).toMatchObject({ kind: 'OK', leverage: 2.5, zerodhaLeverage: null });
    // Netted against an opposite position: Zerodha blocks almost nothing; never more than 5x.
    expect(marginInfoFromRow(r, { symbol: 'X', total: 100, leverage: null })).toMatchObject({ kind: 'OK', leverage: 5 });
    // More margin than the notional (should not happen): never below 1x.
    expect(marginInfoFromRow(r, { symbol: 'X', total: 60000, leverage: null })).toMatchObject({ kind: 'OK', leverage: 1 });
    expect(marginInfoFromRow(r, { symbol: 'X', total: 0, leverage: null }).kind).toBe('UNKNOWN');
    expect(marginInfoFromRow(r, null).kind).toBe('UNKNOWN');
  });

  test('only a clear "not allowed intraday" error counts as BLOCKED', () => {
    expect(isIntradayBlockedError(new InputException('MIS orders are blocked for this scrip'))).toBe(true);
    expect(isIntradayBlockedError(new InputException('Intraday trading is not allowed in this stock'))).toBe(true);
    expect(isIntradayBlockedError(new InputException('This scrip is in the trade-to-trade segment'))).toBe(true);
    expect(isIntradayBlockedError(new InputException('Invalid quantity'))).toBe(false);
    expect(isIntradayBlockedError(new TokenException('MIS not allowed'))).toBe(false); // session errors never skip a stock
    expect(isIntradayBlockedError(new NetworkException('ECONNRESET'))).toBe(false);
  });

  test('classifyMarginError: rejections are about the stock only when another stock answered', () => {
    expect(classifyMarginError(new OrderException('odd text'), true)).toBe('BLOCKED');
    expect(classifyMarginError(new InputException('odd text'), true)).toBe('BLOCKED');
    expect(classifyMarginError(new InputException('odd text'), false)).toBe('UNKNOWN');
    expect(classifyMarginError(new InputException('MIS not allowed'), false)).toBe('BLOCKED');
    expect(classifyMarginError(new GeneralKiteException('502 Bad Gateway'), true)).toBe('UNKNOWN'); // server fault
    expect(classifyMarginError(new NetworkException('ETIMEDOUT'), true)).toBe('UNKNOWN');
    expect(classifyMarginError(new TokenException('MIS not allowed'), true)).toBe('UNKNOWN');
  });

  test('qtyByCapital matches the live FINCABLES sizing at the old fixed 4x', () => {
    // 9 Nov live log: free funds ≥ ₹24,801, 4x, ₹1273.50 → "capital allows 74".
    expect(qtyByCapital(24_810, 4, 1273.5)).toBe(74);
    expect(qtyByCapital(24_810, 5, 1273.5)).toBe(92);
    expect(qtyByCapital(24_810, 1, 1273.5)).toBe(18);
    expect(qtyByCapital(0, 4, 100)).toBe(0);
  });

  test('leverageText', () => {
    expect(leverageText(4.987, 'ZERODHA')).toBe('4.99x (Zerodha)');
    expect(leverageText(4, 'FALLBACK')).toBe('4x (fallback)');
  });
});

// The engine's margin methods, called on a minimal `this` (no Nest, DB or broker).
describe('engine margin check', () => {
  const proto = StocksInPlayEngine.prototype as any;
  const makeState = () => ({ strategyId: 's1', isPaperTrade: false, config: { setup: 'FADE', leverage: 4 }, margins: new Map<string, MarginInfo>(), marginCheck: null as Promise<void> | null, candidates: null as any[] | null });
  const makeEngine = () => {
    const logs: string[] = [];
    const self: any = { log: (_s: any, m: string) => logs.push(m) };
    self.checkMargins = proto.checkMargins.bind(self);
    self.dropBlockedCandidates = proto.dropBlockedCandidates.bind(self);
    self.marginFor = proto.marginFor.bind(self);
    return { self, logs };
  };
  const items = [
    { symbol: 'AAA', side: 'SHORT', price: 500, tick: 0.05 },
    { symbol: 'BBB', side: 'LONG', price: 1000, tick: 0.05 },
  ];
  beforeEach(() => (logSignal as jest.Mock).mockClear());

  test('one batched call; leverage stored per stock and logged', async () => {
    const { self, logs } = makeEngine();
    const state = makeState();
    const getOrderMargins = jest.fn(async (orders: any[]) => orders.map((o) => ({ symbol: o.symbol, total: (o.qty * o.price) / (o.symbol === 'AAA' ? 5 : 2.5), leverage: null })));
    await self.checkMargins(state, { getOrderMargins }, items);
    expect(getOrderMargins).toHaveBeenCalledTimes(1);
    expect(getOrderMargins.mock.calls[0][0]).toEqual([
      { symbol: 'AAA', exchange: 'NSE', side: 'SELL', product: 'MIS', orderType: 'LIMIT', qty: 100, price: 500 },
      { symbol: 'BBB', exchange: 'NSE', side: 'BUY', product: 'MIS', orderType: 'LIMIT', qty: 50, price: 1000 },
    ]);
    expect(state.margins.get('AAA')).toMatchObject({ kind: 'OK', leverage: 5 });
    expect(state.margins.get('BBB')).toMatchObject({ kind: 'OK', leverage: 2.5 });
    expect(logs.at(-1)).toBe('🧮 Zerodha intraday leverage: AAA 5x, BBB 2.5x');
    expect(logSignal).toHaveBeenCalledTimes(2);
    expect((logSignal as jest.Mock).mock.calls[0][2]).toMatchObject({ event: 'MARGIN', symbol: 'AAA', kind: 'OK', leverage: 5 });

    // Asked once a day: a second check for the same stocks makes no call.
    await self.checkMargins(state, { getOrderMargins }, items);
    expect(getOrderMargins).toHaveBeenCalledTimes(1);
  });

  test('a batch refused for one stock is asked stock by stock; the blocked one is dropped', async () => {
    const { self, logs } = makeEngine();
    const state = makeState();
    const getOrderMargins = jest.fn(async (orders: any[]) => {
      if (orders.some((o) => o.symbol === 'BBB')) throw new InputException('MIS orders are blocked for BBB');
      return orders.map((o) => ({ symbol: o.symbol, total: (o.qty * o.price) / 5, leverage: 5 }));
    });
    state.candidates = [{ symbol: 'AAA', done: false }, { symbol: 'BBB', done: false }];
    await self.checkMargins(state, { getOrderMargins }, items);
    self.dropBlockedCandidates(state);
    expect(getOrderMargins).toHaveBeenCalledTimes(3); // batch + 2 singles
    expect(state.margins.get('AAA')).toMatchObject({ kind: 'OK', leverage: 5 });
    expect(state.margins.get('BBB')).toMatchObject({ kind: 'BLOCKED' });
    expect(state.candidates.map((c) => c.done)).toEqual([false, true]);
    expect(logs.some((l) => l.includes('BBB NOT ALLOWED intraday'))).toBe(true);
    expect(logs.at(-1)).toContain('BBB dropped: Zerodha does not allow it intraday');
  });

  test('any wording: a stock refused while another stock answered is BLOCKED', async () => {
    const { self } = makeEngine();
    const state = makeState();
    const getOrderMargins = jest.fn(async (orders: any[]) => {
      if (orders.some((o) => o.symbol === 'BBB')) throw new OrderException('Some new RMS message nobody has seen before');
      return orders.map((o) => ({ symbol: o.symbol, total: (o.qty * o.price) / 5, leverage: 5 }));
    });
    await self.checkMargins(state, { getOrderMargins }, items);
    expect(state.margins.get('AAA')?.kind).toBe('OK');
    expect(state.margins.get('BBB')).toMatchObject({ kind: 'BLOCKED', reason: 'OrderException: Some new RMS message nobody has seen before' });
  });

  test('every stock refused with an unclear error: UNKNOWN (maybe our request), fallback leverage', async () => {
    const { self } = makeEngine();
    const state = makeState();
    const getOrderMargins = jest.fn(async () => { throw new InputException('Invalid `price`.'); });
    await self.checkMargins(state, { getOrderMargins }, items);
    expect(getOrderMargins).toHaveBeenCalledTimes(3);
    expect(state.margins.get('AAA')?.kind).toBe('UNKNOWN');
    expect(state.margins.get('BBB')?.kind).toBe('UNKNOWN');
  });

  test('a single candidate is BLOCKED only when the message says so', async () => {
    const { self } = makeEngine();
    const one = [items[0]];
    const s1 = makeState();
    await self.checkMargins(s1, { getOrderMargins: jest.fn(async () => { throw new InputException('MIS is not allowed for this scrip'); }) }, one);
    expect(s1.margins.get('AAA')?.kind).toBe('BLOCKED');
    const s2 = makeState();
    await self.checkMargins(s2, { getOrderMargins: jest.fn(async () => { throw new InputException('Something else'); }) }, one);
    expect(s2.margins.get('AAA')?.kind).toBe('UNKNOWN');
  });

  test('a session error leaves every stock UNKNOWN (fallback leverage) and is not retried per stock', async () => {
    const { self, logs } = makeEngine();
    const state = makeState();
    const getOrderMargins = jest.fn(async () => { throw new TokenException('Incorrect `api_key` or `access_token`.'); });
    await self.checkMargins(state, { getOrderMargins }, items);
    expect(getOrderMargins).toHaveBeenCalledTimes(1);
    expect(state.margins.get('AAA')?.kind).toBe('UNKNOWN');
    expect(state.margins.get('BBB')?.kind).toBe('UNKNOWN');
    expect(logs.at(-1)).toContain('AAA unknown (');
    expect(logs.at(-1)).toContain('4x fallback');
  });

  test('a broker without the margin call is UNKNOWN, with no error', async () => {
    const { self } = makeEngine();
    const state = makeState();
    await self.checkMargins(state, {}, items);
    expect(state.margins.get('AAA')).toMatchObject({ kind: 'UNKNOWN', reason: 'this broker has no margin check' });
  });

  test('marginFor waits for a check in flight, but at most MARGIN_WAIT_MS', async () => {
    const { self } = makeEngine();
    const state = makeState();
    state.marginCheck = new Promise<void>((r) => setTimeout(() => { state.margins.set('AAA', { kind: 'OK', leverage: 5, marginRs: 1, notionalRs: 5, zerodhaLeverage: 5 }); r(); }, 50));
    await expect(self.marginFor(state, 'AAA')).resolves.toMatchObject({ kind: 'OK', leverage: 5 });

    state.marginCheck = new Promise<void>(() => undefined); // never answers
    const t0 = Date.now();
    await expect(self.marginFor(state, 'ZZZ')).resolves.toBeNull();
    const waited = Date.now() - t0;
    expect(waited).toBeGreaterThanOrEqual(1400);
    expect(waited).toBeLessThan(3000);
  });
});
