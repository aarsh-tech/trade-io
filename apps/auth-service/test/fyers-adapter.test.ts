/**
 * Offline tests for the FYERS adapter. FYERS HTTP is stubbed: nothing here touches the network, and no order can be
 * placed (the stub records calls; live orders are also blocked by default).
 *
 *   pnpm --filter @algo-trade/auth-service test:fyers
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { FyersKiteCompat, fyersLiveOrdersEnabled } from '../src/brokers/fyers/fyers-kite-compat';
import { fyersAppIdHash, fyersError, fyersLoginUrl } from '../src/brokers/fyers/fyers-http';
import { fromFyersOrderStatus, fromFyersSymbol, parseFyersMaster, toFyersResolution, toFyersSymbol } from '../src/brokers/fyers/fyers-symbols';
import { FyersClient } from '../src/brokers/broker-client.factory';
import { InstrumentStore, getSharedInstruments } from '../src/brokers/instrument-store';
import { toKiteError, TokenException, RateLimitException } from '../src/brokers/kite-errors';
import { isKiteAuthError } from '../src/common/utils/kite-errors';
import { getTopCandidateStocks } from '../src/strategy/smart-stock-picker';

delete process.env.FYERS_LIVE_ORDERS;

// Real rows from the FYERS NSE_CM / NSE_FO masters (2026-10-14), plus a few synthetic stocks for the scanner.
const NSE_CM = [
  '10100000003045,STATE BANK OF INDIA,0,1,0.05,INE062A01020,0915-1530|1815-1915:,2026-10-14,,NSE:SBIN-EQ,10,10,3045,SBIN,3045,-1.0,XX,10100000003045,None,1,3.7',
  '10100000002885,RELIANCE INDUSTRIES LTD,0,1,0.1,INE002A01018,0915-1530|1815-1915:,2026-10-14,,NSE:RELIANCE-EQ,10,10,2885,RELIANCE,2885,-1.0,XX,10100000002885,None,1,3.7',
  '10100000006240,3I INFOTECH LIMITED,0,1,0.01,INE748C01038,0915-1530|1815-1915:,2026-10-14,,NSE:3IINFOLTD-BE,10,10,6240,3IINFOLTD,6240,-1.0,XX,10100000006240,None,0,0.0',
  '101000000016669,BAJAJ AUTO LIMITED,0,1,0.5,INE917I01010,0915-1530|1815-1915:,2026-10-14,,NSE:BAJAJ-AUTO-EQ,10,10,16669,BAJAJ-AUTO,16669,-1.0,XX,101000000016669,None,1,3.7',
  '101000000026000,NIFTY50-INDEX,10,1,0.05,,0915-1530|:,2026-10-14,,NSE:NIFTY50-INDEX,10,10,26000,NIFTY50,26000,-1.0,XX,101000000026000,None,0,0.0',
  '101000000026009,NIFTYBANK-INDEX,10,1,0.05,,0915-1530|:,2026-10-14,,NSE:NIFTYBANK-INDEX,10,10,26009,NIFTYBANK,26009,-1.0,XX,101000000026009,None,0,0.0',
  ...Array.from({ length: 60 }, (_, i) => `1010000000${9000 + i},TEST STOCK ${i},0,1,0.05,,0915-1530|:,2026-10-14,,NSE:TST${i}-EQ,10,10,${9000 + i},TST${i},${9000 + i},-1.0,XX,1010000000${9000 + i},None,1,3.7`),
].join('\n');
const NSE_FO = [
  '101126102748994,SBIN 27 Oct 26 FUT,13,750,0.05,,0915-1540|1815-1915:,2026-10-14,1793095800,NSE:SBIN26OCTFUT,10,11,48994,SBIN,3045,-1.0,XX,10100000003045,None,0,0.0',
  '101126102735018,BANKNIFTY 27 Oct 26 71900 CE,14,30,0.05,,0915-1540|1815-1915:,2026-10-14,1793095800,NSE:BANKNIFTY26OCT71900CE,10,11,35018,BANKNIFTY,26009,71900.0,CE,101000000026009,None,0,0.0',
].join('\n');

/** A compat client whose HTTP layer and master download are stubbed. */
function stubbedCompat(handlers: Partial<Record<'get' | 'post' | 'patch' | 'delete', (url: string, arg?: any) => any>>) {
  const compat = new FyersKiteCompat('TESTAPP-100', 'test-token');
  const calls: Array<{ method: string; url: string; arg: any }> = [];
  for (const method of ['get', 'post', 'patch', 'delete'] as const) {
    (compat.http as any)[method] = async (url: string, arg?: any) => {
      calls.push({ method, url, arg });
      const h = handlers[method];
      if (!h) throw new Error(`unexpected ${method} ${url}`);
      return h(url, arg);
    };
  }
  (compat as any).getInstruments = async (exchange: string) => {
    const rows = parseFyersMaster(exchange === 'NFO' ? NSE_FO : NSE_CM, exchange);
    // same side effects as the real download: symbol + token registries
    const { registerFyersSymbols } = await import('../src/brokers/fyers/fyers-symbols');
    registerFyersSymbols(rows);
    return rows;
  };
  return { compat, calls };
}

