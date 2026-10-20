import { describe, expect, it } from "vitest";
import { buildAgentsMdSnippet, buildFixPrompt } from "../src/index.ts";
import type { AuditReport } from "@aeo/core";

const report: AuditReport = {
  schemaVersion: 1, id: "fixture-report", startUrl: "https://example.com", origin: "https://example.com",
  createdAt: "2026-10-20T00:00:00.000Z", durationMs: 10, pagesCrawled: 2, capabilities: [],
  scores: { overall: 60, pillars: [] }, stack: ["Next.js App Router"],
  results: [
    { id: "seo.title.length", pillar: "seo", category: "on-page", kind: "deterministic", severity: "high", status: "fail", score: 0, title: "Title too long", message: "Title is 82 characters.", url: "https://example.com/about", evidence: { length: 82 }, fix: { summary: "Shorten the title to 60 characters.", snippet: "export const metadata = { title: 'About' };", snippetLang: "ts" } },
    { id: "geo.llms.missing", pillar: "geo", category: "site", kind: "deterministic", severity: "medium", status: "warn", score: 0.5, title: "Missing llms.txt", message: "llms.txt returned 404.", evidence: { status: 404 }, fix: { summary: "Publish a concise llms.txt." } },
  ],
};

describe("fix prompt", () => {
  it("matches the stable prompt snapshot", () => {
    expect(buildFixPrompt(report)).toMatchSnapshot();
  });
  it("generates concise repository guidance", () => {
    expect(buildAgentsMdSnippet(report)).toContain("Never invent facts");
  });
});
