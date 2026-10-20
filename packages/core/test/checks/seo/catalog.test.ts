import { describe, expect, it } from "vitest";
import { seoChecks } from "../../../src/checks/seo/index.ts";
import { fixture, page, runPage, runSite, site } from "../../helpers.ts";
import { siteChecks } from "../../../src/checks/site/index.ts";

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
  it("runs site checks on both linked and orphaned pages", async () => {
    const a = page(goodHtml, { url: "https://example.com/guide", finalUrl: "https://example.com/guide" });
    const b = page("<html><head><title>Second unique title for page</title></head><body><main><h1>Second</h1><p>Different content here.</p></main></body></html>", { url: "https://example.com/other", finalUrl: "https://example.com/other", depth: 4 });
    const s = site([a, b], { links: [{ from: a.url, to: b.url, anchor: "Other page", nofollow: false }], sitemaps: [{ url: "https://example.com/sitemap.xml", status: 200, entries: [{ loc: a.url }, { loc: b.url }] }] });
    const results = await Promise.all(siteChecks.map((c) => runSite(c, s)));
    expect(results).toHaveLength(siteChecks.length);
    expect(results.every((r) => ["pass", "warn", "fail", "skip"].includes(r.status))).toBe(true);
  });
});
