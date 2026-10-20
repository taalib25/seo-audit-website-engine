import { describe, expect, it } from "vitest";
import type { SiteSnapshot } from "@aeo/core";
import { runFullAudit } from "../src/index.ts";

const site: SiteSnapshot = {
  startUrl: "https://example.test/", origin: "https://example.test", sitemaps: [],
  pages: [{ url: "https://example.test/", finalUrl: "https://example.test/", status: 200, redirectChain: [], headers: { "content-type": "text/html" }, rawHtml: "<html><head><title>Example</title><meta name=description content='A test'></head><body><h1>Example</h1></body></html>", timing: { ttfbMs: 1, totalMs: 2 }, depth: 0 }],
  links: [], uncrawled: [], crawledAt: new Date(0).toISOString(),
};

describe("runFullAudit", () => {
  it("runs checks and builds the actual fix prompt without network access", async () => {
    const events: string[] = [];
    const result = await runFullAudit({ url: site.startUrl, maxPages: 1, render: "never", llm: false, probe: false, onProgress: (event) => events.push(event.type) }, {
      env: {}, crawl: async () => site, detectStack: () => ["test-stack"],
    });
    expect(result.report.pagesCrawled).toBe(1);
    expect(result.report.stack).toEqual(["test-stack"]);
    expect(result.prompt.markdown).toContain("SEO/AEO/GEO fix plan");
    expect(result.traces).toEqual([]);
    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
    expect(events).toContain("crawl:start");
    expect(events).toContain("checks:start");
    expect(events).toContain("done");
  });
});
