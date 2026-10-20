import { createFileRoute } from "@tanstack/react-router";
import { jobStore } from "../server/jobs";
import { secureResponse } from "../server/security";

export const Route = createFileRoute("/api/audits/$id/events")({
  server: { handlers: {
    GET: async ({ params, request }) => {
      const job = jobStore.get(params.id);
      if (!job) return secureResponse(JSON.stringify({ error: "Audit not found." }), { status: 404, headers: { "Content-Type": "application/json" } });
      const parsedId = Number(request.headers.get("last-event-id") ?? "0");
      let cursor = Number.isSafeInteger(parsedId) && parsedId >= 0 ? parsedId : 0;
      const encoder = new TextEncoder();
      let interval: ReturnType<typeof setInterval> | undefined;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = () => {
            const current = jobStore.get(params.id);
            if (!current) { controller.close(); clearInterval(interval); return; }
            for (const event of current.events) {
              if (event.id <= cursor) continue;
              controller.enqueue(encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`));
              cursor = event.id;
            }
            if (current.status === "complete" || current.status === "failed") { controller.close(); clearInterval(interval); }
          };
          interval = setInterval(send, 500);
          send();
          request.signal.addEventListener("abort", () => { clearInterval(interval); try { controller.close(); } catch { /* already closed */ } }, { once: true });
        },
        cancel() { clearInterval(interval); },
      });
      return secureResponse(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
    },
  } },
});
