# @aeo/web

TanStack Start application for running website audits and viewing `@aeo/core` reports.

## Development

From the monorepo root:

```sh
bun install
bun run --cwd apps/web dev
```

The app listens on Vite's default port. Run the package gates with:

```sh
bunx tsc --noEmit -p apps/web
bun run --cwd apps/web test
bun run --cwd apps/web build
```

## HTTP routes

- `GET /` — landing page and audit form
- `GET /audit/:id` — live progress or report; `/audit/demo` loads the local fixture
- `POST /api/audits` — validate and enqueue `{ url, maxPages?, render?, llm?, probe? }`; returns `{ id }`
- `GET /api/audits/:id` — status, progress, and report when complete
- `GET /api/audits/:id/events` — resumable SSE event stream (`Last-Event-ID`)
- `GET /api/audits/:id/prompt.md` — downloadable prompt placeholder
- `GET /api/audits/:id/report.json` — downloadable `AuditReport`
- `GET /robots.txt`, `/sitemap.xml`, `/llms.txt` — product discovery files

## Worker and persistence seam

`src/server/jobs.ts` owns the `JobStore`, `AuditPipeline`, and bounded `InProcessQueue` interfaces and their in-memory implementation. To scale beyond one process, implement `JobStore` over a database, append events with a durable per-job sequence, and replace `InProcessQueue` with BullMQ/Redis. Keep the route layer calling `createAudit`; change the queue adapter to enqueue an idempotent job ID and run it from a worker that loads the job, invokes the pipeline, and persists every progress event. The current memory store is intentionally temporary and loses jobs on process restart.

The per-IP token bucket follows the same adapter approach in `src/server/rate-limit.ts`; replace it with Redis when deploying multiple web instances. Configure the edge proxy to overwrite forwarding headers before using the forwarded client IP for rate limiting.

## Integration seams

- `src/server/pipeline.ts`: replace the one-page `safeFetch` snapshot at `// seam: @aeo/crawler crawlSite()` with the crawler's multi-page/rendered snapshot. The request options are already parsed and available on the job.
- `src/routes/api.audits.$id.prompt[.]md.ts`: replace the temporary Markdown body at `// seam: @aeo/prompt buildFixPrompt()` with the prompt package output.

Until the crawler is integrated, the pipeline fetches one raw HTML page. `maxPages`, `render`, `llm`, and `probe` are accepted and stored but do not enable those capabilities yet. No changes to `@aeo/core` are required for the fetch-only path: it currently exports `assertSafeUrl`, `safeFetch`, `createDefaultRegistry`, `runAudit`, and the `AuditReport` contract used here.
