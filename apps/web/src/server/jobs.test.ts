import { describe, expect, it, vi } from "vitest";
import { InProcessQueue, JobCapacityError, MemoryJobStore, type AuditOptions } from "./jobs";

const options: AuditOptions = { url: "https://example.test/", maxPages: 1, render: false, llm: false, probe: false };
const limits = { maxJobs: 2, ttlMs: 1000, maxBytes: 20_000, maxJobBytes: 10_000 };

describe("bounded audit jobs", () => {
  it("rejects admission when all retained slots are active and evicts completed work first", () => {
    const store = new MemoryJobStore(limits);
    const first = store.create(options);
    const second = store.create(options);
    expect(() => store.create(options)).toThrow(JobCapacityError);
    store.update(first.id, { status: "complete" });
    const third = store.create(options);
    expect(store.get(first.id)).toBeUndefined();
    expect(store.get(second.id)).toBeDefined();
    expect(store.get(third.id)).toBeDefined();
  });

  it("expires terminal reports without evicting running jobs", () => {
    vi.useFakeTimers();
    try {
      const store = new MemoryJobStore(limits);
      const done = store.create(options);
      const active = store.create(options);
      store.update(done.id, { status: "complete" });
      store.update(active.id, { status: "running" });
      vi.advanceTimersByTime(1001);
      expect(store.get(done.id)).toBeUndefined();
      expect(store.get(active.id)?.status).toBe("running");
    } finally { vi.useRealTimers(); }
  });

  it("rejects oversized events before retention and can record a bounded failure", () => {
    const store = new MemoryJobStore({ ...limits, maxJobBytes: 1500 });
    const job = store.create(options);
    store.addEvent(job.id, "progress", { stage: "Running" });
    expect(() => store.addEvent(job.id, "engine", { text: "x".repeat(2000) })).toThrow(JobCapacityError);
    expect(store.get(job.id)?.events).toHaveLength(1);
    store.update(job.id, { status: "failed", error: "Output exceeds retention limit" });
    expect(store.get(job.id)?.events).toEqual([]);
    expect(store.addEvent(job.id, "error", { message: "Output exceeds retention limit" })).toBeDefined();
  });

  it("enforces total retained bytes across active jobs", () => {
    const store = new MemoryJobStore({ ...limits, maxBytes: 1400 });
    const first = store.create(options);
    const second = store.create(options);
    expect(() => store.addEvent(second.id, "engine", { text: "x".repeat(1000) })).toThrow(JobCapacityError);
    expect(store.get(first.id)).toBeDefined();
    expect(store.get(second.id)?.events).toEqual([]);
  });

  it("bounds waiting work and frees capacity after a failed task", async () => {
    const queue = new InProcessQueue(1, 1);
    let rejectFirst: (reason: Error) => void = () => { throw new Error("Task not started"); };
    const started: number[] = [];
    queue.enqueue(() => new Promise<void>((_resolve, reject) => { started.push(1); rejectFirst = reject; }));
    queue.enqueue(async () => { started.push(2); });
    expect(queue.hasCapacity()).toBe(false);
    expect(() => queue.enqueue(async () => {})).toThrow(JobCapacityError);
    await Promise.resolve();
    expect(started).toEqual([1]);
    rejectFirst(new Error("fixture failure"));
    await vi.waitFor(() => expect(started).toEqual([1, 2]));
    await vi.waitFor(() => expect(queue.hasCapacity()).toBe(true));
  });
});
