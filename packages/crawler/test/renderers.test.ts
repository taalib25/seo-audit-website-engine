import http from "node:http";
import { gzipSync } from "node:zlib";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { safeFetch } from "@aeo/core";
import { PlaywrightRenderer } from "../src/renderers.ts";

let server: http.Server;
let origin: string;
const requested: string[] = [];
const binary = Buffer.from([0, 255, 128, 254, 10]);
const request = http.request;

beforeAll(async () => {
  server = http.createServer((req, response) => {
    const path = new URL(req.url ?? "/", "http://fixture.example").pathname;
    requested.push(path);
    if (path === "/unsafe-redirect") {
      response.writeHead(302, { location: `${origin}/private-target` });
      response.end();
    } else if (path === "/bytes") {
      const body = gzipSync(binary);
      response.writeHead(200, { "content-type": "application/octet-stream", "content-encoding": "gzip", "content-length": String(body.length) });
      response.end(body);
    } else if (path === "/hydrate.js") {
      response.writeHead(200, { "content-type": "application/javascript" });
      response.end(`
        document.querySelector('h1').textContent='Hydrated';
        fetch('/bytes').then(r=>r.arrayBuffer()).then(b=>document.body.dataset.bytes=Array.from(new Uint8Array(b)).join(','));
        fetch('/unsafe-redirect').then(()=>document.body.dataset.redirect='allowed').catch(()=>document.body.dataset.redirect='blocked');
        fetch('/mutate',{method:'POST',body:'change'}).catch(()=>{});
        new WebSocket('ws://fixture.example/socket');
        document.body.dataset.directApis=[typeof RTCPeerConnection,typeof WebTransport,typeof Worker,typeof SharedWorker].join(',');
        const frame=document.createElement('iframe'); document.body.append(frame);
        document.body.dataset.frameRtc=typeof frame.contentWindow.RTCPeerConnection;
      `);
    } else if (path === "/mutate" || path === "/private-target") {
      response.end("must not be fetched");
    } else if (path === "/request-budget") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html><body><script>for(let i=0;i<110;i++)fetch('/request-'+i).catch(()=>{});</script></body></html>");
    } else if (path === "/byte-budget") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<html><body><script>for(let i=0;i<3;i++)fetch('/large-'+i).catch(()=>{});</script></body></html>");
    } else if (path.startsWith("/large-")) {
      response.end(Buffer.alloc(4 * 1024 * 1024, 255));
    } else {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><html><body><h1>Raw</h1><script src='/hydrate.js'></script></body></html>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test HTTP port");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

afterEach(() => { vi.restoreAllMocks(); requested.length = 0; });

function fixtureTransport() {
  // Only the test's public fixture connection is remapped; safeFetch still validates every redirect URL.
  return vi.spyOn(http, "request").mockImplementation((url, options, callback) => {
    const target = new URL(url);
    if (target.hostname !== "fixture.example") throw new Error(`Unexpected fixture URL: ${target.href}`);
    return request(new URL(`${target.pathname}${target.search}`, origin), options, callback);
  });
}

describe("guarded browser transport", () => {
  it("rejects a private redirect before making the redirected connection", async () => {
    const connections = fixtureTransport();
    await expect(safeFetch("http://fixture.example/unsafe-redirect")).rejects.toThrow();
    expect(connections).toHaveBeenCalledTimes(1);
    expect(requested).toEqual(["/unsafe-redirect"]);
  });

  it("preserves compressed binary resource bytes through safeFetch", async () => {
    fixtureTransport();
    const result = await safeFetch("http://fixture.example/bytes", { includeBodyBytes: true });
    expect(result.bodyBytes).toEqual(binary);
  });

  it.skipIf(!existsSync(chromium.executablePath()))("hydrates pages through guarded requests and blocks bypass paths", async () => {
    fixtureTransport();
    const renderer = new PlaywrightRenderer();
    try {
      const guardedFetch = vi.fn(safeFetch);
      const result = await renderer.render({ url: "http://fixture.example/", timeoutMs: 5000, guardedFetch });
      expect(result.renderedHtml).toContain("<h1>Hydrated</h1>");
      expect(result.renderedHtml).toContain('data-bytes="0,255,128,254,10"');
      expect(result.renderedHtml).toContain('data-redirect="blocked"');
      expect(result.renderedHtml).toContain('data-direct-apis="undefined,undefined,undefined,undefined"');
      expect(result.renderedHtml).toContain('data-frame-rtc="undefined"');
      expect(requested).toContain("/hydrate.js");
      expect(requested).toContain("/bytes");
      expect(requested).toContain("/unsafe-redirect");
      expect(requested).not.toContain("/private-target");
      expect(requested).not.toContain("/mutate");
      expect(requested).not.toContain("/socket");
      expect(guardedFetch.mock.calls.some(([url]) => url.endsWith("/hydrate.js"))).toBe(true);
      expect(guardedFetch.mock.calls.some(([url]) => url.endsWith("/bytes"))).toBe(true);
    } finally {
      await renderer.close();
    }
  }, 30_000);

  it.skipIf(!existsSync(chromium.executablePath()))("stops the entire render when resource request count is exhausted", async () => {
    fixtureTransport();
    const renderer = new PlaywrightRenderer();
    try {
      await expect(renderer.render({ url: "http://fixture.example/request-budget", timeoutMs: 5000 })).rejects.toThrow("100 request limit");
      expect(requested.filter((path) => path.startsWith("/request-")).length).toBeLessThanOrEqual(100);
    } finally { await renderer.close(); }
  }, 30_000);

  it.skipIf(!existsSync(chromium.executablePath()))("stops the entire render when combined resource bytes are exhausted", async () => {
    fixtureTransport();
    const renderer = new PlaywrightRenderer();
    try {
      await expect(renderer.render({ url: "http://fixture.example/byte-budget", timeoutMs: 5000 })).rejects.toThrow("resource byte limit");
    } finally { await renderer.close(); }
  }, 30_000);
});
