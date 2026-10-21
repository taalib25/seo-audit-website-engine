import { jobStore, type JobStore } from "./jobs";
import { clientIp } from "./client-ip";
import { readRateLimiter } from "./rate-limit";
import { secureResponse } from "./security";

/** Tracks how many event streams are open per audit and across the process. */
export interface SseRegistry {
  acquire(jobId: string): boolean;
  release(jobId: string): void;
  count(jobId: string): number;
  total(): number;
}

export class MemorySseRegistry implements SseRegistry {
  private readonly perJob = new Map<string, number>();
  private open = 0;
  constructor(private readonly perJobLimit = 5, private readonly globalLimit = 200) {}
  acquire(jobId: string): boolean {
    if (this.open >= this.globalLimit) return false;
    if ((this.perJob.get(jobId) ?? 0) >= this.perJobLimit) return false;
    this.perJob.set(jobId, (this.perJob.get(jobId) ?? 0) + 1);
    this.open++;
    return true;
  }
  release(jobId: string): void {
    const current = this.perJob.get(jobId);
    if (current === undefined) return;
    if (current <= 1) this.perJob.delete(jobId);
    else this.perJob.set(jobId, current - 1);
    this.open = Math.max(0, this.open - 1);
  }
  count(jobId: string): number { return this.perJob.get(jobId) ?? 0; }
  total(): number { return this.open; }
}

export interface AuditEventStreamOptions {
  jobId: string;
  store: Pick<JobStore, "get">;
  request: Request;
  /** Called exactly once when the stream stops, so the caller can free its slot. */
  release: () => void;
  startCursor?: number;
  pollIntervalMs?: number;
  idleTimeoutMs?: number;
  now?: () => number;
}

/**
 * Streams audit events over server-sent events.
 *
 * The stream closes when the audit reaches a terminal state, when the client
 * aborts, or when it stays idle for `idleTimeoutMs`. Every exit path clears
 * the poll timer, removes the abort listener and releases the slot exactly once.
 */
export function createAuditEventStream(options: AuditEventStreamOptions): ReadableStream<Uint8Array> {
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const idleTimeoutMs = options.idleTimeoutMs ?? 60_000;
  const now = options.now ?? Date.now;
  const encoder = new TextEncoder();
  let cursor = options.startCursor ?? 0;
  let lastActivity = now();
  let interval: ReturnType<typeof setInterval> | undefined;
  let onAbort: (() => void) | undefined;
  let stopped = false;
  let released = false;

  const releaseOnce = () => {
    if (released) return;
    released = true;
    options.release();
  };

  const stop = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (interval !== undefined) { clearInterval(interval); interval = undefined; }
    if (onAbort) { options.request.signal.removeEventListener("abort", onAbort); onAbort = undefined; }
    releaseOnce();
    try { controller.close(); } catch { /* already closed */ }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = () => {
        if (stopped) return;
        const current = options.store.get(options.jobId);
        if (!current) { stopped = true; stop(controller); return; }
        let sent = false;
        for (const event of current.events) {
          if (event.id <= cursor) continue;
          controller.enqueue(encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`));
          cursor = event.id;
          sent = true;
        }
        if (sent) lastActivity = now();
        if (current.status === "complete" || current.status === "failed") { stopped = true; stop(controller); return; }
        if (now() - lastActivity >= idleTimeoutMs) { stopped = true; stop(controller); }
      };
      onAbort = () => { if (stopped) return; stopped = true; stop(controller); };
      options.request.signal.addEventListener("abort", onAbort, { once: true });
      interval = setInterval(send, pollIntervalMs);
      send();
    },
    cancel() {
      stopped = true;
      if (interval !== undefined) { clearInterval(interval); interval = undefined; }
      if (onAbort) { options.request.signal.removeEventListener("abort", onAbort); onAbort = undefined; }
      releaseOnce();
    },
  });
}

function parseLastEventId(request: Request): number {
  const parsed = Number(request.headers.get("last-event-id") ?? "0");
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function tooManyRequests(message: string): Response {
  return secureResponse(JSON.stringify({ error: message }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "5" } });
}

export interface EventStreamResponseOptions {
  store?: Pick<JobStore, "get">;
  registry?: SseRegistry;
  pollIntervalMs?: number;
  idleTimeoutMs?: number;
}

/** Builds the SSE response for an audit, bounding the number of open streams. */
export function createEventStreamResponse(jobId: string, request: Request, options: EventStreamResponseOptions = {}): Response {
  const store = options.store ?? jobStore;
  const registry = options.registry ?? sseRegistry;
  if (!readRateLimiter.take(clientIp(request))) return tooManyRequests("Too many requests. Try again shortly.");
  if (!registry.acquire(jobId)) return tooManyRequests("Too many event streams for this audit.");
  const stream = createAuditEventStream({
    jobId,
    store,
    request,
    release: () => registry.release(jobId),
    startCursor: parseLastEventId(request),
    ...(options.pollIntervalMs !== undefined ? { pollIntervalMs: options.pollIntervalMs } : {}),
    ...(options.idleTimeoutMs !== undefined ? { idleTimeoutMs: options.idleTimeoutMs } : { idleTimeoutMs: sseIdleTimeoutMs }),
  });
  return secureResponse(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}

const perAuditLimit = Number(process.env.SSE_MAX_PER_AUDIT ?? 5);
const globalLimit = Number(process.env.SSE_MAX_TOTAL ?? 200);
const idleTimeoutMs = Number(process.env.SSE_IDLE_TIMEOUT_MS ?? 60_000);

// Swap this process-local registry for a shared counter in multi-instance deployments.
export const sseRegistry: SseRegistry = new MemorySseRegistry(
  Number.isFinite(perAuditLimit) && perAuditLimit > 0 ? perAuditLimit : 5,
  Number.isFinite(globalLimit) && globalLimit > 0 ? globalLimit : 200,
);

export const sseIdleTimeoutMs = Number.isFinite(idleTimeoutMs) && idleTimeoutMs > 0 ? idleTimeoutMs : 60_000;
