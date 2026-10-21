# Slice 3 — website copy and conversion research

Research date: 2026-10-20. Verdicts use recovered post text plus destination inspection where available. The t.co links that were fetched returned X's client/login shell, so their linked video/image contents could not be verified. Direct URLs from the tool roundup loaded; they are treated as products/examples, not evidence of conversion lift.

## Row verdicts

| # | Row / source | Verdict | Why |
|---:|---|---|---|
| 1 | Prajwal Tomar, [landing-page workflow](https://x.com/PrajwalTomar_/status/1902729429312307200) | hype | Promises quality/conversion, but the linked walkthrough was inaccessible and no method or evidence is in recovered text. |
| 2 | Prajwal Tomar, [Lovable + 21stdev workflow](https://x.com/PrajwalTomar_/status/1902371273147064772) | hype | Similar unsubstantiated “high-converting” claim; walkthrough inaccessible. |
| 3 | Pedro Aquino, [Marc Lou landing-page thread](https://x.com/pedrovearta/status/1867641621631971761) | marginal | Points to a potentially useful teardown, but supplies no actual observations in this row. |
| 4 | levelsio, [Riverside landing-copy rewrite](https://x.com/levelsio/status/1865050999817449727) | useful | Concrete lesson: replace ambiguous category language with what the product does and explain the workflow and backup benefit. |
| 5 | Namya @ Supafast, [“Get started” CTA post](https://x.com/namyakhann/status/1856307479451238757) | marginal | Correctly flags generic CTA language, but offers no alternative or context; “throw laptop” is engagement rhetoric. |
| 6 | The Boring Marketer, [Playwright + voice/design skills](https://x.com/boringmarketer/status/2059386379625234552) | marginal | A plausible agent-assisted workflow; the linked guide did not expose readable content, and “world class” is unsupported. |
| 7 | The Boring Marketer, [25-point conversion skill](https://x.com/boringmarketer/status/2058907061883150387) | marginal | Audit-skill concept fits product direction, but the 25 criteria are absent from this post and cannot be assessed. |
| 8 | The Boring Marketer, [copy rules image](https://x.com/boringmarketer/status/2058669822699823345) | marginal | A reusable copy prompt may exist in the image, but the linked content was inaccessible. |
| 9 | Prajwal Tomar, [20-minute Lovable hero](https://x.com/PrajwalTomar_/status/1982787454877974640) | hype | Speed/design tool promotion with no copy method or conversion evidence; linked guide inaccessible. |
| 10 | Prajwal Tomar, [hero-section follow-up](https://x.com/PrajwalTomar_/status/1983014822393590018) | hype | Teaser and self-promotion, no reusable details. |
| 11 | Prajwal Tomar, [ChatGPT PRD → v0 workflow](https://x.com/PrajwalTomar_/status/1860291336366153832) | marginal | Useful iterative design workflow, but focuses on visual implementation and unsupported “fantastic” outcome rather than conversion/copy. |
| 12 | Open Analytics, [v0.6.0 analytics](https://x.com/openanalyticshq/status/2096318835163013614) | marginal | Entries/exits and attribution features could help measure conversion changes; not itself copy guidance. |
| 13 | Csaba Kissi, [open-source tools roundup](https://x.com/csaba_kissi/status/2074745257099485319) | marginal | Direct tool destinations load: [Ship Studio](https://www.ship.studio), [TraceDR](https://tracedr.com), [Vercel eve](https://vercel.com/eve), [devl.dev](https://www.devl.dev). They are build/SEO/design resources, not validated conversion advice. |
| 14 | The Boring Marketer, [AI stack](https://x.com/boringmarketer/status/1993760661185138939) | hype | Tool/model stack endorsement without a copy process or evidence; post text is incomplete. |
| 15 | ILIAS ISM, [A/B testing process](https://x.com/illyism/status/1967905998095765755) | marginal | Testing is relevant, but the linked session could not be inspected and the post gives no test design or result. |

## A) Candidate deterministic checks

These are new conversion/copy checks, not duplicates of `seo.h1.present` (presence/count only), `seo.heading.order`, or `aeo.extractable-facts` (factual extractability). Thresholds below are product heuristics, not established ranking/conversion cutoffs. IDs use `aeo.` because the tests inspect whether primary page messaging is explicit and machine-readable; they are content/on-page checks.

| ID | Exact rule / severity | Fix hint | Source |
|---|---|---|---|
| `aeo.hero-message-completeness` | **High.** In rendered DOM, inspect the first viewport-height of the main content. Pass if it contains exactly one visible H1 (1–90 chars), a visible nonempty supporting text block (20–240 chars), and ≥1 visible primary action link/button. Warn if 2/3 are present; fail if ≤1/3. Exclude global nav/footer and hidden elements. | State the concrete product/category in the H1, explain the core outcome in supporting text, and expose the next step above the fold. | [levelsio rewrite](https://x.com/levelsio/status/1865050999817449727) |
| `aeo.primary-cta-specificity` | **Medium.** For visible links/buttons in hero, flag primary CTA labels matching case-insensitive generic-only set `get started`, `learn more`, `click here`, `submit`, `continue`, `sign up`. Pass when none; warn when 1; fail when ≥2. If destination purpose cannot be inferred from accessible label + nearby text, report “needs review” rather than infer. | Name the action or immediate result (“Create a free audit”, “See pricing”); preserve existing destination and offer terms. | [Supafast CTA post](https://x.com/namyakhann/status/1856307479451238757) |
| `aeo.form-friction` | **Medium.** Count visible, enabled, user-entered fields in the primary conversion form (exclude hidden fields, submit controls, and consent-only checkbox). Pass 1–5; warn 6–8; fail ≥9. Do not apply to account/security flows or forms where the page states a required compliance need. | Remove fields not needed for the stated next step; defer optional details until later. | Conversion-form auditing concept: [Boring Marketer 25-point skill post](https://x.com/boringmarketer/status/2058907061883150387) (criteria themselves unavailable); thresholds are local heuristics. |
| `aeo.hero-cta-count` | **Low.** Count visible interactive links/buttons inside hero. Pass 1–2 actions; warn 3; fail ≥4. This is a clutter heuristic; classify only when hero boundary is identifiable and do not equate every action with primary. | Keep one visually primary action and at most one clearly secondary alternative. | [levelsio rewrite](https://x.com/levelsio/status/1865050999817449727); heuristic threshold is local. |

Do **not** add readability-grade, “jargon list,” or generic social-proof presence checks from these bookmarks: no usable source establishes thresholds or reliable classification, and social proof can be irrelevant or unverifiable. They may be exploratory signals only; require evidence and context before severity.

## B) LLM-judge rubrics

Use page-visible copy only. Return a score per dimension, short evidence quotes with DOM location, and an uncertainty note. A quote must support the assigned score; no score from aesthetics or inferred product knowledge.

| Dimension | 0 — weak | 2 — mixed | 4 — strong |
|---|---|---|---|
| Message clarity | H1 and opening copy rely on vague metaphor/category; reader cannot tell what the product is or does. | Product/category is inferable, but wording or opening explanation leaves a material ambiguity. | H1 directly names the product/category or job; opening copy explains what it does in plain language. Quote H1 and supporting line. |
| Value proposition specificity | No user, outcome, mechanism, or differentiator is stated; or benefits are empty superlatives. | Some user/outcome detail appears, but key scope, mechanism, or condition is missing. | Copy identifies a user/job and concrete outcome, with mechanism or relevant condition where the page provides one. Quote each claimed element. |
| CTA strength | No discernible next step, or generic label with no contextual explanation. | Action is understandable from nearby copy, but label is generic, competing, or unclear about commitment. | Label states a specific next action/outcome; nearby copy clarifies material commitment (e.g. free/trial/demo) only when explicitly supported. Quote label and context. |

Grounding: the specific-vs-ambiguous heading and concrete product explanation in [levelsio’s rewrite](https://x.com/levelsio/status/1865050999817449727), plus the generic CTA criticism in [Supafast’s post](https://x.com/namyakhann/status/1856307479451238757). Scores are editorial rubric anchors, not empirically validated conversion predictors. Abstain when the page lacks enough copy or context.

## C) Copy-rewrite prompt pattern for coding agents

> Improve the page’s existing heading, supporting copy, and CTA for clarity. First inspect the page text, route purpose, existing UI, and any supplied product/source-of-truth facts. Preserve all factual claims, numbers, eligibility, pricing, guarantees, integrations, and commitments exactly; do not invent benefits, customers, testimonials, metrics, or credentials. Make the H1 name the actual product/category or user job in plain language, then make the supporting line explain the mechanism/outcome using only evidenced facts. Replace a generic CTA only when its destination and action are known; keep the existing route/action and commitment level. If required facts are missing, retain neutral wording and report the exact questions instead of filling gaps. Change only relevant copy, preserve layout/accessibility/brand voice, and show a before/after diff with each factual phrase traced to its source.

Pattern basis: the [Riverside example](https://x.com/levelsio/status/1865050999817449727) rewrites metaphor into product category, workflow, and explicit backup benefit. The factual-preservation constraints are product guardrails, not claims made in the post.

## D) Product ideas

- Add a “copy clarity” section alongside SEO/AEO findings: quote the current H1/supporting text/CTA, explain the ambiguity, then offer a grounded rewrite prompt.
- Provide a conversion audit skill for coding agents that evaluates pages and lead forms, but make its checks transparent and individually evidenced; the bookmark’s advertised “25 points” were not available to verify.
- Pair copy recommendations with measurement: record current CTA/form state and let users compare analytics or experiment results after edits. The Open Analytics post lists entry/exit, bounce, revenue attribution, and click-ID features; this suggests integration potential, not proof that these metrics alone establish causality.
- Support a review-first rewrite workflow: agent drafts changed strings only, cites source facts, preserves route/offer, and requires a human to approve uncertain claims.

## Evidence quality / top finds

1. Strongest insight: replace abstract category slogans with a concrete product description and an explanation of how it works ([levelsio](https://x.com/levelsio/status/1865050999817449727)).
2. Generic “Get started” labels are a worthwhile detection target, but context and destination must govern the recommendation ([Supafast](https://x.com/namyakhann/status/1856307479451238757)).
3. The 25-point conversion-skill idea maps directly to our audit-to-agent workflow, although the checklist itself is unavailable ([Boring Marketer](https://x.com/boringmarketer/status/2058907061883150387)).
4. Iterative PRD-to-page generation is a plausible coding-agent workflow, but the post validates neither copy quality nor conversion impact ([Prajwal Tomar](https://x.com/PrajwalTomar_/status/1860291336366153832)).
5. Conversion recommendations should close the loop with analytics/experiments; the analytics post is a feature announcement, not causal evidence ([Open Analytics](https://x.com/openanalyticshq/status/2096318835163013614)).
