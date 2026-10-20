import { definePageCheck, defineSiteCheck, fail, pass, skip, warn } from "@aeo/core";
import type { Check } from "@aeo/core";
import type { GscClient } from "./gsc.ts";
import type { BingClient } from "./bing.ts";
import type { IndexNowClient } from "./indexnow.ts";
import type { SearchProvider } from "./presence.ts";
import type { Prober } from "./probe.ts";

type ServicesWithIntegrations = { gsc?: GscClient; bing?: BingClient; probe?: Prober; presence?: SearchProvider; indexnow?: IndexNowClient; indexNowKey?: string };
const gsc = (s: unknown) => (s as ServicesWithIntegrations).gsc;
const bing = (s: unknown) => (s as ServicesWithIntegrations).bing;
const probe = (s: unknown) => (s as ServicesWithIntegrations).probe;
const external = { kind: "external" as const };
const matchingGscProperty = (sites: Array<{ siteUrl: string }>, origin: string): string | undefined => {
  const host = new URL(origin).hostname.toLowerCase();
  return sites.find((s) => s.siteUrl.replace(/\/$/, "") === origin || s.siteUrl.toLowerCase() === `sc-domain:${host}`)?.siteUrl;
};

export const gscPropertyVerified = defineSiteCheck({ id: "seo.gsc.property-verified", title: "Google Search Console property verified", pillar: "seo", category: "site", ...external, severity: "high", weight: 2, requires: ["gsc"], rationale: "A verified property enables first-party search diagnostics.", async run(ctx) {
  const client = gsc(ctx.services); if (!client) return skip("Google Search Console is not connected."); const sites = await client.listSites(); const site = ctx.site.origin;
  const match = sites.find((s) => s.siteUrl.replace(/\/$/, "") === site || s.siteUrl === `sc-domain:${new URL(site).hostname}`);
  return match ? pass("A matching Search Console property is available.", { evidence: { property: match.siteUrl, permissionLevel: match.permissionLevel } }) : fail("No matching Search Console property is available.", { evidence: { checkedOrigin: site } });
} });

export const gscIndexStatus = definePageCheck({ id: "seo.gsc.index-status", title: "Google index status", pillar: "seo", category: "crawlability", ...external, severity: "high", weight: 2, requires: ["gsc"], rationale: "Google URL Inspection reports whether the crawled URL is indexed.", async run(ctx) {
  const client = gsc(ctx.services); if (!client) return skip("Google Search Console is not connected.");
  const pageIndex = ctx.site.pages.findIndex((page) => page.url === ctx.page.url);
  if (pageIndex >= 100) return skip("URL Inspection is capped at 100 crawled pages per site audit.");
  const siteUrl = matchingGscProperty(await client.listSites(), ctx.site.origin);
  if (!siteUrl) return skip("No matching Search Console property is available."); const result = await client.inspectUrl(siteUrl, ctx.page.url); const status = result.indexStatusResult;
  if (!status?.verdict) return warn("Google did not return an index verdict for this URL.");
  const evidence = { verdict: status.verdict, coverageState: status.coverageState ?? "unknown", indexingState: status.indexingState ?? "unknown", lastCrawlTime: status.lastCrawlTime ?? "unknown", googleCanonical: status.googleCanonical ?? "unknown" };
  return status.verdict === "PASS" ? pass("Google reports this URL as indexed.", { evidence }) : warn(`Google index verdict: ${status.verdict}.`, { evidence, fix: { summary: "Review the URL Inspection coverage details and resolve any indexing blockers." } });
} });

export const gscSitemaps = defineSiteCheck({ id: "seo.gsc.sitemaps-submitted-and-error-free", title: "Search Console sitemaps submitted and error-free", pillar: "seo", category: "crawlability", ...external, severity: "medium", weight: 1, requires: ["gsc"], rationale: "Submitted, error-free sitemaps help Google discover canonical URLs.", async run(ctx) {
  const client = gsc(ctx.services); if (!client) return skip("Google Search Console is not connected."); const property = matchingGscProperty(await client.listSites(), ctx.site.origin);
  if (!property) return skip("No matching Search Console property is available."); const maps = await client.listSitemaps(property); const errors = maps.reduce((n, m) => n + (m.errors ?? 0), 0);
  if (!maps.length) return warn("No sitemaps are submitted in Search Console.", { evidence: { sitemapCount: 0 }, fix: { summary: "Submit the site's canonical XML sitemap in Search Console." } });
  return errors ? warn(`${errors} sitemap error(s) are reported by Google.`, { evidence: { sitemapCount: maps.length, errors }, fix: { summary: "Resolve sitemap errors reported by Google Search Console." } }) : pass("Submitted sitemaps have no reported errors.", { evidence: { sitemapCount: maps.length, errors } });
} });

