import { definePageCheck, defineSiteCheck, fail, pass, warn } from "../../check.ts";
import { canonicalUrl, extractLinks, pageForUrl } from "../../extract/links.ts";

export const internalCrawlable = definePageCheck({
  id: "seo.links.internal-crawlable",
  title: "Internal destinations use crawlable anchors",
  pillar: "seo",
  category: "links",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["raw-html"],
  rationale: "Standard anchors help crawlers discover pages.",
  run: ({ raw, dom, page, site }) => {
    const rawLinks = extractLinks(raw(), page.url, site.origin);
    const visibleLinks = extractLinks(dom(), page.url, site.origin);
    const rawTargets = new Set(rawLinks.map((link) => link.to));
    const renderedOnly = visibleLinks.filter((link) => !rawTargets.has(link.to));
    const ratio = visibleLinks.length ? (visibleLinks.length - renderedOnly.length) / visibleLinks.length : 1;
    const evidence = {
      internalAnchorCount: visibleLinks.length,
      rawAnchorCount: rawLinks.length,
      renderedOnly: renderedOnly.slice(0, 20).map((link) => ({ url: link.to, anchor: link.anchor })),
      ratio: Number(ratio.toFixed(3)),
    };
    const fix = { summary: "Use real <a href> links for internal navigation and key content paths." };
    if (ratio < 0.8) return fail(`Only ${Math.round(ratio * 100)}% of rendered internal anchors exist in raw HTML.`, { evidence, fix });
    if (ratio < 0.95) return warn(`Only ${Math.round(ratio * 100)}% of rendered internal anchors exist in raw HTML.`, { evidence, fix });
    return pass("Internal anchors are crawlable in the initial HTML.", { evidence });
  },
});

export const internalBroken = defineSiteCheck({
  id: "seo.links.internal-broken",
  title: "Internal links resolve",
  pillar: "seo",
  category: "links",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["crawl-graph", "headers"],
  rationale: "Broken links interrupt users and waste crawl paths.",
  run: ({ site }) => {
    const broken = site.links.flatMap((link) => {
      const target = pageForUrl(site, link.to);
      return target && target.status >= 400 ? [{ link, target }] : [];
    });
    const rate = site.links.length ? broken.length / site.links.length : 0;
    const evidence = {
      brokenCount: broken.length,
      linkCount: site.links.length,
      rate: Number(rate.toFixed(4)),
      broken: broken.slice(0, 30).map(({ link, target }) => ({ from: link.from, to: link.to, anchor: link.anchor, status: target.status })),
    };
    const fix = { summary: "Repair broken destinations or update source links to their live replacements." };
    if (rate > 0.01) return fail(`${broken.length} internal links target error pages.`, { evidence, fix });
    if (broken.length) return warn(`${broken.length} internal links target error pages.`, { evidence, fix });
    return pass("No crawled internal links target error pages.", { evidence });
  },
});

export const orphaned = defineSiteCheck({
  id: "seo.links.orphaned",
  title: "Important crawled pages have inbound links",
  pillar: "seo",
  category: "links",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["crawl-graph", "sitemap"],
  rationale: "Pages reachable by links are easier to discover and navigate to.",
  run: ({ site }) => {
    const inbound = new Set(site.links
      .filter((link) => canonicalUrl(link.from) !== canonicalUrl(link.to))
      .map((link) => canonicalUrl(link.to)));
    const sitemap = new Set(site.sitemaps.flatMap((map) => map.entries.map((entry) => canonicalUrl(entry.loc))));
    const targets = site.pages.filter((page) => sitemap.has(canonicalUrl(page.url)));
    const orphan = targets.filter((page) => !inbound.has(canonicalUrl(page.url)));
    const evidence = { sitemapPageCount: targets.length, orphanCount: orphan.length, orphanUrls: orphan.slice(0, 30).map((page) => page.url) };
    const fix = { summary: "Link orphaned sitemap pages from a relevant reachable hub or parent page." };
    return orphan.length
      ? fail(`${orphan.length} crawled sitemap pages have no inbound internal link.`, { evidence, fix })
      : pass("Crawled sitemap pages have inbound internal links.", { evidence });
  },
});

