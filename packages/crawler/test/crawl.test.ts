import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { crawlSite, detectStack, needsRendering, normalizeUrl, PlaywrightRenderer } from "../src/index.ts";

let server: Server;
let baseUrl: string;
let mediaRequests = 0;

beforeAll(async () => {
  server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    response.setHeader("content-type", path.endsWith(".xml") ? "application/xml" : "text/html; charset=utf-8");
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
});
