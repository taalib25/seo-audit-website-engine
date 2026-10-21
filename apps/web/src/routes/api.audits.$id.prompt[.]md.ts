import { createFileRoute } from "@tanstack/react-router";
import { jobStore } from "../server/jobs";
import { clientIp, secureResponse } from "../server/security";
import { readRateLimiter } from "../server/rate-limit";

export const Route = createFileRoute("/api/audits/$id/prompt.md")({
  server: { handlers: {
    GET: async ({ params, request }) => {
      if (!readRateLimiter.take(clientIp(request))) return secureResponse(JSON.stringify({ error: "Too many requests. Try again shortly." }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "5" } });
      const job = jobStore.get(params.id);
      if (!job?.report) return secureResponse("Audit report is not ready.", { status: job ? 409 : 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      const body = job.prompt?.markdown ?? "Fix prompt is not available for this audit.";
      return secureResponse(body, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${params.id}-prompt.md"` } });
    },
  } },
});
