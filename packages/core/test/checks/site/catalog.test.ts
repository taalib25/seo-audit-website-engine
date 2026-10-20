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
});
