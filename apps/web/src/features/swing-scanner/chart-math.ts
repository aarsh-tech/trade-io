/** Column-form daily/weekly bars; `t` = UTC-midnight epoch seconds of the IST trading day (weekly: the week's Monday). */
export interface Bars {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

const DAY = 86_400;

/** Weekly bars (Monday-keyed) from daily bars. */
export function toWeekly(d: Bars): Bars {
  const w: Bars = { t: [], o: [], h: [], l: [], c: [], v: [] };
  for (let i = 0; i < d.t.length; i++) {
    const dow = new Date(d.t[i] * 1000).getUTCDay(); // 0 = Sunday
    const monday = d.t[i] - ((dow + 6) % 7) * DAY;
    const k = w.t.length - 1;
    if (k >= 0 && w.t[k] === monday) {
      w.h[k] = Math.max(w.h[k], d.h[i]);
      w.l[k] = Math.min(w.l[k], d.l[i]);
      w.c[k] = d.c[i];
      w.v[k] += d.v[i];
    } else {
      w.t.push(monday);
      w.o.push(d.o[i]);
      w.h.push(d.h[i]);
      w.l.push(d.l[i]);
      w.c.push(d.c[i]);
      w.v.push(d.v[i]);
    }
  }
  return w;
}

/** Simple moving average; null until `period` values exist. */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Index of the first bar a base starting at `from` should be drawn on (weekly bars cover Monday + 6 days). */
export function firstBarFrom(t: number[], from: number, weekly: boolean): number {
  const span = weekly ? 6 * DAY : 0;
  const i = t.findIndex((x) => x + span >= from);
  return i < 0 ? t.length - 1 : i;
}

const pct = (a: number, b: number) => (b > 0 ? (a / b - 1) * 100 : null);

/** Header numbers for the daily bars. */
export function dailyStats(d: Bars) {
  const n = d.c.length - 1;
  if (n < 0) return null;
  const prior = d.v.slice(Math.max(0, n - 20), n);
  const avgVol20 = prior.length ? prior.reduce((s, x) => s + x, 0) / prior.length : 0;
  return {
    change1M: n >= 21 ? pct(d.c[n], d.c[n - 21]) : null,
    change3M: n >= 63 ? pct(d.c[n], d.c[n - 63]) : null,
    avgVol20,
    rvol: avgVol20 > 0 ? (d.v[n] / avgVol20) * 100 : null,
  };
}

/** Indian short volume: 5.9L, 1.2Cr, 45.6K. */
export function fmtVolume(v: number): string {
  if (v >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}