test('Kite <-> FYERS symbols', () => {
  assert.equal(toFyersSymbol('NSE:SBIN'), 'NSE:SBIN-EQ');
  assert.equal(toFyersSymbol('SBIN'), 'NSE:SBIN-EQ');
  assert.equal(toFyersSymbol('NSE:BAJAJ-AUTO'), 'NSE:BAJAJ-AUTO-EQ');
  assert.equal(toFyersSymbol('NSE:3IINFOLTD-BE'), 'NSE:3IINFOLTD-BE');
  assert.equal(toFyersSymbol('NSE:NIFTY 50'), 'NSE:NIFTY50-INDEX');
  assert.equal(toFyersSymbol('NSE:BANKNIFTY'), 'NSE:NIFTYBANK-INDEX');
  assert.equal(toFyersSymbol('BSE:SENSEX'), 'BSE:SENSEX-INDEX');
  assert.equal(toFyersSymbol('NFO:BANKNIFTY26OCT71900CE'), 'NSE:BANKNIFTY26OCT71900CE');
  assert.deepEqual(fromFyersSymbol('NSE:SBIN-EQ', 10), { exchange: 'NSE', tradingsymbol: 'SBIN' });
  assert.deepEqual(fromFyersSymbol('NSE:BAJAJ-AUTO-EQ'), { exchange: 'NSE', tradingsymbol: 'BAJAJ-AUTO' });
  assert.deepEqual(fromFyersSymbol('NSE:3IINFOLTD-BE'), { exchange: 'NSE', tradingsymbol: '3IINFOLTD-BE' });
  assert.deepEqual(fromFyersSymbol('NSE:NIFTY50-INDEX'), { exchange: 'NSE', tradingsymbol: 'NIFTY 50' });
  assert.deepEqual(fromFyersSymbol('NSE:SBIN26OCTFUT', 11), { exchange: 'NFO', tradingsymbol: 'SBIN26OCTFUT' });
  assert.deepEqual(fromFyersSymbol('NSE:BAJAJ-AUTO26OCTFUT'), { exchange: 'NFO', tradingsymbol: 'BAJAJ-AUTO26OCTFUT' });
  assert.equal(toFyersResolution('5minute'), '5');
  assert.equal(toFyersResolution('minute'), '1');
  assert.equal(toFyersResolution('day'), '1D');
  assert.equal(fromFyersOrderStatus(2), 'COMPLETE');
  assert.equal(fromFyersOrderStatus(6, 4), 'TRIGGER PENDING');
  assert.equal(fromFyersOrderStatus(6, 1), 'OPEN');
  assert.equal(fromFyersOrderStatus(5), 'REJECTED');
});