export const gscPerformanceTrend = defineSiteCheck({ id: "seo.gsc.performance-trend", title: "Search Console performance and CTR opportunities", pillar: "seo", category: "visibility", ...external, severity: "medium", weight: 1, requires: ["gsc"], rationale: "Search clicks, impressions, and CTR reveal pages that may benefit from better snippets.", async run(ctx) {
  const client = gsc(ctx.services); if (!client) return skip("Google Search Console is not connected."); const property = matchingGscProperty(await client.listSites(), ctx.site.origin);
  if (!property) return skip("No matching Search Console property is available."); const rows = await client.searchAnalytics(property, { dimensions: ["page"], rowLimit: 1000 }); const clicks = rows.reduce((n, r) => n + r.clicks, 0); const impressions = rows.reduce((n, r) => n + r.impressions, 0); const ctr = impressions ? clicks / impressions : 0;
  const opportunities = rows.filter((r) => r.impressions >= 100 && r.ctr < 0.02).slice(0, 20).map((r) => ({ page: r.keys[0] ?? "", impressions: r.impressions, ctr: r.ctr }));
  const evidence = { clicks, impressions, ctr, lowCtrHighImpressionPages: opportunities };
  return opportunities.length ? warn(`${opportunities.length} page(s) have high impressions and CTR below 2%.`, { evidence, fix: { summary: "Rewrite titles and meta descriptions for high impression, low CTR pages." } }) : pass("No high impression pages with CTR below 2% were found.", { evidence });
} });

export const bingSiteVerified = defineSiteCheck({ id: "seo.bing.site-verified", title: "Bing Webmaster site verified", pillar: "seo", category: "site", ...external, severity: "medium", weight: 1, requires: ["bing"], rationale: "A verified Bing site enables first-party crawl diagnostics.", async run(ctx) {
  const client = bing(ctx.services); if (!client) return skip("Bing Webmaster is not connected."); const sites = (await client.listSites()) ?? []; const match = sites.find((s) => s.url.replace(/\/$/, "") === ctx.site.origin);
  return match && (match.verified ?? match.isVerified ?? false) ? pass("The site is verified in Bing Webmaster Tools.", { evidence: { site: match.url } }) : warn("No verified matching Bing site was found.", { evidence: { checkedOrigin: ctx.site.origin } });
} });
export const bingIndexCrawl = definePageCheck({ id: "seo.bing.index-crawl-issues", title: "Bing index and crawl status", pillar: "seo", category: "crawlability", ...external, severity: "medium", weight: 1, requires: ["bing"], rationale: "Bing URL and crawl diagnostics can reveal discoverability problems.", async run(ctx) {
  const client = bing(ctx.services); if (!client) return skip("Bing Webmaster is not connected."); const info = await client.urlInfo(ctx.site.origin, ctx.page.url); const crawl = await client.crawlIssues(ctx.site.origin); const errors = crawl.issues?.filter((i) => !i.url || i.url === ctx.page.url) ?? [];
  const evidence = { indexed: info.indexed ?? info.isIndexed ?? null, lastCrawled: info.lastCrawled ?? null, urlCrawlErrors: info.crawlErrors ?? info.errors ?? [], matchingSiteIssues: errors.map((i) => i.issue ?? "unknown") };
  return evidence.indexed === false || evidence.urlCrawlErrors.length > 0 || errors.length > 0 ? warn("Bing reports index or crawl concerns for this URL.", { evidence, fix: { summary: "Review Bing Webmaster URL and crawl diagnostics for this page." } }) : info.indexed === true ? pass("Bing reports this URL as indexed without matching crawl issues.", { evidence }) : warn("Bing returned incomplete URL status; index state is unknown.", { evidence });
} });
export const bingUrlInfo = definePageCheck({ id: "seo.bing.url-info", title: "Bing URL information available", pillar: "seo", category: "visibility", ...external, severity: "info", weight: 0.5, requires: ["bing"], rationale: "Bing URL inspection provides an independent search-engine view.", async run(ctx) { const client = bing(ctx.services); if (!client) return skip("Bing Webmaster is not connected."); const info = await client.urlInfo(ctx.site.origin, ctx.page.url); return pass("Bing URL information was retrieved.", { evidence: { indexed: info.indexed ?? info.isIndexed ?? null, lastCrawled: info.lastCrawled ?? null } }); } });

