import axios from 'axios';
import { getSharedInstruments, resolveIndex } from '../instrument-store';
import { FYERS_API, FYERS_DATA, FyersHttp, fyersError } from './fyers-http';
import {
  FYERS_MASTER_URLS, FyersInstrument, fromFyersOrderStatus, fromFyersOrderType, fromFyersProduct, fromFyersSide,
  fromFyersSymbol, maxHistoryDays, parseFyersMaster, registerFyersSymbols, toFyersOrderType, toFyersProduct,
  toFyersResolution, toFyersSide, toFyersSymbol, toKiteTimestamp,
} from './fyers-symbols';

/** FYERS quotes take at most 50 symbols per request. */
const QUOTE_BATCH = 50;
const DAY_MS = 24 * 3600_000;

/** Kite segment id (low byte of a token) -> the master that holds it. Indices (9) live in the cash masters. */
const EXCHANGE_BY_SEGMENT: Record<number, string> = { 1: 'NSE', 2: 'NFO', 3: 'CDS', 4: 'BSE', 5: 'BFO', 7: 'MCX', 9: 'NSE' };

/** Instrument token -> FYERS symbol, filled whenever a master is parsed (the shared store keeps slim rows only). */
const fyersSymbolByToken = new Map<number, string>();

/**
 * Live FYERS orders are off unless FYERS_LIVE_ORDERS=true. PAPER trading never reaches here (the engines book PAPER_ ids
 * themselves); this is the backstop so a misconfigured strategy or a test can never send a real FYERS order.
 */
export function fyersLiveOrdersEnabled(): boolean {
  return String(process.env.FYERS_LIVE_ORDERS || '').toLowerCase() === 'true';
}

function assertLiveOrdersEnabled(action: string) {
  if (!fyersLiveOrdersEnabled()) {
    const err: any = new Error(`FYERS live orders are disabled (${action} blocked). Run strategies in PAPER mode, or set FYERS_LIVE_ORDERS=true once the FYERS adapter has been verified.`);
    err.error_type = 'OrderException';
    throw err;
  }
}

const num = (v: any) => (v === undefined || v === null || v === '' ? 0 : Number(v));

/**
 * A kiteconnect-shaped facade over FYERS API v3.
 *
 * The engines and scanners call the raw Kite client (`client['kite'].getQuote(...)`, `.getOrders()`, `.getHistoricalData(token, ...)`)
 * and read Kite field names (`last_price`, `ohlc.close`, `order_id`, `status === 'COMPLETE'`). Rather than touch that logic, a FYERS
 * account gets this object in the `kite` slot: same method names and signatures, same response shapes, FYERS underneath.
 */
export class FyersKiteCompat {
  /** Keeps FYERS-built instrument rows out of the Kite master the other accounts share (see getSharedInstruments). */
  readonly instrumentNamespace = 'FYERS';
  readonly http: FyersHttp;

  constructor(readonly appId: string, accessToken: string | null) {
    this.http = new FyersHttp(appId, accessToken);
  }

  // ─── Account ────────────────────────────────────────────────────────────────

  async getProfile() {
    const res = await this.http.get(`${FYERS_API}/profile`);
    const p = res?.data || {};
    return { user_id: p.fy_id, user_name: p.name, user_shortname: p.display_name || p.name, email: p.email_id, broker: 'FYERS', raw: p };
  }

  /** Kite `getMargins()` shape built from FYERS `/funds` (equity and commodity columns of `fund_limit`). */
  async getMargins() {
    const res = await this.http.get(`${FYERS_API}/funds`);
    const rows: any[] = res?.fund_limit || [];
    const pick = (title: string, id: number, col: 'equityAmount' | 'commodityAmount') => {
      const row = rows.find((r) => String(r.title || '').toLowerCase() === title) ?? rows.find((r) => Number(r.id) === id);
      return num(row?.[col]);
    };
    const segment = (col: 'equityAmount' | 'commodityAmount') => {
      const available = pick('available balance', 10, col);
      return {
        enabled: true,
        net: available,
        available: {
          cash: pick('clear balance', 3, col),
          live_balance: available,
          opening_balance: pick('limit at start of the day', 9, col),
          collateral: pick('collaterals', 5, col),
          adhoc_margin: pick('adhoc limit', 8, col),
          intraday_payin: 0,
        },
        utilised: { debits: pick('utilized amount', 2, col), m2m_realised: pick('realized profit and loss', 4, col) },
      };
    };
    return { equity: segment('equityAmount'), commodity: segment('commodityAmount') };
  }

