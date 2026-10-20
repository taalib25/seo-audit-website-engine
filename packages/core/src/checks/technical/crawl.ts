import {
  definePageCheck,
  defineSiteCheck,
  fail,
  pass,
  skip,
  warn,
} from "../../check.ts";
import type { PageCheck, SiteCheck } from "../../check.ts";
import { header } from "../../extract/headers.ts";
import { matchRobots, parseRobots } from "../../extract/robots.ts";
import type { PageSnapshot, SiteSnapshot } from "../../snapshot.ts";
import {
  canonical,
  googleDocs,
  htmlText,
  indexable,
  normalize,
  pageMeta,
  robots,
  siteMeta,
  sitemapUrls,
} from "./shared.ts";

export const robotsFetchable = defineSiteCheck({
  ...siteMeta(
    "crawl.robots.fetchable",
    "robots.txt reachable and parseable",
    "crawlability",
    "high",
    4,
    ["robots"],
    "Broken directives can hide allowed/disallowed intent.",
    googleDocs,
  ),
  run: ({ site: s }) => {
    const f = s.robotsTxt;
    if (!f) return skip("robots.txt was not collected.");
    const parsed = parseRobots(f.body);
    if (f.status === 404)
      return warn("robots.txt is absent (valid no-rules behavior).", {
        evidence: { status: f.status },
      });
    if (f.status !== 200)
      return warn(`robots.txt returned ${f.status}.`, {
        evidence: { status: f.status },
      });
    return parsed.errors.length
      ? fail("robots.txt contains malformed directives.", {
          evidence: { errors: parsed.errors },
        })
      : pass("robots.txt returned 200 and parsed successfully.", {
          evidence: { groups: parsed.groups.length, sitemaps: parsed.sitemaps },
        });
  },
});

export const googlebotRobots = defineSiteCheck({
  ...siteMeta(
    "crawl.robots.googlebot",
    "Important URLs not disallowed to Googlebot",
    "crawlability",
    "critical",
    5,
    ["robots", "crawl-graph"],
    "Google cannot fetch blocked pages or needed render resources.",
    googleDocs,
  ),
  run: ({ site: s }) => {
    const d = robots(s);
    if (!d) return skip("robots.txt was not collected.");
    const urls = [
      s.startUrl,
      ...s.pages.map((p) => p.finalUrl),
      ...s.uncrawled,
    ];
    const blocks = urls
      .map((url) => ({ url, ...matchRobots(d, "Googlebot", url) }))
      .filter((x) => !x.allowed);
    const utility = blocks.every((b) =>
      /\/(?:admin|private|account|login|cart|checkout)(?:\/|$)/i.test(
        new URL(b.url).pathname,
      ),
    );
    if (blocks.length && utility)
      return warn(
        "Only explicitly non-indexable utility paths are blocked to Googlebot.",
        { evidence: { blocked: blocks } },
      );
    return blocks.length
      ? fail(`${blocks.length} important URL(s) are disallowed to Googlebot.`, {
          evidence: { blocked: blocks },
          fix: {
            summary:
              "Narrow rules to private or duplicate paths; allow important pages and assets.",
            snippet: blocks
              .map(
                (b) =>
                  `User-agent: Googlebot\nAllow: ${new URL(b.url).pathname}`,
              )
              .join("\n"),
          },
        })
      : pass(
          "No crawled or discovered target URL is disallowed to Googlebot.",
          { evidence: { checked: urls.length } },
        );
  },
});

export const httpStatus = definePageCheck({
  ...pageMeta(
    "crawl.http.status",
    "Intended landing pages return success",
    "crawlability",
    "critical",
    5,
    ["headers"],
    "Non-success responses frustrate users and discovery.",
    "https://developers.google.com/search/docs/crawling-indexing/http-network-errors",
  ),
  run: ({ page: p, site: s }) => {
    const hops = p.redirectChain.length;
    const startUrl = normalize(s.startUrl);
    const requestedUrl = normalize(p.url);
    const finalUrl = normalize(p.finalUrl);
    const linkedFrom = s.links
      .filter((link) => normalize(link.to) === requestedUrl)
      .map((link) => link.from);
    const listedInSitemap = sitemapUrls(s).some(
      (url) => normalize(url) === requestedUrl || normalize(url) === finalUrl,
    );
    const evidence = {
      status: p.status,
      redirects: hops,
      finalUrl: p.finalUrl,
      startUrl: requestedUrl === startUrl,
      listedInSitemap,
      linkingPages: linkedFrom,
    };
    if (p.status === 200 && hops <= 1) {
      if (hops === 0 || requestedUrl === startUrl || listedInSitemap)
        return pass("Page returns 200 without a redirect issue.", { evidence });
      if (linkedFrom.length > 0)
        return warn("Internal links point to a URL that redirects to 200.", {
          evidence,
        });
      return pass("Page reaches 200 after a single redirect hop.", {
        evidence,
      });
    }
    if (p.status === 200 && hops > 1)
      return warn("Page reaches 200 after multiple redirect hops.", {
        evidence,
      });
    return fail(`Page returned ${p.status} after ${hops} redirect(s).`, {
      evidence,
      fix: {
        summary:
          "Restore the page or redirect directly to its closest replacement.",
      },
    });
  },
});

