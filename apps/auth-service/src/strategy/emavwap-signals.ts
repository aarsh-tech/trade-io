/**
 * EMA-VWAP signal maths shared by the stock engine (emavwap.engine.ts) and the index-options engine, so the
 * 15-EMA / VWAP crossover and the inside candle mean exactly the same thing in both. Pure functions: no broker calls.
 */

/** One shared IST `YYYY-MM-DD` formatter. Building an Intl.DateTimeFormat per call (per candle / per instrument) costs
 *  ~1 ms and ~30 MB of native memory per 1,000 calls, enough to push the process past PM2's memory-restart limit. */
const IST_DATE_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

export interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function getIstDateStr(d: Date): string {
  return IST_DATE_FMT.format(d);
}

/** Minutes since midnight, IST. */
export function getIstHhmm(date: Date): number {
  const utcMs = date.getTime() + (date.getTimezoneOffset() * 60000);
  const istDate = new Date(utcMs + (330 * 60000));
  return istDate.getHours() * 60 + istDate.getMinutes();
}

/** EMA seeded with the SMA of the first `period` closes; earlier slots are null. */
export function calculateEMA(candles: Candle[], period: number): (number | null)[] {
  const emas: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period) return emas;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += candles[i].close;
  let prev = sum / period; emas[period - 1] = prev;
  const mult = 2 / (period + 1);
  for (let i = period; i < candles.length; i++) {
    const ema = (candles[i].close - prev) * mult + prev;
    emas[i] = ema; prev = ema;
  }
  return emas;
}

/** Session VWAP, reset at each IST day. With zero volume (an index) it equals the candle close. */
export function calculateVWAP(candles: Candle[], vwapSource: 'close' | 'hlc3' = 'close'): (number | null)[] {
  const vwaps: (number | null)[] = new Array(candles.length).fill(null);
  let cpv = 0, cv = 0;
  let lastDateStr = '';
  for (let i = 0; i < candles.length; i++) {
    const dateStr = getIstDateStr(candles[i].date);
    if (dateStr !== lastDateStr) {
      cpv = 0;
      cv = 0;
      lastDateStr = dateStr;
    }
    const price = vwapSource === 'close' ? candles[i].close : (candles[i].high + candles[i].low + candles[i].close) / 3;
    cpv += price * candles[i].volume;
    cv += candles[i].volume;
    vwaps[i] = cv === 0 ? candles[i].close : cpv / cv;
  }
  return vwaps;
}

/** Drops the last candle while it is still forming. */
export function filterClosedCandles(candles: Candle[], now: Date, intervalMin: number = 5): Candle[] {
  if (!candles || candles.length === 0) return [];
  const latestCandle = candles[candles.length - 1];
  const isClosed = (now.getTime() - latestCandle.date.getTime()) >= intervalMin * 60 * 1000;
  return isClosed ? candles : candles.slice(0, -1);
}

/** The baby candle's whole range sits inside the mother candle's range. */
export function isInsideCandle(mother: Candle, baby: Candle): boolean {
  return baby.high <= mother.high && baby.low >= mother.low;
}

/**
 * The latest 15-EMA / VWAP crossover of the trading day of `candles[idx]`, at or before `idx`.
 * LONG: EMA crosses above VWAP on a bullish candle that closes at or above both lines.
 * SHORT: EMA crosses below VWAP on a bearish candle that closes at or below both lines.
 * Only crossovers between two candles of that same day count.
 */
export function findLatestEmaVwapCrossToday(
  idx: number,
  candles: Candle[],
  emas: (number | null)[],
  vwaps: (number | null)[],
): { trend: 'LONG' | 'SHORT'; crossoverIdx: number } | null {
  let latest: 'LONG' | 'SHORT' | null = null;
  let crossoverIdx = -1;
  const todayStr = getIstDateStr(candles[idx].date);

  for (let k = 1; k <= idx; k++) {
    if (getIstDateStr(candles[k].date) !== todayStr) continue;
    if (getIstDateStr(candles[k - 1].date) !== todayStr) continue;

    const prevEma = emas[k - 1], currEma = emas[k];
    const prevVwap = vwaps[k - 1], currVwap = vwaps[k];
    if (prevEma === null || currEma === null || prevVwap === null || currVwap === null) continue;

    const candle = candles[k];
    if (prevEma <= prevVwap && currEma > currVwap && candle.close >= currVwap && candle.close >= currEma && candle.close >= candle.open) {
      latest = 'LONG';
      crossoverIdx = k;
    } else if (prevEma >= prevVwap && currEma < currVwap && candle.close <= currVwap && candle.close <= currEma && candle.close <= candle.open) {
      latest = 'SHORT';
      crossoverIdx = k;
    }
  }

  return latest !== null ? { trend: latest, crossoverIdx } : null;
}
