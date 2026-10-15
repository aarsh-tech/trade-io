import { INDEX_INSTRUMENTS, Instrument } from '../instrument-store';

/**
 * Kite <-> FYERS symbol, product and order-type mapping.
 *
 * The engines speak Kite: `EXCH:TRADINGSYMBOL` keys (`NSE:SBIN`, `NSE:NIFTY 50`), numeric instrument tokens, MIS/CNC/NRML
 * products and MARKET/LIMIT/SL/SL-M order types. FYERS v3 uses `NSE:SBIN-EQ` / `NSE:NIFTY50-INDEX` symbols, INTRADAY/CNC/MARGIN
 * products and numeric order types. Everything here is pure so it can be tested offline.
 */

/** Kite segment ids, used to build Kite-compatible instrument tokens: token = exchange_token * 256 + segment. */
const KITE_SEGMENT_ID: Record<string, number> = { NSE: 1, NFO: 2, CDS: 3, BSE: 4, BFO: 5, BCD: 6, MCX: 7 };

/** FYERS symbol-master files per Kite exchange (public, no login needed). */
export const FYERS_MASTER_URLS: Record<string, string> = {
  NSE: 'https://public.fyers.in/sym_details/NSE_CM.csv',
  NFO: 'https://public.fyers.in/sym_details/NSE_FO.csv',
  BSE: 'https://public.fyers.in/sym_details/BSE_CM.csv',
  BFO: 'https://public.fyers.in/sym_details/BSE_FO.csv',
  CDS: 'https://public.fyers.in/sym_details/NSE_CD.csv',
  MCX: 'https://public.fyers.in/sym_details/MCX_COM.csv',
};

/** Kite index tradingsymbol -> FYERS index symbol (checked against the FYERS NSE_CM / BSE_CM masters). */
export const FYERS_INDEX_SYMBOLS: Record<string, string> = {
  'NSE:NIFTY 50': 'NSE:NIFTY50-INDEX',
  'NSE:NIFTY BANK': 'NSE:NIFTYBANK-INDEX',
  'BSE:SENSEX': 'BSE:SENSEX-INDEX',
  'NSE:NIFTY FIN SERVICE': 'NSE:FINNIFTY-INDEX',
  'NSE:NIFTY MID SELECT': 'NSE:MIDCPNIFTY-INDEX',
  'NSE:NIFTY IT': 'NSE:NIFTYIT-INDEX',
  'NSE:INDIA VIX': 'NSE:INDIAVIX-INDEX',
};
const KITE_INDEX_BY_FYERS: Record<string, string> = Object.fromEntries(
  Object.entries(FYERS_INDEX_SYMBOLS).map(([k, f]) => [f, k]),
);

/** Exchanges whose FYERS symbols carry a series suffix for cash equities (`-EQ`, `-BE`, ...). */
const CASH_EXCHANGES = new Set(['NSE', 'BSE']);

/**
 * Cash-market series suffixes (every FYERS NSE_CM symbol ends in one). A hyphen alone proves nothing: `BAJAJ-AUTO` is a
 * plain EQ name and `BAJAJ-AUTO26OCTFUT` a future.
 */
const SERIES_SUFFIX = /-(EQ|BE|BZ|BL|SM|ST|SZ|SG|GB|GS|IL|IT|IV|RR|MF|TB|[A-Z]\d)$/;

/** Kite key -> FYERS symbol, filled from the loaded symbol master; the heuristics below only cover what it lacks. */
const knownFyersSymbols = new Map<string, string>();

export function registerFyersSymbols(rows: Array<{ exchange: string; tradingsymbol: string; fyers_symbol: string }>) {
  for (const r of rows) knownFyersSymbols.set(`${r.exchange}:${r.tradingsymbol}`, r.fyers_symbol);
}

/**
 * `NSE:SBIN` -> `NSE:SBIN-EQ`, `NSE:NIFTY 50` -> `NSE:NIFTY50-INDEX`, `NFO:NIFTY26OCT25000CE` -> `NSE:NIFTY26OCT25000CE`.
 * Kite already writes non-EQ cash series with their suffix (`NSE:XYZ-BE`), so only a bare cash symbol gets `-EQ`.
 */
