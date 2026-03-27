import OpenAI from "openai";
import type { MetricsObject, DerivedSignals } from "@/types/audit";
import { AIAnalysisSchema, type AIAnalysis } from "@/types/audit";

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

// ============ MODEL CONFIGURATION ============
const MODELS = {
  // Layer 2A + 2B: qwen-turbo-latest — fast and cheap for focused sub-analyses
  seoTechnical: "qwen-turbo-latest",
  contentUx: "qwen-turbo-latest",
  // Layer 2C: qwen-plus — balanced quality for final synthesis and prioritisation
  synthesis: "qwen-plus",
  // Fallback if any model fails
  fallback: "qwen-turbo",
} as const;

// ============ SYSTEM PROMPTS (per-layer) ============
// Exported for prompt logging — single source of truth

const SEO_SYSTEM_PROMPT = `You are a senior SEO consultant auditing a page for a web agency. You produce sharp, specific insights — never generic advice.

RULES:
- The UI already shows raw counts. Your job is INTERPRETATION: why does this specific combination of metrics matter for THIS page?
- Every insight must cite a metric, but the insight is the strategic "so what", not the number itself.
- Assess the ACTUAL copy provided (title text, H1 text, description text) — is it compelling? Keyword-rich? Does it differentiate?
- If a metric is healthy, skip it. Only surface issues worth fixing.
- If dynamicContentSuspected is true, note metrics may be incomplete.

BAD: "63% of images are missing alt text, which harms SEO."
GOOD: "63% missing alt on a page with 99 images — Google Image Search can't index the visual examples that are this page's core value."

SEVERITY: high = blocks indexing or directly loses traffic, medium = missed ranking opportunity, low = minor polish.

Return ONLY valid JSON. No markdown.`;

const CONTENT_SYSTEM_PROMPT = `You are a conversion strategist auditing a page for a web agency. You evaluate messaging, CTAs, and content quality — not technical SEO.

RULES:
- The UI already shows raw counts. Your job is INTERPRETATION: is the messaging clear? Are CTAs compelling? Is the conversion path obvious?
- Read the actual H1/H2 text and CTA keywords provided — assess whether they communicate a specific value proposition or are vague.
- Look at the COMBINATION of metrics (e.g., high CTAs but 0 forms = no conversion path; many words but no lists = wall of text).
- If a metric is healthy, skip it. Only surface issues worth fixing.

BAD: "The CTA density is high at 0.175, which could overwhelm users."
GOOD: "11 CTAs but 0 forms — visitors see action prompts everywhere but have no way to actually convert. Adding one lead capture form could turn this traffic into leads."

SEVERITY: high = directly loses conversions, medium = missed engagement opportunity, low = minor UX polish.

Return ONLY valid JSON. No markdown.`;

const SYNTHESIS_SYSTEM_PROMPT = `You merge SEO and content analyses into a single prioritized action plan for a web agency team.

RULES:
- Deduplicate overlapping insights. Drop any insight that just restates a number without strategic context.
- Keep only the most actionable insights (max 4-5 total).
- Recommendations must be specific enough that a developer or copywriter could execute them without further research. Include what to change, not just "improve X".
- Priority 1 = highest business impact. Consider: does fixing this unlock traffic, conversions, or both?

Return ONLY valid JSON. No markdown.`;

// Composite prompt for logging — shows the full multi-layer strategy
export const SYSTEM_PROMPT = `[MULTI-LAYER AI PIPELINE]

Layer 2A — SEO/Technical Analysis (${MODELS.seoTechnical}):
${SEO_SYSTEM_PROMPT}

Layer 2B — Content/UX Analysis (${MODELS.contentUx}):
${CONTENT_SYSTEM_PROMPT}

Layer 2C — Synthesis & Ranking (${MODELS.synthesis}):
${SYNTHESIS_SYSTEM_PROMPT}`;

// ============ TYPES ============

interface AnalysisResult {
  analysis: AIAnalysis;
  rawOutput: string;
  userPrompt: string;
  modelUsed: string;
}

// ============ HELPERS ============

function parseJSON(content: string): unknown {
  let jsonStr = content.trim();
  // Strip <think>...</think> blocks emitted by Qwen3 thinking models
  jsonStr = jsonStr.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "");
  }
  return JSON.parse(jsonStr);
}

// Per-call timeout — abort if model doesn't respond in time
const CALL_TIMEOUT_MS = 30_000;  // 30s for turbo layers; qwen-plus synthesis gets same budget

/** Standard (non-streaming) model call */
async function callModel(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  fallbackModel?: string
): Promise<{ content: string; model: string }> {
  const attempt = async (m: string): Promise<string> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
    try {
      const response = await client.chat.completions.create(
        {
          model: m,
          temperature: 0.1,
          max_tokens: maxTokens,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        },
        { signal: controller.signal }
      );
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error(`Empty response from ${m}`);
      return content;
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    return { content: await attempt(model), model };
  } catch (err) {
    if (fallbackModel) {
      console.warn(`${model} failed, falling back to ${fallbackModel}:`, err);
      return { content: await attempt(fallbackModel), model: fallbackModel };
    }
    throw err;
  }
}


