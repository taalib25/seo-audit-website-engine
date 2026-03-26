import type { MetricsObject, DerivedSignals, AIAnalysis } from "@/types/audit";

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

function createUserPrompt(
  url: string,
  metrics: MetricsObject,
  signals: DerivedSignals
): string {
  const dynamicContentWarning = metrics.dynamicContentSuspected
    ? "\n⚠️ WARNING: This page appears to be JS-heavy. Some content may not have been captured by static scraping. Metrics may be incomplete.\n"
    : "";

  return `Analyze the webpage: ${url}${dynamicContentWarning}

## Metrics
${JSON.stringify(metrics, null, 2)}

## Derived Signals
${JSON.stringify(signals, null, 2)}

## Content Sample
${metrics.bodyText.slice(0, 3000)}

Generate structural insights for:
- SEO
- Messaging clarity
- CTA usage
- Content depth
- UX

Each insight must:
- reference a metric or signal
- include impact

Then provide 3-5 prioritized recommendations with effort estimates.

RECOMMENDATION RULES:
- Priority 1 = highest, 5 = lowest
- Tie priority to severity: high severity → priority 1-2, medium → 2-3, low → 4-5
- Include effort estimate: low/medium/high
- Make recommendations actionable for a web agency (specific steps they can take)
- Each recommendation must reference a metric

Return ONLY valid JSON with this exact structure:
{
  "insights": [
    {
      "summary": "...",
      "finding": "...",
      "impact": "...",
      "metricReferenced": "...",
      "severity": "high" | "medium" | "low"
    }
  ],
  "recommendations": [
    {
      "title": "...",
      "description": "...",
      "priority": 1-5,
      "category": "seo" | "messaging" | "cta" | "content" | "ux",
      "effort": "low" | "medium" | "high",
      "metricReferenced": "..."
    }
  ]
}`;
}

export async function analyzeWithAI(
  url: string,
  metrics: MetricsObject,
  signals: DerivedSignals
): Promise<AIAnalysis> {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Missing API key. Set DASHSCOPE_API_KEY or OPENROUTER_API_KEY in environment."
    );
  }

  const userPrompt = createUserPrompt(url, metrics, signals);

  // Use Qwen model via DashScope or OpenRouter
  const endpoint = "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "qwen-plus",
      input: {
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      },
      parameters: {
        temperature: 0.1, // Low temperature for consistent structured output
        max_tokens: 2000,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AI API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // Parse Qwen/DashScope response format
  const content = data.output?.text || "";

  if (!content) {
    throw new Error("Empty response from AI model");
  }

  // Extract JSON from response (handle potential markdown wrapping)
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```json")) {
    jsonStr = jsonStr.replace(/^```json\s*/, "").replace(/\s*```$/, "");
  } else if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```\s*/, "").replace(/\s*```$/, "");
  }

  try {
    const result = JSON.parse(jsonStr);
    return {
      insights: result.insights || [],
      recommendations: result.recommendations || [],
    };
  } catch (e) {
    throw new Error(
      `Failed to parse AI response as JSON: ${(e as Error).message}\nRaw output: ${jsonStr}`
    );
  }
}
