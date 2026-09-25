/**
 * Remembers the outcome of a mutating request by client-supplied key so a double click, a
 * retried POST after a lost response, or two tabs never place the same order twice.
 *
 * A concurrent duplicate awaits the first call's promise; a completed success is replayed
 * for `ttlMs`. Failures are dropped immediately so a legitimate retry can go through.
 */
export class IdempotencyStore<T> {
  private readonly entries = new Map<string, { promise: Promise<T>; expiresAt: number }>();

  constructor(private readonly ttlMs = 10 * 60_000, private readonly maxEntries = 5_000) {}

  async run(scope: string, key: string | undefined, fn: () => Promise<T>): Promise<T> {
    if (!key) return fn();

    const id = `${scope}:${key}`;
    const now = Date.now();
    const hit = this.entries.get(id);
    if (hit && hit.expiresAt > now) return hit.promise;

    this.prune(now);
    const promise = fn();
    this.entries.set(id, { promise, expiresAt: now + this.ttlMs });
    promise.catch(() => {
      if (this.entries.get(id)?.promise === promise) this.entries.delete(id);
    });
    return promise;
  }

  private prune(now: number): void {
    if (this.entries.size < this.maxEntries) return;
    for (const [id, e] of this.entries) if (e.expiresAt <= now) this.entries.delete(id);
    // Still full of live keys: drop the oldest (Map iterates in insertion order).
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

/** Keys come from a header: accept only a sane, bounded token. */
export function sanitizeIdempotencyKey(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const key = raw.trim();
  return /^[A-Za-z0-9_\-:.]{8,80}$/.test(key) ? key : undefined;
}