// ============ LAYER 2A: SEO/Technical Analysis ============

function buildSeoPrompt(url: string, metrics: MetricsObject, signals: DerivedSignals): string {
  const seoMetrics = {
    meta: { title: metrics.meta.title, titleLength: metrics.meta.titleLength, description: metrics.meta.description, descriptionLength: metrics.meta.descriptionLength },
    headings: { h1: metrics.headings.h1, h2: metrics.headings.h2, h3: metrics.headings.h3 },
    headingTexts: metrics.headingTexts,
    images: { total: metrics.images.total, missingAltPercent: metrics.images.missingAltPercent },
    links: metrics.links,
    seo: { canonical: metrics.seo.canonical, robotsMeta: metrics.seo.robotsMeta, lang: metrics.seo.lang, schemaOrgTypes: metrics.seo.schemaOrgTypes },
    dynamicContentSuspected: metrics.dynamicContentSuspected || undefined,
  };

  const seoSignals = {
    headingStructure: signals.headingStructure,
    headingHierarchy: signals.headingHierarchy,
    altTextCoverage: signals.altTextCoverage,
    metaOptimization: signals.metaOptimization,
    schemaOrgPresence: signals.schemaOrgPresence,
    socialMetaCompleteness: signals.socialMetaCompleteness,
    technicalSeoBasics: signals.technicalSeoBasics,
    titleH1Overlap: signals.titleH1Overlap,
    ogImagePresent: signals.ogImagePresent,
    h1WordCount: signals.h1WordCount,
  };

  const h1Text = metrics.headingTexts.h1[0] || "(no H1)";
  const h2Samples = metrics.headingTexts.h2.slice(0, 3).join(" | ") || "(no H2s)";

  return `PAGE: ${url}

COPY TO EVALUATE:
- Title (${metrics.meta.titleLength} chars): "${metrics.meta.title}"
- H1 (${signals.h1WordCount} words): "${h1Text}"
- H2 samples: ${h2Samples}
- Description (${metrics.meta.descriptionLength} chars): "${metrics.meta.description}"

METRICS: ${JSON.stringify(seoMetrics)}
SIGNALS: ${JSON.stringify(seoSignals)}

BENCHMARKS: title 30-60 chars, description 120-160 chars, exactly 1 H1, alt text 100%, 0 render-blocking scripts.

Return 2-3 insights. Focus on what a senior SEO would flag — not obvious counts.

JSON format — each field serves a DIFFERENT purpose:
{"insights":[{"summary":"≤10 word headline","finding":"specific evidence with numbers — NOT a restatement of summary","impact":"what business outcome this affects and why — NOT a restatement of finding","metricReferenced":"metric name","severity":"high|medium|low"}]}`;
}

// ============ LAYER 2B: Content/UX Analysis ============

function buildContentPrompt(url: string, metrics: MetricsObject, signals: DerivedSignals): string {
  const contentMetrics = {
    meta: { title: metrics.meta.title, description: metrics.meta.description },
    headingTexts: metrics.headingTexts,
    wordCount: metrics.wordCount,
    ctaCount: metrics.ctaCount,
    ctaKeywords: metrics.ctaKeywords,
    buttonCount: metrics.buttonCount,
    formCount: metrics.formCount,
    links: { internal: metrics.links.internal, external: metrics.links.external },
    genericAnchorCount: metrics.genericAnchorCount,
    listCount: metrics.listCount,
  };

  const contentSignals = {
    ctaDensity: signals.ctaDensity,
    ctaDensityLabel: signals.ctaDensityLabel,
    contentDepth: signals.contentDepth,
    internalLinkRatio: signals.internalLinkRatio,
    contentScannability: signals.contentScannability,
    titleH1Overlap: signals.titleH1Overlap,
  };

  const h1Text = metrics.headingTexts.h1[0] || "(no H1)";
  const h2Samples = metrics.headingTexts.h2.slice(0, 3).join(" | ") || "(no H2s)";
  const ctaList = metrics.ctaKeywords.slice(0, 8).join(", ") || "(none detected)";

  return `PAGE: ${url}

MESSAGING TO EVALUATE:
- H1: "${h1Text}"
- H2 samples: ${h2Samples}
- CTA phrases found: ${ctaList}
- Forms: ${metrics.formCount} | Buttons: ${metrics.buttonCount}

METRICS: ${JSON.stringify(contentMetrics)}
SIGNALS: ${JSON.stringify(contentSignals)}

BENCHMARKS: 800+ words for ranking, 3-5 CTAs, at least 1 form, H1 should complement (not duplicate) the title, 0 generic anchor text.

Return 2-3 insights. Focus on the CONVERSION PATH — can a visitor understand the value prop and take action? What's broken in that flow?

JSON format — each field serves a DIFFERENT purpose:
{"insights":[{"summary":"≤10 word headline","finding":"specific evidence with numbers — NOT a restatement of summary","impact":"what business outcome this affects and why — NOT a restatement of finding","metricReferenced":"metric name","severity":"high|medium|low"}]}`;
}

