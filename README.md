# AI Website Audit Engine

A lightweight, single-page website audit tool that combines **deterministic metrics extraction**, **derived signal interpretation**, and **constrained LLM reasoning** — with full traceability from metrics to insights to recommendations.

## Architecture

```
[Frontend UI]
       |
POST /api/audit
       |
[Layer 1: Scraper] ---------> Raw Metrics (axios + cheerio)
       |
[Layer 1.5: Signal Engine] --> Derived Signals
       |
[Layer 2: Multi-Model AI Pipeline]
       |
   +---+---+
   |       |
 [2A]   [2B]         ← PARALLEL
 SEO    Content/UX
 coder  qwen3.5
   |       |
   +---+---+
       |
     [2C]             ← SYNTHESIS
   qwen3.5-plus
   Merge + Rank
       |
[Prompt Logger] --> Full trace per layer
       |
[Response to UI]
```

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript (strict mode)
- **Styling:** Tailwind CSS v4
- **Scraping:** axios + cheerio (no JS rendering — fast, deterministic)
- **AI:** Multi-model pipeline via DashScope (qwen3-coder-plus, qwen3.5-plus)
- **Validation:** Zod schemas (input types + AI output validation)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed (or npm/npx)
- API key for DashScope (Qwen models)

### Installation

```bash
bun install
cp .env.example .env
# Edit .env and add your API key
# DASHSCOPE_API_KEY=your_key_here
```

### Development

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000)

## AI Pipeline Design

### Layer 1: Deterministic Extraction (No AI)

```
HTML --> cheerio parsing --> MetricsObject
```

Pure extraction with no interpretation:
- Meta tags (title, description, OG tags)
- Heading structure (H1-H6 counts + actual heading text)
- Word count
- CTA detection (scans actual `<a>` and `<button>` elements for 35+ action phrases, plus elements with CTA-like classes)
- Link analysis (internal/external — relative paths correctly classified as internal)
- Image analysis: count + alt text coverage

Additional data collected for AI context (not displayed in UI):
- Technical SEO: canonical, robots, viewport, language, charset, favicon, Schema.org/JSON-LD, Twitter Card
- Performance: TTFB, script/stylesheet counts, render-blocking scripts, lazy loading, image dimensions
- Forms, buttons (conversion path indicators)

### Layer 1.5: Signal Engine (Interpretation Layer)

```
MetricsObject --> DerivedSignals
```

Transforms raw numbers into categorical assessments that the AI can reason about:
- **Content Depth:** thin | moderate | deep
- **CTA Density:** low | moderate | high
- **Heading Structure:** valid | invalid
- **Alt Text Coverage:** poor | good
- **Meta Optimization:** poor | average | good
- Plus: heading hierarchy, schema.org presence, social meta completeness, technical SEO basics, performance indicator

### Layer 2: Multi-Model AI Pipeline (Parallel + Synthesis)

```
Layer 2A (SEO/Technical)     Layer 2B (Content/UX)
  qwen3-coder-plus              qwen3.5-plus
  Strict JSON, fast             Deep reasoning
         |                          |
         +----------+----------+
                    |
            Layer 2C (Synthesis)
              qwen3.5-plus
            Merge + Rank + Validate
```

**Why multi-model?** Each model is chosen for its strength:
- **qwen3-coder-plus** (Layer 2A): Coding models produce the most reliable structured JSON. Handles technical SEO metrics where precision matters.
- **qwen3.5-plus** (Layer 2B): Deep reasoning for nuanced content quality and messaging assessment.
- **qwen3.5-plus** (Layer 2C): Balanced reasoning for final synthesis. Merges both analyses, deduplicates, and ranks recommendations by business impact.

**Layers 2A and 2B run in parallel** — total latency = max(A, B) + C, not A + B + C.

Key constraints:
- Every insight MUST cite a specific metric value
- Benchmark injection in prompts (e.g., "title 30-60 chars optimal", "TTFB under 600ms good") grounds AI against industry standards
- **Zod schema validation on AI output** (with retry on validation failure)
- Per-layer model fallback to qwen-plus if primary model unavailable

