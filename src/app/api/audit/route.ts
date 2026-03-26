import { NextRequest, NextResponse } from "next/server";
import { scrapeUrl } from "@/lib/scraper";
import { deriveSignals } from "@/lib/signal-engine";
import { analyzeWithAI, SYSTEM_PROMPT } from "@/lib/ai-engine";
import { createPromptLog } from "@/lib/prompt-logger";
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

    // Layer 2: AI analysis (returns actual prompt sent + raw output)
    const { analysis, rawOutput, userPrompt, modelUsed } = await analyzeWithAI(url, metrics, signals);

    // Prompt log uses the EXACT prompt sent and raw output received
    const promptLog = createPromptLog(
      url,
      metrics,
      signals,
      SYSTEM_PROMPT,
      userPrompt,
      rawOutput,
      modelUsed
    );

    const response: AuditResponse = {
      url,
      metrics,
      signals,
      insights: analysis.insights,
      recommendations: analysis.recommendations,
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
      if (message.includes("Failed to fetch") || message.includes("timeout") || message.includes("ECONNREFUSED")) {
        return NextResponse.json(
          { error: "Failed to fetch the provided URL. Ensure it's accessible and try again." },
          { status: 502 }
        );
      }
      if (message.includes("403") || message.includes("Request failed with status code 403")) {
        return NextResponse.json(
          { error: "This website blocks automated access (403 Forbidden). Try a different URL." },
          { status: 502 }
        );
      }
      if (message.includes("Request failed with status code")) {
        return NextResponse.json(
          { error: `The website returned an error: ${message}. Try a different URL.` },
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
