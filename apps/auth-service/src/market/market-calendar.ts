import { Logger } from '@nestjs/common';

/**
 * Indian equity/derivatives market calendar (NSE/BSE), all in IST.
 *
 * Pure functions with no DI so the ticker, scheduler and broker session code share one source.
 *
 * Holidays are a built-in list (NSE trading-holiday circular; verify against the exchange
 * circular each January) that can be extended without a deploy:
 *   MARKET_HOLIDAYS="2027-01-26,2027-03-19"          extra full-day closures
 *   MARKET_SPECIAL_SESSIONS="2026-11-08@18:15-19:15"  trading on an otherwise closed day
 *                                                    (Muhurat, Saturday special sessions);
 *                                                    "@HH:MM-HH:MM" is optional (default 09:15-15:30).
 * The static list is backed by a live check: if the feed's exchange clock is still stale shortly
 * before the open, the day is flagged closed at runtime (markObservedClosed).
 * A year with no built-in list and no env entries is treated as weekday-only and warns once.
 */

const IST_OFFSET_MS = 330 * 60_000;
const logger = new Logger('MarketCalendar');

const BUILT_IN_HOLIDAYS: Record<number, string[]> = {
  2026: [
    '2026-01-26', // Republic Day
    '2026-03-03', // Holi
    '2026-03-26', // Ram Navami
    '2026-03-31', // Mahavir Jayanti
    '2026-04-03', // Good Friday
    '2026-04-14', // Dr. Ambedkar Jayanti
    '2026-05-01', // Maharashtra Day
    '2026-05-28', // Bakri Id
    '2026-06-26', // Muharram
    '2026-09-14', // Ganesh Chaturthi
    '2026-10-02', // Gandhi Jayanti
    '2026-10-20', // Dussehra
    '2026-11-10', // Diwali Balipratipada
    '2026-11-24', // Guru Nanak Jayanti
    '2026-12-25', // Christmas
  ],
};

export const PRE_OPEN_MINUTE = 9 * 60;
export const MARKET_OPEN_MINUTE = 9 * 60 + 15;
export const MARKET_CLOSE_MINUTE = 15 * 60 + 30;

export interface IstParts {
  /** YYYY-MM-DD in IST */
  date: string;
  /** 0 = Sunday … 6 = Saturday, in IST */
  day: number;
  /** Minutes since IST midnight */
  minute: number;
}

interface Session { open: number; close: number }

const warnedYears = new Set<number>();
/** IST dates the live feed proved closed (see TickerService.verifyCalendarAgainstFeed); process-local. */
const observedClosed = new Set<string>();
let envCache: { key: string; holidays: Set<string>; specials: Map<string, Session> } | null = null;

export function istParts(now: Date = new Date()): IstParts {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    date: ist.toISOString().slice(0, 10),
    day: ist.getUTCDay(),
    minute: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
  };
}

function parseHm(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function loadConfig() {
  const key = `${process.env.MARKET_HOLIDAYS || ''}|${process.env.MARKET_SPECIAL_SESSIONS || ''}`;
  if (envCache?.key === key) return envCache;

  const holidays = new Set<string>(Object.values(BUILT_IN_HOLIDAYS).flat());
  for (const d of (process.env.MARKET_HOLIDAYS || '').split(',')) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.trim())) holidays.add(d.trim());
  }

  const specials = new Map<string, Session>();
  for (const entry of (process.env.MARKET_SPECIAL_SESSIONS || '').split(',')) {
    const [date, hours] = entry.trim().split('@');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) continue;
    let open = MARKET_OPEN_MINUTE;
    let close = MARKET_CLOSE_MINUTE;
    if (hours) {
      const [o, c] = hours.split('-');
      const po = parseHm(o || '');
      const pc = parseHm(c || '');
      if (po !== null && pc !== null && pc > po) { open = po; close = pc; }
    }
    specials.set(date, { open, close });
  }

  envCache = { key, holidays, specials };
  return envCache;
}

function warnIfYearUnknown(date: string) {
  const year = Number(date.slice(0, 4));
  if (BUILT_IN_HOLIDAYS[year] || warnedYears.has(year)) return;
  const cfg = loadConfig();
  if ([...cfg.holidays].some((h) => h.startsWith(`${year}-`))) return;
  warnedYears.add(year);
  logger.warn(`No holiday calendar for ${year}: treating every weekday as a trading day. Set MARKET_HOLIDAYS or update market-calendar.ts.`);
}

/** Full session for the given IST date, or null when the exchange is closed all day. */
export function getSession(now: Date = new Date()): Session | null {
  const { date, day } = istParts(now);
  const cfg = loadConfig();
  const special = cfg.specials.get(date);
  if (special) return special;
  warnIfYearUnknown(date);
  if (observedClosed.has(date)) return null;
  if (day === 0 || day === 6 || cfg.holidays.has(date)) return null;
  return { open: MARKET_OPEN_MINUTE, close: MARKET_CLOSE_MINUTE };
}

/** Records that the exchange is closed on this IST date although the static calendar says open. */
export function markObservedClosed(date: string) {
  if (observedClosed.has(date)) return;
  observedClosed.add(date);
  logger.warn(`Live feed shows no fresh exchange data on ${date}: treating it as a market holiday. Add it to MARKET_HOLIDAYS.`);
}

export function clearObservedClosed(date: string) {
  if (observedClosed.delete(date)) logger.warn(`Fresh exchange data arrived on ${date}: cancelling the observed-holiday flag.`);
}

/** True when the exchange holds a session on this IST date (weekday and not a holiday, or a special session). */
export function isTradingDay(now: Date = new Date()): boolean {
  return getSession(now) !== null;
}

/** Why the market is closed today, for logs and the UI; null on a trading day. */
export function closedReason(now: Date = new Date()): 'weekend' | 'holiday' | null {
  if (isTradingDay(now)) return null;
  const { day } = istParts(now);
  return day === 0 || day === 6 ? 'weekend' : 'holiday';
}

/**
 * True during the trading window on a trading day. `openLeadMinutes` / `closeLagMinutes` widen the
 * window for consumers that need pre-open or post-close settlement (the ticker uses 15 / 5).
 */
export function isMarketWindow(now: Date = new Date(), openLeadMinutes = 0, closeLagMinutes = 0): boolean {
  const session = getSession(now);
  if (!session) return false;
  const { minute } = istParts(now);
  return minute >= session.open - openLeadMinutes && minute <= session.close + closeLagMinutes;
}

/**
 * Kite access tokens expire at 06:00 IST the next morning: the first 06:00 IST strictly after `now`.
 * (Logging in between 00:00 and 06:00 IST therefore expires the same day, not a day later.)
 */
export function nextKiteTokenExpiry(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const sixIstMs = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate(), 6, 0, 0, 0);
  let expiryIstMs = sixIstMs;
  if (expiryIstMs <= ist.getTime()) expiryIstMs += 24 * 3600_000;
  return new Date(expiryIstMs - IST_OFFSET_MS);
}
