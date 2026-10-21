import { describe, expect, it } from "vitest";
import type { PageCheck } from "../../../src/check.ts";
import { seoChecks } from "../../../src/checks/seo/index.ts";
import { fixture, page, runPage, runSite, site } from "../../helpers.ts";
import { siteChecks } from "../../../src/checks/site/index.ts";
import { descriptionLength, descriptionPresent, titleLength, titlePresent } from "../../../src/checks/seo/on-page.ts";

describe("deterministic SEO checks", () => {
  const goodHtml = fixture("content/structured.html");
  it("runs every page check against a complete page fixture", async () => {
    const p = page(goodHtml, { url: "https://example.com/guide", finalUrl: "https://example.com/guide" });
    const results = await Promise.all(seoChecks.filter((c) => c.scope === "page").map((c) => runPage(c, p)));
    expect(results).toHaveLength(seoChecks.filter((c) => c.scope === "page").length);
    expect(results.every((r) => ["pass", "warn", "fail", "skip"].includes(r.status))).toBe(true);
  });
  it("records actual missing-field evidence on an edge page", async () => {
    const p = page("<html><head></head><body><main></main></body></html>");
    const results = await Promise.all(seoChecks.filter((c) => c.scope === "page").map((c) => runPage(c, p)));
    expect(results.every((r) => r && typeof r.message === "string")).toBe(true);
  });
  it("keeps title presence separate from title length", async () => {
    const longTitle = "A useful page title that is deliberately longer than sixty characters without being excessive";
    const p = page(`<html><head><title>${longTitle}</title></head><body></body></html>`);
    expect((await runPage(titlePresent, p)).status).toBe("pass");
    expect((await runPage(titleLength, p)).status).toBe("warn");
    expect((await runPage(titleLength, page(`<title>${"x".repeat(101)}</title>`))).status).toBe("fail");
    expect((await runPage(titleLength, page(`<title>${"x".repeat(9)}</title>`))).status).toBe("fail");
    expect((await runPage(titleLength, page(`<title>${"x".repeat(45)}</title>`))).status).toBe("pass");
  });
  it("keeps description presence separate from description length", async () => {
    const longDescription = "Northstar helps growing teams understand customers and improve retention with practical analytics that supports clear product decisions.";
    const p = page(`<head><meta name="description" content="${longDescription}"></head>`);
    expect((await runPage(descriptionPresent, p)).status).toBe("pass");
    expect((await runPage(descriptionLength, p)).status).toBe("pass");
    expect((await runPage(descriptionPresent, page('<meta name="description" content="">'))).status).toBe("fail");
    expect((await runPage(descriptionPresent, page('<meta name="description" content="A description"><meta name="description" content="Another description">'))).status).toBe("fail");
    expect((await runPage(descriptionLength, page('<meta name="description" content="Brief description">'))).status).toBe("warn");
  });
  it("registers site duplicate checks without page-level duplicates", () => {
    const ids = [...seoChecks, ...siteChecks].map((check) => check.id);
    expect(ids).toContain("seo.site.title.duplicates");
    expect(ids).toContain("seo.site.description.duplicates");
    expect(ids).not.toContain("seo.title.unique");
    expect(ids).not.toContain("seo.description.unique");
  });
  for (const check of seoChecks.filter((candidate): candidate is PageCheck => candidate.scope === "page")) {
    it(`${check.id} returns an outcome for marketing, article, and sparse fixtures`, async () => {
      const fixtures = [
        fixture("content/marketing-homepage.html"),
        fixture("content/blog-article.html"),
        "<html><head></head><body><main><img src='data:image/png;base64,AA'></main></body></html>",
      ];
      const outcomes = await Promise.all(fixtures.map((html) => runPage(check, page(html))));
      expect(outcomes).toHaveLength(3);
      expect(outcomes.every((outcome) => ["pass", "warn", "fail", "skip"].includes(outcome.status))).toBe(true);
      expect(outcomes.every((outcome) => typeof outcome.message === "string" && outcome.message.length > 0)).toBe(true);
    });
  }
  it("runs site checks on both linked and orphaned pages", async () => {
    const a = page(goodHtml, { url: "https://example.com/guide", finalUrl: "https://example.com/guide" });
    const b = page("<html><head><title>Second unique title for page</title></head><body><main><h1>Second</h1><p>Different content here.</p></main></body></html>", { url: "https://example.com/other", finalUrl: "https://example.com/other", depth: 4 });
    const s = site([a, b], { links: [{ from: a.url, to: b.url, anchor: "Other page", nofollow: false }], sitemaps: [{ url: "https://example.com/sitemap.xml", status: 200, entries: [{ loc: a.url }, { loc: b.url }] }] });
    const results = await Promise.all(siteChecks.map((c) => runSite(c, s)));
    expect(results).toHaveLength(siteChecks.length);
    expect(results.every((r) => ["pass", "warn", "fail", "skip"].includes(r.status))).toBe(true);
  });
});
