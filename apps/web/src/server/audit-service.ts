import { assertSafeUrl } from "@aeo/core";
import { z } from "zod";
import { auditQueue, emitProgress, jobStore, type AuditJob, type AuditPipeline } from "./jobs";
import { runPipeline } from "./pipeline";

export const CreateAuditSchema = z.object({
  url: z.string().trim().min(1).max(2048),
  maxPages: z.number().int().min(1).max(50).default(10),
  render: z.boolean().default(false),
  llm: z.boolean().default(false),
  probe: z.boolean().default(false),
}).strict();

export async function createAudit(input: unknown, pipeline: AuditPipeline = { run: runPipeline }): Promise<AuditJob> {
  const options = CreateAuditSchema.parse(input);
  assertSafeUrl(options.url);
  const job = jobStore.create(options);
  auditQueue.enqueue(async () => {
    try {
      jobStore.update(job.id, { status: "running", stage: "Starting", progress: 5 });
      jobStore.addEvent(job.id, "progress", { stage: "Starting", progress: 5 });
      const report = await pipeline.run(job, (stage, progress) => emitProgress(job.id, stage, progress));
      jobStore.update(job.id, { status: "complete", stage: "Complete", progress: 100, report });
      jobStore.addEvent(job.id, "complete", { progress: 100 });
    } catch {
      jobStore.update(job.id, { status: "failed", stage: "Failed", error: "Audit could not be completed" });
      jobStore.addEvent(job.id, "error", { message: "Audit could not be completed" });
    }
  });
  return job;
}