  async getHoldings() {
    const res = await this.http.get(`${FYERS_API}/holdings`);
    return (res?.holdings || []).map((h: any) => {
      const { exchange, tradingsymbol } = fromFyersSymbol(h.symbol, h.segment);
      return {
        tradingsymbol, exchange, isin: h.isin,
        quantity: num(h.quantity), t1_quantity: 0,
        average_price: num(h.costPrice), last_price: num(h.ltp), pnl: num(h.pl),
        product: 'CNC',
      };
    });
  }

  /** Kite `{ net, day }`; FYERS has one net list, used for both. */
  async getPositions() {
    const res = await this.http.get(`${FYERS_API}/positions`);
    const net = (res?.netPositions || []).map((p: any) => {
      const { exchange, tradingsymbol } = fromFyersSymbol(p.symbol, p.segment);
      const buyQty = num(p.buyQty);
      const sellQty = num(p.sellQty);
      return {
        tradingsymbol, exchange,
        product: fromFyersProduct(p.productType),
        quantity: num(p.netQty),
        average_price: num(p.netAvg ?? p.avgPrice),
        last_price: num(p.ltp),
        pnl: num(p.pl),
        realised: num(p.realized_profit),
        unrealised: num(p.unrealized_profit),
        buy_quantity: buyQty,
        sell_quantity: sellQty,
        buy_price: num(p.buyAvg),
        sell_price: num(p.sellAvg),
        day_buy_quantity: num(p.dayBuyQty ?? buyQty - num(p.cfBuyQty)),
        day_sell_quantity: num(p.daySellQty ?? sellQty - num(p.cfSellQty)),
      };
    });
    return { net, day: net };
  }

  private mapOrder(o: any) {
    const { exchange, tradingsymbol } = fromFyersSymbol(o.symbol, o.segment);
    const qty = num(o.qty);
    const filled = num(o.filledQty);
    return {
      order_id: String(o.id),
      exchange_order_id: o.exchOrdId || null,
      tradingsymbol, exchange,
      order_type: fromFyersOrderType(o.type),
      transaction_type: fromFyersSide(o.side),
      product: fromFyersProduct(o.productType),
      variety: o.offlineOrder ? 'amo' : 'regular',
      status: fromFyersOrderStatus(o.status, o.type),
      status_message: o.message || null,
      quantity: qty,
      filled_quantity: filled,
      pending_quantity: num(o.remainingQuantity ?? qty - filled),
      cancelled_quantity: Number(o.status) === 1 || Number(o.status) === 7 ? qty - filled : 0,
      price: num(o.limitPrice),
      trigger_price: num(o.stopPrice),
      average_price: num(o.tradedPrice),
      validity: o.orderValidity || 'DAY',
      tag: o.orderTag || null,
      order_timestamp: toKiteTimestamp(o.orderDateTime),
      exchange_timestamp: toKiteTimestamp(o.orderDateTime),
    };
  }

  async getOrders() {
    const res = await this.http.get(`${FYERS_API}/orders`);
    return (res?.orderBook || []).map((o: any) => this.mapOrder(o));
  }

  /** Kite returns the order's state transitions; FYERS has only the current row, returned as a one-step history. */
  async getOrderHistory(orderId: string) {
    const orders = await this.getOrders();
    return orders.filter((o: any) => o.order_id === String(orderId));
  }

  async getTrades() {
    const res = await this.http.get(`${FYERS_API}/tradebook`);
    return (res?.tradeBook || []).map((t: any) => {
      const { exchange, tradingsymbol } = fromFyersSymbol(t.symbol, t.segment);
      return {
        trade_id: String(t.tradeNumber ?? t.id),
        order_id: String(t.orderNumber),
        tradingsymbol, exchange,
        transaction_type: fromFyersSide(t.side),
        product: fromFyersProduct(t.productType),
        quantity: num(t.tradedQty),
        average_price: num(t.tradePrice),
        fill_timestamp: toKiteTimestamp(t.orderDateTime),
        exchange_timestamp: toKiteTimestamp(t.orderDateTime),
      };
    });
  }

  // ─── Market data ────────────────────────────────────────────────────────────

