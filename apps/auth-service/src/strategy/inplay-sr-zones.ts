/**
 * Support/resistance zones for the In-play Fade's 📋 Placed Trade log line. LOGGING ONLY: nothing here changes an
 * entry, a stop or a target.
 *
 * Built from the 5m candles the engine already holds for the stock, previous sessions only (today is never used):
 * - the candles are merged into 15m candles (09:15, 09:30, ...), continuous across sessions as on a chart;
 * - a swing low/high is a 15m low/high below/above the PIVOT_K candles on each side;
 * - yesterday's low, high and close are added as levels;
 * - levels within CLUSTER_PCT of the zone's lowest level form one zone; more levels = more touches.
 *
 * Same rules as the 2-year backtest (scratchpad srlib.js, 4 Nov 2026). Its result: exits at these zones (book before
 * the zone, book half there, tighten the stop there, skip when a zone is under 1R away) all made less than the
 * live exits (0 of 324 settings beat them), and price bounced at real zones no more often than at fake levels.
 */
import { FadeCandle } from './inplay-fade-signals';

export const PIVOT_K = 3;
export const CLUSTER_PCT = 0.3;
export const MAX_SESSIONS = 10;

export type LevelSource = 'swingLow' | 'swingHigh' | 'PDL' | 'PDH' | 'PDC';

export interface SrZone {
  lo: number;
  hi: number;
  touches: number;
  sources: LevelSource[];
}

export interface SrZoneSet {
  zones: SrZone[];
  /** Previous sessions the zones were built from. */
  sessions: number;
}

const IST_OFFSET_MIN = 330;
const OPEN_MIN = 9 * 60 + 15;

function istDay(t: number): number {
  return Math.floor((t / 60000 + IST_OFFSET_MIN) / 1440);
}
function istMinuteOfDay(t: number): number {
  return Math.floor(((t / 60000 + IST_OFFSET_MIN) % 1440 + 1440) % 1440);
}

/** Zones from the completed 5m candles before `dayOpenMs` (the last MAX_SESSIONS sessions). */
export function buildSrZones(candles: FadeCandle[] | null | undefined, dayOpenMs: number): SrZoneSet {
  const prior = (candles || []).filter((k) => k.t < dayOpenMs && k.h > 0 && k.l > 0);
  if (prior.length === 0) return { zones: [], sessions: 0 };

  // 5m -> 15m candles, keyed by IST day and 15m slot.
  const bars: { day: number; slot: number; h: number; l: number; c: number }[] = [];
  for (const k of prior.slice().sort((a, b) => a.t - b.t)) {
    const mod = istMinuteOfDay(k.t);
    if (mod < OPEN_MIN || mod >= 15 * 60 + 30) continue;
    const day = istDay(k.t), slot = Math.floor((mod - OPEN_MIN) / 15);
    const last = bars[bars.length - 1];
    if (last && last.day === day && last.slot === slot) {
      last.h = Math.max(last.h, k.h); last.l = Math.min(last.l, k.l); last.c = k.c;
    } else {
      bars.push({ day, slot, h: k.h, l: k.l, c: k.c });
    }
  }
  const days = Array.from(new Set(bars.map((b) => b.day))).sort((a, b) => a - b).slice(-MAX_SESSIONS);
  const keep = new Set(days);
  const b15 = bars.filter((b) => keep.has(b.day));
  if (b15.length === 0) return { zones: [], sessions: 0 };

  const levels: { p: number; src: LevelSource }[] = [];
  for (let i = PIVOT_K; i < b15.length - PIVOT_K; i++) {
    let lo = true, hi = true;
    for (let j = 1; j <= PIVOT_K; j++) {
      if (!(b15[i].l < b15[i - j].l && b15[i].l <= b15[i + j].l)) lo = false;
      if (!(b15[i].h > b15[i - j].h && b15[i].h >= b15[i + j].h)) hi = false;
    }
    if (lo) levels.push({ p: b15[i].l, src: 'swingLow' });
    if (hi) levels.push({ p: b15[i].h, src: 'swingHigh' });
  }
  const yday = b15.filter((b) => b.day === days[days.length - 1]);
  levels.push(
    { p: Math.min(...yday.map((b) => b.l)), src: 'PDL' },
    { p: Math.max(...yday.map((b) => b.h)), src: 'PDH' },
    { p: yday[yday.length - 1].c, src: 'PDC' },
  );

  levels.sort((a, b) => a.p - b.p);
  const zones: SrZone[] = [];
  for (const x of levels) {
    const z = zones[zones.length - 1];
    if (z && ((x.p - z.lo) / z.lo) * 100 <= CLUSTER_PCT) {
      z.hi = x.p; z.touches++; z.sources.push(x.src);
    } else {
      zones.push({ lo: x.p, hi: x.p, touches: 1, sources: [x.src] });
    }
  }
  return { zones, sessions: days.length };
}

export interface ZoneAhead {
  zone: SrZone;
  /** The zone edge price meets first: SHORT the top of a support zone, LONG the bottom of a resistance zone. */
  edge: number;
  /** Distance from the entry to the edge, in R (stop distances). */
  distR: number;
}

/** Zones in the profit direction (SHORT: below the entry, LONG: above), nearest first, up to `maxR` away. */
export function zonesAhead(set: SrZoneSet, side: 'LONG' | 'SHORT', entry: number, stopDist: number, maxR: number): ZoneAhead[] {
  if (!(stopDist > 0)) return [];
  const out: ZoneAhead[] = [];
  for (const z of set.zones) {
    const edge = side === 'SHORT' ? z.hi : z.lo;
    const distR = (side === 'SHORT' ? entry - edge : edge - entry) / stopDist;
    if (distR > 0 && distR <= maxR) out.push({ zone: z, edge, distR });
  }
  return out.sort((a, b) => a.distR - b.distR);
}

const SRC_LABEL: Record<LevelSource, string> = { swingLow: 'swing low', swingHigh: 'swing high', PDL: 'yday low', PDH: 'yday high', PDC: 'yday close' };

function describeSources(z: SrZone): string {
  const counts = new Map<LevelSource, number>();
  for (const s of z.sources) counts.set(s, (counts.get(s) || 0) + 1);
  return Array.from(counts.entries()).map(([s, n]) => `${n > 1 ? `${n}x ` : ''}${SRC_LABEL[s]}`).join(' + ');
}

/** Short text for the 📋 Placed Trade line, e.g. "S/R (7 sessions, 15m) supports below: ₹1379.40 (2x swing low, 1.66R) ...". */
export function describeZonesAhead(set: SrZoneSet, side: 'LONG' | 'SHORT', entry: number, stopDist: number, maxR: number, limit = 8): string {
  if (set.sessions === 0) return 'S/R: no history';
  const ahead = zonesAhead(set, side, entry, stopDist, maxR);
  const what = side === 'SHORT' ? 'supports below' : 'resistances above';
  if (ahead.length === 0) return `S/R (${set.sessions} session${set.sessions === 1 ? '' : 's'}, 15m): no ${what} within ${maxR}R`;
  const list = ahead.slice(0, limit).map((a) => {
    const lo = a.zone.lo.toFixed(2), hi = a.zone.hi.toFixed(2);
    const px = lo === hi ? `₹${lo}` : `₹${lo}–${hi}`;
    return `${px} (${describeSources(a.zone)}, ${a.distR.toFixed(2)}R)`;
  });
  return `S/R (${set.sessions} session${set.sessions === 1 ? '' : 's'}, 15m) ${what}: ${list.join(' · ')}${ahead.length > limit ? ` · +${ahead.length - limit} more` : ''}`;
}
