import * as cheerio from "cheerio";
import { defineSiteCheck, fail, pass, warn } from "../../check.ts";
import { mainText, normalizeText, wordCount } from "../../extract/text.ts";
import { canonicalUrl, pageForUrl } from "../../extract/links.ts";
import type { SiteSnapshot } from "../../snapshot.ts";

function fields(site: SiteSnapshot, selector: string): { value: string; url: string }[] {
  return site.pages
    .map((page) => {
      const $ = cheerio.load(page.rawHtml);
      const node = $(selector).first();
      const value = selector.startsWith("meta[") ? node.attr("content") ?? "" : node.text();
      return { value: value.replace(/\s+/g, " ").trim(), url: page.url };
    })
    .filter((row) => row.value.length > 0);
}
function duplicateGroups(rows: { value: string; url: string }[]) {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const key = row.value.toLowerCase().replace(/\s+/g, " ");
    groups.set(key, [...(groups.get(key) ?? []), row.url]);
  }
  return [...groups]
    .filter(([, urls]) => urls.length > 1)
    .map(([value, urls]) => ({ value, urls: urls.slice(0, 12) }));
}

function duplicateCheck(id: string, title: string, selector: string, rationale: string) {
  return defineSiteCheck({
    id,
    title,
    pillar: "seo",
    category: "site",
    kind: "deterministic",
    severity: "medium",
    weight: 3,
    requires: ["raw-html", "crawl-graph"],
    rationale,
    run: ({ site }) => {
      const groups = duplicateGroups(fields(site, selector));
      const evidence = {
        duplicateGroups: groups.slice(0, 20),
        duplicateGroupCount: groups.length,
        crawledPageCount: site.pages.length,
        uncrawledCount: site.uncrawled.length,
      };
      const fix = { summary: `Make each page's ${title.toLowerCase()} distinct and specific to its content.` };
      if (groups.length) return warn(`${groups.length} duplicate ${title.toLowerCase()} group(s) found.`, { evidence, fix });
      if (site.pages.length < 5 || site.uncrawled.length > 0) {
        return { status: "skip", message: `The crawl is too small to rule out duplicate ${title.toLowerCase()} values; a larger --pages crawl is needed.`, evidence };
      }
      return pass(`No duplicate ${title.toLowerCase()} values found.`, { evidence });
    },
  });
}

export const titleDuplicates = duplicateCheck("seo.site.title.duplicates", "Duplicate titles", "title", "Duplicate titles obscure page differentiation.");
export const descriptionDuplicates = duplicateCheck("seo.site.description.duplicates", "Duplicate descriptions", "meta[name='description']", "Unique descriptions preserve page specific snippet context.");
export const h1Duplicates = duplicateCheck("seo.site.h1.duplicates", "Duplicate H1 headings", "h1", "Distinct main headings clarify page subjects.");

export const nearDuplicate = defineSiteCheck({
  id: "seo.site.content.near-duplicate",
  title: "Near duplicate content clusters",
  pillar: "seo",
  category: "site",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html", "crawl-graph"],
  rationale: "Repetitive pages add little distinct value.",
  run: ({ site }) => {
    const docs = site.pages.map((page) => {
      const text = normalizeText(mainText(cheerio.load(page.rawHtml)));
      return { url: page.url, words: new Set(text.split(" ").filter((word) => word.length > 2)) };
    });
    const clusters: { urls: string[]; similarity: number }[] = [];
    for (let first = 0; first < docs.length && clusters.length < 50; first++) {
      for (let second = first + 1; second < docs.length && second < first + 100; second++) {
        const a = docs[first];
        const b = docs[second];
        if (!a || !b || !a.words.size || !b.words.size) continue;
        let intersection = 0;
        for (const token of a.words) if (b.words.has(token)) intersection++;
        const similarity = intersection / (a.words.size + b.words.size - intersection);
        if (similarity >= 0.9) clusters.push({ urls: [a.url, b.url], similarity: Number(similarity.toFixed(3)) });
      }
    }
    const evidence = {
      threshold: 0.9,
      clusterCount: clusters.length,
      clusters,
      crawledPageCount: site.pages.length,
      uncrawledCount: site.uncrawled.length,
    };
    const fix = { summary: "Consolidate near-identical pages or add substantial page-specific information." };
    if (clusters.length) return warn(`${clusters.length} near-duplicate page pair(s) detected.`, { evidence, fix });
    if (site.pages.length < 5 || site.uncrawled.length > 0) {
      return { status: "skip", message: "The crawl is too small to rule out near-duplicate pages; a larger --pages crawl is needed.", evidence };
    }
    return pass("No pages exceeded the near-duplicate similarity threshold.", { evidence });
  },
});

