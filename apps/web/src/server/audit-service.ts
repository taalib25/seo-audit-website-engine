import { assertSafeUrl } from "@aeo/core";
import { z } from "zod";
import { auditQueue, emitProgress, jobStore, JobCapacityError, type AuditJob, type AuditPipeline } from "./jobs";
import { runPipeline } from "./pipeline";

export const CreateAuditSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  maxPages: z.number().int().min(1).max(50).default(10),
  render: z.boolean().default(false),
  llm: z.boolean().default(false),
  probe: z.boolean().default(false),
}).strict();

export function auditFailureReason(error: unknown): string {
  if (error instanceof JobCapacityError || (error instanceof Error && error.name === "JobCapacityError")) return "The audit exceeded temporary storage limits. Try auditing fewer pages.";
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || /timed out|crawl budget exhausted/i.test(error.message))) {
    return "The site did not finish responding within the audit time limits. Try again later or audit fewer pages.";
  }
  if (error instanceof Error && /byte limit|response too large/i.test(error.message)) {
    return "The site response exceeded the audit size limit. Try auditing fewer pages.";
  }
  return "The audit could not be completed. Try again later.";
}

export async function createAudit(input: unknown, pipeline: AuditPipeline = { run: runPipeline }, env: NodeJS.ProcessEnv = process.env): Promise<AuditJob> {
  const requested = CreateAuditSchema.parse(input);
  assertSafeUrl(requested.url);
  const capabilityNotes: string[] = [];
  const options = { ...requested, maxPages: Math.min(requested.maxPages, 25) };
  if (requested.maxPages > options.maxPages) capabilityNotes.push("Page limit capped at 25 for anonymous audits.");
  const renderEnabled = env.ENABLE_BROWSER === "true";
  if (options.render && !renderEnabled) { options.render = false; capabilityNotes.push("Rendering disabled: set ENABLE_BROWSER=true to enable it."); }
  const llmEnabled = Boolean(env.OPENROUTER_API_KEY || env.LLM_API_KEY);
  if (options.llm && !llmEnabled) { options.llm = false; capabilityNotes.push("LLM checks skipped: no LLM key configured."); }
  const probeConfigured = Boolean(env.PROBE_QUERIES);
  if (options.probe && (!llmEnabled || !probeConfigured)) {
    options.probe = false;
    capabilityNotes.push(!llmEnabled ? "AI visibility probes skipped: no LLM key configured." : "AI visibility probes skipped: PROBE_QUERIES is not configured.");
  }
  const renderer = renderEnabled ? (env.RENDERER ?? (env.CDP_ENDPOINT ? "cdp" : undefined)) : undefined;
  if (!auditQueue.hasCapacity()) throw new JobCapacityError("Audit queue is at capacity");
  const job = jobStore.create({ ...options, ...(renderer ? { renderer } : {}), ...(env.CDP_ENDPOINT ? { cdpEndpoint: env.CDP_ENDPOINT } : {}) }, capabilityNotes);
  auditQueue.enqueue(async () => {
    try {
      jobStore.update(job.id, { status: "running", stage: "Starting", progress: 5 });
      jobStore.addEvent(job.id, "progress", { stage: "Starting", progress: 5 });
      const result = await pipeline.run(job, (stage, progress) => emitProgress(job.id, stage, progress), (event) => { jobStore.addEvent(job.id, "engine", event as unknown as Record<string, unknown>); }, AbortSignal.timeout(5 * 60_000));
      jobStore.update(job.id, { status: "complete", stage: "Complete", progress: 100, report: result.report, prompt: result.prompt, traces: result.traces, usage: result.usage });
      jobStore.addEvent(job.id, "complete", { progress: 100 });
    } catch (error) {
      const message = auditFailureReason(error);
      jobStore.update(job.id, { status: "failed", stage: "Failed", error: message });
      jobStore.addEvent(job.id, "error", { message });
    }
  });
  return job;
}
