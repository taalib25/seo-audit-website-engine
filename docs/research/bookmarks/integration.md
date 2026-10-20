# Bookmark integration decisions

Research date: 2026-10-20. Inputs: [slice 1](./slice-1.md), [slice 2](./slice-2.md), [slice 3](./slice-3.md). These notes distinguish source-backed engineering practices from promotional outcomes. Source inspection details and failures remain in the slices.

## Implemented

| Recommendation | Integration |
|---|---|
| Preserve useful material during refresh; inspect repository truth first (slice 1). | Generated fix-plan constraints preserve URLs, useful sections, inbound-link anchors, voice and behavior; inspect route/content conventions and product sources before editing. |
| Require distinct, factual programmatic content (slices 1/2). | Fix-plan constraints reject name-swap doorway templates, require a real user need and distinct verified facts per page, and retain sourced comparison tradeoffs. |
| Make claims extractable without inventing authority (slices 1/2). | Existing `geo.quotable-facts` rubric adds scoped firsthand provenance, dates/method limits and comparison tradeoffs; its repair text explicitly forbids invented figures/testimonials. Visible attribution is explicitly not independent verification. |
| Explain products and next actions plainly (slice 3). | Existing `geo.content-clarity` rubric now considers H1/opening copy and contextual CTA wording on conversion pages. It does not demand CTAs on reference/non-conversion pages. Fix plans preserve existing CTA route/action, pricing, eligibility, guarantees and commitment. |
| Keep sampled visibility and content judgment honest (slices 1/2/3). | Judge instructions expose uncertainty, prohibit inferred live SERP intent/demand/rankings/lift and label scores editorial heuristics. Fix plans preserve prompt/provider/model/time/settings/sample-size context and reject universal AI-visibility claims. |
| Close the change/measurement loop (all slices). | Final handoff requests affected URLs, change/date, available source metrics and comparison windows; missing data remains unavailable. Confounders include seasonality, campaigns, indexing lag and unrelated changes. |
| Preserve operator crawler policy (slices 1/2). | Only failed known retrieval-bot checks become repair tasks. Training policy and inherited-allow warnings remain advisory even in legacy reports with higher severity. Repair text preserves private paths and training choices; no blanket Allow snippet is generated. |
| Verify the same crawl breadth. | Generated commands retain the audited page budget through `--pages` and quote query-bearing URLs as a single shell argument. |

Changes live in [LLM rubrics](../../../packages/llm/src/checks/index.ts) and [prompt generator](../../../packages/prompt/src/index.ts). The LLM heading check is now `aeo.question-headings.judge` to avoid colliding with the deterministic `aeo.question-headings` registration; the other six LLM IDs remain stable. A runtime intersection of built-in and LLM IDs is empty. The catalog contains proposed IDs as well as implemented checks: rubric refinements target the actual implemented IDs above, rather than claiming that catalog-only checks were shipped. Tests verify public prompt output, safe crawler-policy handling, verification URL/page-budget preservation and existing LLM evidence rejection; semantic score improvements still require evaluation against a labeled content set.

## Deferred or rejected

- **No added deterministic checks:** technical ideas duplicate catalog coverage. Slice 3's hero message/CTA/form counts require reliable visibility, hero and primary-form identification. Their numeric cutoffs are local conversion heuristics, with no demonstrated SEO threshold; they remain proposals rather than scoring rules.
- **Live SERP/keyword/competitor planning:** requires external observations and demand/locale/date context. No fabricated volume, rankings, intent or competitor measurements. The current judge receives page evidence only.
- **Persistent SEO backlog and automated readbacks:** useful future workflow, but storing a new repository state format, provider accounts and scheduler is beyond this prompt/rubric change. Generated guidance asks for a concise change/readback record without pretending a tracker was built.
- **CRO experiments, analytics adapters and conversion grades:** need actual events, experiment design and appropriate denominators. No predicted conversion lift or general urgency/social-proof mandates.
- **Paid crawl, backlink outreach and bulk submissions:** publisher policy and external side effects need their own explicit scope; marketing claims do not justify changing access policy or publishing outreach.
- **Claims rejected as evidence:** guaranteed rankings/revenue, unverified ARR attribution, daily backlink quotas, domain-rating-only quality, paid placements presented as organic results, and citation-rate uplifts converted into ranking rules.

No external code, dependencies or remote telemetry were added. Existing raw/render, robots, metadata, sitemap and graph checks provide the relevant technical foundation; bookmark posts do not establish universal crawler behavior or guaranteed indexing/citation.
