import OpenAI from "openai";
import type { MetricsObject, DerivedSignals, AIAnalysis } from "@/types/audit";

const client = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

const SYSTEM_PROMPT = `You are a senior web strategist at a performance marketing agency specializing in SEO, conversion optimization, and UX.

You will analyze structured webpage data.

STRICT RULES:
- Every insight MUST reference a specific metric or signal.
- If no issue exists, explicitly state the area is healthy and explain why.
- DO NOT give generic advice.
- DO NOT infer beyond the provided data.
- The "metricReferenced" field must contain exact values (e.g. "CTA count: 2", "Alt text missing: 50%").
- The "impact" field must explain why this matters for SEO, UX, or conversions.
- If the page appears to be JS-heavy or dynamic, note this in your analysis.

SEVERITY:
- high → directly harms conversions/SEO
- medium → meaningful improvement opportunity
- low → minor optimization

OUTPUT:
Return ONLY valid JSON matching the schema. Do not include markdown formatting or explanation.`;

function parseAIResponse(content: string): AIAnalysis {
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "");
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`Failed to parse AI response: ${(e as Error).message}`);
  }
}

export async function analyzeWithAI(
  url: string,
  metrics: MetricsObject,
  signals: DerivedSignals
): Promise<AIAnalysis> {
  if (!process.env.DASHSCOPE_API_KEY) {
    throw new Error("Missing DASHSCOPE_API_KEY in environment");
  }

  const response = await client.chat.completions.create({
    model: "qwen-plus",
    temperature: 0.1,
    max_tokens: 2000,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analyze the webpage: ${url}

## Metrics
${JSON.stringify(metrics, null, 2)}

## Derived Signals
${JSON.stringify(signals, null, 2)}

## Content Sample
${metrics.bodyText.slice(0, 3000)}

Generate structural insights for SEO, Messaging, CTA, Content depth, and UX.
Each insight must reference a metric or signal and include impact.

Then provide 3-5 prioritized recommendations with effort estimates.
Priority 1 = highest, 5 = lowest. Include effort: low/medium/high.

Return ONLY valid JSON:
{
  "insights": [{ "summary": "...", "finding": "...", "impact": "...", "metricReferenced": "...", "severity": "high|medium|low" }],
  "recommendations": [{ "title": "...", "description": "...", "priority": 1-5, "category": "seo|messaging|cta|content|ux", "effort": "low|medium|high", "metricReferenced": "..." }]
}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from AI");

  return parseAIResponse(content);
}