test('symbol master -> Kite-compatible instrument rows and tokens', () => {
  const nse = parseFyersMaster(NSE_CM, 'NSE');
  const sbin = nse.find((r) => r.tradingsymbol === 'SBIN')!;
  assert.equal(sbin.instrument_token, 779521); // Kite's own SBIN token: 3045 * 256 + 1
  assert.equal(sbin.instrument_type, 'EQ');
  assert.equal(sbin.tick_size, 0.05);
  assert.equal(sbin.fyers_symbol, 'NSE:SBIN-EQ');
  const nifty = nse.find((r) => r.tradingsymbol === 'NIFTY 50')!;
  assert.equal(nifty.instrument_token, 256265); // Kite's NIFTY 50 token
  assert.equal(nifty.segment, 'INDICES');
  const nfo = parseFyersMaster(NSE_FO, 'NFO');
  const fut = nfo.find((r) => r.tradingsymbol === 'SBIN26OCTFUT')!;
  assert.equal(fut.name, 'SBIN');
  assert.equal(fut.lot_size, 750);
  assert.equal(fut.segment, 'NFO-FUT');
  assert.equal(nfo.find((r) => r.instrument_type === 'CE')!.segment, 'NFO-OPT');
});

test('FYERS instrument cache never replaces the shared Kite master', async () => {
  const { compat } = stubbedCompat({});
  await getSharedInstruments(compat, 'NSE');
  assert.equal(InstrumentStore.isFresh('FYERS:NSE'), true);
  assert.equal(InstrumentStore.isFresh('NSE'), false);
});

test('getQuote: Kite shape, caller keys kept, 50 symbols per request', async () => {
  const { compat, calls } = stubbedCompat({
    get: (_url, params) => ({
      s: 'ok',
      d: String(params.symbols).split(',').map((n: string) => ({
        n, s: 'ok',
        v: { lp: 101.5, open_price: 100, high_price: 102, low_price: 99, prev_close_price: 98, volume: 12345, tt: 1792041000, ch: 3.5 },
      })),
    }),
  });
  const keys = ['NSE:NIFTY 50', ...Array.from({ length: 119 }, (_, i) => `NSE:TST${i}`)];
  const q = await compat.getQuote(keys);
  assert.equal(calls.length, 3);
  assert.ok(calls.every((c) => String(c.arg.symbols).split(',').length <= 50));
  assert.ok(String(calls[0].arg.symbols).includes('NSE:NIFTY50-INDEX'));
  assert.equal(q['NSE:NIFTY 50'].last_price, 101.5);
  assert.deepEqual(q['NSE:TST7'].ohlc, { open: 100, high: 102, low: 99, close: 98 });
  assert.equal(q['NSE:TST7'].volume, 12345);
  assert.ok(q['NSE:TST7'].timestamp instanceof Date);
  const ltp = await compat.getLTP('NSE:TST1');
  assert.equal(ltp['NSE:TST1'].last_price, 101.5);
});

test('getHistoricalData: Kite token -> FYERS symbol, candles in Kite shape, long ranges split', async () => {
  const { compat, calls } = stubbedCompat({
    get: (_url, p) => ({ s: 'ok', candles: [[Number(p.range_from), 10, 11, 9, 10.5, 1000], [Number(p.range_from) + 300, 10.5, 12, 10, 11.5, 2000]] }),
  });
  const to = new Date('2026-10-15T10:00:00+05:30');
  const from = new Date(to.getTime() - 5 * 24 * 3600_000);
  const candles = await compat.getHistoricalData(779521, '5minute', from, to, false);
  assert.equal(calls[0].arg.symbol, 'NSE:SBIN-EQ');
  assert.equal(calls[0].arg.resolution, '5');
  assert.equal(calls[0].arg.date_format, 0);
  assert.equal(candles.length, 2);
  assert.ok(candles[0].date instanceof Date);
  assert.deepEqual({ ...candles[1], date: undefined }, { date: undefined, open: 10.5, high: 12, low: 10, close: 11.5, volume: 2000 });

  calls.length = 0;
  await compat.getHistoricalData(256265, 'minute', new Date(to.getTime() - 150 * 24 * 3600_000), to);
  assert.equal(calls.length, 2); // 150 days of 1m bars -> two <=100-day windows
  assert.equal(calls[0].arg.symbol, 'NSE:NIFTY50-INDEX');
});

