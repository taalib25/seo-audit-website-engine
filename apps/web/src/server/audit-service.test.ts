import { expect, it, vi } from "vitest";
import { auditFailureReason, createAudit } from "./audit-service";
import { auditQueue, jobStore, JobCapacityError, type AuditPipeline } from "./jobs";
import { sampleReport } from "../fixtures/sample-report";

it("turns internal pipeline errors into safe, actionable audit failure reasons", () => {
  const reason = auditFailureReason(new Error("Timed out after 15000ms: https://private.example/secret?token=hidden"));
  expect(reason).toContain("time limits");
  expect(reason).not.toContain("private.example");
  expect(reason).not.toContain("token");
  expect(auditFailureReason(new Error("Unexpected internal stack path C:\\server\\secret.ts"))).toBe("The audit could not be completed. Try again later.");
});

it("rejects audit admission before adding work beyond the queue capacity", async () => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const pipeline: AuditPipeline = { async run(_job, _progress, _event, signal) {
    expect(signal).toBeInstanceOf(AbortSignal);
    await gate;
    return { report: sampleReport, prompt: { markdown: "fixture", tasks: [] }, traces: [], usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } };
  } };
  const ids: string[] = [];
  try {
    for (let index = 0; index < 12; index++) ids.push((await createAudit({ url: "https://example.test/", maxPages: 1 }, pipeline, {})).id);
    expect(auditQueue.hasCapacity()).toBe(false);
    await expect(createAudit({ url: "https://example.test/" }, pipeline, {})).rejects.toBeInstanceOf(JobCapacityError);
  } finally {
    release();
    await vi.waitFor(() => expect(ids.every((id) => jobStore.get(id)?.status === "complete")).toBe(true));
  }
});
