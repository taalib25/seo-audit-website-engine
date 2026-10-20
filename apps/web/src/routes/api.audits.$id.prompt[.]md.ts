import { createFileRoute } from "@tanstack/react-router";
import { jobStore } from "../server/jobs";
import { secureResponse } from "../server/security";

export const Route = createFileRoute("/api/audits/$id/prompt.md")({
  server: { handlers: { GET: async ({ params }) => {
    const job = jobStore.get(params.id);
    if (!job?.report) return secureResponse("Audit report is not ready.", { status: job ? 409 : 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    // seam: @aeo/prompt buildFixPrompt()
    const body = `# Fix prompt for ${job.report.startUrl}\n\nReview the attached audit report and address the highest priority SEO, AEO, and GEO findings. Keep changes focused and verify each fix.\n\nPrompt generation will be provided by @aeo/prompt when integrated.\n`;
    return secureResponse(body, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${params.id}-prompt.md"` } });
  } } },
});