// ============ LAYER 2C: Synthesis ============

function buildSynthesisPrompt(
  url: string,
  seoInsights: string,
  contentInsights: string,
  signals: DerivedSignals
): string {
  return `PAGE: ${url}

SEO/TECHNICAL ANALYSIS:
${seoInsights}

CONTENT/UX ANALYSIS:
${contentInsights}

SIGNALS: ${JSON.stringify(signals)}

TASK:
1. Merge insights from both analyses. Deduplicate overlapping ones. Drop any that just restate a number without strategic context. Keep 4-5 max.
2. Produce 3-5 recommendations ranked by business impact. Each must tell the agency team EXACTLY what to do (not "improve alt text" but "add descriptive alt to the ${signals.altTextCoverage === "poor" ? "majority of" : "remaining"} images, prioritizing hero and product images").

JSON — each insight field serves a DIFFERENT purpose (summary ≠ finding ≠ impact):
{"insights":[{"summary":"≤10 word headline","finding":"specific evidence with numbers","impact":"concrete business consequence","metricReferenced":"metric name","severity":"high|medium|low"}],"recommendations":[{"title":"action verb + what to change","description":"specific steps a developer or copywriter can execute","priority":1,"category":"seo|content|cta|ux|performance","effort":"low|medium|high","metricReferenced":"metric name"}]}`;
}

// ============ MAIN PIPELINE ============

export async function analyzeWithAI(
  url: string,
  metrics: MetricsObject,
  signals: DerivedSignals
): Promise<AnalysisResult> {
  if (!process.env.DASHSCOPE_API_KEY) {
    throw new Error("Missing DASHSCOPE_API_KEY in environment");
  }

  const seoPrompt = buildSeoPrompt(url, metrics, signals);
  const contentPrompt = buildContentPrompt(url, metrics, signals);

  // Layer 2A + 2B: qwen-turbo in parallel — fast, focused sub-analyses
  const [seoResult, contentResult] = await Promise.all([
    callModel(MODELS.seoTechnical, SEO_SYSTEM_PROMPT, seoPrompt, 800, MODELS.fallback),
    callModel(MODELS.contentUx, CONTENT_SYSTEM_PROMPT, contentPrompt, 800, MODELS.fallback),
  ]);

  // Layer 2C: qwen-plus synthesis — merges, deduplicates and ranks by business impact
  const synthesisPrompt = buildSynthesisPrompt(url, seoResult.content, contentResult.content, signals);
  const synthesisResult = await callModel(MODELS.synthesis, SYNTHESIS_SYSTEM_PROMPT, synthesisPrompt, 2000, MODELS.fallback);

  // Compose the full user prompt for logging (shows all 3 layers)
  const fullUserPrompt = `[LAYER 2A — SEO/Technical → ${seoResult.model}]
${seoPrompt}

[LAYER 2B — Content/UX → ${contentResult.model}]
${contentPrompt}

[LAYER 2C — Synthesis → ${synthesisResult.model}]
${synthesisPrompt}`;

  // Raw output log shows all model responses
  const fullRawOutput = `[LAYER 2A — ${seoResult.model}]
${seoResult.content}

[LAYER 2B — ${contentResult.model}]
${contentResult.content}

[LAYER 2C — ${synthesisResult.model}]
${synthesisResult.content}`;

  const modelsUsed = `${seoResult.model} + ${contentResult.model} → ${synthesisResult.model}`;

  // Validate final synthesis output with Zod
  try {
    const analysis = AIAnalysisSchema.parse(parseJSON(synthesisResult.content));
    return { analysis, rawOutput: fullRawOutput, userPrompt: fullUserPrompt, modelUsed: modelsUsed };
  } catch (firstError) {
    console.warn("Synthesis validation failed, retrying with repair prompt:", firstError);

    const repairPrompt = `Your previous response had invalid JSON. Fix and return ONLY valid JSON:
{"insights":[{"summary":"string","finding":"string","impact":"string","metricReferenced":"string","severity":"high|medium|low"}],"recommendations":[{"title":"string","description":"string","priority":1-5,"category":"seo|messaging|cta|content|ux","effort":"low|medium|high","metricReferenced":"string"}]}

Previous response (fix this):
${synthesisResult.content.slice(0, 1500)}`;

    const retryResult = await callModel(MODELS.synthesis, SYNTHESIS_SYSTEM_PROMPT, repairPrompt, 3000, MODELS.fallback);
    const analysis = AIAnalysisSchema.parse(parseJSON(retryResult.content));

    const retryRawOutput = `${fullRawOutput}\n\n[RETRY — ${retryResult.model}]\n${retryResult.content}`;
    return { analysis, rawOutput: retryRawOutput, userPrompt: fullUserPrompt, modelUsed: modelsUsed };
  }
}
