import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as core from "@aeo/core";
import { crawlSite, detectStack, needsRendering, normalizeUrl, PlaywrightRenderer } from "../src/index.ts";

let server: Server;
let baseUrl: string;
let mediaRequests = 0;
const requestedPaths: string[] = [];
let fixtureMode: "normal" | "large-discovery" | "slow-discovery" | "spa" | "non-html-pages" = "normal";

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    requestedPaths.push(path);
    response.setHeader("content-type", path.endsWith(".xml") ? "application/xml" : "text/html; charset=utf-8");
    if (fixtureMode === "large-discovery") { response.end("x".repeat(2048)); return; }
    if (fixtureMode === "slow-discovery") { setTimeout(() => response.end("slow"), 1000); return; }
    if (fixtureMode === "non-html-pages") {
      if (path === "/sitemap.xml") response.end(`<urlset>${Array.from({ length: 20 }, (_, index) => `<url><loc>${baseUrl}/download-${index}</loc></url>`).join("")}</urlset>`);
      else if (path === "/" || path.startsWith("/download-")) { response.setHeader("content-type", "application/octet-stream"); response.end("binary"); }
      else response.end("");
      return;
    }
    if (fixtureMode === "spa") {
      if (path === "/") response.end("<html><body><div id='root'></div><a href='/raw'>Raw</a></body></html>");
      else if (path === "/resource-jump") { response.statusCode = 302; response.setHeader("location", "/asset.bin"); response.end("r".repeat(64)); }
      else if (path === "/asset.bin") { response.setHeader("content-type", "application/octet-stream"); response.end(Buffer.alloc(2048, 255)); }
      else if (path === "/raw" || path === "/hydrated") response.end("<html><body><h1>Page</h1></body></html>");
      else { response.statusCode = 404; response.end(""); }
      return;
    }
    if (path === "/robots.txt") {
      response.end("User-agent: *\nAllow: /\nSitemap: /sitemap.xml\nCrawl-delay: 0");
    } else if (path === "/sitemap.xml") {
      response.end(`<urlset><url><loc>${baseUrl}/about</loc></url>${Array.from({ length: 8 }, (_, index) => `<url><loc>${baseUrl}/page-${index}</loc></url>`).join("")}</urlset>`);
    } else if (path === "/testimonial.webm") {
      mediaRequests++;
      response.setHeader("content-type", "video/webm");
      response.end("x".repeat(128 * 1024));
    } else if (path === "/about") {
      response.end("<html><head><title>About</title></head><body><p>About us</p><a href='/'>Home</a></body></html>");
    } else if (path === "/llms.txt" || path === "/llms-full.txt") {
      response.end("# Site instructions");
    } else {
      response.end("<html><head><title>Home</title></head><body><nav><a href='/about?utm_source=x'>About</a><a href='/testimonial.webm'>Testimonial</a></nav><p>Welcome to our helpful site with real content.</p></body></html>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not bind");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); });
afterEach(() => { fixtureMode = "normal"; vi.restoreAllMocks(); });

