# @aeo/web

TanStack Start UI and HTTP API backed by `@aeo/engine`, the same pipeline used by the CLI.

Run `bun run dev` from the repository root. Vite prints the actual port. `/demo` runs an offline simulation in development; `/audit/demo` displays a sample report.

Copy `.env.example` to `.env` in this directory for optional configuration. Leave unused optional variables unset. `ENABLE_BROWSER=true` allows rendering; Chromium or a configured CDP endpoint must also be available. LLM checks require `OPENROUTER_API_KEY` or `LLM_API_KEY`. GSC uses `GSC_ACCESS_TOKEN` without an OAuth UI.

## HTTP routes

- `POST /api/audits` accepts `{ url, maxPages?, render?, llm?, probe? }` and returns `{ id }`. Anonymous requests cap at 25 pages. `render` is a boolean. Unavailable requested capabilities produce notes.
- `GET /api/audits/:id` returns status, progress and the completed report, prompt and redacted traces.
- `GET /api/audits/:id/events` streams progress and findings over SSE; supports `Last-Event-ID`.
- `GET /api/audits/:id/prompt.md` downloads the generated fix prompt.
- `GET /api/audits/:id/report.json` downloads the structured report.
- `GET /robots.txt`, `/sitemap.xml`, `/llms.txt` expose product discovery files.

Real runs stream discoveries and findings into the checklist. Finished reports support filters, expanded evidence, snippets, prompt copying and prompt traces. Repeated checks on different pages have separate row identities. Reduced-motion preferences disable checklist movement.

## Validation and deployment

```sh
bun run --cwd apps/web typecheck
bun run --cwd apps/web test
bun run --cwd apps/web build
```

`src/server/jobs.ts` provides `JobStore`, `AuditPipeline` and bounded `InProcessQueue` interfaces. One process runs two audits with at most ten waiting; excess admission returns HTTP 503 with `Retry-After`. The store retains at most 50 jobs, 64 MiB in total and 8 MiB per job including events, reports and traces. Completed/failed jobs expire after 30 minutes and may be evicted sooner for capacity. Oversized output fails the audit and releases partial output. Audit execution receives a five-minute cancellation deadline; crawler and provider requests also enforce their own limits. Request JSON is limited to 8 KiB (HTTP 413).

The store and rate limiter are process-local; audits disappear on restart. The token bucket retains at most 10,000 client keys. Forwarding headers are ignored by default, so direct requests share a conservative anonymous bucket. Set `TRUST_PROXY=true` only behind a trusted proxy that overwrites `x-forwarded-for`; it enables validated forwarded IPs. Before multi-instance deployment, use a durable store, shared rate limiter and worker queue while retaining capacity limits. Persist event sequences for SSE resume.

The build keeps `playwright-core` external; install it and the browser in the runtime when rendering is enabled. Probes are samples from configured models and require retrieval-enabled models to observe current sources. No production hosting deployment is configured.
