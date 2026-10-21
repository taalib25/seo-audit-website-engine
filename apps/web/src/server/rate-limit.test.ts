import { describe, expect, it, vi } from "vitest";
import { MemoryTokenBucket, readRateLimiter, rateLimiter } from "./rate-limit";

describe("MemoryTokenBucket", () => {
  it("allows a burst of five, blocks the sixth, and refills over time", () => {
    vi.useFakeTimers();
    const limiter = new MemoryTokenBucket();
    for (let index = 0; index < 5; index++) expect(limiter.take("client")).toBe(true);
    expect(limiter.take("client")).toBe(false);
    vi.advanceTimersByTime(12_000);
    expect(limiter.take("client")).toBe(true);
    vi.useRealTimers();
  });

  it("bounds client keys and reclaims fully refilled inactive buckets", () => {
    vi.useFakeTimers();
    try {
      const limiter = new MemoryTokenBucket(1, 1000, 2);
      expect(limiter.take("a")).toBe(true);
      expect(limiter.take("b")).toBe(true);
      expect(limiter.take("c")).toBe(false);
      vi.advanceTimersByTime(1000);
      expect(limiter.take("c")).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("gives read routes a separate, more generous bucket than write routes", () => {
    for (let index = 0; index < 5; index++) expect(rateLimiter.take("shared-client")).toBe(true);
    expect(rateLimiter.take("shared-client")).toBe(false);
    for (let index = 0; index < 5; index++) expect(readRateLimiter.take("shared-client")).toBe(true);
    expect(readRateLimiter.take("shared-client")).toBe(true);
  });
});
