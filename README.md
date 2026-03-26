# AI Website Audit Engine

A lightweight, single-page website audit tool that combines **deterministic metrics extraction**, **derived signal interpretation**, and **constrained LLM reasoning** — with full traceability from metrics → insights → recommendations.

## Core Differentiator

> A hybrid audit system combining deterministic extraction, derived signal interpretation, and constrained LLM reasoning — with full traceability.

## Architecture

```
[Frontend UI]
       ↓
POST /api/audit
       ↓
[Layer 1: Scraper] → Raw Metrics (axios + cheerio)
       ↓
[Layer 1.5: Signal Engine] → Derived Signals
       ↓
[Layer 2: AI Engine] → Structured Insights + Recommendations (Qwen)
       ↓
[Prompt Logger] → Full trace (input → prompt → output)
       ↓
[Response to UI]
```

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Scraping:** axios + cheerio (no JS rendering, fast)
- **AI:** Qwen model via DashScope/OpenRouter (direct API, no SDK)
- **Validation:** Zod schemas

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed
- API key for Qwen model (DashScope or OpenRouter)

### Installation

```bash
# Install dependencies
bun install

# Copy environment example
cp .env.local.example .env.local

# Edit .env.local and add your API key
# DASHSCOPE_API_KEY=your_key_here
# OR
# OPENROUTER_API_KEY=your_key_here
```

### Development

```bash
bun dev
```

Open [http://localhost:3000](http://localhost:3000)

## AI Pipeline Design

This system uses a **hybrid architecture** to ensure AI outputs are grounded in real data:

### Layer 1: Deterministic Extraction (No AI)

```
HTML → cheerio parsing → MetricsObject
```

Pure extraction with no interpretation:
- Meta tags (title, description, OG tags)
- Heading structure (H1-H6 counts)
- Word count
- CTA keyword detection
- Link analysis (internal/external)
- Image alt text coverage

### Layer 1.5: Signal Engine (Interpretation Layer)

```
MetricsObject → DerivedSignals
```

Derived signals add interpretability:
- **CTA Density:** low | moderate | high
- **Content Depth:** thin | moderate | deep
- **Heading Structure:** valid | invalid
- **Alt Text Coverage:** poor | good
- **Internal Link Ratio:** 0-1
- **Meta Optimization:** poor | average | good

### Layer 2: AI Engine (Constrained Reasoning)

```
Metrics + Signals → Qwen → Structured JSON
```

Key constraints:
- Every insight MUST reference a specific metric or signal
- Impact field explains WHY this matters (SEO, UX, conversions)
- Severity levels: high | medium | low
- Zod schema validation on output

### Why Direct API Calls (No SDK)?

We use direct `fetch()` calls instead of higher-level SDKs to ensure:
- **Full transparency** of prompts sent
- **Precise control** over inputs/outputs
- **Accurate logging** for reproducibility
- **No hidden abstractions** obscuring what the model receives

This aligns with the "prompt logs / reasoning traces" requirement — what we log is exactly what was sent.

## Data Model

### MetricsObject (Raw)

```typescript
{
  url: string;
  meta: { title, titleLength, description, descriptionLength, keywords, ogTags };
  headings: { h1, h2, h3, h4, h5, h6 };
  wordCount: number;
  bodyText: string;
  ctaCount: number;
  ctaKeywords: string[];
  links: { internal, external, total };
  images: { total, withAlt, missingAlt, missingAltPercent };
}
```

### DerivedSignals (Interpreted)

```typescript
{
  ctaDensity: number;
  ctaDensityLabel: "low" | "moderate" | "high";
  contentDepth: "thin" | "moderate" | "deep";
  headingStructure: "valid" | "invalid";
  altTextCoverage: "poor" | "good";
  internalLinkRatio: number;
  metaOptimization: "poor" | "average" | "good";
}
```

### AIInsight (Structured)

```typescript
{
  summary: string;
  finding: string;
  impact: string;      // WHY this matters
  metricReferenced: string;  // Exact values
  severity: "high" | "medium" | "low";
}
```

### PromptLog (Traceability)

```typescript
{
  systemPrompt: string;
  userPrompt: string;
  structuredInput: { metrics, signals };
  rawModelOutput: string;
  executionMeta: { model, timestamp, url };
}
```

## UI Structure

1. **Metrics Panel** - Clean numbers from scraping
2. **Signals Panel** - Derived interpretations
3. **Insights Panel** - AI insights grouped by severity
4. **Recommendations Panel** - Prioritized action items
5. **Prompt Logs Panel** - 4 tabs (System | User | Input | Output)

## Trade-offs

| Decision | Benefit | Trade-off |
|----------|---------|-----------|
| Cheerio over Puppeteer | Fast, lightweight | No JS rendering |
| Direct API calls | Full transparency | More boilerplate |
| No caching | Simple architecture | Repeated crawls cost more |
| Single-page only | Focused scope | No site-wide analysis |
| Structured outputs | Consistent JSON | May miss edge cases |

## What Makes This Top-Tier

### 1. AI is Not Magic

```
Extract → Interpret → Then use AI
```

The AI only sees structured data, not raw HTML. This grounds outputs in reality.

### 2. Constrained Model

- Schema validation (Zod)
- Strict system prompts
- Metric referencing required
- Impact explanation mandatory

### 3. Debuggable

- Full prompt logs visible in UI
- Structured input shows exactly what AI received
- Timestamped execution metadata

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
- `500` - Server error (missing API key, etc.)
- `502` - Failed to fetch URL

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DASHSCOPE_API_KEY` | API key for DashScope (Qwen) |
| `OPENROUTER_API_KEY` | API key for OpenRouter (Qwen) |

Set at least one in `.env.local`.

## License

MIT