describe("crawler", () => {
  it("normalizes tracking parameters and fragments", () => {
    expect(normalizeUrl("https://EXAMPLE.com/a/?utm_source=x&b=2#top")).toBe("https://example.com/a?b=2");
  });

  it("discovers robots, llms files, sitemap URLs, internal links, and page snapshots", async () => {
    const snapshot = await crawlSite(baseUrl, { maxPages: 5, render: "never", testOnlyAllowPrivate: true });
    expect(snapshot.robotsTxt?.status).toBe(200);
    expect(snapshot.llmsTxt?.body).toContain("Site instructions");
    expect(snapshot.llmsFullTxt?.status).toBe(200);
    expect(snapshot.sitemaps.flatMap((item) => item.entries).map((entry) => entry.loc)).toContain(`${baseUrl}/about`);
    expect(snapshot.pages.map((page) => new URL(page.url).pathname)).toContain("/about");
    expect(snapshot.links.some((link) => link.anchor === "About" && link.to === `${baseUrl}/about`)).toBe(true);
  });

  it("detects common stacks and JS shells", () => {
    expect(detectStack({ rawHtml: "<script id='__NEXT_DATA__'></script>", headers: { "x-vercel-id": "abc" } })).toEqual(["Next.js", "Vercel"]);
    expect(needsRendering("<html><body><div id='root'></div><script src='/bundle.js'></script></body></html>")).toBe(true);
    expect(needsRendering("<html><body><h1>Useful content</h1></body></html>")).toBe(false);
  });

  it("fills the page limit from sitemaps without spending the HTML budget on linked media", async () => {
    const before = mediaRequests;
    const snapshot = await crawlSite(baseUrl, { maxPages: 5, render: "never", testOnlyAllowPrivate: true, maxBytes: 64 * 1024, totalByteBudgetBytes: 64 * 1024 });
    expect(snapshot.pages).toHaveLength(5);
    expect(snapshot.uncrawled.length).toBeGreaterThan(0);
    expect(snapshot.uncrawled).toContain(`${baseUrl}/testimonial.webm`);
    expect(mediaRequests).toBe(before);
  });

  it("rejects private crawl and browser destinations outside the explicit fixture mode", async () => {
    await expect(crawlSite(baseUrl)).rejects.toThrow();
    const renderer = new PlaywrightRenderer();
    try {
      await expect(renderer.render({ url: baseUrl })).rejects.toThrow();
      await expect(renderer.render({ url: "http://localhost" })).rejects.toThrow();
    } finally {
      await renderer.close();
    }
  });

  it("counts discovery bodies against the shared byte budget", async () => {
    fixtureMode = "large-discovery";
    const before = requestedPaths.length;
    const site = await crawlSite(baseUrl, { render: "never", testOnlyAllowPrivate: true, maxBytes: 128, totalByteBudgetBytes: 128 });
    expect(requestedPaths.slice(before)).toEqual(["/robots.txt"]);
    expect(site.pages).toHaveLength(0);
    expect(site.uncrawled).toContain(`${baseUrl}/`);
  });

  it("aborts discovery at the total deadline instead of granting each request a fresh timeout", async () => {
    fixtureMode = "slow-discovery";
    const before = requestedPaths.length;
    const site = await crawlSite(baseUrl, { render: "never", testOnlyAllowPrivate: true, totalBudgetMs: 75, timeoutMs: 2000 });
    expect(requestedPaths.slice(before)).toEqual(["/robots.txt"]);
    expect(site.pages).toHaveLength(0);
  });

  it("discovers the raw and rendered link union once without replacing raw HTML", async () => {
    fixtureMode = "spa";
    vi.spyOn(PlaywrightRenderer.prototype, "render").mockImplementation(async ({ url }) => ({
      url, finalUrl: url, status: 200, headers: {}, redirectChain: [], body: "", truncated: false,
      timing: { ttfbMs: 1, totalMs: 1 }, consoleErrors: 0, renderer: "chromium",
      renderedHtml: "<html><body><a href='/raw'>Raw</a><a href='/hydrated'>Hydrated</a><a href='/hydrated'>Hydrated</a></body></html>",
    }));
    const site = await crawlSite(baseUrl, { maxPages: 3, render: "always", testOnlyAllowPrivate: true });
    expect(site.pages.map((page) => new URL(page.url).pathname)).toEqual(["/", "/raw", "/hydrated"]);
    expect(site.links.filter((link) => link.from === `${baseUrl}/`)).toHaveLength(2);
    expect(site.pages[0]?.rawHtml).not.toContain("Hydrated");
    expect(site.pages[0]?.renderedHtml).toContain("Hydrated");
  });

  it("caps discovery operations while retaining the initial page snapshot", async () => {
    fixtureMode = "spa";
    const before = requestedPaths.length;
    const site = await crawlSite(baseUrl, { maxPages: 1, render: "never", testOnlyAllowPrivate: true, maxDiscoveryRequests: 1 });
    expect(requestedPaths.slice(before)).toEqual(["/robots.txt", "/"]);
    expect(site.pages).toHaveLength(1);
  });

  it("caps attempted frontier URLs even when no HTML page succeeds", async () => {
    fixtureMode = "non-html-pages";
    const before = requestedPaths.length;
    const site = await crawlSite(baseUrl, { maxPages: 1, maxPageAttempts: 3, render: "never", testOnlyAllowPrivate: true });
    expect(requestedPaths.slice(before).filter((path) => path === "/" || path.startsWith("/download-"))).toEqual(["/", "/download-0", "/download-1"]);
    expect(site.pages).toHaveLength(0);
    expect(site.uncrawled).toContain(`${baseUrl}/download-2`);
  });

  it("charges browser raw fetches, redirect bodies, and binary resources to the shared crawl byte budget", async () => {
    fixtureMode = "spa";
    let assetBytes = 0;
    let rawBytes = 0;
    vi.spyOn(PlaywrightRenderer.prototype, "render").mockImplementation(async ({ url, guardedFetch }) => {
      if (!guardedFetch) throw new Error("Crawler must inject its guarded budget transport");
      const raw = await guardedFetch(url, { includeBodyBytes: true });
      rawBytes = raw.bodyBytes?.byteLength ?? 0;
      const asset = await guardedFetch(`${baseUrl}/resource-jump`, { includeBodyBytes: true });
      assetBytes = asset.bodyBytes?.byteLength ?? 0;
      expect(asset.bytesRead).toBe(512 - 2 * rawBytes);
      expect(asset.truncated).toBe(true);
      await expect(guardedFetch(`${baseUrl}/hydrated`, {})).rejects.toThrow("budget exhausted");
      return { ...raw, consoleErrors: 0, renderer: "chromium", renderedHtml: "<html><body><a href='/hydrated'>Hydrated</a></body></html>" };
    });
    const site = await crawlSite(baseUrl, { maxPages: 3, render: "always", testOnlyAllowPrivate: true, maxBytes: 512, totalByteBudgetBytes: 512 });
    expect(rawBytes).toBeGreaterThan(0);
    expect(assetBytes).toBe(512 - 2 * rawBytes - 64);
    expect(site.pages).toHaveLength(1);
    expect(site.uncrawled).toContain(`${baseUrl}/hydrated`);
  });

  it("charges browser operations to the same total HTTP request cap", async () => {
    fixtureMode = "spa";
    vi.spyOn(PlaywrightRenderer.prototype, "render").mockImplementation(async ({ url, guardedFetch }) => {
      if (!guardedFetch) throw new Error("Crawler must inject its guarded budget transport");
      const raw = await guardedFetch(url, {});
      await expect(guardedFetch(`${baseUrl}/asset.bin`, {})).rejects.toThrow("HTTP request limit");
      return { ...raw, consoleErrors: 0, renderer: "chromium", renderedHtml: "<html><body>Rendered page</body></html>" };
    });
    // robots + initial page + two llms files + sitemap + renderer raw request = six.
    const before = requestedPaths.length;
    const site = await crawlSite(baseUrl, { maxPages: 1, render: "always", testOnlyAllowPrivate: true, maxRequests: 6 });
    expect(requestedPaths.slice(before)).toHaveLength(6);
    expect(site.pages[0]?.renderedHtml).toContain("Rendered page");
  });

  it("reserves redirect hops against the shared HTTP request cap before dispatch", async () => {
    fixtureMode = "spa";
    vi.spyOn(PlaywrightRenderer.prototype, "render").mockImplementation(async ({ url, guardedFetch }) => {
      if (!guardedFetch) throw new Error("Crawler must inject its guarded budget transport");
      const raw = await guardedFetch(url, {});
      await expect(guardedFetch(`${baseUrl}/resource-jump`, {})).rejects.toThrow("Too many redirects");
      return { ...raw, consoleErrors: 0, renderedHtml: "<html><body>Bounded render</body></html>" };
    });
    const before = requestedPaths.length;
    await crawlSite(baseUrl, { maxPages: 1, render: "always", testOnlyAllowPrivate: true, maxRequests: 7 });
    expect(requestedPaths.slice(before)).toHaveLength(7);
    expect(requestedPaths.slice(before)).not.toContain("/asset.bin");
  });

  for (const redirectHost of ["www.example.test", "unrelated.test"]) {
    it(`handles initial redirect to ${redirectHost} without broadening unrelated scope`, async () => {
      fixtureMode = "spa";
      const actualFetch = core.safeFetch;
      const requests: string[] = [];
      // Adapt public-host HTTP results to the local fixture; safeFetch itself owns redirect validation.
      vi.spyOn(core, "safeFetch").mockImplementation(async (url, options) => {
        requests.push(url);
        const requested = new URL(url);
        const response = await actualFetch(new URL(requested.pathname + requested.search, baseUrl).href, { ...options, allowPrivate: true });
        const redirected = url === "http://example.test/";
        return { ...response, url, finalUrl: redirected ? `http://${redirectHost}/` : url, redirectChain: redirected ? [url] : [] };
      });
      const site = await crawlSite("http://example.test", { maxPages: 3, render: "never", testOnlyAllowPrivate: true });
      if (redirectHost === "www.example.test") {
        expect(site.origin).toBe("http://www.example.test");
        expect(site.pages.map((page) => page.finalUrl)).toEqual(["http://www.example.test/", "http://www.example.test/raw"]);
        expect(requests).toContain("http://www.example.test/robots.txt");
        expect(requests).toContain("http://www.example.test/llms.txt");
        expect(requests).toContain("http://www.example.test/sitemap.xml");
      } else {
        expect(site.origin).toBe("http://example.test");
        expect(site.pages).toHaveLength(1);
        expect(requests.some((url) => new URL(url).hostname === redirectHost)).toBe(false);
      }
    });
  }
});
