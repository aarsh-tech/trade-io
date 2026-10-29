/**
 * In-play Fade: the overbought rollover that triggers a short on a stock in play (Stocks-in-Play engine, setup FADE),
 * and its mirror, the oversold turn-up that arms a long on a gap-down stock in play (fadeLongTrigger).
 *
 * Signal on a closed 5m candle i when any of these turns down (checked in this order, the first one names it):
 * - MFI(14) closes back at or below 80 after the previous candle was above 80;
 * - Stochastic(14,3,3) %D crosses above %K (K under D) while the previous %K was above 80;
 * - the previous candle closed above the upper Bollinger band (20, 2 population SD) and this one closes back below it;
 * - CMF(20) crosses below -0.1.
 *
 * All four use fixed look-back windows, so ~60 candles of history (the previous session) reproduce them exactly.
 * Candles run continuously across sessions, as on a chart. Same formulas as the 2-year backtest
 * (scratchpad fade-sim.js / research.js, 2026-10-28).
 */

export interface FadeCandle {
  t: number; // candle start, epoch ms
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type FadeTrigger = 'MFI' | 'STOCH' | 'BB' | 'CMF';

/** Candles needed before the evaluated one. */
export const FADE_MIN_HISTORY = 25;

function mfiAt(k: FadeCandle[], i: number): number {
  let pos = 0, neg = 0;
  for (let q = i - 13; q <= i; q++) {
    const tp = (k[q].h + k[q].l + k[q].c) / 3, tpp = (k[q - 1].h + k[q - 1].l + k[q - 1].c) / 3;
    if (tp > tpp) pos += tp * k[q].v;
    else if (tp < tpp) neg += tp * k[q].v;
  }
  return neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
}

function rawKAt(k: FadeCandle[], i: number): number {
  let hh = -Infinity, ll = Infinity;
  for (let q = i - 13; q <= i; q++) {
    if (k[q].h > hh) hh = k[q].h;
    if (k[q].l < ll) ll = k[q].l;
  }
  return hh > ll ? ((k[i].c - ll) / (hh - ll)) * 100 : 50;
}

function stochKAt(k: FadeCandle[], i: number): number {
  return (rawKAt(k, i) + rawKAt(k, i - 1) + rawKAt(k, i - 2)) / 3;
}

function stochDAt(k: FadeCandle[], i: number): number {
  return (stochKAt(k, i) + stochKAt(k, i - 1) + stochKAt(k, i - 2)) / 3;
}

function bbUpperAt(k: FadeCandle[], i: number): number {
  let s = 0, s2 = 0;
  for (let q = i - 19; q <= i; q++) { s += k[q].c; s2 += k[q].c * k[q].c; }
  const mean = s / 20;
  return mean + 2 * Math.sqrt(Math.max(0, s2 / 20 - mean * mean));
}

function bbLowerAt(k: FadeCandle[], i: number): number {
  let s = 0, s2 = 0;
  for (let q = i - 19; q <= i; q++) { s += k[q].c; s2 += k[q].c * k[q].c; }
  const mean = s / 20;
  return mean - 2 * Math.sqrt(Math.max(0, s2 / 20 - mean * mean));
}

function cmfAt(k: FadeCandle[], i: number): number {
  let flow = 0, vol = 0;
  for (let q = i - 19; q <= i; q++) {
    const r = k[q].h - k[q].l;
    if (r > 0) flow += (((k[q].c - k[q].l) - (k[q].h - k[q].c)) / r) * k[q].v;
    vol += k[q].v;
  }
  return vol > 0 ? flow / vol : 0;
}

/** The short trigger on candle i, or null. Needs i >= FADE_MIN_HISTORY. */
export function fadeShortTrigger(k: FadeCandle[], i: number): FadeTrigger | null {
  if (i < FADE_MIN_HISTORY || i >= k.length) return null;
  if (mfiAt(k, i - 1) > 80 && mfiAt(k, i) <= 80) return 'MFI';
  const k1 = stochKAt(k, i - 1), d1 = stochDAt(k, i - 1), k0 = stochKAt(k, i), d0 = stochDAt(k, i);
  if (d1 <= k1 && d0 > k0 && k1 > 80) return 'STOCH';
  if (k[i - 1].c > bbUpperAt(k, i - 1) && k[i].c < bbUpperAt(k, i)) return 'BB';
  if (cmfAt(k, i - 1) >= -0.1 && cmfAt(k, i) < -0.1) return 'CMF';
  return null;
}

/**
 * The long mirror on candle i, or null: MFI back at or above 20 from below, %K crossing over %D from below 20,
 * a close back above the lower Bollinger band, or CMF crossing above +0.1. On its own it lost money in the backtest;
 * the engine only buys once price then breaks the first 5m candle's high (scratchpad research2.js, 29 Oct 2026).
 */
export function fadeLongTrigger(k: FadeCandle[], i: number): FadeTrigger | null {
  if (i < FADE_MIN_HISTORY || i >= k.length) return null;
  if (mfiAt(k, i - 1) < 20 && mfiAt(k, i) >= 20) return 'MFI';
  const k1 = stochKAt(k, i - 1), d1 = stochDAt(k, i - 1), k0 = stochKAt(k, i), d0 = stochDAt(k, i);
  if (d1 >= k1 && d0 < k0 && k1 < 20) return 'STOCH';
  if (k[i - 1].c < bbLowerAt(k, i - 1) && k[i].c > bbLowerAt(k, i)) return 'BB';
  if (cmfAt(k, i - 1) <= 0.1 && cmfAt(k, i) > 0.1) return 'CMF';
  return null;
}

/** Indicator readings on candle i, for the log line. */
export function fadeReadings(k: FadeCandle[], i: number): { mfi: number; stochK: number; stochD: number; bbUpper: number; bbLower: number; cmf: number } | null {
  if (i < FADE_MIN_HISTORY || i >= k.length) return null;
  return { mfi: mfiAt(k, i), stochK: stochKAt(k, i), stochD: stochDAt(k, i), bbUpper: bbUpperAt(k, i), bbLower: bbLowerAt(k, i), cmf: cmfAt(k, i) };
}

const FIVE_MIN = 5 * 60_000;

/** Kite 5m history rows -> completed candles only (the forming candle, start + 5m > now, is dropped). */
export function toCompletedCandles(raw: any[], nowMs: number): FadeCandle[] {
  const out: FadeCandle[] = [];
  for (const r of raw || []) {
    const t = new Date(r.date).getTime();
    if (!Number.isFinite(t) || t + FIVE_MIN > nowMs) continue;
    const c: FadeCandle = { t, o: Number(r.open), h: Number(r.high), l: Number(r.low), c: Number(r.close), v: Number(r.volume) || 0 };
    if (c.c > 0 && c.h > 0 && c.l > 0) out.push(c);
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}