test('funds, positions and orders map to the Kite fields the engines read', async () => {
  const { compat } = stubbedCompat({
    get: (url) => {
      if (url.endsWith('/funds')) return { s: 'ok', fund_limit: [
        { id: 1, title: 'Total Balance', equityAmount: 60000, commodityAmount: 0 },
        { id: 2, title: 'Utilized Amount', equityAmount: 10000, commodityAmount: 0 },
        { id: 3, title: 'Clear Balance', equityAmount: 60000, commodityAmount: 0 },
        { id: 10, title: 'Available Balance', equityAmount: 50000, commodityAmount: 0 },
      ] };
      if (url.endsWith('/positions')) return { s: 'ok', netPositions: [
        { symbol: 'NSE:SBIN-EQ', segment: 10, netQty: -20, netAvg: 812.5, ltp: 805, pl: 150, productType: 'INTRADAY', buyQty: 0, sellQty: 20 },
      ] };
      if (url.endsWith('/orders')) return { s: 'ok', orderBook: [
        { id: '26101500001', symbol: 'NSE:SBIN-EQ', segment: 10, qty: 20, filledQty: 20, remainingQuantity: 0, limitPrice: 0, stopPrice: 0, tradedPrice: 812.5, type: 2, side: -1, productType: 'INTRADAY', status: 2, orderDateTime: '15-Oct-2026 09:25:03', orderTag: 'EMAVWAPENTRY' },
        { id: '26101500002', symbol: 'NSE:SBIN-EQ', segment: 10, qty: 20, filledQty: 0, limitPrice: 821, stopPrice: 820, type: 4, side: 1, productType: 'INTRADAY', status: 6, orderDateTime: '15-Oct-2026 09:25:04' },
      ] };
      throw new Error(`unexpected ${url}`);
    },
  });
  const m = await compat.getMargins();
  assert.equal(m.equity.available.live_balance, 50000);
  assert.equal(m.equity.available.cash, 60000);
  assert.equal(m.equity.net, 50000);
  const pos = await compat.getPositions();
  assert.equal(pos.net[0].tradingsymbol, 'SBIN');
  assert.equal(pos.net[0].quantity, -20);
  assert.equal(pos.net[0].product, 'MIS');
  assert.equal(pos.day[0].day_sell_quantity, 20);
  const orders = await compat.getOrders();
  assert.equal(orders[0].status, 'COMPLETE');
  assert.equal(orders[0].transaction_type, 'SELL');
  assert.equal(orders[0].order_type, 'MARKET');
  assert.equal(orders[0].average_price, 812.5);
  assert.equal(orders[0].order_timestamp, '2026-10-15 09:25:03');
  assert.equal(orders[1].status, 'TRIGGER PENDING');
  assert.equal(orders[1].order_type, 'SL');
  assert.equal(orders[1].trigger_price, 820);
});

test('live orders are blocked unless FYERS_LIVE_ORDERS=true, through the client and the raw facade', async () => {
  assert.equal(fyersLiveOrdersEnabled(), false);
  const { compat, calls } = stubbedCompat({ post: () => ({ s: 'ok', id: 'X1' }), patch: () => ({ s: 'ok', id: 'X1' }) });
  await assert.rejects(compat.placeOrder('regular', { exchange: 'NSE', tradingsymbol: 'SBIN', transaction_type: 'BUY', quantity: 1, order_type: 'MARKET', product: 'MIS' }), /disabled/);
  await assert.rejects(compat.modifyOrder('regular', 'X1', { trigger_price: 800, order_type: 'SL-M' }), /disabled/);

  const client = new FyersClient('TESTAPP-100', 'test-token');
  (client as any).kite = compat;
  await assert.rejects(client.placeOrder({ symbol: 'SBIN', exchange: 'NSE', side: 'BUY', orderType: 'MARKET', product: 'MIS', qty: 1, intent: 'ENTRY' }), /disabled/);
  assert.equal(calls.filter((c) => c.method === 'post' || c.method === 'patch').length, 0);
});

