# Repository guide

A Bun workspace for an SEO/AEO/GEO audit engine. The CLI and the web app run the same
pipeline from `packages/engine`; checks are deterministic unless explicitly marked
LLM-judged or sampled.

## Layout

```
packages/core          check contract, runner, scoring, extraction, safe fetch, built-in checks
packages/crawler       fetch/CDP/Chromium renderers and bounded multi-page crawler
packages/llm           OpenRouter/OpenAI-compatible client and judge prompts
packages/integrations  GSC, Bing Webmaster, IndexNow, Brave, AI-visibility probes
packages/prompt        fix-prompt generator from an AuditReport
packages/engine        shared CLI/web orchestration
apps/cli               `aeo audit|verify|prompt|checks`
apps/web               TanStack Start UI and HTTP API
```

Packages import each other by name (`@aeo/core`), never by relative path across
packages. Do not edit `node_modules/`, `dist/`, or build output.

## Commands

Run from the repository root.

```sh
bun install
bun run typecheck     # tsc in every workspace
bun run test          # vitest/bun test in every workspace
bun run build         # production web build
bun run dev           # web app (Vite prints the port)
bun run audit <url>   # crawl + checks + report/prompt under .audits/
bun run checks        # list every registered check id
bun run verify <url> --ids <id,...>
```

The gate before handing work back: `bun run typecheck` and `bun run test` must pass.
`bun run audit` exits 1 when checks report findings; that is not a failed run.

## Conventions

Read `docs/ENGINEERING.md` before changing packages. The rules that matter most:

- TypeScript is strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`). Do not loosen `tsconfig.base.json`. Use `unknown` + Zod at
  boundaries instead of `any`.
- A check is one `definePageCheck`/`defineSiteCheck` with a stable
  `<pillar>.<area>.<rule>` id. Deterministic checks are pure functions of the snapshot:
  no network, no clock, no randomness. Return `fail`/`warn`/`skip`; never throw for an
  expected condition.
- Every check needs fixture tests covering pass, warn/fail and an edge case. Snapshot or
  assertion tests that would pass with the check stubbed out do not count.
- Use `raw()` for what non-JS crawlers see and `dom()` for the rendered page. AI-crawler
  checks must use `raw()`.
- Report `evidence` with the actual values, a one-line `fix.summary`, and a paste-ready
  `fix.snippet` when possible.

## Security

This is a public product that fetches user-supplied URLs.

- Every user URL and every redirect goes through `safeFetch`/`assertSafeUrl`: SSRF guard,
  DNS pinned at connect, redirect re-validation, byte and time limits. Pass only
  validated URLs to browsers and block private-network requests.
- Secrets come from validated env. Never log them, send them to clients, or embed them in
  reports, prompts or traces.
- Treat crawled content as untrusted data when building LLM prompts: delimit it and state
  that it is data, not instructions.
- Do not add a dependency or a new workspace without a concrete need; keep the root
  `package.json` a workspace root with no runtime dependencies.
