/**
 * Stocks-in-Play: per-stock intraday (MIS) leverage from Zerodha's order-margin API (POST /margins/orders).
 *
 * Zerodha's MIS margin differs per stock (VaR + ELM, at most 5x), and some stocks are not allowed intraday at all.
 * The engine asks once for all of the day's candidates, as soon as they are known, and sizes the entry from the
 * answer with no extra call at the signal. When Zerodha cannot say, the strategy's fallback leverage is used.
 */

/** Zerodha gives at most 5x on equity MIS. */
export const MAX_MIS_LEVERAGE = 5;
/** The margin check asks about an order of about this size; the leverage is a ratio, so the exact size hardly matters. */
export const MARGIN_CHECK_NOTIONAL = 50_000;
/** Part of the funds the engine is willing to commit (room for charges and price moves before the fill). */
export const FUNDS_USE = 0.95;
/** At the entry, wait at most this long for a margin check still in flight before using the fallback leverage. */
export const MARGIN_WAIT_MS = 1500;

export type MarginSide = 'BUY' | 'SELL';

export interface MarginRequest {
  symbol: string;
  side: MarginSide;
  qty: number;
  price: number;
}

/** One row of Zerodha's order-margin answer. */
export interface MarginRow {
  symbol: string;
  total: number;
  leverage: number | null;
}

export type MarginInfo =
  | { kind: 'OK'; leverage: number; marginRs: number; notionalRs: number; zerodhaLeverage: number | null }
  | { kind: 'BLOCKED'; reason: string }
  | { kind: 'UNKNOWN'; reason: string };

const roundToTick = (p: number, tick: number) => Number((Math.round(p / tick) * tick).toFixed(2));

/** A LIMIT order of about MARGIN_CHECK_NOTIONAL at `price`, so the notional is known exactly. */
export function marginRequest(symbol: string, side: MarginSide, price: number, tick = 0.05): MarginRequest {
  const px = roundToTick(price, tick > 0 ? tick : 0.05);
  return { symbol, side, qty: Math.max(1, Math.floor(MARGIN_CHECK_NOTIONAL / px)), price: px };
}

/** Leverage = notional / margin Zerodha blocks, kept within 1x..5x. */
export function marginInfoFromRow(req: MarginRequest, row: MarginRow | null | undefined): MarginInfo {
  const total = Number(row?.total);
  if (!row || !Number.isFinite(total) || total <= 0) return { kind: 'UNKNOWN', reason: 'Zerodha returned no margin' };
  const notional = req.qty * req.price;
  const leverage = Math.min(MAX_MIS_LEVERAGE, Math.max(1, notional / total));
  const z = Number(row.leverage);
  return { kind: 'OK', leverage: Number(leverage.toFixed(2)), marginRs: total, notionalRs: notional, zerodhaLeverage: Number.isFinite(z) && z > 0 ? z : null };
}

/**
 * True only when Zerodha's error clearly says the stock cannot be traded intraday. Anything else (network, session,
 * an unclear input error) is UNKNOWN, so a good trade is never skipped on a guess.
 */
export function isIntradayBlockedError(err: any): boolean {
  const type = String(err?.name || err?.error_type || err?.data?.error_type || '');
  if (/Token|Network|RateLimit|Permission/i.test(type)) return false;
  const msg = String(err?.message || err?.data?.message || err || '');
  return /\bMIS\b|intraday|not allowed|blocked|restricted|\bban\b|trade[- ]to[- ]trade|\bT2T\b|\bASM\b|\bGSM\b/i.test(msg);
}

/** A session, network, rate-limit or permission failure: says nothing about the stock. */
export function isTransientMarginError(err: any): boolean {
  return /Token|Network|RateLimit|Permission/i.test(String(err?.name || err?.error_type || err?.data?.error_type || ''));
}

/** Zerodha refused the order itself (bad input, order or margin rule), as opposed to a server or connection fault. */
export function isOrderRejectionError(err: any): boolean {
  return /InputException|OrderException|MarginException/.test(String(err?.name || err?.error_type || err?.data?.error_type || ''));
}

/**
 * A single stock's margin check failed. Every candidate is asked in exactly the same format, so when Zerodha answered
 * normally for another stock and refused this one with an order-rejection error, the stock is the problem: BLOCKED,
 * whatever the wording. With no other stock answered (or a transient failure) it may be our side: UNKNOWN, unless the
 * message itself clearly says the stock is not allowed intraday.
 */
export function classifyMarginError(err: any, otherStockAnswered: boolean): 'BLOCKED' | 'UNKNOWN' {
  if (isTransientMarginError(err)) return 'UNKNOWN';
  if (otherStockAnswered && isOrderRejectionError(err)) return 'BLOCKED';
  return isIntradayBlockedError(err) ? 'BLOCKED' : 'UNKNOWN';
}

/** Shares the funds can carry at `leverage` (the margin at the entry price is price / leverage). */
export function qtyByCapital(fundsRs: number, leverage: number, price: number): number {
  if (!(fundsRs > 0) || !(leverage > 0) || !(price > 0)) return 0;
  return Math.floor((fundsRs * leverage * FUNDS_USE) / price);
}

/** Short text for the logs: "4.9x (Zerodha)" or "4x (fallback: ...)". */
export function leverageText(leverage: number, source: 'ZERODHA' | 'FALLBACK'): string {
  return `${Number(leverage.toFixed(2))}x (${source === 'ZERODHA' ? 'Zerodha' : 'fallback'})`;
}