  /** Kite `getQuote` shape keyed by the caller's own keys (`NSE:SBIN`, `NSE:NIFTY 50`); unknown symbols are omitted, as on Kite. */
  async getQuote(instruments: string | string[]): Promise<Record<string, any>> {
    const keys = Array.from(new Set((Array.isArray(instruments) ? instruments : [instruments]).filter(Boolean)));
    const out: Record<string, any> = {};
    for (let i = 0; i < keys.length; i += QUOTE_BATCH) {
      const batch = keys.slice(i, i + QUOTE_BATCH);
      const byFyers = new Map<string, string[]>();
      for (const k of batch) {
        const f = toFyersSymbol(k);
        byFyers.set(f, [...(byFyers.get(f) || []), k]);
      }
      const res = await this.http.get(`${FYERS_DATA}/quotes`, { symbols: Array.from(byFyers.keys()).join(',') });
      for (const row of res?.d || []) {
        if (row?.s !== 'ok' || !row.v) continue;
        const v = row.v;
        const lp = num(v.lp);
        if (!(lp > 0)) continue;
        const tsSec = num(v.tt);
        const quote = {
          instrument_token: undefined as number | undefined,
          last_price: lp,
          volume: num(v.volume),
          average_price: num(v.atp ?? v.avg_trade_price),
          net_change: num(v.ch),
          timestamp: tsSec > 0 ? new Date(tsSec * 1000) : null,
          ohlc: { open: num(v.open_price), high: num(v.high_price), low: num(v.low_price), close: num(v.prev_close_price) },
          depth: undefined,
        };
        for (const k of byFyers.get(row.n) || byFyers.get(String(v.symbol)) || []) out[k] = quote;
      }
    }
    return out;
  }

  async getLTP(instruments: string | string[]) {
    const quotes = await this.getQuote(instruments);
    const out: Record<string, any> = {};
    for (const [k, q] of Object.entries(quotes)) out[k] = { instrument_token: q.instrument_token, last_price: q.last_price };
    return out;
  }

  async getOHLC(instruments: string | string[]) {
    const quotes = await this.getQuote(instruments);
    const out: Record<string, any> = {};
    for (const [k, q] of Object.entries(quotes)) out[k] = { instrument_token: q.instrument_token, last_price: q.last_price, ohlc: q.ohlc };
    return out;
  }

  /** Raw master download for one Kite exchange. Callers cache it through getSharedInstruments (namespaced, once a day). */
  async getInstruments(exchange: string = 'NSE'): Promise<FyersInstrument[]> {
    const exch = (exchange || 'NSE').toUpperCase();
    const url = FYERS_MASTER_URLS[exch];
    if (!url) throw fyersError({ message: `No FYERS symbol master for exchange ${exch}` }, 400);
    const res = await axios.get(url, { responseType: 'text', timeout: 60000, transformResponse: (d) => d });
    const rows = parseFyersMaster(String(res.data || ''), exch);
    if (rows.length === 0) throw fyersError({ message: `FYERS ${exch} symbol master was empty` }, 502);
    registerFyersSymbols(rows);
    for (const r of rows) fyersSymbolByToken.set(r.instrument_token, r.fyers_symbol);
    return rows;
  }

  /** Token -> FYERS symbol, loading the token's master on a miss. */
  async resolveToken(token: number): Promise<string> {
    const t = Number(token);
    let sym = fyersSymbolByToken.get(t);
    if (sym) return sym;
    const exch = EXCHANGE_BY_SEGMENT[t & 0xff];
    if (exch) {
      const rows = await getSharedInstruments(this, exch);
      const row = rows.find((r) => r.instrument_token === t);
      sym = fyersSymbolByToken.get(t) ?? (row ? toFyersSymbol(`${row.exchange}:${row.tradingsymbol}`) : undefined);
    }
    if (!sym) {
      const idx = resolveIndexByToken(t);
      if (idx) sym = toFyersSymbol(idx);
    }
    if (!sym) throw fyersError({ code: -50, message: `Unknown instrument token ${token} for FYERS` }, 400);
    fyersSymbolByToken.set(t, sym);
    return sym;
  }

