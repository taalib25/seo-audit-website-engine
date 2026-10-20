import { describe, expect, it } from "vitest";
import { fixture, page, runPage, runSite, site } from "../../helpers.ts";
import {
  technicalChecks,
  robotsFetchable,
  googlebotRobots,
  httpStatus,
  noindex,
  canonicalPresent,
  sitemapValid,
  renderMainContent,
  chatgptUserReachability,
  fieldLcp,
  mixedContent,
  hreflangValid,
  securityChecks,
  longTaskProxy,
  payloadOversize,
  aiBotChecks,
} from "../../../src/checks/technical/index.ts";

const good = fixture("technical/indexable.html");
describe("technical checks", () => {
  it("exports all catalog checks with stable metadata", () => {
    expect(technicalChecks.length).toBeGreaterThanOrEqual(32);
    expect(new Set(technicalChecks.map((c) => c.id)).size).toBe(
      technicalChecks.length,
    );
    for (const c of technicalChecks) {
      expect(c.id).toMatch(/^(seo|geo)\./);
      expect(c.kind).toBe("deterministic");
      expect(c.docs).toMatch(/^https:\/\//);
      expect(c.rationale.length).toBeGreaterThan(10);
    }
  });
  it("handles an empty-evidence edge fixture for every technical check", async () => {
    const emptyPage = page("");
    const emptySite = site([], {
      sitemaps: [],
      links: [],
    });
    for (const check of technicalChecks) {
      const result =
        check.scope === "page"
          ? await runPage(check, emptyPage, emptySite)
          : await runSite(check, emptySite);
      expect(result.status, check.id).not.toBe("error");
      if (check.id === "seo.crawl.sitemap.valid")
        expect(result.status, check.id).toBe("skip");
      if (check.id === "seo.crawl.canonical.self-consistent")
        expect(result.status, check.id).toBe("skip");
    }
  });
  it("evaluates robots fetchability and target rules", async () => {
    const p = page(good);
    expect(
      (
        await runSite(
          robotsFetchable,
          site([p], {
            robotsTxt: {
              url: "https://example.com/robots.txt",
              status: 200,
              body: "User-agent: *\nAllow: /",
            },
          }),
        )
      ).status,
    ).toBe("pass");
    expect(
      (
        await runSite(
          robotsFetchable,
          site([p], {
            robotsTxt: {
              url: "https://example.com/robots.txt",
              status: 200,
              body: "Allow: /",
            },
          }),
        )
      ).status,
    ).toBe("fail");
    expect(
      (
        await runSite(
          googlebotRobots,
          site([p], {
            robotsTxt: {
              url: "https://example.com/robots.txt",
              status: 200,
              body: "User-agent: *\nDisallow: /",
            },
          }),
        )
      ).status,
    ).toBe("fail");
  });
  it("checks status, noindex and canonical edge cases", async () => {
    expect((await runPage(httpStatus, page(good))).status).toBe("pass");
    expect(
      (await runPage(httpStatus, page(good, { status: 503 }))).status,
    ).toBe("fail");
    expect(
      (
        await runPage(
          noindex,
          page(
            good.replace(
              "<head>",
              '<head><meta name="robots" content="noindex">',
            ),
          ),
        )
      ).status,
    ).toBe("fail");
    expect(
      (await runPage(noindex, page("<html><head></head><body></body></html>")))
        .status,
    ).toBe("pass");
    expect((await runPage(canonicalPresent, page(good))).status).toBe("pass");
    expect(
      (await runPage(canonicalPresent, page(fixture("technical/shell.html"))))
        .status,
    ).toBe("warn");
  });
  it("treats a one-hop redirect as link hygiene only when internal links point to it", async () => {
    const redirecting = page(good, {
      url: "https://example.com/old",
      finalUrl: "https://example.com/new",
      redirectChain: ["https://example.com/new"],
    });
    expect((await runPage(httpStatus, redirecting)).status).toBe("pass");
    const linkedSite = site([redirecting], {
      startUrl: "https://example.com/",
      links: [
        {
          from: "https://example.com/",
          to: redirecting.url,
          anchor: "old",
          nofollow: false,
        },
      ],
    });
    const linked = await runPage(httpStatus, redirecting, linkedSite);
    expect(linked.status).toBe("warn");
    expect(linked.evidence).toMatchObject({
      linkingPages: ["https://example.com/"],
    });
    const deepRedirect = page(good, {
      redirectChain: ["https://example.com/a", "https://example.com/"],
    });
    expect((await runPage(httpStatus, deepRedirect)).status).toBe("warn");
  });
  it("handles absent and invalid sitemap artifacts", async () => {
    expect((await runSite(sitemapValid, site([page(good)]))).status).toBe(
      "skip",
    );
    const s = site([page(good)], {
      sitemaps: [
        { url: "https://example.com/map.xml", status: 500, entries: [] },
      ],
    });
    expect((await runSite(sitemapValid, s)).status).toBe("fail");
  });
  it("compares raw and rendered content and skips without a render", async () => {
    expect(
      (await runPage(renderMainContent, page(good, { renderedHtml: good })))
        .status,
    ).toBe("pass");
    expect(
      (
        await runPage(
          renderMainContent,
          page(fixture("technical/shell.html"), { renderedHtml: good }),
        )
      ).status,
    ).toBe("fail");
    expect((await runPage(renderMainContent, page(good))).status).toBe("skip");
  });
  it("reports choices and skips data absent from the snapshot", async () => {
    const p = page(good);
    expect((await runSite(chatgptUserReachability, site([p]))).status).toBe(
      "skip",
    );
    expect((await runPage(fieldLcp, p)).status).toBe("skip");
  });
  it("passes wildcard retrieval access and treats training access as an operator choice", async () => {
    const p = page(good);
    const wildcard = site([p], {
      robotsTxt: {
        url: "https://example.com/robots.txt",
        status: 200,
        body: "User-agent: *\nAllow: /",
      },
    });
    const retrieval = await runSite(aiBotChecks[0]!, wildcard);
    expect(retrieval.status).toBe("pass");
    expect(retrieval.evidence).toMatchObject({ explicitRule: false });

    const blockedStart = site([p], {
      robotsTxt: {
        url: "https://example.com/robots.txt",
        status: 200,
        body: "User-agent: *\nDisallow: /",
      },
    });
    expect((await runSite(aiBotChecks[0]!, blockedStart)).status).toBe("fail");

    const blockedTraining = site([p], {
      robotsTxt: {
        url: "https://example.com/robots.txt",
        status: 200,
        body: "User-agent: GPTBot\nDisallow: /",
      },
    });
    const trainingResult = await runSite(aiBotChecks[1]!, blockedTraining);
    expect(trainingResult.status).toBe("pass");
    expect(aiBotChecks[1]?.severity).toBe("info");
  });
  it("checks mixed content, hreflang, and available performance proxies", async () => {
    expect((await runPage(mixedContent, page(good))).status).toBe("pass");
    expect(
      (
        await runPage(
          mixedContent,
          page(
            good.replace(
              "</main>",
              "<script src='http://cdn.test/a.js'></script></main>",
            ),
          ),
        )
      ).status,
    ).toBe("fail");
    expect((await runPage(hreflangValid, page(good))).status).toBe("pass");
    expect(
      (await runPage(longTaskProxy, page(good, { renderedHtml: good }))).status,
    ).toBe("pass");
    expect((await runPage(longTaskProxy, page(good))).status).toBe("skip");
    expect(
      (
        await runPage(
          payloadOversize,
          page(good, { headers: { "content-length": "6000000" } }),
        )
      ).status,
    ).toBe("fail");
  });
  it("includes security header findings", async () => {
    const s = site([page(good)]);
    expect(securityChecks).toHaveLength(4);
    expect((await runSite(securityChecks[1]!, s)).status).toBe("fail");
    expect(
      (
        await runSite(
          securityChecks[2]!,
          site([
            page(good, {
              headers: {
                "content-security-policy-report-only": "default-src 'self'",
              },
            }),
          ]),
        )
      ).status,
    ).toBe("warn");
  });
});