export const indexNowKeyCheck = defineSiteCheck({ id: "seo.indexnow.key-file", title: "IndexNow key file reachable", pillar: "seo", category: "crawlability", ...external, severity: "low", weight: 0.5, requires: [], rationale: "The public key file authorizes IndexNow URL notifications for this host.", async run(ctx) { const service = ctx.services as typeof ctx.services & { indexNowKey?: string }; if (!service.indexNowKey) return skip("No IndexNow key is configured."); const { checkIndexNowKeyFile } = await import("./indexnow.ts"); const result = await checkIndexNowKeyFile(ctx.site.origin, service.indexNowKey, { safeFetchOptions: { signal: ctx.signal, maxBytes: 4096 } }); return result.matches ? pass("The configured IndexNow key file is reachable and matches.", { evidence: { status: result.status, matches: true } }) : warn("The configured IndexNow key file is missing or has different content.", { evidence: { status: result.status, matches: false }, fix: { summary: `Publish the configured key at /${service.indexNowKey}.txt with its exact key as the file content.` } }); } });

export const bravePresenceCheck = defineSiteCheck({ id: "seo.index.presence-brave", title: "Sampled site presence in Brave Search", pillar: "seo", category: "visibility", ...external, severity: "info", weight: 0.5, requires: [], rationale: "A Brave Search result is a heuristic signal from an independent index.", async run(ctx) { const client = (ctx.services as typeof ctx.services & { presence?: SearchProvider }).presence; if (!client) return skip("Brave Search presence is not configured."); const pages = [ctx.site.startUrl, ...ctx.site.pages.slice(0, 5).map((p) => p.url)]; const results = await Promise.all(pages.map((url) => client.checkPresence({ url }))); const count = results.filter((r) => r.found).length; return count ? pass(`${count} of ${results.length} sampled URLs appeared in Brave Search (heuristic).`, { evidence: { provider: "brave", heuristic: true, results: results.map((r) => ({ url: r.matchedUrl ?? "not found", found: r.found, checkedAt: r.checkedAt })) } }) : warn("No sampled URLs appeared in Brave Search; this is a heuristic result, not definitive index status.", { evidence: { provider: "brave", heuristic: true, sampleCount: results.length }, fix: { summary: "Review crawlability and rerun this sampled Brave Search presence check later." } }); } });

export const probeCitedRate = defineSiteCheck({ id: "geo.visibility.cited-rate", title: "Sampled AI citation rate", pillar: "geo", category: "visibility", ...external, severity: "medium", weight: 1, requires: ["probe"], rationale: "Sampled search-grounded model answers show whether the site is cited for configured queries.", async run(ctx) { const p = probe(ctx.services); if (!p) return skip("AI visibility probing is not configured."); const report = await p.run(ctx.site.origin); return report.citedRate >= 0.5 ? pass(`The site was cited in ${Math.round(report.citedRate * 100)}% of sampled answers.`, { evidence: { citedRate: report.citedRate, sampleCount: report.sampleCount, estimatedCostUsd: report.estimatedCostUsd } }) : warn(`The site was cited in ${Math.round(report.citedRate * 100)}% of sampled answers.`, { evidence: { citedRate: report.citedRate, sampleCount: report.sampleCount, estimatedCostUsd: report.estimatedCostUsd }, fix: { summary: "Improve authoritative, query-focused pages and repeat the same AI visibility sample." } }); } });
export const probeBrandMentionRate = defineSiteCheck({ id: "geo.visibility.brand-mention-rate", title: "Sampled AI brand mention rate", pillar: "geo", category: "visibility", ...external, severity: "medium", weight: 1, requires: ["probe"], rationale: "Brand mentions in sampled AI answers complement citation measurements.", async run(ctx) { const p = probe(ctx.services); if (!p) return skip("AI visibility probing is not configured."); const r = await p.run(ctx.site.origin); return pass(`Brand mention rate across sampled answers: ${Math.round(r.brandMentionRate * 100)}%.`, { evidence: { brandMentionRate: r.brandMentionRate, sampleCount: r.sampleCount } }); } });
export const probeCompetitors = defineSiteCheck({ id: "geo.visibility.competitors", title: "Competitors cited by sampled AI answers", pillar: "geo", category: "visibility", ...external, severity: "info", weight: 0.5, requires: ["probe"], rationale: "Competitor citations provide context for sampled visibility results.", async run(ctx) { const p = probe(ctx.services); if (!p) return skip("AI visibility probing is not configured."); const r = await p.run(ctx.site.origin); return pass("Competitor citation observations were collected.", { evidence: { citedCompetitors: r.citedCompetitors, sampleCount: r.sampleCount } }); } });

export const integrationChecks: Check[] = [gscPropertyVerified, gscIndexStatus, gscSitemaps, gscPerformanceTrend, bingSiteVerified, bingIndexCrawl, bingUrlInfo, indexNowKeyCheck, bravePresenceCheck, probeCitedRate, probeBrandMentionRate, probeCompetitors];
export const integrationPageChecks = [gscIndexStatus, bingIndexCrawl, bingUrlInfo];
