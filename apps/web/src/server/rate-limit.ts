interface Bucket { tokens: number; updatedAt: number }
export interface RateLimiter { take(key: string): boolean }

/** Token bucket: burst 5 requests, refills at 1 token per 12 seconds per IP. */
export class MemoryTokenBucket implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  constructor(private readonly burst = 5, private readonly refillMs = 12_000) {}
  take(key: string) {
    const now = Date.now();
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
