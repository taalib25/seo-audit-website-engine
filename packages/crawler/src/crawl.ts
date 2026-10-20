import { load } from "cheerio";
import robotsParser from "robots-parser";
import type { PageSnapshot, SiteSnapshot, SitemapEntry, TextFile, LinkEdge } from "@aeo/core";
import { assertSafeUrl, safeFetch, type SafeFetchOptions } from "@aeo/core";
import {
  CdpRenderer,
  HttpRenderer,
  LightpandaRenderer,
  PlaywrightRenderer,
  type Renderer,
  type RendererMode,
} from "./renderers.ts";
import { needsRendering } from "./signals.ts";

export { detectStack, needsRendering } from "./signals.ts";
export * from "./renderers.ts";

export interface CrawlProgress {
  type: "page" | "discovery" | "done";
  url?: string;
  index?: number;
  total?: number;
}

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  concurrency?: number;
  render?: "auto" | "always" | "never";
  renderer?: RendererMode | { mode: RendererMode; cdpEndpoint?: string; blockHeavyResources?: boolean };
  timeoutMs?: number;
  totalBudgetMs?: number;
  userAgent?: string;
  respectRobots?: boolean;
  includeSubdomains?: boolean;
  signal?: AbortSignal;
  onProgress?: (event: CrawlProgress) => void;
  /** Test-only loopback access. Never set from a public request or production configuration. */
  testOnlyAllowPrivate?: boolean;
  maxBytes?: number;
  totalByteBudgetBytes?: number;
}

interface QueueEntry { url: string; depth: number; priority: number }

const DEFAULT_UA = "AEOAuditBot";
const TRACKING = /^(utm_.+|gclid|fbclid)$/i;
const NON_HTML_PATH = /\.(?:pdf|zip|gz|tar|png|jpe?g|gif|svg|webp|avif|ico|css|[cm]?js|xml|json|mp[34]|m4[av]|mov|webm|ogg|wav|flac|woff2?|ttf|otf|eot)$/i;

export function normalizeUrl(input: string, base?: string): string {
  const url = new URL(input, base);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported URL scheme");
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url.href;
}

