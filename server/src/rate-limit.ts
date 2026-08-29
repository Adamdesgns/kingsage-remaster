/**
 * A small token bucket, per key, with an injectable clock.
 *
 * Why it exists (audit 2026-08-29, finding 12.4): the world had no rate
 * limiting anywhere. Registration was unthrottled against a six-seat world,
 * login was unthrottled against scryptSync - which BLOCKS the event loop on
 * a single-threaded server - and one client looping distinct commands could
 * drain a whole Roblox place's shared HttpService budget.
 *
 * In-memory and per-process on purpose: the world server is a single
 * process by design (single writer over one SQLite file), so shared state
 * would be solving a problem this deployment cannot have.
 */

export type RateLimiter = {
  /** True if the caller identified by `key` may proceed; false = refused. */
  allow(key: string): boolean;
};

type Bucket = { tokens: number; last: number };

// Keys are remote addresses and player ids; a runaway map would be its own
// denial of service, so past this size full-and-idle buckets are swept.
const SWEEP_THRESHOLD = 10_000;

export function createRateLimiter(options: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const { limit, windowMs } = options;
  const now = options.now ?? (() => Date.now());
  const buckets = new Map<string, Bucket>();

  function sweep(at: number): void {
    if (buckets.size < SWEEP_THRESHOLD) return;
    for (const [key, bucket] of buckets) {
      const refilled = bucket.tokens + ((at - bucket.last) / windowMs) * limit;
      if (refilled >= limit) buckets.delete(key);
    }
  }

  return {
    allow(key: string): boolean {
      const at = now();
      sweep(at);
      const bucket = buckets.get(key) ?? { tokens: limit, last: at };
      bucket.tokens = Math.min(limit, bucket.tokens + ((at - bucket.last) / windowMs) * limit);
      bucket.last = at;
      const allowed = bucket.tokens >= 1;
      if (allowed) bucket.tokens -= 1;
      buckets.set(key, bucket);
      return allowed;
    },
  };
}