  /**
   * Kite `getHistoricalData(token, interval, from, to, continuous)` -> `[{ date, open, high, low, close, volume }]`.
   * Long ranges are split into FYERS-sized windows (100 days intraday, 366 daily).
   */
  async getHistoricalData(instrumentToken: number | string, interval: string, from: Date | string, to: Date | string, continuous = false, _oi = false) {
    const symbol = typeof instrumentToken === 'string' && instrumentToken.includes(':')
      ? toFyersSymbol(instrumentToken)
      : await this.resolveToken(Number(instrumentToken));
    const resolution = toFyersResolution(interval);
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return [];
    const windowMs = maxHistoryDays(resolution) * DAY_MS;
    const candles: any[] = [];
    let lastTs = -Infinity;
    for (let start = fromMs; start <= toMs; start += windowMs) {
      const end = Math.min(toMs, start + windowMs - 1000);
      const res = await this.http.get(`${FYERS_DATA}/history`, {
        symbol,
        resolution,
        date_format: 0,
        range_from: Math.floor(start / 1000),
        range_to: Math.floor(end / 1000),
        cont_flag: continuous ? 1 : 0,
      });
      for (const c of res?.candles || []) {
        const ts = Number(c[0]);
        if (!(ts > lastTs)) continue; // windows can share an edge candle
        lastTs = ts;
        candles.push({ date: new Date(ts * 1000), open: num(c[1]), high: num(c[2]), low: num(c[3]), close: num(c[4]), volume: num(c[5]) });
      }
    }
    return candles;
  }

  // ─── Orders (live-order guard applies) ─────────────────────────────────────

  /** Kite `placeOrder(variety, params)` -> `{ order_id }`. */
  async placeOrder(variety: string, params: any) {
    assertLiveOrdersEnabled('placeOrder');
    const orderType = toFyersOrderType(params.order_type);
    const body: any = {
      symbol: toFyersSymbol(`${params.exchange}:${params.tradingsymbol}`),
      qty: Number(params.quantity),
      type: orderType,
      side: toFyersSide(params.transaction_type),
      productType: toFyersProduct(params.product),
      limitPrice: orderType === 1 || orderType === 4 ? Number(params.price) || 0 : 0,
      stopPrice: orderType === 3 || orderType === 4 ? Number(params.trigger_price) || 0 : 0,
      validity: (params.validity || 'DAY').toUpperCase(),
      disclosedQty: Number(params.disclosed_quantity) || 0,
      offlineOrder: String(variety || '').toLowerCase() === 'amo',
      stopLoss: 0,
      takeProfit: 0,
    };
    const tag = String(params.tag || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 20);
    if (tag) body.orderTag = tag;
    const res = await this.http.post(`${FYERS_API}/orders/sync`, body);
    if (!res?.id) throw fyersError(res, 400);
    return { order_id: String(res.id) };
  }

  /** Kite `modifyOrder(variety, orderId, { price, trigger_price, quantity, order_type })`. */
  async modifyOrder(_variety: string, orderId: string, params: any) {
    assertLiveOrdersEnabled('modifyOrder');
    let type = params.order_type ? toFyersOrderType(params.order_type) : undefined;
    if (type === undefined) {
      const current = (await this.getOrders()).find((o: any) => o.order_id === String(orderId));
      if (current) type = toFyersOrderType(current.order_type);
    }
    const body: any = { id: String(orderId) };
    if (type !== undefined) body.type = type;
    if (params.price !== undefined) body.limitPrice = Number(params.price);
    if (params.trigger_price !== undefined) body.stopPrice = Number(params.trigger_price);
    if (params.quantity !== undefined) body.qty = Number(params.quantity);
    const res = await this.http.patch(`${FYERS_API}/orders/sync`, body);
    return { order_id: String(res?.id ?? orderId) };
  }

  /** Cancelling only ever reduces exposure, so it is not behind the live-order switch. */
  async cancelOrder(_variety: string, orderId: string) {
    const res = await this.http.delete(`${FYERS_API}/orders/sync`, { id: String(orderId) });
    return { order_id: String(res?.id ?? orderId) };
  }

  async placeGTT(_params: any): Promise<any> {
    throw fyersError({ message: 'GTT orders are not supported by the FYERS adapter yet' }, 400);
  }
}

function resolveIndexByToken(token: number): string | undefined {
  for (const key of ['NIFTY 50', 'NIFTY BANK', 'SENSEX', 'NIFTY FIN SERVICE', 'NIFTY MID SELECT', 'NIFTY IT']) {
    const idx = resolveIndex(key);
    if (idx?.token === token) return `${idx.exchange}:${idx.tradingsymbol}`;
  }
  return undefined;
}
