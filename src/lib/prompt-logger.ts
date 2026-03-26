import type {
  MetricsObject,
  DerivedSignals,
  PromptLog,
} from "@/types/audit";

export function createPromptLog(
  url: string,
  metrics: MetricsObject,
  signals: DerivedSignals,
  systemPrompt: string,
  userPrompt: string,
  rawModelOutput: string,
  model: string
): PromptLog {
  return {
    systemPrompt,
    userPrompt,
    structuredInput: {
      metrics,
      signals,
    },
    rawModelOutput,
    executionMeta: {
      model,
      timestamp: new Date().toISOString(),
      url,
    },
  };
}

// System prompt used for AI analysis (exported for logging)
export const SYSTEM_PROMPT = `You are a senior web strategist at a performance marketing agency specializing in SEO, conversion optimization, and UX.

You will analyze structured webpage data.

STRICT RULES:
- Every insight MUST reference a specific metric or signal.
- If no issue exists, explicitly state the area is healthy and explain why.
- DO NOT give generic advice.
- DO NOT infer beyond the provided data.
- The "metricReferenced" field must contain exact values (e.g. "CTA count: 2", "Alt text missing: 50%").
- The "impact" field must explain why this matters for SEO, UX, or conversions.

SEVERITY:
- high → directly harms conversions/SEO
- medium → meaningful improvement opportunity
- low → minor optimization

OUTPUT:
Return ONLY valid JSON matching the schema. Do not include markdown formatting or explanation.`;
