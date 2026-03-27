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

const SEO_SYSTEM_PROMPT = `You are an SEO technical analyst. Analyze structured webpage metrics for technical SEO and on-page optimization issues.

RULES:
- Every insight MUST cite a specific metric value (e.g. "H1 count: 0", "Missing alt: 93%").
- State when an area is healthy and why.
- Never infer beyond provided data.
- If dynamicContentSuspected is true, note metrics may be incomplete.

SEVERITY: high = directly harms SEO/indexing, medium = improvement opportunity, low = minor optimization.

Return ONLY valid JSON. No markdown wrapping.`;

const CONTENT_SYSTEM_PROMPT = `You are a content strategist and UX analyst. Analyze webpage signals for messaging clarity, CTA effectiveness, content depth, and user experience.

RULES:
- Every insight MUST cite a specific metric value (e.g. "CTA count: 2", "Word count: 353").
- Assess messaging quality, conversion path clarity, and content persuasiveness.
- Never infer beyond provided data.

SEVERITY: high = directly harms conversions/engagement, medium = improvement opportunity, low = minor optimization.

Return ONLY valid JSON. No markdown wrapping.`;

const SYNTHESIS_SYSTEM_PROMPT = `You synthesize SEO and content/UX analyses into a unified, prioritized action plan for a web agency.

RULES:
- Merge and deduplicate insights from both analyses.
- Rank recommendations by business impact (SEO + conversions combined).
- Priority 1 = highest impact. Tie priority to severity.
- Every insight must cite a specific metric value.
- Recommendations must be actionable for a web agency (specific steps).

Return ONLY valid JSON. No markdown wrapping.`;

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

function buildCondensedMetrics(metrics: MetricsObject) {
  return {
    meta: {
      title: metrics.meta.title,
      description: metrics.meta.description,
      keywords: metrics.meta.keywords || undefined,
    },
    headings: { h1: metrics.headings.h1, h2: metrics.headings.h2, h3: metrics.headings.h3 },
    headingTexts: metrics.headingTexts,
    wordCount: metrics.wordCount,
    ctaCount: metrics.ctaCount,
    ctaKeywords: metrics.ctaKeywords,
    buttonCount: metrics.buttonCount,
    formCount: metrics.formCount,
    links: metrics.links,
    images: {
      total: metrics.images.total,
      missingAltPercent: metrics.images.missingAltPercent,
      withLazyLoading: metrics.images.withLazyLoading,
      withDimensions: metrics.images.withDimensions,
    },
    seo: metrics.seo,
    dynamicContentSuspected: metrics.dynamicContentSuspected || undefined,
  };
}

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
    meta: { title: metrics.meta.title, description: metrics.meta.description },
    headings: { h1: metrics.headings.h1, h2: metrics.headings.h2, h3: metrics.headings.h3 },
    headingTexts: metrics.headingTexts,
    images: {
      total: metrics.images.total,
      missingAltPercent: metrics.images.missingAltPercent,
      withLazyLoading: metrics.images.withLazyLoading,
      withDimensions: metrics.images.withDimensions,
    },
    links: metrics.links,
    seo: metrics.seo,
    performance: metrics.performance,
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
    performanceIndicator: signals.performanceIndicator,
  };

  return `Webpage: ${url}
Metrics: ${JSON.stringify(seoMetrics)}
Signals: ${JSON.stringify(seoSignals)}

Benchmarks: title 30-60 chars optimal, description 120-160 chars, exactly 1 H1, alt text 100% coverage, TTFB under 600ms good / over 1500ms poor, 0 render-blocking scripts ideal, images should have lazy loading and width/height attributes.

Analyze technical SEO: meta optimization, heading structure, alt text, structured data, canonical/robots, render-blocking resources, image optimization, TTFB.
Return 2-3 insights focused on SEO/technical issues.

Return JSON:
{"insights":[{"summary":"...","finding":"...","impact":"...","metricReferenced":"...","severity":"high|medium|low"}]}`;
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
  };

  const contentSignals = {
    ctaDensity: signals.ctaDensity,
    ctaDensityLabel: signals.ctaDensityLabel,
    contentDepth: signals.contentDepth,
    internalLinkRatio: signals.internalLinkRatio,
  };

  return `Webpage: ${url}
Metrics: ${JSON.stringify(contentMetrics)}
Signals: ${JSON.stringify(contentSignals)}

Benchmarks: 800+ words for ranking competitiveness, 3-5 distinct CTAs per page, at least 1 lead capture form, H1 should align with meta title in theme, CTA keywords should be action-oriented (not generic "submit" or "click here").

Analyze: messaging clarity (H1/H2 text quality, meta alignment), CTA effectiveness (count vs buttons, keyword quality), content depth (word count adequacy), UX concerns (form presence, navigation).
Return 2-3 insights focused on content/messaging/CTA/UX.

Return JSON:
{"insights":[{"summary":"...","finding":"...","impact":"...","metricReferenced":"...","severity":"high|medium|low"}]}`;
}

// ============ LAYER 2C: Synthesis ============

function buildSynthesisPrompt(
  url: string,
  seoInsights: string,
  contentInsights: string,
  signals: DerivedSignals
): string {
  return `Webpage: ${url}

SEO/Technical Analysis:
${seoInsights}

Content/UX Analysis:
${contentInsights}

Signals Summary: ${JSON.stringify(signals)}

Merge insights from both analyses (keep all, deduplicate if overlapping). Then produce 3-5 prioritized recommendations.
Priority 1 = highest business impact. Include effort: low/medium/high.
Each recommendation must reference a specific metric and be actionable for a web agency.

Return JSON:
{"insights":[{"summary":"...","finding":"...","impact":"...","metricReferenced":"...","severity":"high|medium|low"}],"recommendations":[{"title":"...","description":"...","priority":1-5,"category":"short label e.g. seo/content/cta/performance/ux","effort":"low|medium|high","metricReferenced":"..."}]}`;
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
