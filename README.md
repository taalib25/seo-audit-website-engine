# AI Website Audit Engine

Enter a URL, get a structured breakdown of what's working and what isn't — factual metrics separated cleanly from AI analysis, with full visibility into every prompt sent and response received.

Built as a 24-hour assignment for EIGHT25MEDIA.

---

## Setup

**You'll need:** Node.js 18+ and a DashScope API key ([get one here](https://dashscope.console.aliyun.com/))

```bash
npm install
cp .env.example .env
# DASHSCOPE_API_KEY=your_key_here
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Results take about 30 seconds.

---

## Architecture

```
URL Input
   │
   ▼
Layer 1 — Scraper (axios + cheerio)
   │  extracts: word count, headings, CTAs, links, images, meta tags
   │
   ▼
Layer 1.5 — Signal Engine (no AI)
   │  interprets numbers into categories the AI can reason about
   │  e.g. content depth, CTA density, heading structure, meta quality
   │
   ▼
Layer 2 — AI Pipeline
   │
   ├── 2A: SEO analysis (qwen-turbo-latest) ──┐
   │                                          │  parallel
   ├── 2B: Content/UX analysis (qwen-turbo-latest)
   │
   └── 2C: Synthesis (qwen-plus)
          merges both, removes duplicates, ranks by business impact
   │
   ▼
Prompt Logger — full trace per layer
```

---

## Deliverables

### 1. Factual Metrics

Extracted from HTML, no AI involved, clearly separated from insights in the UI:

| Metric | Source |
|--------|--------|
| Total word count | Body text, scripts and styles stripped |
| Heading counts (H1–H3) | DOM traversal |
| CTA count | Keyword scan on `<a>` and `<button>` text + `input[type=submit]` |
| Internal / external links | Hostname comparison, `www`-normalized |
| Images + % missing alt text | `<img>` tag analysis |
| Meta title + description | `<title>` and `<meta name="description">` |

### 2. AI Insights

The AI receives structured metrics and pre-interpreted signals — never raw HTML. Each insight covers one of: SEO structure, messaging clarity, CTA usage, content depth, or UX concerns. Every insight must cite a specific metric value. The system prompt uses before/after examples to prevent the model from restating numbers without analysis.

### 3. Recommendations

3–5 actions ranked by business impact, each tied to a specific metric and specific enough for a developer or copywriter to act on directly.

### 4. Prompt Logs

Click **View Prompt Log** in the top-right corner:

- **System** — system prompts for each model layer
- **User** — user prompts as actually sent (all 3 layers)
- **Input** — full metrics + signals JSON the AI received
- **Output** — raw model responses before parsing

---

## AI Design Decisions

**Why 3 calls instead of one?**

A single prompt covering SEO, content, and synthesis produces generic output. Splitting them gives each model a focused brief with only the relevant metrics. Layers 2A and 2B run in parallel, so total time is roughly `max(A, B) + C` rather than `A + B + C`.

**Why interpret metrics before sending to the AI?**

The signal engine converts raw numbers into categories (`thin / moderate / deep`, `valid / invalid`) first. The model then reasons about what they mean rather than re-deriving benchmarks it already knows.

**Why put actual copy in the prompt?**

The title, H1, H2 samples, and CTA text are surfaced explicitly in the prompt. A model that can read `"H1: 51 Excellent One Page Website Examples..."` can evaluate that copy — not just report its character count.

---

## Trade-offs

| Decision | Why | Cost |
|----------|-----|------|
| Cheerio over Puppeteer | Fast, no browser, deterministic | Misses JS-rendered content — SPAs show partial metrics |
| `head > title` selector | Avoids picking up SVG `<title>` elements (e.g. logo carousels inflate the title string) | Relies on well-formed HTML with title in `<head>` |
| Heading selectors exclude `svg *` | SVGs can contain `<h1>`–`<h6>` tags that aren't page headings | Same assumption about standard HTML structure |
| 3 AI calls | Each layer stays focused | More orchestration; parallel execution offsets most of the latency |
| Keyword-list CTA detection | No latency, no extra API cost | Misses unusual copy like "Claim Your Spot" |
| Condensed prompt | ~75% fewer tokens | AI can't assess body copy tone directly |
| Zod + retry | Catches malformed JSON automatically | One extra API call if validation fails |

---

## What I'd Fix With More Time

- **JS rendering** — the biggest gap. Tested against eight25media.com (a B2B agency homepage) and the scraper returned 354 words — far below the real content count because most of the page is JS-rendered. `dynamicContentSuspected` also returned false, meaning the flag doesn't catch all cases. Playwright would fix this.
- **TTFB as an actionable insight** — the signal engine correctly captures TTFB (eight25media returned 1808ms, above the 1500ms "poor" threshold) but no AI layer currently surfaces it as an insight. It should feed into Layer 2A as a performance finding.
- **Dynamic CTA detection** — cosine similarity against a CTA prototype vector instead of a fixed keyword list; catches unusual copy like "Claim Your Spot"
- **Streaming** — show Layer 2A/2B results as they arrive rather than waiting for synthesis
- **Visual audit** — screenshot + vision model for layout, above-the-fold content, and visual CTA hierarchy
- **Comparative audits** — diff two URLs side by side

---

## API

```
POST /api/audit
Body: { "url": "https://example.com" }
```

Returns: `metrics`, `signals`, `insights`, `recommendations`, `promptLog`

Error codes: `400` invalid URL · `401` bad API key · `502` target unreachable · `500` server error

---

## Stack

Next.js 16 · TypeScript · Tailwind CSS v4 · axios · cheerio · OpenAI SDK · Zod

---

## Environment

| Variable | Description |
|----------|-------------|
| `DASHSCOPE_API_KEY` | Qwen models via DashScope (OpenAI-compatible) |