export const depth = defineSiteCheck({
  id: "seo.links.depth",
  title: "Priority pages are reachable within 3 clicks",
  pillar: "seo",
  category: "links",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["crawl-graph"],
  rationale: "Deep paths make important content harder to find and crawl.",
  run: ({ site }) => {
    const deep = site.pages.filter((page) => page.depth > 3);
    const unreachable = site.uncrawled.slice(0, 30);
    const evidence = { deepPages: deep.slice(0, 30).map((page) => ({ url: page.url, depth: page.depth })), deepCount: deep.length, uncrawled: unreachable };
    const fix = { summary: "Add links from navigation or topic hubs to priority pages within three clicks." };
    if (deep.some((page) => page.depth > 5)) return fail(`${deep.length} pages are deeper than three clicks or uncrawled destinations remain.`, { evidence, fix });
    if (deep.length) return warn(`${deep.length} pages are deeper than three clicks.`, { evidence, fix });
    if (unreachable.length) return warn(`${unreachable.length} discovered destinations were not crawled, so depth coverage is incomplete.`, { evidence });
    return pass("All crawled pages are within three clicks.", { evidence });
  },
});

export const redirectChain = defineSiteCheck({
  id: "seo.links.redirect-chain",
  title: "Internal links point to final destinations",
  pillar: "seo",
  category: "links",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["crawl-graph", "headers"],
  rationale: "Redirecting links waste requests and slow users.",
  run: ({ site }) => {
    const redirected = site.links.map((link) => ({ ...link, page: pageForUrl(site, link.to) }))
      .filter((link) => link.page && link.page.url !== link.page.finalUrl);
    const evidence = {
      redirectedCount: redirected.length,
      examples: redirected.slice(0, 30).map((link) => ({ from: link.from, to: link.to, finalUrl: link.page?.finalUrl, anchor: link.anchor })),
    };
    const fix = { summary: "Update internal hrefs to point directly to each final URL." };
    return redirected.length
      ? warn(`${redirected.length} internal links point to redirected pages.`, { evidence, fix })
      : pass("Internal links point to final destinations.", { evidence });
  },
});

export const outboundQualification = definePageCheck({
  id: "seo.links.outbound-ugc-sponsorship",
  title: "Paid and user-generated links are qualified",
  pillar: "seo",
  category: "links",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html"],
  rationale: "Qualification clarifies link relationships to search engines.",
  run: ({ raw, page, site }) => {
    const missing: { url: string; anchor: string; rel: string }[] = [];
    raw()("a[href]").each((_, element) => {
      const href = raw()(element).attr("href") ?? "";
      if (!href) return;
      const target = new URL(href, page.url);
      if (target.hostname.replace(/^www\./, "") === new URL(site.origin).hostname.replace(/^www\./, "")) return;
      const rel = raw()(element).attr("rel") ?? "";
      const className = raw()(element).attr("class") ?? "";
      if (/(sponsored|paid|affiliate|user.?generated|comment)/i.test(`${rel} ${className}`)
        && !/(sponsored|ugc|nofollow)/i.test(rel)) {
        missing.push({ url: href, anchor: raw()(element).text().trim(), rel });
      }
    });
    const evidence = { missingQualification: missing.slice(0, 20), count: missing.length };
    const fix = { summary: "Qualify paid links with rel=sponsored and untrusted user links with rel=ugc or nofollow." };
    return missing.length
      ? warn(`${missing.length} potentially paid or UGC links are unqualified.`, { evidence, fix })
      : pass("No unqualified paid or UGC links were detected.", { evidence });
  },
});

export const linkChecks = [internalCrawlable, internalBroken, orphaned, depth, redirectChain, outboundQualification];
