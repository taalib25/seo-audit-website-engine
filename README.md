# SEO, AEO and GEO Audit Engine

Crawl a public website, run evidence-backed checks, and export a fix prompt for a coding agent. The CLI and web app use the same engine. Deterministic findings, optional LLM judgments and sampled external observations are identified separately.

## Run locally

Install [Bun](https://bun.sh), then:

```sh
bun install
bun run dev
```

Open the Vite URL printed in the terminal. `/demo` simulates a live audit offline in development; `/audit/demo` shows a sample report. Real audits stream findings into the animated checklist, then provide evidence, fixes, JSON reports and a copyable Markdown prompt.

No API key is required for deterministic audits. See [optional configuration](apps/web/.env.example). Copy that file to `apps/web/.env` for Vite development. For CLI use, export variables in your shell or put them in the root `.env` loaded by Bun. Leave unused optional variables unset.

```sh
# Exports report.json and fix-prompt.md under .audits/
bun run audit https://example.com --pages 5 --render never

bun run checks
bun apps/cli/src/index.ts verify https://example.com --ids seo.title.present --render never

# Requires OPENROUTER_API_KEY or LLM_API_KEY
bun run audit https://example.com --pages 5 --render never --llm
```

Browser rendering requires Chromium:

```sh
bun packages/crawler/node_modules/playwright-core/cli.js install chromium-headless-shell
bun run audit https://example.com --pages 5 --render always --renderer chromium
```

See [crawler setup](packages/crawler/README.md) for CDP and Lightpanda. Web rendering additionally requires `ENABLE_BROWSER=true`. Probes need `PROBE_QUERIES` and a provider model with the desired retrieval capabilities. Citation samples describe those particular runs; they are not universal visibility or ranking scores.

## Workspaces

| Path | Purpose |
| --- | --- |
| `packages/core` | Check contracts, scoring, extraction, deterministic checks, SSRF-safe fetch |
| `packages/crawler` | Bounded crawling, sitemaps, raw and rendered snapshots |
| `packages/llm` | OpenRouter/OpenAI-compatible judgments, usage and prompt traces |
| `packages/integrations` | GSC, Bing, IndexNow helpers, Brave and visibility probes |
| `packages/prompt` | Consolidated fix plans with evidence and verification commands |
| `packages/engine` | Shared CLI/web orchestration |
| `apps/cli` | Audit, checks, verify and prompt commands |
| `apps/web` | TanStack Start UI, audit queue and SSE endpoints |

The previous Next.js app remains in `src/`, available through `bun run dev:legacy`.

## Verify changes

```sh
bun run typecheck
bun run test
bun run build
```

Missing capabilities are reported as skips and excluded from scoring. LLM judgments and heuristic scores cannot establish rankings or conversion lift. Fix prompts preserve routes, factual claims, private-path restrictions and operator choices about training bots.

The web queue, reports and rate limiter currently live in one process and reset on restart. Use durable storage and a shared rate limiter before running multiple instances. GSC uses a supplied access token; an interactive OAuth UI is not implemented. See [engineering conventions](docs/ENGINEERING.md), [web API notes](apps/web/README.md), and [bookmark research](docs/research/bookmarks/integration.md).
