/**
 * NSE's surveillance lists (ASM long/short term and GSM), read once a day from nseindia.com's JSON endpoints, which
 * answer from the server without a browser session. Stocks on either list are never traded by Stocks-in-Play
 * (decided 10 Nov 2026): the exchange has flagged them for unusual price/volume, and brokers cut or block intraday
 * leverage on them.
 *
 * Shared by every strategy (same list for everyone). A failed load is retried at most once a minute; callers then
 * carry on without the list (Zerodha's 1x margin answer still skips the strictest cases).
 */

export interface SurveillanceList {
  day: string;
  /** Symbol -> short label, e.g. "ASM long-term Stage IV", "GSM stage 0". */
  bySymbol: Map<string, string>;
  asm: number;
  gsm: number;
}

export type NseFetcher = (endpoint: 'reportASM' | 'reportGSM') => Promise<any>;

const RETRY_MS = 60_000;
const TIMEOUT_MS = 10_000;

/** Turns the two NSE answers into symbol -> label. Throws when the shape is not what NSE sends, so a bad answer is not mistaken for "nothing listed". */
export function parseSurveillance(asm: any, gsm: any): { bySymbol: Map<string, string>; asm: number; gsm: number } {
  const lt = asm?.longterm?.data;
  const st = asm?.shortterm?.data;
  const g = Array.isArray(gsm) ? gsm : gsm?.data;
  if (!Array.isArray(lt) || !Array.isArray(st) || !Array.isArray(g)) throw new Error('unexpected NSE ASM/GSM response');
  const bySymbol = new Map<string, string>();
  for (const [rows, label] of [[lt, 'ASM long-term'], [st, 'ASM short-term']] as const) {
    for (const r of rows) {
      const sym = String(r?.symbol || '').trim().toUpperCase();
      if (sym) bySymbol.set(sym, `${label} ${r?.asmSurvIndicator ?? ''}`.trim());
    }
  }
  for (const r of g) {
    const sym = String(r?.symbol || '').trim().toUpperCase();
    if (!sym) continue;
    const label = `GSM stage ${r?.gsmStage ?? '?'}`;
    bySymbol.set(sym, bySymbol.has(sym) ? `${bySymbol.get(sym)} + ${label}` : label);
  }
  return { bySymbol, asm: lt.length + st.length, gsm: g.length };
}

const defaultFetcher: NseFetcher = async (endpoint) => {
  const res = await fetch(`https://www.nseindia.com/api/${endpoint}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: 'application/json',
      Referer: 'https://www.nseindia.com/reports/asm',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`NSE ${endpoint} HTTP ${res.status}`);
  return res.json();
};

let cache: SurveillanceList | null = null;
let inflight: Promise<SurveillanceList | null> | null = null;
let failedAt = 0;
let lastError = '';

/** Today's list (cached for the day), or null when NSE could not be read (retried at most once a minute). */
export function getSurveillanceList(day: string, fetcher: NseFetcher = defaultFetcher, now = Date.now()): Promise<SurveillanceList | null> {
  if (cache?.day === day) return Promise.resolve(cache);
  if (inflight) return inflight;
  if (now - failedAt < RETRY_MS) return Promise.resolve(null);
  inflight = (async () => {
    try {
      const [a, g] = await Promise.all([fetcher('reportASM'), fetcher('reportGSM')]);
      cache = { day, ...parseSurveillance(a, g) };
      return cache;
    } catch (e: any) {
      failedAt = Date.now();
      lastError = String(e?.message || e);
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function lastSurveillanceError(): string {
  return lastError;
}

/** Tests only. */
export function resetSurveillanceCache() {
  cache = null;
  inflight = null;
  failedAt = 0;
  lastError = '';
}
