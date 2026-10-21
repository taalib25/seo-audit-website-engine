import { describe, expect, it } from "vitest";
import { aeoChecks } from "../../../src/checks/aeo/index.ts";
import { fixture, page, runPage } from "../../helpers.ts";
import { runAudit } from "../../../src/runner.ts";
import { createDefaultRegistry } from "../../../src/checks/index.ts";
import { site } from "../../helpers.ts";

describe("deterministic AEO checks", () => {
  it("runs all checks with an initial-HTML content fixture", async () => {
    const p = page(fixture("content/structured.html"), { renderedHtml: fixture("content/structured.html") });
    const results = await Promise.all(aeoChecks.map((c) => runPage(c, p)));
    expect(results).toHaveLength(aeoChecks.length);
    expect(results.every((r) => r && typeof r.message === "string")).toBe(true);
  });
  it("handles empty content as an edge case", async () => {
    const results = await Promise.all(aeoChecks.map((c) => runPage(c, page("<html><head></head><body></body></html>"))));
    expect(results).toHaveLength(aeoChecks.length);
  });
  it("evaluates checks on raw HTML without a renderer", async () => {
    const homepage = page(fixture("content/marketing-homepage.html"));
    const outcomes = await Promise.all(aeoChecks.map((check) => runPage(check, homepage)));
    expect(outcomes.every((outcome) => outcome.status !== "skip")).toBe(true);
    const report = await runAudit(site([homepage]), createDefaultRegistry(), { pillars: ["aeo"] });
    expect(report.results).toHaveLength(aeoChecks.length);
    expect(report.results.every((result) => result.status !== "skip")).toBe(true);
  });
  it("warns when a homepage has no question headings instead of failing", async () => {
    const result = await runPage(aeoChecks.find((check) => check.id === "aeo.question-headings")!, page(fixture("content/marketing-homepage.html")));
    expect(result.status).toBe("warn");
  });
  it("uses the article fixture for question and freshness signals", async () => {
    const article = page(fixture("content/blog-article.html"));
    const outcomes = await Promise.all(aeoChecks.map((check) => runPage(check, article)));
    expect(outcomes).toHaveLength(aeoChecks.length);
    expect(outcomes.every((outcome) => outcome.message.length > 0)).toBe(true);
  });
});