export async function crawlSite(startUrl: string, opts: CrawlOptions = {}): Promise<SiteSnapshot> {
  const initial = opts.testOnlyAllowPrivate ? new URL(startUrl) : assertSafeUrl(startUrl);
  if (initial.protocol !== "http:" && initial.protocol !== "https:") throw new Error("Unsupported URL scheme");
  const normalizedStart = normalizeUrl(initial.href);
  const origin = new URL(normalizedStart).origin;
  const started = performance.now();
  const maxPages = Math.min(200, Math.max(1, opts.maxPages ?? 10));
  const maxDepth = Math.max(0, opts.maxDepth ?? 3);
  const concurrency = Math.max(1, Math.min(16, opts.concurrency ?? 4));
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const userAgent = opts.userAgent ?? DEFAULT_UA;
  const fetchOptions: SafeFetchOptions = {
    timeoutMs,
    maxBytes,
    userAgent,
    ...(opts.signal ? { signal: opts.signal } : {}),
    ...(opts.testOnlyAllowPrivate ? { allowPrivate: true } : {}),
  };
  const fetch = (url: string) => safeFetch(url, fetchOptions);
  const robotsUrl = new URL("/robots.txt", origin).href;
  const robotsResponse = await fetch(robotsUrl).catch(() => undefined);
  const robotsFile = toTextFile(robotsUrl, robotsResponse);
  const robots = robotsParser(robotsUrl, robotsResponse?.body ?? "");
  const llmsTxt = await readTextFile(new URL("/llms.txt", origin).href, fetch);
  const llmsFullTxt = await readTextFile(new URL("/llms-full.txt", origin).href, fetch);

  const sitemapUrls = new Set<string>();
  for (const line of (robotsResponse?.body ?? "").split(/\r?\n/)) {
    const match = /^\s*Sitemap:\s*(\S+)/i.exec(line);
    if (match?.[1]) sitemapUrls.add(match[1]);
  }
  sitemapUrls.add(new URL("/sitemap.xml", origin).href);
  const sitemapRecords: SiteSnapshot["sitemaps"] = [];
  const sitemapVisited = new Set<string>();
  const sitemapEntries: SitemapEntry[] = [];
  const readSitemap = async (sitemapUrl: string, depth = 0): Promise<void> => {
    if (depth > 3 || sitemapVisited.has(sitemapUrl) || sitemapVisited.size >= 20) return;
    sitemapVisited.add(sitemapUrl);
    let response;
    try { response = await fetch(sitemapUrl); } catch { sitemapRecords.push({ url: sitemapUrl, status: 0, entries: [] }); return; }
    const locations = [...response.body.matchAll(/<(?:loc)\b[^>]*>([\s\S]*?)<\/loc\s*>/gi)]
      .map((match) => decodeXml(match[1] ?? "").trim()).filter(Boolean);
    const isIndex = /<sitemapindex\b/i.test(response.body);
    if (isIndex) {
      sitemapRecords.push({ url: sitemapUrl, status: response.status, entries: [] });
      for (const loc of locations.slice(0, 20)) await readSitemap(loc, depth + 1);
      return;
    }
    const entries: SitemapEntry[] = locations.slice(0, 5000 - sitemapEntries.length).flatMap((loc) => {
      if (!/^https?:\/\//i.test(loc)) return [];
      const lastmodMatch = /<lastmod\b[^>]*>([\s\S]*?)<\/lastmod\s*>/i.exec(response.body.slice(Math.max(0, response.body.indexOf(loc) - 100), response.body.indexOf(loc) + loc.length + 400));
      return [{ loc, ...(lastmodMatch?.[1] ? { lastmod: decodeXml(lastmodMatch[1]).trim() } : {}) }];
    });
    sitemapEntries.push(...entries);
    sitemapRecords.push({ url: sitemapUrl, status: response.status, entries });
  };
  for (const sitemapUrl of [...sitemapUrls].slice(0, 20)) await readSitemap(sitemapUrl);

  const queue: QueueEntry[] = [{ url: normalizedStart, depth: 0, priority: -2 }];
  const queued = new Set([normalizedStart]);
  for (const entry of sitemapEntries) {
    try {
      const url = normalizeUrl(entry.loc);
      if (isInScope(url, origin, opts.includeSubdomains ?? false) && !queued.has(url)) {
        queued.add(url);
        queue.push({ url, depth: 1, priority: 2 });
      }
    } catch { /* malformed sitemap URLs are ignored */ }
  }
  const pages: PageSnapshot[] = [];
  const links: LinkEdge[] = [];
  const discovered = new Set(queued);
  const crawled = new Set<string>();
  const uncrawled = new Set<string>();
  const selectedRenderer = makeRenderer(opts.renderer, userAgent);
  const fallbackRenderer = selectedRenderer.mode !== "none" && selectedRenderer.mode !== "chromium"
    ? new PlaywrightRenderer({ userAgent })
    : undefined;
  const allowRobots = opts.respectRobots !== false;
  const crawlDelayMs = Math.min(5_000, Math.max(0, (robots.getCrawlDelay(userAgent) ?? 0) * 1000));
  let budgetBytes = 0;
  let reservedBytes = 0;
  const totalByteBudget = opts.totalByteBudgetBytes ?? 25 * 1024 * 1024;
  let lastRequestTime = 0;
  let rateQueue: Promise<void> = Promise.resolve();
  const paceRequest = async (): Promise<void> => {
    let release = (): void => {};
    const previous = rateQueue;
    rateQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const delay = Math.max(crawlDelayMs, 150) - (performance.now() - lastRequestTime);
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    lastRequestTime = performance.now();
    release();
  };
  const tryChromiumFallback = async (url: string) => {
    try {
      return await fallbackRenderer?.render({ url, timeoutMs, userAgent, ...(opts.signal ? { signal: opts.signal } : {}) });
    } catch { return undefined; }
  };

  const crawlOne = async (item: QueueEntry): Promise<{ page?: PageSnapshot; children: QueueEntry[] }> => {
    if (opts.signal?.aborted || (opts.totalBudgetMs !== undefined && performance.now() - started >= opts.totalBudgetMs)) {
      uncrawled.add(item.url); return { children: [] };
    }
    if (allowRobots && robots.isAllowed(item.url, userAgent) === false) {
      uncrawled.add(item.url); return { children: [] };
    }
    // Media linked from HTML must not consume the page-body budget before sitemap pages run.
    if (NON_HTML_PATH.test(new URL(item.url).pathname)) {
      uncrawled.add(item.url); return { children: [] };
    }
    await paceRequest();
    let response;
    let reservation = 0;
    try {
      reservation = Math.min(maxBytes, totalByteBudget - budgetBytes - reservedBytes);
      if (reservation <= 0) { uncrawled.add(item.url); return { children: [] }; }
      reservedBytes += reservation;
      response = await safeFetch(item.url, { ...fetchOptions, maxBytes: reservation });
    } catch { uncrawled.add(item.url); return { children: [] }; }
    finally { reservedBytes -= reservation; }
    budgetBytes += Buffer.byteLength(response.body);
    if (budgetBytes > totalByteBudget) { uncrawled.add(item.url); return { children: [] }; }
    const contentType = response.headers["content-type"] ?? "";
    if (!/html|xhtml/i.test(contentType) || NON_HTML_PATH.test(new URL(response.finalUrl).pathname)) {
      uncrawled.add(item.url);
      return { children: [] };
    }
    const $ = load(response.body);
    const children: QueueEntry[] = [];
    $("a[href]").each((_, element) => {
      const href = $(element).attr("href");
      if (!href) return;
      try {
        const to = normalizeUrl(href, response.finalUrl);
        if (!isInScope(to, origin, opts.includeSubdomains ?? false)) return;
        const rel = ($(element).attr("rel") ?? "").toLowerCase().split(/\s+/);
        links.push({ from: response.finalUrl, to, anchor: $(element).text().replace(/\s+/g, " ").trim(), nofollow: rel.includes("nofollow") });
        if (!discovered.has(to)) {
          discovered.add(to);
          opts.onProgress?.({ type: "discovery", url: to, total: discovered.size });
          if (item.depth < maxDepth) children.push({ url: to, depth: item.depth + 1, priority: rel.includes("nofollow") ? 3 : 1 });
          else uncrawled.add(to);
        }
      } catch { /* invalid href */ }
    });
    let renderedHtml: string | undefined;
    let rendererName: string | undefined;
    if (opts.render === "always" || (opts.render !== "never" && needsRendering(response.body))) {
      const useRenderer = selectedRenderer.mode === "none" ? undefined : selectedRenderer;
      if (useRenderer) {
        try {
          const rendered = await useRenderer.render({ url: item.url, timeoutMs, userAgent, ...(opts.signal ? { signal: opts.signal } : {}) });
          if (rendered.renderedHtml?.trim()) { renderedHtml = rendered.renderedHtml; rendererName = rendered.renderer ?? useRenderer.mode; }
          if ((!renderedHtml || renderedHtml.length < 100) && useRenderer.mode !== "chromium") {
            const result = await tryChromiumFallback(item.url);
            if (result?.renderedHtml?.trim()) { renderedHtml = result.renderedHtml; rendererName = "chromium"; }
          }
        } catch {
          if (useRenderer.mode !== "chromium") {
            const result = await tryChromiumFallback(item.url);
            if (result?.renderedHtml?.trim()) { renderedHtml = result.renderedHtml; rendererName = "chromium"; }
          }
        }
      }
    }
    return {
      page: {
        url: item.url, finalUrl: response.finalUrl, status: response.status,
        redirectChain: response.redirectChain, headers: response.headers, rawHtml: response.body,
        ...(renderedHtml ? { renderedHtml } : {}), timing: response.timing, depth: item.depth,
        ...(rendererName ? { renderer: rendererName } : {}),
      },
      children,
    };
  };

  try {
    while (queue.length && pages.length < maxPages) {
      queue.sort((a, b) => a.depth - b.depth || a.priority - b.priority);
      const slots = Math.min(concurrency, 2, maxPages - pages.length);
      const batch = queue.splice(0, slots);
      const results = await Promise.all(batch.map(async (item) => {
        if (crawled.has(item.url)) return { children: [] as QueueEntry[] };
        crawled.add(item.url);
        return crawlOne(item);
      }));
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const item = batch[i];
        if (!result || !item) continue;
        if (result.page) {
          pages.push(result.page);
          opts.onProgress?.({ type: "page", url: result.page.url, index: pages.length, total: maxPages });
        }
        for (const child of result.children) queue.push(child);
      }
    }
    for (const item of queue) uncrawled.add(item.url);
    for (const url of discovered) if (!crawled.has(url)) uncrawled.add(url);
  } finally {
    await selectedRenderer.close();
    await fallbackRenderer?.close();
  }
  opts.onProgress?.({ type: "done", total: pages.length });
  return {
    startUrl: normalizedStart, origin,
    ...(robotsFile ? { robotsTxt: robotsFile } : {}),
    ...(llmsTxt ? { llmsTxt } : {}),
    ...(llmsFullTxt ? { llmsFullTxt } : {}),
    sitemaps: sitemapRecords, pages, links, uncrawled: [...uncrawled], crawledAt: new Date().toISOString(),
  };
}