export const noindex = definePageCheck({
  ...pageMeta(
    "crawl.index.noindex",
    "Indexable page has no accidental noindex",
    "crawlability",
    "critical",
    5,
    ["raw-html", "headers"],
    "Noindex excludes the page from search indexing.",
    "https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag",
  ),
  run: ({ page: p, raw }) => {
    const metas = raw()('meta[name="robots" i], meta[name="googlebot" i]')
      .toArray()
      .map((x) => raw()(x).attr("content") ?? "");
    const x = header(p.headers, "x-robots-tag") ?? "";
    const sources = [...metas, x].filter(Boolean);
    const blocked = sources.some((v) => /(?:^|[,;\s])noindex\b/i.test(v));
    const mixed =
      new Set(sources.map((v) => /(?:^|[,;\s])noindex\b/i.test(v))).size > 1;
    const evidence = { directives: sources, noindex: blocked };
    if (mixed)
      return warn("Robots directives conflict across sources.", { evidence });
    if (blocked)
      return fail("Page sends an effective noindex directive.", {
        evidence,
        fix: {
          summary: "Remove unintended noindex and leave crawl access open.",
          snippet: '<meta name="robots" content="index,follow">',
        },
      });
    return pass("No noindex directive found.", { evidence });
  },
});

export const canonicalPresent = definePageCheck({
  ...pageMeta(
    "crawl.canonical.present",
    "Canonical is singular and valid",
    "crawlability",
    "high",
    4,
    ["raw-html", "headers"],
    "Canonicals consolidate duplicate URL signals.",
    "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
  ),
  run: ({ page: p, raw, site: s }) => {
    const links = raw()('link[rel~="canonical" i]')
      .toArray()
      .map((x) => raw()(x).attr("href") ?? "");
    const target = links[0] ? new URL(links[0], p.finalUrl) : undefined;
    const found = target?.href;
    const targetPage = s.pages.find(
      (x) =>
        normalize(x.finalUrl) === normalize(found ?? "https://invalid.local"),
    );
    const evidence = {
      count: links.length,
      hrefs: links,
      absolute: Boolean(target && /^https?:$/.test(target.protocol)),
      targetStatus: targetPage?.status,
    };
    if (links.length > 1)
      return fail("Multiple canonical links were found.", { evidence });
    if (!found)
      return warn("No canonical link was found.", {
        evidence,
        fix: { summary: "Emit one absolute canonical to the preferred URL." },
      });
    if (!/^https?:$/.test(target?.protocol ?? ""))
      return warn("Canonical URL is not HTTP(S).", { evidence });
    if (targetPage?.status === 200)
      return pass("Canonical is singular, absolute, and target returned 200.", {
        evidence,
      });
    if (targetPage && targetPage.status >= 400)
      return fail("Canonical target returns an error.", { evidence });
    return warn(
      "Canonical target was not crawled or its successful status is unverified.",
      { evidence },
    );
  },
});

export const canonicalConsistency = defineSiteCheck({
  ...siteMeta(
    "crawl.canonical.self-consistent",
    "Canonical agrees with sitemap and internal links",
    "crawlability",
    "high",
    4,
    ["raw-html", "sitemap", "crawl-graph"],
    "Mixed canonical hints weaken consolidation.",
    "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
  ),
  run: ({ site: s }) => {
    if (!s.pages.length)
      return skip("No crawled pages are available for canonical comparison.");
    let conflicts = 0;
    const details = s.pages.flatMap((p) => {
      const c = canonical(p);
      if (!c) return [];
      const u = normalize(p.finalUrl);
      const signals = [
        sitemapUrls(s).some((x) => normalize(x) === u) ? u : undefined,
        s.links.some((l) => normalize(l.to) === u) ? u : undefined,
      ].filter((x): x is string => Boolean(x));
      const mismatch = normalize(c) !== u && signals.length > 0;
      if (mismatch) conflicts++;
      return mismatch ? [{ url: p.finalUrl, canonical: c, signals }] : [];
    });
    return conflicts === 0
      ? pass(
          "Canonical, sitemap, and internal link signals show no detected conflicts.",
          { evidence: { pages: s.pages.length } },
        )
      : conflicts > 1
        ? fail(`${conflicts} canonical signal conflicts found.`, {
            evidence: { conflicts: details },
            fix: {
              summary:
                "Point canonicals, sitemap, and internal links at one preferred URL.",
            },
          })
        : warn("One canonical signal conflict found.", {
            evidence: { conflicts: details },
          });
  },
});

