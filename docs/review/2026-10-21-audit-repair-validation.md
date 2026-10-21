# Audit repair validation — 2026-10-21

## Result

The `https://playtree.live` audit completed through the web UI after the job store and queue were made stable across development module reloads. Audit `4807c3e8-07a6-4905-83dc-feb5df5c108e` rendered a report for 10 pages with overall score 83 (SEO 96, AEO 89, GEO 63). The run used raw HTML only and made no LLM calls (0 tokens, $0 cost).

The preceding UI run (`c2704a44-b640-49c1-989f-04f06811c2ff`) reached 618/618 checks, then changed to “Audit failed / Audit not found” after a development reload. After the HMR persistence fix, the successful run remained available through the report-copy HMR edit and rendered the report rather than a 404.

## Browser checks

- JSON report download completed: 663,413 bytes.
- Fix-prompt Markdown download completed: 71,158 bytes.
- “Copy fix prompt” populated the clipboard (70,686 characters; begins with the executive summary).
- The progress route displayed crawled pages and check counts before the final report rendered.
- LLM and sampled probes remained off; skipped probe checks appeared in the report.

The browser resize tool accepted requested widths of 320, 390, and 1440 CSS pixels, but its reported viewport stayed at 1280 pixels. The responsive overflow check therefore could not be validated at the requested widths. Invalid/private URL messaging was also not exercised in this run.

## Gates

- `bun run typecheck` — passed across all workspaces.
- `bun run test` — passed: 273 tests across core (171), integrations (8), prompt (12), LLM (21), crawler (20), engine (4), CLI (8), and web (29).
- `bun run build` — passed. Vite emitted an ineffective dynamic import warning for `packages/integrations/src/indexnow.ts` because it is also statically imported.
- Focused `apps/web/src/server/audit-service.test.ts` — passed, 2 tests, including the `vi.resetModules` HMR regression case.
