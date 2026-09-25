/**
 * Indian retail trading charges (Zerodha schedule), so the ledger shows net P&L instead of gross.
 *
 * VERIFY these against Zerodha's brokerage calculator / the current exchange and SEBI circulars before relying on
 * them for tax or performance decisions. Statutory rates change; the STT on F&O in particular was revised in the
 * Union Budget 2026 (effective 1 Apr 2026). Override without a deploy via env: STT_FUT_SELL_PCT, STT_OPT_SELL_PCT.
 * Exchange transaction charges use NSE rates for BSE/BFO too, which slightly under/over-states BSE trades.
 */

export type Segment = 'EQ_INTRADAY' | 'EQ_DELIVERY' | 'FUT' | 'OPT';

const BROKERAGE_CAP = 20; // ₹ per executed order
const BROKERAGE_PCT = 0.0003; // 0.03% (intraday equity and futures)
const GST_PCT = 0.18; // on brokerage + exchange transaction + SEBI charges
const SEBI_PCT = 0.000001; // ₹10 per crore
const STT_REVISION_DATE = '2026-04-01';

const pct = (envKey: string, fallback: number) => {
  const v = Number(process.env[envKey]);
  return Number.isFinite(v) && v >= 0 ? v / 100 : fallback;
};

export function isFnoSymbol(exchange: string | null | undefined, symbol: string): boolean {
  return ['NFO', 'BFO', 'MCX', 'CDS'].includes((exchange || '').toUpperCase()) || /(CE|PE|FUT)$/.test(symbol);
}

export function segmentOf(exchange: string | null | undefined, symbol: string, product: string): Segment {
  if (isFnoSymbol(exchange, symbol)) return /(CE|PE)$/.test(symbol) ? 'OPT' : 'FUT';
  return product === 'CNC' ? 'EQ_DELIVERY' : 'EQ_INTRADAY';
}

/** Brokerage for one executed order of the given value. Delivery is free; options are a flat fee per order. */
export function orderBrokerage(segment: Segment, orderValue: number): number {
  if (segment === 'EQ_DELIVERY' || orderValue <= 0) return 0;
  if (segment === 'OPT') return BROKERAGE_CAP;
  return Math.min(BROKERAGE_CAP, orderValue * BROKERAGE_PCT);
}

interface Rates {
  sttBuy: number;
  sttSell: number;
  txn: number;
  stampBuy: number;
}

function ratesFor(segment: Segment, onDate: string): Rates {
  const revised = onDate >= STT_REVISION_DATE;
  switch (segment) {
    case 'EQ_INTRADAY':
      return { sttBuy: 0, sttSell: 0.00025, txn: 0.0000297, stampBuy: 0.00003 };
    case 'EQ_DELIVERY':
      return { sttBuy: 0.001, sttSell: 0.001, txn: 0.0000297, stampBuy: 0.00015 };
    case 'FUT':
      return { sttBuy: 0, sttSell: pct('STT_FUT_SELL_PCT', revised ? 0.0005 : 0.0002), txn: 0.0000173, stampBuy: 0.00002 };
    case 'OPT':
      return { sttBuy: 0, sttSell: pct('STT_OPT_SELL_PCT', revised ? 0.0015 : 0.001), txn: 0.0003503, stampBuy: 0.00003 };
  }
}

/**
 * Total charges for one leg (a buy or a sell) of `qty` units at `price`, given its share of the order's brokerage.
 * `onDate` is the IST trade date (YYYY-MM-DD), which selects the rate schedule.
 */
export function legCharges(
  segment: Segment,
  side: 'BUY' | 'SELL',
  qty: number,
  price: number,
  brokerage: number,
  onDate: string,
): number {
  const value = qty * price;
  if (value <= 0) return brokerage;
  const r = ratesFor(segment, onDate);
  const stt = value * (side === 'BUY' ? r.sttBuy : r.sttSell);
  const txn = value * r.txn;
  const sebi = value * SEBI_PCT;
  const stamp = side === 'BUY' ? value * r.stampBuy : 0;
  const gst = (brokerage + txn + sebi) * GST_PCT;
  return brokerage + stt + txn + sebi + stamp + gst;
}
