interface Bucket { tokens: number; updatedAt: number }
export interface RateLimiter { take(key: string): boolean }

/** Token bucket: burst 5 requests, refills at 1 token per 12 seconds per IP. */
export class MemoryTokenBucket implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  constructor(private readonly burst = 5, private readonly refillMs = 12_000, private readonly maxKeys = 10_000) {}
  take(key: string) {
    const now = Date.now();
    if (!this.buckets.has(key) && this.buckets.size >= this.maxKeys) {
      for (const [id, bucket] of this.buckets) if (now - bucket.updatedAt >= this.refillMs * this.burst) this.buckets.delete(id);
      if (this.buckets.size >= this.maxKeys) return false;
    }
    const bucket = this.buckets.get(key) ?? { tokens: this.burst, updatedAt: now };
    bucket.tokens = Math.min(this.burst, bucket.tokens + (now - bucket.updatedAt) / this.refillMs);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) { this.buckets.set(key, bucket); return false; }
    bucket.tokens--;
    this.buckets.set(key, bucket);
    return true;
  }
}

// Replace with Redis-backed RateLimiter for horizontally scaled deployments.
const burst = Number(process.env.RATE_LIMIT_BURST ?? 5);
const refillMs = Number(process.env.RATE_LIMIT_REFILL_MS ?? 12_000);
export const rateLimiter: RateLimiter = new MemoryTokenBucket(Number.isFinite(burst) && burst > 0 ? burst : 5, Number.isFinite(refillMs) && refillMs > 0 ? refillMs : 12_000);

// Read routes are far more frequent than audit submissions, so they get their
// own, more generous bucket instead of competing with the write limiter.
const readBurst = Number(process.env.RATE_LIMIT_READ_BURST ?? 60);
const readRefillMs = Number(process.env.RATE_LIMIT_READ_REFILL_MS ?? 1000);
export const readRateLimiter: RateLimiter = new MemoryTokenBucket(Number.isFinite(readBurst) && readBurst > 0 ? readBurst : 60, Number.isFinite(readRefillMs) && readRefillMs > 0 ? readRefillMs : 1000);
