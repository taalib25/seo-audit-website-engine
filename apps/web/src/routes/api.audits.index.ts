import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { createAudit } from "../server/audit-service";
import { clientIp, json } from "../server/security";
import { rateLimiter } from "../server/rate-limit";

export const Route = createFileRoute("/api/audits/")({
  server: { handlers: {
    POST: async ({ request }) => {
      if (!rateLimiter.take(clientIp(request))) return json({ error: "Too many audit requests. Try again shortly." }, 429);
      try {
        const body: unknown = await request.json();
        const job = await createAudit(body);
        return json({ id: job.id, capabilityNotes: job.capabilityNotes }, 202);
      } catch (error) {
        if (error instanceof ZodError) return json({ error: "Invalid audit request." }, 400);
        return json({ error: "Audit could not be started." }, 400);
      }
    },
  } },
});
