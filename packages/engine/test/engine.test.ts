import { describe, expect, it } from "vitest";
import type { SiteSnapshot } from "@aeo/core";
import { listEngineChecks, runFullAudit, type EngineProgress } from "../src/index.ts";

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

  it("reports explicitly selected LLM checks as skipped without a configured client", async () => {
    const check = (await listEngineChecks()).find((item) => item.kind === "llm");
    if (!check) throw new Error("Expected an LLM check");
    const events: EngineProgress[] = [];
    const result = await runFullAudit({ url: site.startUrl, maxPages: 1, render: "never", llm: false, probe: false, ids: [check.id], onProgress: (event) => events.push(event) }, { env: {}, crawl: async () => site });
    expect(result.report.results).toHaveLength(1);
    expect(result.report.results[0]?.status).toBe("skip");
    const event = events.find((item) => item.type === "check:result");
    expect(event?.type === "check:result" && event.result).toEqual(result.report.results[0]);
  });

  it("uses the configured query model for visibility samples", async () => {
    const models: Array<string | undefined> = [];
    const result = await runFullAudit({ url: site.startUrl, maxPages: 1, render: "never", llm: false, probe: true, ids: ["geo.visibility.cited-rate"] }, {
      env: { OPENROUTER_API_KEY: "test-key", PROBE_QUERIES: JSON.stringify([{ query: "Which example?", model: "provider/query-model" }]) },
      crawl: async () => site,
      createClient: () => ({
        async judge(request) { models.push(request.model); return request.schema.parse({ text: "Example", citations: [{ url: site.startUrl }] }); },
        getPromptTraces: () => [], getUsage: () => ({ inputTokens: 0, outputTokens: 0, costUsd: 0 }), resetAuditMeter() {},
      }),
    });
    expect(models).toEqual(["provider/query-model"]);
    expect(result.report.results[0]?.status).toBe("pass");
  });

  it("cancels remaining work when a consumer rejects progress output", async () => {
    let signal: AbortSignal | undefined;
    await expect(runFullAudit({ url: site.startUrl, maxPages: 1, render: "never", llm: false, probe: false, onProgress: (event) => { if (event.type === "checks:start") throw new Error("Output storage full"); } }, {
      env: {}, crawl: async (_url, options) => { signal = options?.signal; return site; },
    })).rejects.toThrow("Output storage full");
    expect(signal?.aborted).toBe(true);
  });
});
