import { DailyCandle, PatternResult } from './vcp.analyzer';

/**
 * Daily bars for the swing scanner's chart view, kept in memory and shared by every user.
 *
 * The scan already downloads these bars to find the patterns; keeping them (only for stocks
 * that matched a pattern) lets the chart open without another Kite call. Columns are typed
 * arrays: ~340 bars × ~550 stocks ≈ 8 MB.
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
/** Upper bound on cached stocks (the scan universe is ~550; on-demand fetches add a few). */
const MAX_ENTRIES = 800;

/** A daily bar's IST trading day as UTC-midnight epoch seconds (what lightweight-charts expects for daily data). */
export function istDaySec(d: Date, roundUp = false): number {
  const days = (d.getTime() + IST_OFFSET_MS) / DAY_MS;
  return (roundUp ? Math.ceil(days) : Math.floor(days)) * 86_400;
}

export interface ChartBase {
  pattern: string;
  direction: 'LONG' | 'SHORT';
  /** First bar (epoch seconds, as in `t`) the base is drawn from; it runs to the last bar. */
  from: number;
  high: number;
  low: number;
}

interface ChartEntry {
  asOf: number;
  t: Int32Array;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
  v: Float64Array;
  bases: ChartBase[];
  rsRating: number | null;
}

export interface ChartPayload {
  symbol: string;
  asOf: string;
  rsRating: number | null;
  bases: ChartBase[];
  bars: { t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export class SwingChartStore {
  private readonly entries = new Map<string, ChartEntry>();

  has(symbol: string): boolean {
    return this.entries.has(symbol);
  }

  put(symbol: string, candles: DailyCandle[], patterns: PatternResult[]): void {
    const n = candles.length;
    const e: ChartEntry = {
      asOf: Date.now(),
      t: new Int32Array(n),
      o: new Float64Array(n),
      h: new Float64Array(n),
      l: new Float64Array(n),
      c: new Float64Array(n),
      v: new Float64Array(n),
      bases: [],
      rsRating: this.entries.get(symbol)?.rsRating ?? null,
    };
    for (let i = 0; i < n; i++) {
      const k = candles[i];
      e.t[i] = istDaySec(k.date);
      e.o[i] = k.open;
      e.h[i] = k.high;
      e.l[i] = k.low;
      e.c[i] = k.close;
      e.v[i] = k.volume || 0;
    }
    for (const p of patterns) {
      if (!p.base) continue;
      e.bases.push({
        pattern: p.pattern,
        direction: p.direction ?? (p.target1 >= p.entryPrice ? 'LONG' : 'SHORT'),
        from: istDaySec(p.base.from, true),
        high: r2(p.base.high),
        low: r2(p.base.low),
      });
    }
    this.entries.delete(symbol); // re-insert so the Map's order stays oldest-first for eviction
    this.entries.set(symbol, e);
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  /** RS rating 1–99 per stock, ranked within one scan's universe. */
  setRsRatings(ratings: Map<string, number>): void {
    for (const [sym, rating] of ratings) {
      const e = this.entries.get(sym);
      if (e) e.rsRating = rating;
    }
  }

  get(symbol: string): ChartPayload | null {
    const e = this.entries.get(symbol);
    if (!e) return null;
    const round = (a: Float64Array) => Array.from(a, r2);
    return {
      symbol,
      asOf: new Date(e.asOf).toISOString(),
      rsRating: e.rsRating,
      bases: e.bases,
      bars: { t: Array.from(e.t), o: round(e.o), h: round(e.h), l: round(e.l), c: round(e.c), v: Array.from(e.v) },
    };
  }
}

/**
 * IBD-style relative strength score: 40% weight on the last 3 months, 20% each on the
 * three quarters before. Quarters the history doesn't cover are left out and the weights
 * re-normalised; under 63 bars there is no score.
 */
export function rsScore(closes: number[]): number | null {
  const n = closes.length - 1;
  const legs: [number, number][] = [[63, 0.4], [126, 0.2], [189, 0.2], [252, 0.2]];
  let sum = 0;
  let weight = 0;
  for (const [k, w] of legs) {
    if (n - k < 0 || closes[n - k] <= 0) continue;
    sum += w * (closes[n] / closes[n - k] - 1);
    weight += w;
  }
  return weight > 0 && n >= 63 ? sum / weight : null;
}

/** Percentile rank (1–99) of each score within the set. */
export function rankRs(scores: Map<string, number>): Map<string, number> {
  const sorted = [...scores.entries()].sort((a, b) => a[1] - b[1]);
  const out = new Map<string, number>();
  const last = Math.max(1, sorted.length - 1);
  sorted.forEach(([sym], i) => out.set(sym, Math.max(1, Math.min(99, Math.round(1 + (i / last) * 98)))));
  return out;
}
