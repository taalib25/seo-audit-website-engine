# Engineering conventions

Every contributor (human or agent) follows these. The gate before handing work back:
`bun run --filter '*' typecheck && bun run --filter '*' test` must pass.

## Layout

```
packages/core     framework-free engine: types, check contract, runner, scoring, safe fetch, built-in checks
packages/crawler  renderers (fetch, CDP/lightpanda, chromium) + multi-page crawler → SiteSnapshot
packages/llm      OpenRouter/OpenAI-compatible client implementing core's LlmClient; judge prompts
packages/integrations  GSC, Bing Webmaster, IndexNow, AI-visibility probes
packages/prompt   fix-prompt generator (Markdown + JSON) from an AuditReport
apps/cli          `aeo audit|verify|prompt` binary
apps/web          product UI + API
```

Packages import each other by name (`@aeo/core`), never by relative path across packages.

## TypeScript

- `tsconfig.base.json` is strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. Don't loosen it.
- No `any`. Use `unknown` + Zod at every boundary (HTTP bodies, env, LLM output, third-party JSON).
- Relative imports use the `.ts` extension. Type-only imports use `import type`.
- Checks never throw for expected conditions; they return `fail`/`warn`/`skip`. The runner turns a thrown error into `status: "error"`.

## Checks

- One check = one `definePageCheck`/`defineSiteCheck` with a stable id `<pillar>.<area>.<rule>` (see `packages/core/src/checks/seo/on-page.ts` for the reference).
- Deterministic checks are pure functions of the snapshot: no network, no clock, no randomness.
- `evidence` holds the actual values found (so the fix prompt can quote them); `fix.summary` is one actionable line; `fix.snippet` is ready to paste when possible.
- Every check has fixture tests covering pass, warn/fail and at least one edge case.
- Use `raw()` for what non-JS crawlers see; `dom()` for the rendered page. AI-crawler checks must use `raw()`.

## Security (public product)

- Any user-supplied URL goes through `safeFetch`/`assertSafeUrl` (SSRF guard, DNS pinned at connect, redirect re-validation, byte and time limits). Browsers must be pointed only at URLs that passed `assertSafeUrl` and should have private-network requests blocked.
- Secrets come from validated env; never log them, never send them to the client, never embed them in reports or prompts.
- Treat crawled page content as untrusted when building LLM prompts: wrap it in delimiters and instruct the model it is data, not instructions.
