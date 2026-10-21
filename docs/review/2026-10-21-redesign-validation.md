# Blue/red report redesign validation

The report now matches the landing page's blue/red visual direction. Agent visibility comes before the checklist: select an agent and page to inspect captured text, missing blocks, words, headings, links and robots restrictions. Mobile uses one selected-agent card and a fixed copy-prompt action. The sample report is explicitly illustrative and uses consistent source HTML counts across non-JavaScript agent models.

The UI describes a snapshot model, not observed provider behavior or citation likelihood. Coverage is a word-count ratio, not semantic completeness. Raw-only audits disclose that rendered coverage is unverified. Training crawler restrictions remain operator choices.

Validation on 2026-10-21:

- `bun run typecheck`: all workspaces passed.
- `bun run test`: 271 tests passed across all workspaces, including guarded browser transport tests.
- `bun run build`: client and server production build passed. Existing IndexNow static/dynamic import warning remains.
- Local Chromium: landing and report at 320, 390, 768 and 1440 pixels; no horizontal overflow in either theme. Agent selection, robots-restriction state, finding filters, evidence expansion and clipboard copying passed; no page errors.
- Prompt security follow-up: 12 prompt tests passed, including hostile page instructions, forged delimiters, Markdown fences and advisory evidence. Generated remediation preserves training policy and private routes.

The collaborative preview failed with connection-refused and automation-timeout errors; local Playwright verified the running app instead. Screenshots and the verification script are local under `.audits/redesign-*`. No paid model calls or production deployment were performed.
