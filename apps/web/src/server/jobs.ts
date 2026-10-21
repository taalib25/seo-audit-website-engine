import type { AuditReport } from "@aeo/core";
import type { EngineProgress } from "@aeo/engine";
import type { PromptTrace, UsageSummary } from "@aeo/llm";
import type { FixTask } from "@aeo/prompt";

export type JobStatus = "queued" | "running" | "complete" | "failed";
export interface AuditOptions { url: string; maxPages: number; render: boolean; llm: boolean; probe: boolean; renderer?: string; cdpEndpoint?: string }
export interface JobEvent { id: number; type: "progress" | "complete" | "error" | "engine"; data: Record<string, unknown>; createdAt: string }
export interface AuditJob { id: string; status: JobStatus; options: AuditOptions; report?: AuditReport; prompt?: { markdown: string; tasks: FixTask[] }; traces?: PromptTrace[]; usage?: UsageSummary; capabilityNotes: string[]; error?: string; progress: number; stage: string; events: JobEvent[]; createdAt: string }

export interface JobStore {
  create(options: AuditOptions, capabilityNotes?: string[]): AuditJob;
  get(id: string): AuditJob | undefined;
  addEvent(id: string, type: JobEvent["type"], data: Record<string, unknown>): JobEvent | undefined;
  update(id: string, update: Partial<Pick<AuditJob, "status" | "report" | "prompt" | "traces" | "usage" | "error" | "progress" | "stage">>): void;
}

export interface AuditPipeline { run(job: AuditJob, progress: (stage: string, progress: number) => void, engineEvent: (event: EngineProgress) => void, signal: AbortSignal): Promise<{ report: AuditReport; prompt: { markdown: string; tasks: FixTask[] }; traces: PromptTrace[]; usage: UsageSummary }> }

export class JobCapacityError extends Error {
  override name = "JobCapacityError";
}

export class MemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, AuditJob>();
  private readonly sizes = new Map<string, number>();
  private readonly terminalAt = new Map<string, number>();
  private usedBytes = 0;
  constructor(private readonly limits = { maxJobs: 50, ttlMs: 30 * 60_000, maxBytes: 64 * 1024 * 1024, maxJobBytes: 8 * 1024 * 1024 }) {}
  private remove(id: string) {
    this.usedBytes -= this.sizes.get(id) ?? 0;
    this.jobs.delete(id); this.sizes.delete(id); this.terminalAt.delete(id);
  }
  private prune() {
    const cutoff = Date.now() - this.limits.ttlMs;
    for (const [id, ended] of this.terminalAt) if (ended <= cutoff) this.remove(id);
  }
  private reserve(bytes: number, exceptId?: string) {
    if (bytes > this.limits.maxJobBytes) throw new JobCapacityError("Audit result exceeds the retention limit");
    const delta = bytes - (exceptId ? this.sizes.get(exceptId) ?? 0 : 0);
    for (const [id] of this.terminalAt) {
      if (this.usedBytes + delta <= this.limits.maxBytes && (exceptId || this.jobs.size < this.limits.maxJobs)) break;
      if (id !== exceptId) this.remove(id);
    }
    if (this.usedBytes + delta > this.limits.maxBytes || (!exceptId && this.jobs.size >= this.limits.maxJobs)) throw new JobCapacityError("Audit storage is at capacity");
  }
  private setSize(id: string, bytes: number) {
    this.usedBytes += bytes - (this.sizes.get(id) ?? 0);
    this.sizes.set(id, bytes);
  }
  create(options: AuditOptions, capabilityNotes: string[] = []): AuditJob {
    this.prune();
    const job: AuditJob = { id: crypto.randomUUID(), status: "queued", options, capabilityNotes, progress: 0, stage: "Queued", events: [], createdAt: new Date().toISOString() };
    const bytes = Buffer.byteLength(JSON.stringify(job));
    this.reserve(bytes);
    this.jobs.set(job.id, job);
    this.setSize(job.id, bytes);
    return job;
  }
  get(id: string) { this.prune(); return this.jobs.get(id); }
  addEvent(id: string, type: JobEvent["type"], data: Record<string, unknown>) {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const event: JobEvent = { id: (job.events.at(-1)?.id ?? 0) + 1, type, data, createdAt: new Date().toISOString() };
    const bytes = (this.sizes.get(id) ?? 0) + Buffer.byteLength(JSON.stringify(event)) + 1;
    this.reserve(bytes, id);
    job.events.push(event);
    this.setSize(id, bytes);
    return event;
  }
  update(id: string, update: Partial<Pick<AuditJob, "status" | "report" | "prompt" | "traces" | "usage" | "error" | "progress" | "stage">>) {
    const job = this.jobs.get(id);
    if (!job) return;
    // Release oversized partial output before recording a bounded failure.
    const failed = update.status === "failed";
    const next = { ...job, ...update, ...(failed ? { events: [] } : {}) };
    if (failed) { delete next.report; delete next.prompt; delete next.traces; delete next.usage; }
    const bytes = Buffer.byteLength(JSON.stringify(next));
    this.reserve(bytes, id);
    Object.assign(job, next);
    if (failed) { delete job.report; delete job.prompt; delete job.traces; delete job.usage; }
    this.setSize(id, bytes);
    if (job.status === "complete" || job.status === "failed") this.terminalAt.set(id, Date.now());
  }
}

export class InProcessQueue {
  private active = 0;
  private readonly waiting: Array<() => Promise<void>> = [];
  constructor(private readonly limit = 2, private readonly maxWaiting = 10) {}
  hasCapacity() { return this.active < this.limit || this.waiting.length < this.maxWaiting; }
  enqueue(task: () => Promise<void>) {
    if (!this.hasCapacity()) throw new JobCapacityError("Audit queue is at capacity");
    this.waiting.push(task); this.drain();
  }
  private drain() {
    while (this.active < this.limit && this.waiting.length) {
      const task = this.waiting.shift();
      if (!task) return;
      this.active++;
      void Promise.resolve().then(task).catch(() => undefined).finally(() => { this.active--; this.drain(); });
    }
  }
}

// Swap this process-local store and queue for a DB-backed JobStore + BullMQ/Redis
// queue in multi-instance deployments. Persist the event sequence for SSE resume.
export const jobStore: JobStore = new MemoryJobStore();
export const auditQueue = new InProcessQueue(2);

export function emitProgress(id: string, stage: string, progress: number) {
  jobStore.update(id, { status: "running", stage, progress });
  jobStore.addEvent(id, "progress", { stage, progress });
}
