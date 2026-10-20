import { describe, expect, it, vi } from "vitest";
import { MemoryTokenBucket } from "./rate-limit";

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
});