### Why This Architecture?

The AI never sees raw HTML. It only receives structured, pre-interpreted data. This means:
- **Grounded outputs** — insights reference real numbers, not hallucinated observations
- **Reproducible** — same metrics always produce similar analysis
- **Debuggable** — the Prompt Logger shows exactly what was sent and received per layer
- **Token-efficient** — condensed metrics use ~500-800 tokens instead of dumping raw HTML

## Data Model

### MetricsObject (Displayed in UI)

```typescript
{
  wordCount: number;
  headings: { h1, h2, h3 };
  ctaCount: number;
  links: { internal, external, total };
  images: { total, missingAltPercent };
  meta: { title, titleLength, description, descriptionLength };
}
```

### MetricsObject (Full — sent to AI for richer analysis)

```typescript
{
  url: string;
  meta: { title, description, keywords, ogTags };
  headings: { h1, h2, h3, h4, h5, h6 };
  headingTexts: { h1: string[], h2: string[] };
  wordCount: number;
  ctaCount: number;
  ctaKeywords: string[];
  buttonCount: number;
  formCount: number;
  links: { internal, external, total };
  images: { total, withAlt, missingAlt, missingAltPercent, withLazyLoading, withDimensions };
  seo: { canonical, robotsMeta, viewport, lang, charset, favicon, schemaOrgTypes, twitterCard, scriptCount, stylesheetCount, renderBlockingScripts };
  performance: { ttfbMs, redirected, finalUrl, htmlSize };
  dynamicContentSuspected: boolean;
}
```

### PromptLog (Traceability)

```typescript
{
  systemPrompt: string;       // Exact system prompt sent to each model
  userPrompt: string;         // Exact user message sent per layer
  structuredInput: { metrics, signals };
  rawModelOutput: string;     // Unprocessed responses from all 3 layers
  executionMeta: { model, timestamp, url };
}
```

## Trade-offs

| Decision | Benefit | Trade-off |
|----------|---------|-----------|
| Cheerio over Puppeteer | Fast, lightweight, deterministic | No JS rendering — dynamic sites show limited content |
| Multi-model pipeline (3 calls) | Each model plays to its strength; parallel = fast | More complex orchestration than single call |
| Parallel Layers 2A+2B | Latency = max(A,B) + C, not A+B+C | Both calls must complete before synthesis begins |
| Element-based CTA detection | Counts actual clickable CTAs, not body text mentions | May miss CTAs using unusual patterns (e.g., div with onclick) |
| Condensed prompt (no body text) | ~75% fewer tokens, less noise | AI can't assess actual copy quality or tone |
| Zod validation + retry | Catches malformed responses automatically | Adds one extra API call on validation failure |
| Extra metrics for AI only | Richer AI analysis without cluttering UI | More data collected than displayed |

## What I Would Improve With More Time

- **JS rendering** via Playwright for SPA/dynamic sites
- **Caching layer** to avoid re-scraping the same URL within a time window
- **Streaming responses** for real-time insight generation (stream Layer 2A/2B results as they arrive)
- **Display extended metrics** — technical SEO, performance, derived signals in expandable sections
- **Comparative analysis** — audit two URLs and diff their metrics
- **Readability scoring** (Flesch-Kincaid) for content quality assessment
- **Keyword density analysis** in titles and headings vs. page content
- **Visual page analysis** — use a vision model to analyze a screenshot for UX layout issues

## API Reference

### POST /api/audit

**Request:**
```json
{ "url": "https://example.com" }
```

**Response:**
```json
{
  "url": "https://example.com",
  "metrics": { ... },
  "signals": { ... },
  "insights": [ ... ],
  "recommendations": [ ... ],
  "promptLog": { ... }
}
```

**Errors:**
- `400` - Missing or invalid URL
- `401` - Invalid API key
- `500` - Server error (missing API key, etc.)
- `502` - Failed to fetch target URL (403 blocked, timeout, etc.)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DASHSCOPE_API_KEY` | API key for DashScope (Qwen models) |

Set in `.env` file.

## License

MIT
