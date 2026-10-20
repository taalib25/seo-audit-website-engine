import { createFileRoute } from "@tanstack/react-router";
import { jobStore } from "../server/jobs";
import { json, secureResponse } from "../server/security";

export const Route = createFileRoute("/api/audits/$id/report.json")({
  server: { handlers: { GET: ({ params }) => {
    const job = jobStore.get(params.id);
    if (!job) return json({ error: "Audit not found." }, 404);
    if (!job.report) return json({ error: "Audit report is not ready." }, 409);
    return secureResponse(JSON.stringify(job.report, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="${params.id}-report.json"` } });
  } } },
});