function sitemapCoverage(site: SiteSnapshot) {
  const sitemap = [...new Set(site.sitemaps.flatMap((map) => map.entries.map((entry) => canonicalUrl(entry.loc))))];
  const crawled = new Set(site.pages.flatMap((page) => [canonicalUrl(page.url), canonicalUrl(page.finalUrl)]));
  const crawledSitemap = sitemap.filter((url) => crawled.has(url));
  return {
    sitemap,
    crawledSitemap,
    coverage: sitemap.length ? crawledSitemap.length / sitemap.length : 1,
    coverageEvidence: {
      sitemapUrlCount: sitemap.length,
      crawledSitemapUrlCount: crawledSitemap.length,
      coverage: Number((sitemap.length ? crawledSitemap.length / sitemap.length : 1).toFixed(3)),
    },
  };
}

function crawlTooPartial(pageCount: number, coverage: number): boolean {
  return pageCount < 5 || coverage < 0.2;
}

export const orphanPages = defineSiteCheck({
  id: "seo.site.orphan-pages",
  title: "Crawled sitemap URLs are reachable in link graph",
  pillar: "seo",
  category: "site",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["sitemap", "crawl-graph"],
  rationale: "Sitemap inclusion does not replace usable internal navigation.",
  run: ({ site }) => {
    const { sitemap, crawledSitemap, coverage, coverageEvidence } = sitemapCoverage(site);
    const crawled = new Set(crawledSitemap);
    const inbound = new Set(site.links
      .filter((link) => crawled.has(canonicalUrl(link.from)))
      .map((link) => canonicalUrl(link.to)));
    const orphan = crawledSitemap.filter((url) => !inbound.has(url));
    const evidence = { ...coverageEvidence, orphanCount: orphan.length, orphanUrls: orphan.slice(0, 40) };
    const fix = { summary: "Link orphaned sitemap URLs contextually from a reachable page." };
    if (crawlTooPartial(site.pages.length, coverage)) {
      return { status: "skip", message: `Only ${crawledSitemap.length} of ${sitemap.length} sitemap URLs were crawled; a larger --pages crawl is needed to assess orphan pages.`, evidence };
    }
    return orphan.length
      ? warn(`${orphan.length} crawled sitemap URL(s) lack inbound links from crawled pages.`, { evidence, fix })
      : pass("All crawled sitemap URLs have inbound links from crawled pages.", { evidence });
  },
});

export const internal404Rate = defineSiteCheck({
  id: "seo.site.internal-404-rate",
  title: "Broken internal destinations across crawl",
  pillar: "seo",
  category: "site",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["crawl-graph", "headers"],
  rationale: "Crawl-wide failures expose stale references.",
  run: ({ site }) => {
    const crawledTargets = site.links.flatMap((link) => {
      const target = pageForUrl(site, link.to);
      return target ? [{ link, target }] : [];
    });
    const broken = crawledTargets.filter(({ target }) => target.status >= 400);
    const coverage = site.links.length ? crawledTargets.length / site.links.length : 1;
    const rate = crawledTargets.length ? broken.length / crawledTargets.length : 0;
    const evidence = {
      linkCount: site.links.length,
      crawledTargetCount: crawledTargets.length,
      coverage: Number(coverage.toFixed(3)),
      broken: broken.slice(0, 40).map(({ link, target }) => ({ from: link.from, to: link.to, anchor: link.anchor, status: target.status })),
      brokenCount: broken.length,
      rate: Number(rate.toFixed(4)),
    };
    const fix = { summary: "Repair internal links to error pages or route removed URLs to a true replacement." };
    if (site.pages.length < 5 || coverage < 0.2) {
      return { status: "skip", message: `Only ${crawledTargets.length} of ${site.links.length} internal link targets were crawled; a larger --pages crawl is needed to assess the site-wide error rate.`, evidence };
    }
    if (broken.length && rate > 0.005) return fail(`${broken.length} internal links target errors (${(rate * 100).toFixed(2)}%).`, { evidence, fix });
    if (broken.length) return warn(`${broken.length} internal links target error pages.`, { evidence, fix });
    return pass("No crawled internal links target error pages.", { evidence });
  },
});

