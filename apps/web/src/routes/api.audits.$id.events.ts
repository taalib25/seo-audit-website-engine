import { createFileRoute } from "@tanstack/react-router";
import { jobStore } from "../server/jobs";
import { createEventStreamResponse } from "../server/events";
import { secureResponse } from "../server/security";

export const Route = createFileRoute("/api/audits/$id/events")({
  server: { handlers: {
    GET: async ({ params, request }) => {
      const job = jobStore.get(params.id);
      if (!job) return secureResponse(JSON.stringify({ error: "Audit not found." }), { status: 404, headers: { "Content-Type": "application/json" } });
      return createEventStreamResponse(params.id, request);
    },
  } },
});
