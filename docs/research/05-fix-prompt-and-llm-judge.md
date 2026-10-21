# 05 — Fix Prompt & LLM-Judge Design

Two generative outputs: (A) a Markdown **fix prompt** for coding agents inside the audited site's repo, and (B) **rubrics/prompts** for non-deterministic AEO/GEO checks. Inputs are `CheckResult` records from `packages/core/src/types.ts` (`id`, `pillar`, `severity`, `status`, `score`, `evidence`, `fix{snippet,snippetLang}`); the contract is unchanged.

## Part A — Fix prompt

### A1. What the sources say

- Be clear, direct, explicit about output format and constraints; number steps when order matters; state *why* a rule exists. Golden rule: if a colleague with minimal context would be confused, the model will be too. — [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- Structure sections with XML/markdown tags (`<context>`, `<instructions>`, `<input>`) so instructions and evidence never blur. Examples steer format better than prose.
- Long data goes **before** instructions; the task goes last.
- **AGENTS.md** is the portable surface: root file, nearest-file-wins, nested per-package overrides, plain Markdown, no required fields. — [agents.md](https://agents.md/), [Codex](https://developers.openai.com/codex/agent-configuration/agents-md)
- Codex concatenates root→cwd and **truncates at `project_doc_max_bytes` (32 KiB default)**; size is a hard design constraint. Cursor rules: focused, scoped, < ~500 lines, reference files instead of pasting. — [Cursor](https://cursor.com/docs/context/rules)
- `llms.txt` shape is fixed: H1 name, blockquote summary, optional prose, H2 file lists of `[name](url): note`, `## Optional` last. — [llmstxt.org](https://llmstxt.org/)

### A2. Design decisions

| Decision | Why |
|---|---|
| Front block: site, stack, detection signals | Placement is the #1 agent failure mode; wrong framework = wrong fix |
| Sort critical → high → medium → low, then pillar | Severity already exists in `CheckResult`; stops low-value polish first |
| Every task: evidence → fix → placement → acceptance | Nothing invented; no fabrication of stats, authors, credentials. Stop and report on conflicts |\r\n| Acceptance = re-run `audit verify --ids <id>` | Machine-verifiable; works locally and in CI |
| ≤ 200 lines / ≤ 12 KiB | Fits Codex truncation and Cursor length guidance |

### A3. Template (filled example)

Outer fence is four backticks so inner snippets render.

````markdown
# SEO/AEO/GEO fix plan — acme-analytics.com

<!-- audit-fix-prompt v1 · generated 2026-10-20T14:02:11Z · report 8f3c21 -->

You are working in the repo that builds **https://acme-analytics.com**. Apply the tasks below in
order. Do not invent additional SEO work.

## 1. Context

- Site: https://acme-analytics.com · SSR (raw HTML has body copy) · 42 pages audited, 9 failing (2 critical, 3 high, 4 medium)
- Framework: Next.js 15.2, App Router. Detected from `/_next/static/` assets, `app/layout.tsx`, `next.config.ts`, `x-vercel-id`, `pnpm-lock.yaml`
- Editable paths: `app/`, `public/`, `content/`
- If this contradicts the repo, **stop and report** — do not guess.

## 2. Constraints

- Do not change design, routing, copy tone, analytics, or dependencies unless a task says so.
- No refactors, renames, or reformatting of unrelated files. One task = one focused diff.
- Preserve behaviour: run the project's lint/typecheck/test commands before finishing.
- **Never fabricate** statistics, dates, authors, credentials, reviews, or citations. If a value is unknown, write `TODO(owner): <what is needed>` and list it in your final report.
- Keep existing URLs; no new redirects, canonicals, or `noindex` unless required.
- If a placement hint does not match the repo, use the nearest equivalent and say which file. Stop and report if a critical task cannot be done safely.

## 3. Tasks
### T01 · `geo.ai-access.gptbot-blocked` · CRITICAL

**Evidence (as found):**
```
GET /robots.txt → 200
User-agent: GPTBot
Disallow: /
```
**Fix.** Remove the GPTBot disallow; leave every other rule untouched.
```diff
- User-agent: GPTBot
- Disallow: /
```
**Placement (Next App Router).** Served from `public/robots.txt`. If `app/robots.ts` exists it wins —
edit its `rules` array instead:
```ts
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/" }] };
}
```
**Acceptance.**
```bash
audit verify --ids geo.ai-access.gptbot-blocked --url https://acme-analytics.com
# expect status=pass, exit 0
```
### T02 · `seo.structured-data.organization-missing` · CRITICAL

**Evidence (as found):**
```
jsonLdBlocks: 2 · @types: ["WebSite","BreadcrumbList"] · missing: ["Organization"] · sameAs: []
```
**Fix.** Add one `Organization` node to the site-wide graph with `@id` so other nodes can reference it.
```json
{ "@context": "https://schema.org", "@type": "Organization", "@id": "https://acme-analytics.com/#organization",
  "name": "Acme Analytics", "url": "https://acme-analytics.com",
  "logo": "https://acme-analytics.com/brand/acme-logo-512.png",
  "description": "Product analytics for mid-market SaaS teams.",
  "sameAs": ["https://www.linkedin.com/company/acme-analytics"] }
```
**Placement.** `app/layout.tsx`, once in `<head>` as `<script type="application/ld+json">`. Not per page. Keep only `sameAs` URLs that resolve.
**Acceptance.**
```bash
audit verify --ids seo.structured-data.organization-missing --url https://acme-analytics.com
# expect status=pass, evidence.types includes "Organization"
```
### T03 · `seo.on-page.title-length` · HIGH

**Evidence (as found):**
```
url: /pricing · h1: "Simple pricing that scales with you"
title: "Pricing — Acme Analytics | Product Analytics, Session Replay, Funnels and Experiments for SaaS Teams" (104 chars)
```
**Fix.** Title ≤ 60 chars, intent first, brand last. Proposed: `Pricing — Acme Analytics` (25). Keep the H1.
```ts
// app/pricing/page.tsx
export const metadata = { title: "Pricing" }; // root template appends " — Acme Analytics"
```
**Placement.** Prefer the per-route `metadata` export. Confirm `title.template` in `app/layout.tsx` so the brand is appended exactly once.
**Acceptance.**
```bash
audit verify --ids seo.on-page.title-length --url https://acme-analytics.com/pricing
# expect status=pass, evidence.length <= 60
```
### T04 · `aeo.content.answer-first` · HIGH

**Evidence (as found):**
```
url: /guides/what-is-product-analytics · directAnswerSentence: none in first 60 words
first60Words: "Choosing the right analytics stack is one of the most important decisions..."
```
**Fix.** Insert a two-sentence direct answer immediately after the H1; move the existing intro below it.
```md
Product analytics is the practice of tracking how users behave inside a product — which features
they use, where they drop off, and what predicts retention. Teams use it to prioritise roadmap work
and measure whether shipped changes helped.
```
**Placement.** `content/guides/what-is-product-analytics.mdx` if content is file-based; otherwise
the first `<p>` in `app/guides/what-is-product-analytics/page.tsx`.
**Acceptance.**
```bash
audit verify --ids aeo.content.answer-first --url https://acme-analytics.com/guides/what-is-product-analytics
# expect status=pass, evidence.answerWithinFirst60Words=true

audit verify --ids aeo.answerability --llm --url https://acme-analytics.com/guides/what-is-product-analytics
# expect score >= 3 (median of 3 samples; informational)
```
### T05 · `geo.site.llms-txt-missing` · MEDIUM

**Evidence (as found):**
```
GET /llms.txt → 404 · GET /llms-full.txt → 404 · sitemap: 42 URLs
```
**Fix.** Publish a curated map, not a dump.
```md
# Acme Analytics

> Product analytics for mid-market SaaS teams: funnels, retention, session replay, experiments.
> Usage-based pricing; free tier covers 10k monthly events. Documentation lives under /docs.

## Product

- [Pricing](https://acme-analytics.com/pricing): Plans, event limits, overage rules
- [Product overview](https://acme-analytics.com/product): Funnels, retention, replay, experiments

## Guides

- [What is product analytics?](https://acme-analytics.com/guides/what-is-product-analytics): Definition and core metrics

## Company

- [About](https://acme-analytics.com/about): Team, HQ, founding year

## Optional

- [Changelog](https://acme-analytics.com/changelog): Release notes
```
**Placement.** `public/llms.txt`, or `app/llms.txt/route.ts` returning `text/plain; charset=utf-8`. Add `Sitemap: https://acme-analytics.com/sitemap.xml` to `public/robots.txt`.
**Acceptance.**
```bash
audit verify --ids geo.site.llms-txt-missing --url https://acme-analytics.com
# expect status=pass, evidence.status=200, evidence.hasH1=true
```

## 4. Do not

- Add `noindex`, change canonicals, or alter redirects.
- Add keywords meta tags, hidden text, or doorway pages.
- Duplicate the Organization node across pages.
- "Fix" a check by weakening it (e.g. editing audit config).
- Commit generated report files.

## 5. Final verification

```bash
audit verify --ids \
geo.ai-access.gptbot-blocked,seo.structured-data.organization-missing,\
seo.on-page.title-length,aeo.content.answer-first,geo.site.llms-txt-missing \
  --url https://acme-analytics.com --json > audit-after.json

pnpm lint && pnpm typecheck && pnpm test
```

Report: files changed per task, pass/fail per check ID, `TODO(owner)` items, skipped tasks and why.
A failing check is acceptable only if listed with a reason — silent failures are not.
````

### A4. Generation notes

- **Stack detection, strongest first:** `<meta name="generator">` (WordPress, Shopify, Hugo, Docusaurus); asset paths (`/_next/`, `/wp-content/`, `cdn.shopify.com`, `/_astro/`, `/_nuxt/`); config files; headers (`x-vercel-*`, `x-powered-by`, `server`); cookies (`wp-settings-`, `_shopify_`). Emit all signals plus a `mixed` verdict on disagreement — the agent can see the repo, so honesty beats a confident wrong guess.
- **Placement table:** Next App → `app/layout.tsx`, `app/<route>/page.tsx`, `app/robots.ts`, `public/`; Next Pages → `pages/_document.tsx`, `next/head`, `public/`; Astro → `src/layouts/*.astro`, `public/`; WordPress → child-theme `functions.php` (`wp_head`), Yoast/RankMath filters, `robots_txt` filter; Shopify → `layout/theme.liquid`, `templates/`, `robots.txt.liquid`; Vite/static → `index.html`, `public/`, prerender.
- **Determinism:** sort severity → pillar → ID; same audit yields a byte-identical prompt minus timestamp. No evidence, no task: render "needs manual review" instead of inventing a finding.

## Part B — LLM judge for AEO/GEO
### B1. Protocol

1. **Evidence before score.** Quote verbatim first; no quote → `score: 0`, `evidence_insufficient: true`. Biggest hallucination control available.
2. **Absolute scoring, never pairwise.** Pairwise invites position bias; fixed anchors avoid it.
3. **Quote budget:** max 3 quotes × 300 chars, and state "do not reward length" (verbosity bias).
4. **Only 0/2/4 defined.** 1 = clearly better than 0 but short of 2; 3 = most of 4 with one gap.
5. **One check per call.** Bundling degrades calibration and evidence attribution.
6. **Calibrate** on ~20 human-labelled pages; report Cohen's κ. Below ~0.6, revise anchors first.

Bias taxonomy from [Zheng et al., *Judging LLM-as-a-Judge* (NeurIPS 2023)](https://arxiv.org/abs/2306.05685): position, verbosity, self-enhancement. Rubric-then-score ordering follows [G-Eval](https://arxiv.org/abs/2303.16634).
### B2. Rubrics

| Check | Question | Required evidence | 0 | 2 | 4 |
|---|---|---|---|---|---|
| `aeo.answerability` | Does each section answer its likely question in the first 40–60 words? | First 60 words after the H2 + the H2 | No direct answer; positioning only | Answer exists but buried past 100 words or split | First 40–60 words are a self-contained answer with specifics; no preamble |
| `aeo.question-headings` | Do H2/H3 mirror how people ask? | All H2/H3 verbatim | Slogan fragments, no question framing | Some question-form headings, secondary intents only | Primary headings mirror real query phrasing, each immediately answered, no near-duplicates |
| `geo.entity-clarity` | Is who/what/where defined early? | First 100 words + Organization/Person JSON-LD | Entity, audience, location unclear | Name and category clear; audience or service area ambiguous | Name, category, audience, location in first 100 words; matches markup and `sameAs` |
| `geo.quotable-facts` | Are there extractable, sourced specifics? | Up to 3 statistic/citation sentences | No numbers, dates, or sources | Some numbers, unsourced or undated | Specific figures with units and timeframe, attributed to a named source, in standalone sentences |
| `aeo.eeat-signals` | Are author, dates, credentials credible? | Byline, date line, credential/bio link | No author, date, or org info | Name + date, no credentials or bio | Named author with role/credentials + bio link; published and updated dates; primary-source citations; contact reachable |
| `aeo.freshness` | Is it current for topic volatility? | Visible dates and any "last updated" claim | No date, or >24 months stale on a fast-moving topic | 12–24 months old; some dated references | Updated within 12 months (or topic-appropriate), current data, no dead references |
| `aeo.topical-coverage` | Does it cover real sub-questions? | Covered sub-questions + obvious misses | One thin angle; most follow-ups missed | Core covered; 2+ likely follow-ups missing | Core plus follow-ups answered or linked as a cluster |
| `aeo.tone-clarity` | Is it clear, plain, skimmable? | Densest paragraph | Promotional, jargon-dense, unstructured | Readable but padded or hedged | Plain language, short sentences, concrete nouns, scannable |

Rationale for `geo.quotable-facts`: citations, quotations, and statistics are the highest-yield GEO strategies in [Aggarwal et al., *GEO* (KDD 2024)](https://arxiv.org/abs/2311.09735) (up to ~40% visibility lift, domain-dependent). Keep the caveat: Google states there is **no special optimization** for AI Overviews/AI Mode beyond core SEO ([Google](https://developers.google.com/search/docs/appearance/ai-features)) — content quality, not a guaranteed lever.
### B3. Output schema

```json
{ "check_id": "aeo.answerability", "url": "https://acme-analytics.com/guides/what-is-product-analytics",
  "score": 3, "confidence": 0.82,
  "evidence": [{ "quote": "Product analytics is the practice of tracking how users behave inside a product.", "location": "h2#definition + 1", "chars": 78 }],
  "evidence_insufficient": false,
  "rationale": "Answer opens the section but omits the retention example a reader would expect.",
  "missing": ["retention example"], "model": "qwen-plus", "prompt_version": "judge-v1.3", "sample_index": 1 }
```

Integer `score` 0–4. `confidence` routes human review (< 0.6 → flag). `rationale` ≤ 2 sentences and may not introduce facts absent from `evidence`. Retry once on Zod failure, then store `status:"error"` rather than guessing.
### B4. Prompt skeleton

```xml
<role>You are a strict content auditor. You score one page against one rubric.</role>
<task>Score the page for {check_id}: {question}. Return JSON only.</task>
<page url="{url}">
  <title>{title}</title><headings>{h2_h3_list}</headings><text>{main_text_8000}</text>
</page>
<rubric>
  0 = {anchor_0}
  2 = {anchor_2}
  4 = {anchor_4}
  1 = clearly better than 0, short of 2. 3 = most of 4, exactly one gap.
</rubric>
<rules>
  1. Quote the page verbatim before scoring. Every quote must appear in <text>.
  2. If you cannot quote supporting text: score=0, evidence_insufficient=true.
  3. Do not reward length, polish, or keyword density.
  4. Do not use outside knowledge about this brand.
  5. Return only the JSON object matching the schema.
</rules>
```

Page first, rubric and rules last. Temperature 0, `top_p` 1, fixed `max_tokens`, schema-constrained decoding where supported.
### B5. Reducing variance

| Technique | Implementation |
|---|---|
| Temperature 0 | Reduces but does not eliminate variance on most providers |
| Evidence-required | Quote-or-zero; reject quotes not found in the input; cap 300 chars and log text length vs score |
| Self-consistency | 3 samples, take median; flag `max-min >= 2`; report median + spread, never one sample ([Wang et al.](https://arxiv.org/abs/2203.11171)) |
| Judge/generator separation | Never judge with the model family that wrote the fix copy (self-enhancement) |
| Position | Absolute scoring only; if comparative is ever added, swap A/B and average |
| Pinning | Store prompt_version + model id per sample; cache on (content hash, prompt_version) |

### B6. Probe queries for AI visibility

1. **Extract:** H1/title → head term; question-form H2/H3 → long-tail; FAQ `Question.name` → verbatim; product pages → category + differentiator; brand + city → local.
2. **Apply intent templates:** definition ("what is X"), comparison ("X vs Y", "best X for Z"), transactional ("X pricing", "X alternatives"), branded ("is X legit", "X reviews").
3. **Keep realistic:** 3–8 words, no internal jargon; spot-check against autocomplete/People-Also-Ask and drop what nobody would type.
4. **Dedupe:** embedding cosine > 0.92 → drop; keep 10–25 per site, ~60/40 unbranded to branded.
5. **Run:** web-search-enabled assistant; record mentioned (0/1), cited with link (0/1), position of first mention, sentiment, competitor cited instead; aggregate mention rate, citation rate, share of voice.
6. **Report as directional:** single snapshots are noise; use ≥ 3 runs on different days with a pinned query-set version, and call it "AI answer visibility", not rankings.

## Sources

- Anthropic prompting best practices — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- AGENTS.md — https://agents.md/
- Codex AGENTS.md (discovery, 32 KiB cap) — https://developers.openai.com/codex/agent-configuration/agents-md
- Cursor rules — https://cursor.com/docs/context/rules
- llms.txt — https://llmstxt.org/
- Aggarwal et al., GEO (KDD 2024) — https://arxiv.org/abs/2311.09735
- Zheng et al., Judging LLM-as-a-Judge (NeurIPS 2023) — https://arxiv.org/abs/2306.05685
- Liu et al., G-Eval — https://arxiv.org/abs/2303.16634
- Wang et al., Self-Consistency — https://arxiv.org/abs/2203.11171
- Google, AI features and your website — https://developers.google.com/search/docs/appearance/ai-features
- Google, helpful people-first content (E-E-A-T) — https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google, structured data intro — https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
- Google, robots.txt intro — https://developers.google.com/search/docs/crawling-indexing/robots/intro
