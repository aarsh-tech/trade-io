import { toKiteError } from './kite-errors';

/**
 * Shared Kite instrument master.
 *
 * Kite publishes the instrument dump once a day (before the open), and it is identical for every
 * account, so it is fetched once per exchange per trading day and shared by every consumer
 * (ticker, engines, search, lot sizes). An entry is stale once the most recent 08:45 IST
 * boundary has passed since it was fetched. Concurrent callers share one in-flight fetch, and if
 * a refresh fails the previous day's data keeps being served (with a retry back-off) rather than
 * returning an empty list.
 */

export interface Instrument {
  instrument_token: number;
  tradingsymbol: string;
  name?: string;
  exchange: string;
  segment?: string;
  lot_size?: number;
  tick_size?: number;
  strike?: number;
  instrument_type?: string;
  expiry?: any;
}

/** Kite index rows carry these exact tradingsymbols; anything else is an alias. */
export interface IndexInstrument {
  exchange: string;
  tradingsymbol: string;
  /** Long-standing fixed token, used only until the master is loaded. Omit when unsure. */
  token?: number;
  aliases: string[];
}

/**
 * Names and tokens checked against Kite (docs, developer forum and Kite's own chart URLs):
 * NIFTY 50 = 256265 (exchange token 1001), NIFTY BANK = 260105 (1016), SENSEX = 265,
 * NIFTY FIN SERVICE = 257801 (FINNIFTY's index), NIFTY MID SELECT = 288009 (MIDCPNIFTY's index),
 * NIFTY IT = 259849. (257545 is NIFTY CONSUMPTION, which an earlier hard-coded map wrongly used
 * for NIFTY IT.) The tokens are only a fallback for before the master loads; the master wins.
 */
export const INDEX_INSTRUMENTS: IndexInstrument[] = [
  { exchange: 'NSE', tradingsymbol: 'NIFTY 50', token: 256265, aliases: ['NIFTY', 'NIFTY50'] },
  { exchange: 'NSE', tradingsymbol: 'NIFTY BANK', token: 260105, aliases: ['BANKNIFTY', 'BANK NIFTY'] },
  { exchange: 'BSE', tradingsymbol: 'SENSEX', token: 265, aliases: [] },
  { exchange: 'NSE', tradingsymbol: 'NIFTY FIN SERVICE', token: 257801, aliases: ['FINNIFTY'] },
  { exchange: 'NSE', tradingsymbol: 'NIFTY MID SELECT', token: 288009, aliases: ['MIDCPNIFTY'] },
  { exchange: 'NSE', tradingsymbol: 'NIFTY IT', token: 259849, aliases: [] },
];

/** `BANKNIFTY`, `NSE:BANKNIFTY` or `NIFTY BANK` -> the canonical index row, if it is one. */
export function resolveIndex(symbol: string): IndexInstrument | undefined {
  const s = (symbol || '').toUpperCase().trim();
  const bare = s.includes(':') ? s.split(':')[1] : s;
  return INDEX_INSTRUMENTS.find(
    (i) => i.tradingsymbol === bare || i.aliases.includes(bare),
  );
}

/** Canonical `exchange:tradingsymbol` key for an index alias, otherwise the input unchanged. */
export function canonicalKey(symbol: string): string {
  const idx = resolveIndex(symbol);
  return idx ? `${idx.exchange}:${idx.tradingsymbol}` : symbol;
}

interface Entry {
  data: Instrument[];
  byKey: Map<string, Instrument>;
  fetchedAt: number;
  retryAfter: number;
}

const RETRY_BACKOFF_MS = 60_000;

/** The most recent 08:45 IST at or before `now`. */
export function lastRefreshBoundary(now = new Date()): number {
  const ist = (d: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  let boundary = new Date(`${ist(now)}T08:45:00.000+05:30`).getTime();
  if (now.getTime() < boundary) {
    boundary = new Date(`${ist(new Date(now.getTime() - 24 * 3600_000))}T08:45:00.000+05:30`).getTime();
  }
  return boundary;
}

export class InstrumentStore {
  private static entries = new Map<string, Entry>();
  private static inflight = new Map<string, Promise<Instrument[]>>();

  static isFresh(exchange: string, now = new Date()): boolean {
    const e = this.entries.get(exchange);
    return !!e && e.fetchedAt >= lastRefreshBoundary(now);
  }

  /** Instruments for an exchange, fetching through `fetch` only when today's master is missing. */
  static async get(exchange: string, fetch: () => Promise<Instrument[]>): Promise<Instrument[]> {
    const now = Date.now();
    const entry = this.entries.get(exchange);
    if (entry && this.isFresh(exchange)) return entry.data;
    if (entry && now < entry.retryAfter) return entry.data; // stale but refresh recently failed

    let pending = this.inflight.get(exchange);
    if (!pending) {
      pending = this.load(exchange, fetch).finally(() => this.inflight.delete(exchange));
      this.inflight.set(exchange, pending);
    }
    return pending;
  }

  private static async load(exchange: string, fetch: () => Promise<Instrument[]>): Promise<Instrument[]> {
    const previous = this.entries.get(exchange);
    try {
      const data = await fetch();
      const byKey = new Map<string, Instrument>();
      for (const i of data) byKey.set(`${i.exchange || exchange}:${i.tradingsymbol}`, i);
      this.entries.set(exchange, { data, byKey, fetchedAt: Date.now(), retryAfter: 0 });
      console.log(`[InstrumentStore] Loaded ${data.length} ${exchange} instruments.`);
      return data;
    } catch (err) {
      const kerr = toKiteError(err);
      if (previous) {
        console.warn(`[InstrumentStore] ${exchange} refresh failed (${kerr.name}: ${kerr.message}); serving previous master.`);
        previous.retryAfter = Date.now() + RETRY_BACKOFF_MS;
        return previous.data;
      }
      throw kerr; // nothing to fall back on: never pretend the exchange has no instruments
    }
  }

  /** Synchronous lookup from an already-loaded exchange. */
  static find(exchange: string, tradingsymbol: string): Instrument | undefined {
    return this.entries.get(exchange)?.byKey.get(`${exchange}:${tradingsymbol}`);
  }
}