function makeRenderer(config: CrawlOptions["renderer"], userAgent: string): Renderer {
  if (typeof config === "object" && config) {
    const options = { userAgent, ...(config.cdpEndpoint ? { cdpEndpoint: config.cdpEndpoint } : {}), ...(config.blockHeavyResources === undefined ? {} : { blockHeavyResources: config.blockHeavyResources }) };
    if (config.mode === "chromium") return new PlaywrightRenderer(options);
    if (config.mode === "lightpanda") return new LightpandaRenderer(options);
    if (config.mode === "cdp") return new CdpRenderer(options);
    return new HttpRenderer();
  }
  if (config === "chromium") return new PlaywrightRenderer({ userAgent });
  if (config === "lightpanda") return new LightpandaRenderer({ userAgent });
  if (config === "cdp") return new CdpRenderer({ userAgent });
  if (config === "none") return new HttpRenderer();
  return new PlaywrightRenderer({ userAgent });
}

function isInScope(candidate: string, origin: string, includeSubdomains: boolean): boolean {
  const target = new URL(candidate);
  const root = new URL(origin);
  return target.origin === root.origin || (includeSubdomains && target.protocol === root.protocol && target.hostname.endsWith(`.${root.hostname}`));
}

function toTextFile(url: string, response: Awaited<ReturnType<typeof safeFetch>> | undefined): TextFile | undefined {
  return response ? { url, status: response.status, body: response.status >= 200 && response.status < 300 ? response.body : "" } : undefined;
}
async function readTextFile(url: string, fetch: (url: string) => Promise<Awaited<ReturnType<typeof safeFetch>>>): Promise<TextFile | undefined> {
  try { return toTextFile(url, await fetch(url)); } catch { return undefined; }
}
function decodeXml(value: string): string {
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}
