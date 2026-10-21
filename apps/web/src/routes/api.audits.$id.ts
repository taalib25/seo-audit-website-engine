import { createFileRoute } from "@tanstack/react-router";
import { jobStore } from "../server/jobs";
import { clientIp, json } from "../server/security";
import { readRateLimiter } from "../server/rate-limit";

export const Route = createFileRoute("/api/audits/$id")({
  server: { handlers: {
    GET: async ({ params, request }) => {
      if (!readRateLimiter.take(clientIp(request))) return json({ error: "Too many requests. Try again shortly." }, 429, { "Retry-After": "5" });
      const job = jobStore.get(params.id);
      if (!job) return json({ error: "Audit not found." }, 404);
      return json({ status: job.status, ...(job.report ? { report: job.report } : {}), ...(job.prompt ? { prompt: job.prompt } : {}), ...(job.error ? { error: job.error } : {}), traces: job.traces ?? [], usage: job.usage, capabilityNotes: job.capabilityNotes, progress: job.progress, stage: job.stage });
    },
  } },
});