export const sitemapValid = defineSiteCheck({
  ...siteMeta(
    "crawl.sitemap.valid",
    "Sitemap is valid and accessible",
    "crawlability",
    "high",
    4,
    ["sitemap"],
    "Sitemaps aid URL discovery at scale.",
    "https://www.sitemaps.org/protocol.html",
  ),
  run: ({ site: s }) => {
    if (!s.sitemaps.length) return skip("No sitemap files were collected.");
    const bad = s.sitemaps.filter(
      (m) => m.status !== 200 || m.entries.length > 50000,
    );
    const near = s.sitemaps.filter((m) => m.entries.length > 45000);
    if (bad.length)
      return fail(
        "One or more sitemap files are unavailable or exceed 50,000 entries.",
        {
          evidence: {
            invalid: bad.map((m) => ({
              url: m.url,
              status: m.status,
              entries: m.entries.length,
            })),
          },
        },
      );
    return near.length
      ? warn("Sitemap is valid but near the 50,000 URL limit.", {
          evidence: { nearLimit: near.map((m) => m.url) },
        })
      : pass(
          "Collected sitemap files returned 200 and are within URL limits. XML syntax and byte size are not present in the snapshot and are not inferred.",
          {
            evidence: { count: s.sitemaps.length, xmlAndBytesVerified: false },
          },
        );
  },
});

export const sitemapQuality = defineSiteCheck({
  ...siteMeta(
    "crawl.sitemap.url-quality",
    "Sitemap lists canonical indexable URLs only",
    "crawlability",
    "high",
    4,
    ["sitemap", "headers", "raw-html"],
    "Sitemap should describe preferred live content.",
    "https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview",
  ),
  run: ({ site: s }) => {
    const urls = sitemapUrls(s);
    if (!urls.length) return skip("No sitemap URLs were collected.");
    const bad = urls.filter((u) => {
      const p = s.pages.find((x) => normalize(x.finalUrl) === normalize(u));
      return (
        new URL(u).host !== new URL(s.origin).host ||
        (p !== undefined &&
          (p.status !== 200 ||
            !indexable(p) ||
            (canonical(p) !== undefined &&
              normalize(canonical(p)!) !== normalize(u))))
      );
    });
    const pct = (bad.length / urls.length) * 100;
    const evidence = { total: urls.length, invalid: bad, invalidPercent: pct };
    return pct === 0
      ? pass(
          "All sampled sitemap URLs are same-host, live, indexable canonical URLs.",
          { evidence },
        )
      : pct <= 5
        ? warn(`${bad.length} sitemap URL(s) (${pct.toFixed(1)}%) are stray.`, {
            evidence,
          })
        : fail(`${bad.length} sitemap URL(s) (${pct.toFixed(1)}%) are stray.`, {
            evidence,
            fix: {
              summary:
                "Remove redirects, errors, noncanonical and noindex URLs from the sitemap.",
            },
          });
  },
});

export const renderMainContent = definePageCheck({
  ...pageMeta(
    "crawl.render.main-content",
    "Main content exists before client JS",
    "crawlability",
    "high",
    5,
    ["raw-html", "rendered-dom"],
    "Many retrieval crawlers do not execute full page JavaScript.",
    "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics",
  ),
  run: ({ page: p, raw, dom }) => {
    if (p.renderedHtml === undefined)
      return skip("Rendered DOM is unavailable for comparison.");
    const rawText = htmlText(raw()("main").text() || raw()("body").text());
    const renderedText = htmlText(dom()("main").text() || dom()("body").text());
    const rawHeading = raw()("h1").length > 0;
    const ratio = renderedText.length
      ? rawText.length / renderedText.length
      : 1;
    const evidence = {
      rawChars: rawText.length,
      renderedChars: renderedText.length,
      ratio,
      rawHeading,
    };
    if (!rawText || !rawHeading || ratio < 0.3)
      return fail("Main content is mostly absent from source HTML.", {
        evidence,
        fix: { summary: "Server-render or pre-render core content and links." },
      });
    if (ratio < 0.7)
      return warn("Some main content appears only after rendering.", {
        evidence,
      });
    return pass(
      "Source HTML includes the primary heading and at least 70% of rendered main text.",
      { evidence },
    );
  },
});

export const crawlChecks = [
  robotsFetchable,
  googlebotRobots,
  httpStatus,
  noindex,
  canonicalPresent,
  canonicalConsistency,
  sitemapValid,
  sitemapQuality,
  renderMainContent,
];
