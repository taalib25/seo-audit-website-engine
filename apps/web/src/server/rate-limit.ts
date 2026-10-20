interface Bucket { tokens: number; updatedAt: number }
export interface RateLimiter { take(key: string): boolean }

/** Token bucket: burst 5 requests, refills at 1 token per 12 seconds per IP. */
export class MemoryTokenBucket implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  take(key: string) {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: 5, updatedAt: now };
    bucket.tokens = Math.min(5, bucket.tokens + (now - bucket.updatedAt) / 12_000);
    bucket.updatedAt = now;
    if (bucket.tokens < 1) { this.buckets.set(key, bucket); return false; }
    bucket.tokens--;
    this.buckets.set(key, bucket);
    return true;
  }
}

// Replace with Redis-backed RateLimiter for horizontally scaled deployments.
export const rateLimiter: RateLimiter = new MemoryTokenBucket();