export const canonicalClusters = defineSiteCheck({
  id: "seo.site.canonical-clusters",
  title: "Duplicate clusters have one consistent canonical",
  pillar: "seo",
  category: "site",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["raw-html", "crawl-graph", "sitemap"],
  rationale: "Consistent consolidation prevents competing duplicate URLs.",
  run: ({ site }) => {
    const { coverage, coverageEvidence } = sitemapCoverage(site);
    const rows = site.pages.map((page) => {
      const $ = cheerio.load(page.rawHtml);
      const canonical = $("link[rel='canonical']").first().attr("href") ?? "";
      let target = canonical;
      try { if (canonical) target = new URL(canonical, page.url).href; } catch { /* Preserve malformed canonical for evidence. */ }
      return { url: page.url, canonical, target: canonical ? canonicalUrl(target) : "" };
    });
    const byCanonical = new Map<string, string[]>();
    for (const row of rows) {
      if (row.target) byCanonical.set(row.target, [...(byCanonical.get(row.target) ?? []), row.url]);
    }
    const clusters = [...byCanonical].filter(([, urls]) => urls.length > 1);
    const conflicts = clusters.map(([target, urls]) => ({
      target,
      urls,
      targets: [...new Set(urls.map((url) => rows.find((row) => canonicalUrl(row.url) === canonicalUrl(url))?.target ?? ""))],
    })).filter((cluster) => cluster.targets.some((canonical) => canonical !== cluster.target)
      || (pageForUrl(site, cluster.target)?.status ?? 200) >= 400);
    const evidence = {
      ...coverageEvidence,
      duplicateClusters: clusters.slice(0, 20).map(([target, urls]) => ({ target, urls: urls.slice(0, 15) })),
      conflicts: conflicts.slice(0, 20),
      uncrawledCount: site.uncrawled.length,
    };
    const fix = { summary: "Align canonicals, internal links, and sitemap entries on one live preferred URL." };
    if (!conflicts.length && (crawlTooPartial(site.pages.length, coverage) || site.uncrawled.length > 0)) {
      return { status: "skip", message: "The crawl covers too little of the sitemap to rule out canonical conflicts; a larger --pages crawl is needed.", evidence };
    }
    return conflicts.length
      ? fail(`${conflicts.length} canonical cluster conflict(s) found.`, { evidence, fix })
      : pass("Observed canonical clusters are internally consistent.", { evidence });
  },
});

export const navDepth = defineSiteCheck({
  id: "seo.site.nav-depth",
  title: "Priority content is reachable within three clicks",
  pillar: "seo",
  category: "site",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["crawl-graph"],
  rationale: "Information architecture guides users and crawlers.",
  run: ({ site }) => {
    const { coverage, coverageEvidence } = sitemapCoverage(site);
    const deep = site.pages.filter((page) => page.depth > 3);
    const evidence = {
      ...coverageEvidence,
      crawledPageCount: site.pages.length,
      uncrawledCount: site.uncrawled.length,
      deepCount: deep.length,
      deepPages: deep.slice(0, 30).map((page) => ({ url: page.url, depth: page.depth })),
    };
    const fix = { summary: "Link priority pages from navigation or hubs at three clicks or fewer." };
    if (deep.some((page) => page.depth > 5)) return fail(`${deep.filter((page) => page.depth > 5).length} pages are deeper than five clicks.`, { evidence, fix });
    if (deep.length) return warn(`${deep.length} pages are deeper than three clicks.`, { evidence, fix });
    if (crawlTooPartial(site.pages.length, coverage) || site.uncrawled.length > 0) {
      return { status: "skip", message: "The crawl is too small to confirm navigation depth across the site; a larger --pages crawl is needed.", evidence };
    }
    return pass("All crawled pages are within three clicks.", { evidence });
  },
});

export const urlVariants = defineSiteCheck({
  id: "seo.site.url-variants",
  title: "Host and protocol variants consolidate",
  pillar: "seo",
  category: "site",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["headers", "crawl-graph"],
  rationale: "Multiple host variants can split signals.",
  run: ({ site }) => {
    const origins = [...new Set(site.pages.map((page) => {
      try { return new URL(page.url).origin; } catch { return page.url; }
    }))];
    const evidence = { startOrigin: site.origin, observedOrigins: origins, variantCount: origins.length };
    const fix = { summary: "Redirect alternate protocol and www variants to one canonical origin." };
    return origins.length > 1
      ? warn(`${origins.length} origins appear in the crawl.`, { evidence, fix })
      : pass("One origin appears in the crawl.", { evidence });
  },
});

