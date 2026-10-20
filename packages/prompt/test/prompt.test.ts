import { describe, expect, it } from "vitest";
import { buildAgentsMdSnippet, buildFixPrompt } from "../src/index.ts";
import type { AuditReport } from "@aeo/core";
import eight25Report from "./fixtures/eight25media-report.json";

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
    expect(buildFixPrompt(report).markdown).toMatchSnapshot("small report");
  });
  it("matches the real eight25media prompt snapshot and stays concise", () => {
    const generated = buildFixPrompt(eight25Report as AuditReport);
    expect(generated.markdown).toMatchSnapshot("eight25media report");
    expect(generated.markdown.split("\n").length).toBeLessThan(500);
    expect(generated.tasks.length).toBeLessThanOrEqual(25);
  });
  it("consolidates AI crawler findings into one explicit robots task", () => {
    const generated = buildFixPrompt(eight25Report as AuditReport);
    const robots = generated.tasks.filter((task) => task.title === "Update robots.txt AI-crawler policy");
    expect(robots).toHaveLength(1);
    expect(robots[0]?.ids).toContain("geo.ai-crawl.openai.gptbot");
    expect(robots[0]?.snippet).toContain("User-agent: GPTBot\nAllow: /");
  });
  it("compacts evidence and separates rationale from findings", () => {
    const result = buildFixPrompt(report).markdown;
    expect(result).toContain("**Why.** Title is 82 characters.");
    expect(result).toContain("**Finding.**");
    expect(result).toContain("length: 82");
    expect(result).not.toContain("```json");
    expect(result).toContain("bunx @aeo/cli verify https://example.com/about --ids seo.title.length");
  });
  it("generates concise repository guidance", () => {
    expect(buildAgentsMdSnippet(report)).toContain("Never invent facts");
  });
});

describe("evidence compaction", () => {
  it("shows only five array values plus a remainder count and caps lines", () => {
    const arrayReport: AuditReport = {
      ...report,
      results: [{
        id: "seo.title.length", pillar: "seo", category: "on-page", kind: "deterministic", severity: "high", status: "fail", score: 0,
        title: "Array test", message: "Repeated result message", rationale: "The title is too long.",
        evidence: { message: "Repeated result message", values: [1, 2, 3, 4, 5, 6, 7], repeated: "Repeated result message", objects: [
          { url: "/a", allowed: true }, { url: "/b", allowed: true }, { url: "/c", allowed: true },
          { url: "/d", allowed: true }, { url: "/e", allowed: true }, { url: "/f", allowed: true },
        ] },
      }],
    };
    const markdown = buildFixPrompt(arrayReport).markdown;
    expect(markdown).toContain("values: 1, 2, 3, 4, 5, +2 more");
    expect(markdown).toContain("objects: url=/a, allowed=true");
    expect(markdown).toContain("+1 more");
    expect(markdown).not.toContain("6, 7");
    expect(markdown.match(/\*\*Evidence \(compact\):\*\*[\s\S]*?\n\*\*Fix\./)?.[0].split("\n").length).toBeLessThanOrEqual(7);
  });
});