export function toFyersSymbol(kiteKey: string): string {
  const key = (kiteKey || '').trim().toUpperCase();
  const [rawExch, ...rest] = key.includes(':') ? key.split(':') : ['NSE', key];
  const sym = rest.join(':');
  const exch = rawExch || 'NSE';
  const known = knownFyersSymbols.get(`${exch}:${sym}`);
  if (known) return known;
  const index = FYERS_INDEX_SYMBOLS[`${exch}:${sym}`];
  if (index) return index;
  const idx = INDEX_INSTRUMENTS.find((i) => i.aliases.includes(sym));
  if (idx && FYERS_INDEX_SYMBOLS[`${idx.exchange}:${idx.tradingsymbol}`]) return FYERS_INDEX_SYMBOLS[`${idx.exchange}:${idx.tradingsymbol}`];
  if (CASH_EXCHANGES.has(exch)) return SERIES_SUFFIX.test(sym) ? `${exch}:${sym}` : `${exch}:${sym}-EQ`;
  if (exch === 'NFO' || exch === 'CDS') return `NSE:${sym}`;
  if (exch === 'BFO') return `BSE:${sym}`;
  return `${exch}:${sym}`;
}

/**
 * FYERS symbol -> Kite `{ exchange, tradingsymbol }`. `segment` (FYERS numeric segment: 10 CM, 11 FO, 12 CD, 20 COM)
 * tells F&O rows apart, because FYERS writes NFO contracts with the `NSE:` prefix.
 */
export function fromFyersSymbol(fyersSymbol: string, segment?: number | string): { exchange: string; tradingsymbol: string } {
  const s = (fyersSymbol || '').trim().toUpperCase();
  const kiteIndex = KITE_INDEX_BY_FYERS[s];
  if (kiteIndex) {
    const [exchange, tradingsymbol] = kiteIndex.split(':');
    return { exchange, tradingsymbol };
  }
  const [exch, sym = ''] = s.split(':');
  const seg = Number(segment);
  const isDerivative = seg === 11 || seg === 12 || (!SERIES_SUFFIX.test(sym) && /(FUT|CE|PE)$/.test(sym));
  if (exch === 'NSE' && isDerivative) return { exchange: seg === 12 ? 'CDS' : 'NFO', tradingsymbol: sym };
  if (exch === 'BSE' && isDerivative) return { exchange: 'BFO', tradingsymbol: sym };
  return { exchange: exch, tradingsymbol: sym.replace(/-EQ$/, '') };
}

/** Kite key form of a FYERS symbol: `NSE:SBIN-EQ` -> `NSE:SBIN`. */
export function kiteKeyOf(fyersSymbol: string, segment?: number | string): string {
  const { exchange, tradingsymbol } = fromFyersSymbol(fyersSymbol, segment);
  return `${exchange}:${tradingsymbol}`;
}

// ─── Products and order types ──────────────────────────────────────────────────

export function toFyersProduct(product: string): string {
  switch ((product || 'MIS').toUpperCase()) {
    case 'MIS': return 'INTRADAY';
    case 'CNC': return 'CNC';
    case 'NRML': return 'MARGIN';
    default: return product.toUpperCase();
  }
}

export function fromFyersProduct(productType: string): string {
  switch ((productType || '').toUpperCase()) {
    case 'INTRADAY': return 'MIS';
    case 'MARGIN': return 'NRML';
    case 'CNC': return 'CNC';
    default: return productType || 'MIS';
  }
}

/** FYERS order `type`: 1 Limit, 2 Market, 3 Stop (SL-M), 4 Stop-limit (SL). */
export function toFyersOrderType(orderType: string): number {
  switch ((orderType || '').toUpperCase()) {
    case 'LIMIT': return 1;
    case 'MARKET': return 2;
    case 'SL-M': return 3;
    case 'SL': return 4;
    default: throw new Error(`Unsupported order type for FYERS: ${orderType}`);
  }
}

export function fromFyersOrderType(type: number): string {
  return ({ 1: 'LIMIT', 2: 'MARKET', 3: 'SL-M', 4: 'SL' } as Record<number, string>)[Number(type)] || 'LIMIT';
}

export const toFyersSide = (side: string): number => ((side || '').toUpperCase() === 'SELL' ? -1 : 1);
export const fromFyersSide = (side: number): 'BUY' | 'SELL' => (Number(side) === -1 ? 'SELL' : 'BUY');

/**
 * FYERS order status -> Kite status. FYERS: 1 cancelled, 2 traded, 4 transit, 5 rejected, 6 pending, 7 expired.
 * A pending stop order is Kite's TRIGGER PENDING; an expired one is reported as CANCELLED (Kite has no EXPIRED).
 */
export function fromFyersOrderStatus(status: number, type?: number): string {
  switch (Number(status)) {
    case 1: return 'CANCELLED';
    case 2: return 'COMPLETE';
    case 4: return 'OPEN PENDING';
    case 5: return 'REJECTED';
    case 6: return Number(type) === 3 || Number(type) === 4 ? 'TRIGGER PENDING' : 'OPEN';
    case 7: return 'CANCELLED';
    default: return 'OPEN';
  }
}

