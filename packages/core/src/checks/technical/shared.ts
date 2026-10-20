import type { PageSnapshot, SiteSnapshot } from "../../snapshot.ts";
import { parseRobots } from "../../extract/robots.ts";

export const googleDocs =
  "https://developers.google.com/search/docs/crawling-indexing/robots/intro";

export const pageMeta = (
  id: string,
  title: string,
  category: "crawlability" | "international" | "security" | "performance",
  severity: "critical" | "high" | "medium" | "low",
  weight: number,
  requires: readonly (
    | "raw-html"
    | "rendered-dom"
    | "headers"
    | "robots"
    | "sitemap"
    | "crawl-graph"
  )[],
  rationale: string,
  docs: string,
) => ({
  id: `seo.${id}`,
  title,
  pillar: "seo" as const,
  category,
  kind: "deterministic" as const,
  severity,
  weight,
  requires,
  rationale,
  docs,
});

export const siteMeta = (
  id: string,
  title: string,
  category: "crawlability" | "ai-access" | "international" | "security",
  severity: "critical" | "high" | "medium" | "low" | "info",
  weight: number,
  requires: readonly (
    | "raw-html"
    | "rendered-dom"
    | "headers"
    | "robots"
    | "sitemap"
    | "crawl-graph"
  )[],
  rationale: string,
  docs: string,
) => ({
  id: `${category === "ai-access" ? "geo" : "seo"}.${id}`,
  title,
  pillar: category === "ai-access" ? ("geo" as const) : ("seo" as const),
  category,
  kind: "deterministic" as const,
  severity,
  weight,
  requires,
  rationale,
  docs,
});

export const sitemapUrls = (s: SiteSnapshot) =>
  s.sitemaps.flatMap((m) => m.entries.map((e) => e.loc));

export const htmlText = (html: string) =>
  html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const canonical = (p: PageSnapshot) => {
  const m = p.rawHtml.match(
    /<link\b(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i,
  );
  return m?.[1] ? new URL(m[1], p.finalUrl).href : undefined;
};

export const indexable = (p: PageSnapshot) =>
  !/(?:^|[,;\s])noindex\b/i.test(
    `${p.headers["x-robots-tag"] ?? ""} ${p.rawHtml.match(/<meta\b(?=[^>]*name=["']robots["'])[^>]*content=["']([^"']*)/i)?.[1] ?? ""}`,
  );

export const robots = (s: SiteSnapshot) =>
  s.robotsTxt ? parseRobots(s.robotsTxt.body) : undefined;

export const normalize = (u: string) => {
  const x = new URL(u);
  x.hash = "";
  if (x.pathname.length > 1) x.pathname = x.pathname.replace(/\/$/, "");
  return x.href;
};
