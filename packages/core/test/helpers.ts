import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createPageContext, type CheckOutcome, type PageCheck, type Services, type SiteCheck } from "../src/check.ts";
import type { PageSnapshot, SiteSnapshot } from "../src/snapshot.ts";

export const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");

export function page(html: string, over: Partial<PageSnapshot> = {}): PageSnapshot {
  const url = over.url ?? "https://example.com/";
  return {
    url,
    finalUrl: url,
    status: 200,
    redirectChain: [],
    headers: { "content-type": "text/html; charset=utf-8" },
    rawHtml: html,
    timing: { ttfbMs: 100, totalMs: 200 },
    depth: 0,
    ...over,
  };
}

export function site(pages: PageSnapshot[], over: Partial<SiteSnapshot> = {}): SiteSnapshot {
  const first = pages[0]?.url ?? "https://example.com/";
  return {
    startUrl: first,
    origin: new URL(first).origin,
    sitemaps: [],
    pages,
    links: [],
    uncrawled: [],
    crawledAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

export async function runPage(check: PageCheck, p: PageSnapshot, s = site([p]), services: Services = {}): Promise<CheckOutcome> {
  return check.run(createPageContext(p, { site: s, services, signal: new AbortController().signal }));
}

export async function runSite(check: SiteCheck, s: SiteSnapshot, services: Services = {}): Promise<CheckOutcome> {
  return check.run({ site: s, services, signal: new AbortController().signal });
}
