import { describe, expect, it } from "vitest";
import { fixture, page, runPage, runSite, site } from "../../helpers.ts";
import { technicalChecks, robotsFetchable, googlebotRobots, httpStatus, noindex, canonicalPresent, sitemapValid, renderMainContent, chatgptUserReachability, fieldLcp, mixedContent, hreflangValid, securityChecks, longTaskProxy, payloadOversize } from "../../../src/checks/technical/index.ts";

const good = fixture("technical/indexable.html");
describe("technical checks", () => {
  it("exports all catalog checks with stable metadata", () => {
    expect(technicalChecks.length).toBeGreaterThanOrEqual(32);
    expect(new Set(technicalChecks.map((c) => c.id)).size).toBe(technicalChecks.length);
    for (const c of technicalChecks) {
      expect(c.id).toMatch(/^(seo|geo)\./);
      expect(c.kind).toBe("deterministic");
      expect(c.docs).toMatch(/^https:\/\//);
      expect(c.rationale.length).toBeGreaterThan(10);
    }
  });
  it("evaluates robots fetchability and target rules", async () => {
    const p = page(good);
    expect((await runSite(robotsFetchable, site([p], { robotsTxt: { url: "https://example.com/robots.txt", status: 200, body: "User-agent: *\nAllow: /" } }))).status).toBe("pass");
    expect((await runSite(robotsFetchable, site([p], { robotsTxt: { url: "https://example.com/robots.txt", status: 200, body: "Allow: /" } }))).status).toBe("fail");
    expect((await runSite(googlebotRobots, site([p], { robotsTxt: { url: "https://example.com/robots.txt", status: 200, body: "User-agent: *\nDisallow: /" } }))).status).toBe("fail");
  });
  it("checks status, noindex and canonical edge cases", async () => {
    expect((await runPage(httpStatus, page(good))).status).toBe("pass");
    expect((await runPage(httpStatus, page(good, { status: 503 }))).status).toBe("fail");
    expect((await runPage(noindex, page(good.replace("<head>", '<head><meta name="robots" content="noindex">')))).status).toBe("fail");
    expect((await runPage(noindex, page("<html><head></head><body></body></html>"))).status).toBe("pass");
    expect((await runPage(canonicalPresent, page(good))).status).toBe("pass");
    expect((await runPage(canonicalPresent, page(fixture("technical/shell.html")))).status).toBe("warn");
  });
  it("handles absent and invalid sitemap artifacts", async () => {
    expect((await runSite(sitemapValid, site([page(good)]))).status).toBe("warn");
    const s = site([page(good)], { sitemaps: [{ url: "https://example.com/map.xml", status: 500, entries: [] }] });
    expect((await runSite(sitemapValid, s)).status).toBe("fail");
  });
  it("compares raw and rendered content and skips without a render", async () => {
    expect((await runPage(renderMainContent, page(good, { renderedHtml: good }))).status).toBe("pass");
    expect((await runPage(renderMainContent, page(fixture("technical/shell.html"), { renderedHtml: good }))).status).toBe("fail");
    expect((await runPage(renderMainContent, page(good))).status).toBe("skip");
  });
  it("reports choices and skips data absent from the snapshot", async () => {
    const p = page(good);
    expect((await runSite(chatgptUserReachability, site([p]))).status).toBe("skip");
    expect((await runPage(fieldLcp, p)).status).toBe("skip");
  });
  it("checks mixed content, hreflang, and available performance proxies", async () => {
    expect((await runPage(mixedContent, page(good))).status).toBe("pass");
    expect((await runPage(mixedContent, page(good.replace("</main>", "<script src='http://cdn.test/a.js'></script></main>")))).status).toBe("fail");
    expect((await runPage(hreflangValid, page(good))).status).toBe("pass");
    expect((await runPage(longTaskProxy, page(good, { renderedHtml: good }))).status).toBe("pass");
    expect((await runPage(longTaskProxy, page(good))).status).toBe("skip");
    expect((await runPage(payloadOversize, page(good, { headers: { "content-length": "6000000" } }))).status).toBe("fail");
  });
  it("includes security header findings", async () => {
    const s = site([page(good)]);
    expect(securityChecks).toHaveLength(4);
    expect((await runSite(securityChecks[1]!, s)).status).toBe("fail");
    expect((await runSite(securityChecks[2]!, site([page(good, { headers: { "content-security-policy-report-only": "default-src 'self'" } })]))).status).toBe("warn");
  });
});
