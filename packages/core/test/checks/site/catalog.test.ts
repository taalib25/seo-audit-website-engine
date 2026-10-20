import { describe, expect, it } from "vitest";
import { siteChecks } from "../../../src/checks/site/index.ts";
import { fixture, page, runSite, site } from "../../helpers.ts";

describe("deterministic site checks", () => {
  it("returns an outcome for each site check on a multi-page fixture", async () => {
    const html = fixture("content/structured.html");
    const a = page(html, { url: "https://example.com/guide", finalUrl: "https://example.com/guide" });
    const b = page(html.replace("Example guide", "Other guide"), { url: "https://example.com/other", finalUrl: "https://example.com/other", depth: 4 });
    const snapshot = site([a, b], { links: [{ from: a.url, to: b.url, anchor: "Other guide", nofollow: false }], sitemaps: [{ url: "https://example.com/sitemap.xml", status: 200, entries: [{ loc: a.url }, { loc: b.url }] }] });
    const outcomes = await Promise.all(siteChecks.map((check) => runSite(check, snapshot)));
    expect(outcomes).toHaveLength(siteChecks.length);
    expect(outcomes.every((outcome) => outcome.message.length > 0)).toBe(true);
  });
  it("handles empty crawl data without throwing", async () => {
    const outcomes = await Promise.all(siteChecks.map((check) => runSite(check, site([]))));
    expect(outcomes).toHaveLength(siteChecks.length);
  });
  it("does not infer orphan pages from sitemap URLs outside a partial crawl", async () => {
    const homepage = page(fixture("content/marketing-homepage.html"));
    const sitemapEntries = Array.from({ length: 568 }, (_, index) => ({ loc: `https://example.com/page-${index}` }));
    const outcome = await runSite(siteChecks.find((check) => check.id === "seo.site.orphan-pages")!, site([homepage], {
      sitemaps: [{ url: "https://example.com/sitemap.xml", status: 200, entries: sitemapEntries }],
    }));
    expect(outcome.status).toBe("skip");
    expect(outcome.message).toContain("larger --pages crawl is needed");
    expect(outcome.evidence).toMatchObject({ sitemapUrlCount: 568, crawledSitemapUrlCount: 0, coverage: 0 });
  });
  it("skips site-wide absence checks when crawl coverage is too small", async () => {
    const homepage = page(fixture("content/marketing-homepage.html"));
    const snapshot = site([homepage], {
      sitemaps: [{ url: "https://example.com/sitemap.xml", status: 200, entries: [{ loc: homepage.url }, { loc: "https://example.com/unseen" }] }],
    });
    for (const id of ["seo.site.nav-depth", "seo.site.canonical-clusters"]) {
      const outcome = await runSite(siteChecks.find((check) => check.id === id)!, snapshot);
      expect(outcome.status).toBe("skip");
      expect(outcome.message).toContain("larger --pages crawl is needed");
      expect(outcome.evidence).toHaveProperty("coverage");
    }
    const internal404 = await runSite(siteChecks.find((check) => check.id === "seo.site.internal-404-rate")!, snapshot);
    expect(internal404.status).toBe("skip");
    expect(internal404.evidence).toHaveProperty("coverage");
  });
  for (const check of siteChecks) {
    it(`${check.id} returns an outcome for complete, partial, and empty crawl fixtures`, async () => {
      const homepage = page(fixture("content/marketing-homepage.html"));
      const article = page(fixture("content/blog-article.html"), {
        url: "https://example.com/insights/customer-retention-guide",
        finalUrl: "https://example.com/insights/customer-retention-guide",
        depth: 2,
      });
      const completePages = [homepage, article, ...Array.from({ length: 3 }, (_, index) => page(
        `<html lang="en"><head><title>Resource ${index + 1} for customers</title><meta name="description" content="A distinct resource description for customer teams and their work."></head><body><main><h1>Resource ${index + 1}</h1><p>Useful guidance for customer teams.</p></main></body></html>`,
        { url: `https://example.com/resources/${index + 1}`, finalUrl: `https://example.com/resources/${index + 1}`, depth: index + 1 },
      ))];
      const sitemapEntries = completePages.map((item) => ({ loc: item.url }));
      const complete = site(completePages, {
        links: completePages.slice(1).map((item) => ({ from: homepage.url, to: item.url, anchor: "Useful resource", nofollow: false })),
        sitemaps: [{ url: "https://example.com/sitemap.xml", status: 200, entries: sitemapEntries }],
        robotsTxt: { url: "https://example.com/robots.txt", status: 200, body: "Sitemap: https://example.com/sitemap.xml" },
      });
      const partial = site([homepage], {
        links: [{ from: homepage.url, to: "https://example.com/unseen", anchor: "Unseen", nofollow: false }],
        sitemaps: [{ url: "https://example.com/sitemap.xml", status: 200, entries: [{ loc: homepage.url }, { loc: "https://example.com/unseen" }] }],
      });
      const outcomes = await Promise.all([complete, partial, site([])].map((snapshot) => runSite(check, snapshot)));
      expect(outcomes).toHaveLength(3);
      expect(outcomes.every((outcome) => typeof outcome.message === "string" && outcome.message.length > 0)).toBe(true);
      expect(outcomes.every((outcome) => ["pass", "warn", "fail", "skip"].includes(outcome.status))).toBe(true);
    });
  }
});
