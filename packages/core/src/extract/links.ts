import type { CheerioAPI } from "cheerio";
import type { LinkEdge, PageSnapshot, SiteSnapshot } from "../snapshot.ts";

export function normalizedHost(host: string): string { return host.toLowerCase().replace(/^www\./, ""); }
export function isInternalUrl(url: string, origin: string): boolean {
  try { return normalizedHost(new URL(url, origin).hostname) === normalizedHost(new URL(origin).hostname); } catch { return false; }
}
export function classifyLink(url: string, origin: string): "internal" | "external" | "invalid" {
  try { return isInternalUrl(url, origin) ? "internal" : "external"; } catch { return "invalid"; }
}
export function isGenericAnchor(anchor: string): boolean {
  return /^(click here|here|read more|learn more|more|this link|link)$/i.test(anchor.trim());
}
export function extractLinks($: CheerioAPI, baseUrl: string, origin: string): LinkEdge[] {
  const links: LinkEdge[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const target = new URL(href, baseUrl);
      if (!/^https?:$/.test(target.protocol)) return;
      const rel = ($(el).attr("rel") ?? "").toLowerCase().split(/\s+/);
      if (isInternalUrl(target.href, origin)) links.push({ from: baseUrl, to: target.href, anchor: $(el).text().replace(/\s+/g, " ").trim(), nofollow: rel.includes("nofollow") });
    } catch { /* malformed href */ }
  });
  return links;
}
export function canonicalUrl(url: string): string {
  try { const u = new URL(url); u.hash = ""; u.hostname = normalizedHost(u.hostname); if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/$/, ""); return u.href.toLowerCase(); } catch { return url.toLowerCase(); }
}
export function pageForUrl(site: SiteSnapshot, url: string): PageSnapshot | undefined {
  const key = canonicalUrl(url);
  return site.pages.find((p) => canonicalUrl(p.url) === key || canonicalUrl(p.finalUrl) === key);
}
