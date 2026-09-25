/**
 * Central Kite Connect REST rate limiter.
 *
 * Kite limits are enforced per api_key, and every engine, scanner and poller shares one
 * api_key, so buckets are keyed by api_key rather than by client instance.
 *
 *   general     10 req/s   (holdings, positions, orders, margins, profile, instruments, GTT)
 *   quote        1 req/s   (/quote/*)
 *   historical   3 req/s
 *   orders      10 req/s and 400 req/min
 */

export type KiteEndpointClass = 'general' | 'quote' | 'historical' | 'orders';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Token bucket with a FIFO waiter queue so callers are served in arrival order. */
export class TokenBucket {
  private tokens: number;
  private lastRefill = Date.now();
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly capacity: number, private readonly refillPerSec: number) {
    this.tokens = capacity;
  }

  private refill() {
    const now = Date.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.lastRefill) / 1000) * this.refillPerSec);
    this.lastRefill = now;
  }

  /** Resolves once one token has been taken. */
  acquire(): Promise<void> {
    const turn = this.tail.then(async () => {
      for (;;) {
        this.refill();
        if (this.tokens >= 1) {
          this.tokens -= 1;
          return;
        }
        await sleep(Math.ceil(((1 - this.tokens) / this.refillPerSec) * 1000));
      }
    });
    this.tail = turn.catch(() => undefined);
    return turn;
  }

  /** Drop all tokens, e.g. after a 429 so the next call waits a full refill. */
  drain() {
    this.refill();
    this.tokens = 0;
  }
}

export function isRateLimitError(err: any): boolean {
  const msg = String(err?.message || err?.data?.message || '').toLowerCase();
  return err?.status === 429 || err?.response?.status === 429 || msg.includes('too many requests');
}

const MAX_429_RETRIES = 4;
const BACKOFF_BASE_MS = 500;
const BACKOFF_CAP_MS = 8000;

/** Kite REST method -> endpoint class. Anything not listed is left untouched. */
const METHOD_CLASS: Record<string, KiteEndpointClass> = {
  getHoldings: 'general', getPositions: 'general', getOrders: 'general', getOrderHistory: 'general',
  getTrades: 'general', getOrderTrades: 'general', getMargins: 'general', getProfile: 'general',
  getInstruments: 'general', getGTTs: 'general', getGTT: 'general', placeGTT: 'general',
  modifyGTT: 'general', deleteGTT: 'general', generateSession: 'general', renewAccessToken: 'general',
  invalidateAccessToken: 'general',
  getQuote: 'quote', getLTP: 'quote', getOHLC: 'quote',
  getHistoricalData: 'historical',
  placeOrder: 'orders', modifyOrder: 'orders', cancelOrder: 'orders', exitOrder: 'orders',
};

/** Max instruments per request (Kite: quote 500, ltp/ohlc 1000). */
const BATCH_LIMITS: Record<string, number> = { getQuote: 500, getLTP: 1000, getOHLC: 1000 };
const BATCH_WINDOW_MS = 50;

type Deferred = { resolve: (v: any) => void; reject: (e: any) => void; promise: Promise<any> };

/**
 * Merges quote requests from all callers into shared requests: symbols asked for within a
 * short window go out in one call, and a symbol already in flight is joined rather than
 * re-requested. N engines polling one symbol each cost one quote slot, not N.
 */
class QuoteBatcher {
  private inflight = new Map<string, Deferred>();
  private queued = new Map<string, Deferred>();
  private timer: NodeJS.Timeout | null = null;
  private fetch!: (symbols: string[]) => Promise<Record<string, any>>;

  constructor(private readonly max: number, private readonly limiter: KiteRateLimiter) {}

  async get(symbols: string[], fetch: (symbols: string[]) => Promise<Record<string, any>>) {
    this.fetch = fetch; // latest caller's client carries the freshest access token
    const wanted = [...new Set(symbols)];
    const entries = wanted.map(sym => {
      let d = this.inflight.get(sym) || this.queued.get(sym);
      if (!d) {
        let resolve!: Deferred['resolve'], reject!: Deferred['reject'];
        const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
        d = { resolve, reject, promise };
        this.queued.set(sym, d);
      }
      return [sym, d] as const;
    });
    if (!this.timer) this.timer = setTimeout(() => this.flush(), BATCH_WINDOW_MS);
    const values = await Promise.all(entries.map(([, d]) => d.promise));
    const out: Record<string, any> = {};
    entries.forEach(([sym], i) => { if (values[i] !== undefined) out[sym] = values[i]; });
    return out;
  }