/** Kite candle interval -> FYERS history resolution. */
export function toFyersResolution(interval: string): string {
  const map: Record<string, string> = {
    minute: '1', '2minute': '2', '3minute': '3', '5minute': '5', '10minute': '10', '15minute': '15',
    '30minute': '30', '60minute': '60', day: '1D',
  };
  const r = map[interval];
  if (!r) throw new Error(`Unsupported candle interval for FYERS: ${interval}`);
  return r;
}

/** Largest range FYERS serves per history request: 100 days intraday, 366 days daily. */
export function maxHistoryDays(resolution: string): number {
  return resolution === '1D' ? 365 : 99;
}

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

/** FYERS `15-Oct-2026 09:20:01` (IST) -> Kite `2026-10-15 09:20:01`; epoch seconds are converted to IST. */
export function toKiteTimestamp(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' || /^\d{9,11}$/.test(String(value))) {
    const ist = new Date(Number(value) * 1000 + 5.5 * 3600_000);
    return ist.toISOString().replace('T', ' ').slice(0, 19);
  }
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(String(value).trim());
  if (m) return `${m[3]}-${MONTHS[m[2].toUpperCase()] ?? '01'}-${m[1].padStart(2, '0')} ${m[4]}:${m[5]}:${m[6]}`;
  return String(value);
}

// ─── Symbol master ─────────────────────────────────────────────────────────────

/** Kite index tokens keyed by the FYERS index symbol, so index rows keep the tokens the rest of the app hard-codes. */
const INDEX_TOKEN_BY_FYERS: Record<string, number> = Object.fromEntries(
  INDEX_INSTRUMENTS.filter((i) => i.token && FYERS_INDEX_SYMBOLS[`${i.exchange}:${i.tradingsymbol}`])
    .map((i) => [FYERS_INDEX_SYMBOLS[`${i.exchange}:${i.tradingsymbol}`], i.token as number]),
);

export interface FyersInstrument extends Instrument {
  /** The FYERS symbol to send to the API, e.g. `NSE:SBIN-EQ`. */
  fyers_symbol: string;
}

/**
 * One FYERS symbol-master CSV (no header) -> Kite-shaped instrument rows. Columns: 0 Fytoken, 1 description, 2 instrument
 * type, 3 lot size, 4 tick size, 5 ISIN, 6 session, 7 updated, 8 expiry (epoch s), 9 symbol, 10 exchange, 11 segment,
 * 12 scrip code, 13 underlying, 14 underlying scrip code, 15 strike, 16 option type.
 *
 * Tokens are built the way Kite builds them (scrip code * 256 + Kite segment id; scrip code is the exchange token), so a
 * FYERS row and a Kite row for the same stock carry the same `instrument_token` (SBIN: 3045 * 256 + 1 = 779521).
 */
export function parseFyersMaster(csv: string, kiteExchange: string): FyersInstrument[] {
  const segId = KITE_SEGMENT_ID[kiteExchange] ?? 1;
  const out: FyersInstrument[] = [];
  for (const line of csv.split(/\r?\n/)) {
    if (!line) continue;
    const c = line.split(',');
    if (c.length < 17) continue;
    const fyersSymbol = c[9];
    const instType = Number(c[2]);
    const scrip = Number(c[12]);
    if (!fyersSymbol || !Number.isFinite(scrip)) continue;
    const { tradingsymbol } = fromFyersSymbol(fyersSymbol, c[11]);
    const isIndex = /-INDEX$/.test(fyersSymbol);
    const isCash = kiteExchange === 'NSE' || kiteExchange === 'BSE';
    let instrument_type: string;
    let segment: string;
    if (isIndex) {
      instrument_type = 'EQ';
      segment = 'INDICES';
    } else if (isCash) {
      instrument_type = instType === 0 || instType === 9 ? 'EQ' : String(instType);
      segment = kiteExchange;
    } else {
      const opt = (c[16] || '').toUpperCase();
      instrument_type = opt === 'CE' || opt === 'PE' ? opt : 'FUT';
      segment = `${kiteExchange}-${instrument_type === 'FUT' ? 'FUT' : 'OPT'}`;
    }
    const expirySec = Number(c[8]);
    const strike = Number(c[15]);
    out.push({
      instrument_token: isIndex ? INDEX_TOKEN_BY_FYERS[fyersSymbol] ?? scrip * 256 + 9 : scrip * 256 + segId,
      tradingsymbol,
      name: isCash && !isIndex ? c[13] || tradingsymbol : c[13] || undefined,
      exchange: kiteExchange,
      segment,
      lot_size: Number(c[3]) || 1,
      tick_size: Number(c[4]) || 0.05,
      strike: strike > 0 ? strike : undefined,
      instrument_type,
      expiry: expirySec > 0 ? new Date(expirySec * 1000) : undefined,
      fyers_symbol: fyersSymbol,
    });
  }
  return out;
}