test('order payload mapping (stubbed transport, switch on only inside this test)', async () => {
  const { compat, calls } = stubbedCompat({ post: () => ({ s: 'ok', id: '26101500009' }) });
  process.env.FYERS_LIVE_ORDERS = 'true';
  try {
    const res = await compat.placeOrder('regular', {
      exchange: 'NSE', tradingsymbol: 'SBIN', transaction_type: 'SELL', quantity: 20, order_type: 'SL',
      price: 795, trigger_price: 796, product: 'MIS', tag: 'EMAVWAP_SL-1',
    });
    assert.equal(res.order_id, '26101500009');
  } finally {
    delete process.env.FYERS_LIVE_ORDERS;
  }
  assert.deepEqual(calls[0].arg, {
    symbol: 'NSE:SBIN-EQ', qty: 20, type: 4, side: -1, productType: 'INTRADAY', limitPrice: 795, stopPrice: 796,
    validity: 'DAY', disclosedQty: 0, offlineOrder: false, stopLoss: 0, takeProfit: 0, orderTag: 'EMAVWAPSL1',
  });
});

test('FYERS errors classify like Kite errors', () => {
  const expired = fyersError({ s: 'error', code: -16, message: 'Could not authenticate the user' }, 401);
  assert.ok(toKiteError(expired) instanceof TokenException);
  assert.equal(isKiteAuthError(expired), true);
  const limited = fyersError({ s: 'error', code: 429, message: 'request limit reached' }, 429);
  assert.ok(toKiteError(limited) instanceof RateLimitException);
  assert.equal(isKiteAuthError(limited), false);
});

test('login helpers', () => {
  assert.equal(fyersAppIdHash('ABC-100', 'secret'), require('crypto').createHash('sha256').update('ABC-100:secret').digest('hex'));
  const url = new URL(fyersLoginUrl('ABC-100', 'http://localhost:3000/brokers/callback', 's1.s2.s3'));
  assert.equal(url.origin + url.pathname, 'https://api-t1.fyers.in/api/v3/generate-authcode');
  assert.equal(url.searchParams.get('client_id'), 'ABC-100');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('state'), 's1.s2.s3');
});

test('the real EMA-VWAP stock scanner ranks FYERS quotes through the facade', async () => {
  const { compat, calls } = stubbedCompat({
    get: (url, p) => {
      if (url.endsWith('/funds')) return { s: 'ok', fund_limit: [{ id: 10, title: 'Available Balance', equityAmount: 50000 }] };
      if (url.endsWith('/history')) return { s: 'ok', candles: [] };
      if (url.endsWith('/quotes')) {
        return { s: 'ok', d: String(p.symbols).split(',').map((n: string) => {
          const i = Number(n.replace(/\D/g, '')) || 1;
          const prev = 200 + i;
          const lp = prev * (1 + (i % 7) / 100); // 0-6% movers
          return { n, s: 'ok', v: { lp, open_price: prev * 1.002, high_price: lp * 1.004, low_price: prev * 0.998, prev_close_price: prev, volume: 500000 + i * 1000, tt: 1792041000 } };
        }) };
      }
      throw new Error(`unexpected ${url}`);
    },
  });
  const picks = await getTopCandidateStocks(compat, 1000, 500, undefined, undefined, 10);
  assert.ok(picks.length > 0, 'scanner returned no candidates');
  assert.ok(picks.every((c) => /^TST\d+$/.test(c.symbol) || c.symbol === 'SBIN' || c.symbol === 'RELIANCE' || c.symbol === 'BAJAJ-AUTO'));
  assert.ok(calls.some((c) => c.url.endsWith('/quotes')));
  assert.equal(calls.filter((c) => c.method !== 'get').length, 0);
});
