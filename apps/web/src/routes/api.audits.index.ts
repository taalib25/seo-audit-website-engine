import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";
import { createAudit } from "../server/audit-service";
import { boundedJson, clientIp, json, RequestBodyTooLargeError } from "../server/security";
import { rateLimiter } from "../server/rate-limit";
import { JobCapacityError } from "../server/jobs";

export const Route = createFileRoute("/api/audits/")({
  server: { handlers: {
    POST: async ({ request }) => {
      if (!rateLimiter.take(clientIp(request))) return json({ error: "Too many audit requests. Try again shortly." }, 429);
      try {
        const body = await boundedJson(request);
        const job = await createAudit(body);
        return json({ id: job.id, capabilityNotes: job.capabilityNotes }, 202);
      } catch (error) {
        if (error instanceof RequestBodyTooLargeError) return json({ error: "Audit request is too large." }, 413);
        if (error instanceof JobCapacityError || (error instanceof Error && error.name === "JobCapacityError")) return json({ error: "Audit capacity is full. Try again shortly." }, 503, { "Retry-After": "15" });
        if (error instanceof ZodError) return json({ error: "Invalid audit request." }, 400);
        return json({ error: "Audit could not be started." }, 400);
      }
    },
  } },
});
