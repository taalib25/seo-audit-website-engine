import { createFileRoute } from "@tanstack/react-router";
import { jobStore } from "../server/jobs";
import { json } from "../server/security";

export const Route = createFileRoute("/api/audits/$id")({
  server: { handlers: {
    GET: async ({ params }) => {
      const job = jobStore.get(params.id);
      if (!job) return json({ error: "Audit not found." }, 404);
      return json({ status: job.status, ...(job.report ? { report: job.report } : {}), progress: job.progress, stage: job.stage });
    },
  } },
});
