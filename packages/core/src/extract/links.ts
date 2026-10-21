import type { CheerioAPI } from "cheerio";
import type { LinkEdge, PageSnapshot, SiteSnapshot } from "../snapshot.ts";

export function normalizedHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

export function isInternalUrl(url: string, origin: string): boolean {
  try {
    const host = normalizedHost(new URL(url, origin).hostname);
    const originHost = normalizedHost(new URL(origin).hostname);
    return host === originHost;
  } catch {
    return false;
  }
}

export function classifyLink(url: string, origin: string): "internal" | "external" | "invalid" {
  try {
    return isInternalUrl(url, origin) ? "internal" : "external";
  } catch {
    return "invalid";
  }
}

export function isGenericAnchor(anchor: string): boolean {
  return /^(click here|here|read more|learn more|more|this link|link)$/i.test(anchor.trim());
}

export function extractLinks($: CheerioAPI, baseUrl: string, origin: string): LinkEdge[] {
  const links: LinkEdge[] = [];
  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!href) return;
    try {
      const target = new URL(href, baseUrl);
      if (target.protocol !== "http:" && target.protocol !== "https:") return;
      if (!isInternalUrl(target.href, origin)) return;
      const rel = ($(element).attr("rel") ?? "").toLowerCase().split(/\s+/);
      links.push({
        from: baseUrl,
        to: target.href,
        anchor: $(element).text().replace(/\s+/g, " ").trim(),
        nofollow: rel.includes("nofollow"),
      });
    } catch {
      // Malformed hrefs are not crawlable link edges.
    }
  });
  return links;
}

export function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.hostname = normalizedHost(parsed.hostname);
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/$/, "");
    return parsed.href.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function pageForUrl(site: SiteSnapshot, url: string): PageSnapshot | undefined {
  const key = canonicalUrl(url);
  return site.pages.find((page) => canonicalUrl(page.url) === key || canonicalUrl(page.finalUrl) === key);
}