export const sitemapDiscovery = defineSiteCheck({
  id: "seo.site.sitemap.discovery",
  title: "Sitemap is declared or discoverable",
  pillar: "seo",
  category: "site",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["robots", "sitemap"],
  rationale: "Discovery helps search engines find fresh and deep URLs.",
  run: ({ site }) => {
    const body = site.robotsTxt?.body ?? "";
    const declarations = [...body.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((match) => match[1] ?? "");
    const hasMap = site.sitemaps.length > 0;
    const evidence = { sitemapCount: site.sitemaps.length, declarations, robotsStatus: site.robotsTxt?.status ?? null };
    const fix = { summary: "Publish a sitemap and declare its URL in robots.txt." };
    if (!hasMap) return fail("No sitemap was discovered.", { evidence, fix });
    if (!declarations.length) return warn("Sitemap exists but robots.txt does not declare it.", { evidence, fix });
    return pass("Sitemap is discovered and declared in robots.txt.", { evidence });
  },
});

export const indexableShare = defineSiteCheck({
  id: "seo.site.indexable-share",
  title: "Crawl does not waste on accidental variants",
  pillar: "seo",
  category: "site",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["crawl-graph", "sitemap", "headers"],
  rationale: "Duplicate and filter spaces dilute crawl attention.",
  run: ({ site }) => {
    const variants = site.pages.filter((page) => {
      const $ = cheerio.load(page.rawHtml);
      const canonical = $("link[rel='canonical']").first().attr("href");
      let mismatch = false;
      try { mismatch = Boolean(canonical && canonicalUrl(new URL(canonical, page.url).href) !== canonicalUrl(page.url)); }
      catch { mismatch = true; }
      try { return page.status >= 400 || mismatch || new URL(page.url).search.length > 0; }
      catch { return true; }
    });
    const share = site.pages.length ? (site.pages.length - variants.length) / site.pages.length : 1;
    const evidence = {
      pageCount: site.pages.length,
      variantCount: variants.length,
      canonicalShare: Number(share.toFixed(3)),
      variantUrls: variants.slice(0, 30).map((page) => page.url),
    };
    const fix = { summary: "Canonicalize intentional duplicates and constrain crawlable filter or session URLs." };
    if (share < 0.75) return fail(`Only ${Math.round(share * 100)}% of crawled pages appear canonical and clean.`, { evidence, fix });
    if (share < 0.9) return warn(`${Math.round(share * 100)}% of crawled pages appear canonical and clean.`, { evidence, fix });
    return pass("At least 90% of crawled pages appear canonical and clean.", { evidence });
  },
});

export const thinPages = defineSiteCheck({
  id: "seo.site.content.thin-ratio",
  title: "Review pages with very little main content",
  pillar: "seo",
  category: "site",
  kind: "deterministic",
  severity: "low",
  weight: 2,
  requires: ["raw-html", "crawl-graph"],
  rationale: "Very short pages merit review, though word count alone does not determine quality.",
  run: ({ site }) => {
    const thin = site.pages
      .map((page) => ({ url: page.url, words: wordCount(mainText(cheerio.load(page.rawHtml))) }))
      .filter((page) => page.words < 100);
    const ratio = site.pages.length ? thin.length / site.pages.length : 0;
    const evidence = {
      thresholdWords: 100,
      pageCount: site.pages.length,
      thinCount: thin.length,
      ratio: Number(ratio.toFixed(3)),
      examples: thin.slice(0, 30),
    };
    const fix = { summary: "Review short pages and add useful context only where it helps users." };
    if (ratio > 0.5) return warn(`${Math.round(ratio * 100)}% of pages have fewer than 100 main content words.`, { evidence, fix });
    if (thin.length) return warn(`${thin.length} page(s) have fewer than 100 main content words; review contextually.`, { evidence, fix });
    return pass("No pages fall below the review threshold.", { evidence });
  },
});

export const siteChecks = [titleDuplicates, descriptionDuplicates, h1Duplicates, nearDuplicate, orphanPages, urlVariants, sitemapDiscovery, internal404Rate, canonicalClusters, navDepth, indexableShare, thinPages];
