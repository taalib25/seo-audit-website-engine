import { describe, expect, it, vi } from "vitest";
import { MemorySseRegistry, createAuditEventStream, createEventStreamResponse } from "./events";
import type { AuditJob, JobStore } from "./jobs";

function job(overrides: Partial<AuditJob> = {}): AuditJob {
  return {
    id: "job-1",
    status: "running",
    options: { url: "https://example.test/", maxPages: 1, render: false, llm: false, probe: false },
    capabilityNotes: [],
    progress: 0,
    stage: "Queued",
    events: [],
    createdAt: "2026-10-21T00:00:00.000Z",
    ...overrides,
  };
}

function store(jobs: AuditJob[]): Pick<JobStore, "get"> {
  return { get: (id: string) => jobs.find((candidate) => candidate.id === id) };
}

function decode(result: ReadableStreamReadResult<Uint8Array>): string {
  return result.done ? "" : new TextDecoder().decode(result.value);
}

describe("event stream registry", () => {
  it("caps the streams opened against a single audit", () => {
    const registry = new MemorySseRegistry(2, 10);
    expect(registry.acquire("a")).toBe(true);
    expect(registry.acquire("a")).toBe(true);
    expect(registry.acquire("a")).toBe(false);
    expect(registry.count("a")).toBe(2);
    registry.release("a");
    expect(registry.acquire("a")).toBe(true);
  });

  it("caps the streams opened across all audits", () => {
    const registry = new MemorySseRegistry(5, 2);
    expect(registry.acquire("a")).toBe(true);
    expect(registry.acquire("b")).toBe(true);
    expect(registry.acquire("c")).toBe(false);
    expect(registry.total()).toBe(2);
    registry.release("a");
    registry.release("b");
    expect(registry.total()).toBe(0);
  });
});

describe("audit event stream", () => {
  it("streams events and closes once the audit is complete", async () => {
    const completed = job({ status: "complete", events: [{ id: 1, type: "complete", data: { progress: 100 }, createdAt: "2026-10-21T00:00:01.000Z" }] });
    const release = vi.fn();
    const stream = createAuditEventStream({ jobId: "job-1", store: store([completed]), request: new Request("https://audit.test/"), release });
    const reader = stream.getReader();
    const first = await reader.read();
    expect(decode(first)).toContain("event: complete");
    const second = await reader.read();
    expect(second.done).toBe(true);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("closes a stream that stays idle", async () => {
    vi.useFakeTimers();
    try {
      const release = vi.fn();
      const stream = createAuditEventStream({ jobId: "job-1", store: store([job()]), request: new Request("https://audit.test/"), release, pollIntervalMs: 100, idleTimeoutMs: 1000 });
      const reader = stream.getReader();
      const pending = reader.read();
      await vi.advanceTimersByTimeAsync(1500);
      const result = await pending;
      expect(result.done).toBe(true);
      expect(release).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("stops polling and releases the slot when the client aborts", async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const get = vi.fn(() => job());
      const release = vi.fn();
      const stream = createAuditEventStream({ jobId: "job-1", store: { get }, request: new Request("https://audit.test/", { signal: controller.signal }), release, pollIntervalMs: 100, idleTimeoutMs: 60_000 });
      const reader = stream.getReader();
      const pending = reader.read();
      controller.abort();
      const result = await pending;
      expect(result.done).toBe(true);
      expect(release).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1000);
      expect(get).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it("rejects more event streams than the per-audit limit allows", async () => {
    const registry = new MemorySseRegistry(1, 10);
    const audits = [job({ id: "job-1" })];
    const controller = new AbortController();
    const first = createEventStreamResponse("job-1", new Request("https://audit.test/api/audits/job-1/events", { signal: controller.signal }), { store: store(audits), registry, pollIntervalMs: 50, idleTimeoutMs: 1000 });
    expect(first.status).toBe(200);
    const second = createEventStreamResponse("job-1", new Request("https://audit.test/api/audits/job-1/events"), { store: store(audits), registry });
    expect(second.status).toBe(429);
    controller.abort();
  });
});
