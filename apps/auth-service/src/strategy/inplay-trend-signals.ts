import { FadeCandle } from './inplay-fade-signals';

/**
 * 15/40 EMA trend readings on 5m candles (Stocks-in-Play setup TREND), as in the 2 Nov 2026 backtest
 * (scratchpad x1540.js / an8.js): EMAs of the 5m closes continuing across sessions (each seeded with the SMA of its
 * first `period` closes) and the session VWAP of the 5m closes.
 */

export const TREND_FAST = 15;
export const TREND_SLOW = 40;

/** EMA of the closes up to and including candle `i` (null before `period` candles). */
export function emaAt(k: FadeCandle[], i: number, period: number): number | null {
  if (i < period - 1 || i >= k.length) return null;
  let ema = 0;
  for (let q = 0; q < period; q++) ema += k[q].c;
  ema /= period;
  const m = 2 / (period + 1);
  for (let q = period; q <= i; q++) ema = (k[q].c - ema) * m + ema;
  return ema;
}

export interface TrendReadings {
  close: number;
  fast: number;
  slow: number;
  prevFast: number;
  prevSlow: number;
  vwap: number;
  /** Today's low / high through candle `i` (the stop). */
  dayLow: number;
  dayHigh: number;
}

/** Readings at candle `i` (a candle of today); null without the EMA warm-up. */
export function trendReadings(k: FadeCandle[], i: number, dayOpenMs: number): TrendReadings | null {
  if (i < 1 || i >= k.length || k[i].t < dayOpenMs) return null;
  const fast = emaAt(k, i, TREND_FAST), slow = emaAt(k, i, TREND_SLOW);
  const prevFast = emaAt(k, i - 1, TREND_FAST), prevSlow = emaAt(k, i - 1, TREND_SLOW);
  if (fast === null || slow === null || prevFast === null || prevSlow === null) return null;
  let first = i;
  while (first > 0 && k[first - 1].t >= dayOpenMs) first--;
  let pv = 0, vv = 0, dayLow = Infinity, dayHigh = -Infinity;
  for (let q = first; q <= i; q++) {
    pv += k[q].c * k[q].v; vv += k[q].v;
    dayLow = Math.min(dayLow, k[q].l); dayHigh = Math.max(dayHigh, k[q].h);
  }
  return { close: k[i].c, fast, slow, prevFast, prevSlow, vwap: vv > 0 ? pv / vv : k[i].c, dayLow, dayHigh };
}

/** The 15-EMA crossed the 40-EMA on this close: up = LONG, down = SHORT, else null. */
export function crossSide(r: TrendReadings): 'LONG' | 'SHORT' | null {
  if (r.prevFast <= r.prevSlow && r.fast > r.slow) return 'LONG';
  if (r.prevFast >= r.prevSlow && r.fast < r.slow) return 'SHORT';
  return null;
}

/** The close is on the trade's side of the VWAP (above for a long, below for a short). */
export function vwapAgrees(side: 'LONG' | 'SHORT', r: TrendReadings): boolean {
  return side === 'LONG' ? r.close > r.vwap : r.close < r.vwap;
}

/** Exit: the 15-EMA crossed back (below the 40-EMA for a long, above it for a short) at candle `i`. */
export function crossedBack(side: 'LONG' | 'SHORT', k: FadeCandle[], i: number): { fast: number; slow: number } | null {
  const fast = emaAt(k, i, TREND_FAST), slow = emaAt(k, i, TREND_SLOW);
  if (fast === null || slow === null) return null;
  return (side === 'LONG' ? fast < slow : fast > slow) ? { fast, slow } : null;
}
