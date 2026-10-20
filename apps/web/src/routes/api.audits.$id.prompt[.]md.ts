import { createFileRoute } from "@tanstack/react-router";
import { jobStore } from "../server/jobs";
import { secureResponse } from "../server/security";

export const Route = createFileRoute("/api/audits/$id/prompt.md")({
  server: { handlers: { GET: async ({ params }) => {
    const job = jobStore.get(params.id);
    if (!job?.report) return secureResponse("Audit report is not ready.", { status: job ? 409 : 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    const body = job.prompt?.markdown ?? "Fix prompt is not available for this audit.";
    return secureResponse(body, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${params.id}-prompt.md"` } });
  } } },
});
