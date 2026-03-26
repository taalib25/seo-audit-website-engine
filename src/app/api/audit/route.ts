import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl } from "@/lib/scraper";
import { deriveSignals } from "@/lib/signal-engine";
import { analyzeWithAI } from "@/lib/ai-engine";
import { createPromptLog, SYSTEM_PROMPT } from "@/lib/prompt-logger";
import type { AuditResponse } from "@/types/audit";

export async function POST(request: NextRequest) {
  try {
    let url = "";

    try {
      const body = await request.json();
      url = body?.url || "";
    } catch {
      const text = await request.text();
      try {
        const body = JSON.parse(text);
        url = body?.url || "";
      } catch {
        url = "";
      }
    }

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'url' in request body" },
        { status: 400 }
      );
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format. Please provide a valid URL including protocol (http/https)" },
        { status: 400 }
      );
    }

    // Layer 1: Scrape and extract metrics
    const metrics = await scrapeUrl(url);

    // Layer 1.5: Derive signals from metrics
    const signals = deriveSignals(metrics);

    // Layer 2: AI analysis
    const aiAnalysis = await analyzeWithAI(url, metrics, signals);

    // Create prompt log for traceability
    // Re-create user prompt for logging (matching what ai-engine sent)
    const dynamicContentWarning = metrics.dynamicContentSuspected
      ? "\n⚠️ WARNING: This page appears to be JS-heavy. Some content may not have been captured by static scraping. Metrics may be incomplete.\n"
      : "";

    const userPrompt = `Analyze the webpage: ${url}${dynamicContentWarning}

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

    const promptLog = createPromptLog(
      url,
      metrics,
      signals,
      SYSTEM_PROMPT,
      userPrompt,
      aiAnalysis.insights.length > 0 || aiAnalysis.recommendations.length > 0
        ? JSON.stringify(aiAnalysis, null, 2)
        : "(empty or parseable response)",
      "qwen-plus"
    );

    // Build final response
    const response: AuditResponse = {
      url,
      metrics,
      signals,
      insights: aiAnalysis.insights,
      recommendations: aiAnalysis.recommendations,
      promptLog,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Audit error:", error);

    if (error instanceof Error) {
      const message = error.message;

      if (message.includes("invalid_api_key") || message.includes("Incorrect API key")) {
        return NextResponse.json(
          { error: "Invalid DashScope API key. Check your DASHSCOPE_API_KEY in .env" },
          { status: 401 }
        );
      }
      if (message.includes("Missing DASHSCOPE_API_KEY")) {
        return NextResponse.json(
          { error: "Missing DASHSCOPE_API_KEY. Add it to your .env file" },
          { status: 500 }
        );
      }
      if (message.includes("Failed to fetch") || message.includes("timeout")) {
        return NextResponse.json(
          { error: "Failed to fetch the provided URL. Ensure it's accessible and try again." },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
