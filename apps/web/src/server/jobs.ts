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

export interface AuditPipeline { run(job: AuditJob, progress: (stage: string, progress: number) => void, engineEvent: (event: EngineProgress) => void): Promise<{ report: AuditReport; prompt: { markdown: string; tasks: FixTask[] }; traces: PromptTrace[]; usage: UsageSummary }> }

export class MemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, AuditJob>();
  create(options: AuditOptions, capabilityNotes: string[] = []): AuditJob {
    const job: AuditJob = { id: crypto.randomUUID(), status: "queued", options, capabilityNotes, progress: 0, stage: "Queued", events: [], createdAt: new Date().toISOString() };
    this.jobs.set(job.id, job);
    return job;
  }
  get(id: string) { return this.jobs.get(id); }
  addEvent(id: string, type: JobEvent["type"], data: Record<string, unknown>) {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const event: JobEvent = { id: (job.events.at(-1)?.id ?? 0) + 1, type, data, createdAt: new Date().toISOString() };
    job.events.push(event);
    return event;
  }
  update(id: string, update: Partial<Pick<AuditJob, "status" | "report" | "prompt" | "traces" | "usage" | "error" | "progress" | "stage">>) {
    const job = this.jobs.get(id);
    if (job) Object.assign(job, update);
  }
}

export class InProcessQueue {
  private active = 0;
  private readonly waiting: Array<() => Promise<void>> = [];
  constructor(private readonly limit = 2) {}
  enqueue(task: () => Promise<void>) { this.waiting.push(task); this.drain(); }
  private drain() {
    while (this.active < this.limit && this.waiting.length) {
      const task = this.waiting.shift();
      if (!task) return;
      this.active++;
      void task().finally(() => { this.active--; this.drain(); });
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