  private flush() {
    this.timer = null;
    const batch = [...this.queued.entries()];
    this.queued.clear();
    for (let i = 0; i < batch.length; i += this.max) {
      const chunk = batch.slice(i, i + this.max);
      chunk.forEach(([sym, d]) => this.inflight.set(sym, d));
      this.limiter
        .run('quote', () => this.fetch(chunk.map(([sym]) => sym)))
        .then(res => chunk.forEach(([sym, d]) => d.resolve(res?.[sym])))
        .catch(err => chunk.forEach(([, d]) => d.reject(err)))
        .finally(() => chunk.forEach(([sym, d]) => { if (this.inflight.get(sym) === d) this.inflight.delete(sym); }));
    }
  }
}

export class KiteRateLimiter {
  private static registry = new Map<string, KiteRateLimiter>();

  static forKey(apiKey: string): KiteRateLimiter {
    let limiter = KiteRateLimiter.registry.get(apiKey);
    if (!limiter) {
      limiter = new KiteRateLimiter();
      KiteRateLimiter.registry.set(apiKey, limiter);
    }
    return limiter;
  }

  private buckets: Record<KiteEndpointClass, TokenBucket[]> = {
    general: [new TokenBucket(10, 10)],
    quote: [new TokenBucket(1, 1)],
    historical: [new TokenBucket(3, 3)],
    orders: [new TokenBucket(10, 10), new TokenBucket(400, 400 / 60)],
  };

  private stats: Record<KiteEndpointClass, { calls: number; throttled429: number }> = {
    general: { calls: 0, throttled429: 0 },
    quote: { calls: 0, throttled429: 0 },
    historical: { calls: 0, throttled429: 0 },
    orders: { calls: 0, throttled429: 0 },
  };

  /**
   * Waits for a slot in the class's bucket(s), runs `fn`, and retries with exponential
   * back-off plus jitter when Kite answers 429. A 429 means the request was rejected
   * before execution, so retrying is safe for order calls too. Other errors propagate.
   */
  async run<T>(cls: KiteEndpointClass, fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      for (const bucket of this.buckets[cls]) await bucket.acquire();
      this.stats[cls].calls++;
      try {
        return await fn();
      } catch (err: any) {
        if (!isRateLimitError(err) || attempt >= MAX_429_RETRIES) throw err;
        this.stats[cls].throttled429++;
        for (const bucket of this.buckets[cls]) bucket.drain();
        const backoff = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
        const delay = backoff / 2 + Math.random() * (backoff / 2);
        console.warn(`[KiteRateLimiter] 429 on ${cls}; retry ${attempt + 1}/${MAX_429_RETRIES} in ${Math.round(delay)}ms`);
        await sleep(delay);
      }
    }
  }

  private batchers = new Map<string, QuoteBatcher>();

  /**
   * Wraps the REST methods of a KiteConnect instance in place so every caller, including
   * code that reaches the raw client, goes through the buckets. Idempotent.
   */
  instrument(kite: any) {
    if (!kite || kite.__rateLimited) return kite;
    kite.__rateLimited = true;
    for (const [method, cls] of Object.entries(METHOD_CLASS)) {
      const orig = kite[method];
      if (typeof orig !== 'function') continue;
      const bound = orig.bind(kite);
      const max = BATCH_LIMITS[method];
      if (max) {
        let batcher = this.batchers.get(method);
        if (!batcher) {
          batcher = new QuoteBatcher(max, this);
          this.batchers.set(method, batcher);
        }
        kite[method] = (instruments: string | string[]) =>
          batcher!.get(Array.isArray(instruments) ? instruments : [instruments], syms => bound(syms));
      } else {
        kite[method] = (...args: any[]) => this.run(cls, () => bound(...args));
      }
    }
    return kite;
  }

  getMetrics() {
    return { ...this.stats };
  }
}
