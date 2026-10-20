import { describe, expect, it } from "vitest";
import { createGscClient, buildGscOAuthUrl } from "../src/gsc.ts";
import { createIndexNowClient, generateIndexNowKey, indexNowKeyFile } from "../src/indexnow.ts";
import { createProber } from "../src/probe.ts";
import { buildServices } from "../src/services.ts";

describe("integrations", () => {
  it("uses the read-only GSC scope and validates API payloads", async () => {
    const url = new URL(buildGscOAuthUrl({ clientId: "client", redirectUri: "https://app.example/callback", state: "csrf" }));
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/webmasters.readonly");
    const client = createGscClient("secret-token", { minIntervalMs: 0, fetch: async () => new Response(JSON.stringify({ siteEntry: [{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }] }), { status: 200 }) });
    expect(await client.listSites()).toEqual([{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }]);
  });

  it("creates IndexNow key material and submits same-host URLs", async () => {
    const key = generateIndexNowKey(); expect(key).toMatch(/^[a-f0-9]{32}$/); expect(indexNowKeyFile(key).content).toBe(key);
    let sent = "";
    const client = createIndexNowClient({ key, origin: "https://example.com", fetch: async (_input, init) => { sent = String(init?.body); return new Response(null, { status: 202 }); } });
    expect(await client.submitUrls(["https://example.com/a"])).toEqual({ status: 202, accepted: true });
    expect(sent).toContain('"urlList":["https://example.com/a"]');
  });

  it("measures sampled AI citations and estimates cost", async () => {
    const prober = createProber({ llmClientLike: { complete: async () => ({ text: "Example is a good option", citations: [{ url: "https://www.example.com/page" }] }) }, queries: [{ query: "best example", model: "provider/model", competitors: ["rival.com"] }], samples: 2, costPerSampleUsd: 0.01 });
    expect(prober.estimateCostUsd()).toBe(0.02); const result = await prober.run("https://example.com"); expect(result.citedRate).toBe(1); expect(result.brandMentionRate).toBe(1);
  });

  it("builds only configured connectors and rejects malformed env", () => {
    const services = buildServices({ GSC_ACCESS_TOKEN: "token" }); expect(services.gsc).toBeDefined(); expect(services.bing).toBeUndefined();
    expect(() => buildServices({ INDEXNOW_KEY: "short" })).toThrow();
  });
});
