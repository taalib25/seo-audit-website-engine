import { createFileRoute } from "@tanstack/react-router";
import { jobStore } from "../server/jobs";
import { clientIp, json, secureResponse } from "../server/security";
import { readRateLimiter } from "../server/rate-limit";

export const Route = createFileRoute("/api/audits/$id/report.json")({
  server: { handlers: {
    GET: async ({ params, request }) => {
      if (!readRateLimiter.take(clientIp(request))) return json({ error: "Too many requests. Try again shortly." }, 429, { "Retry-After": "5" });
      const job = jobStore.get(params.id);
      if (!job) return json({ error: "Audit not found." }, 404);
      if (!job.report) return json({ error: "Audit report is not ready." }, 409);
      return secureResponse(JSON.stringify(job.report, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${params.id}-report.json"` } });
    },
  } },
});
