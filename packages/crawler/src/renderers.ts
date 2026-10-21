import { lookup } from "node:dns/promises";
import { createServer, isIP } from "node:net";
import type { Browser, BrowserContext, ConsoleMessage, Route } from "playwright-core";
import { safeFetch, type SafeFetchOptions, type SafeResponse } from "@aeo/core";
import { isPublicAddress } from "@aeo/core";

export type RendererMode = "none" | "chromium" | "lightpanda" | "cdp";

export interface RenderRequest {
  url: string;
  timeoutMs?: number;
  userAgent?: string;
  signal?: AbortSignal;
  blockHeavyResources?: boolean;
  /** Internal transport hook for sharing the crawler's guarded fetch budget. */
  guardedFetch?: typeof safeFetch;
}

export interface RenderResult extends SafeResponse {
  renderedHtml?: string;
  renderer?: string;
  consoleErrors: number;
  renderTiming?: {
    navigationMs: number;
    domReadyMs: number;
    lcpMs?: number;
    cls?: number;
    longTasks?: number;
  };
}

export interface Renderer {
  readonly mode: RendererMode;
  render(request: RenderRequest): Promise<RenderResult>;
  close(): Promise<void>;
}

export interface BrowserRendererOptions {
  cdpEndpoint?: string;
  blockHeavyResources?: boolean;
  userAgent?: string;
  /** Test-only loopback access; see RenderRequest.allowPrivate. */
  allowPrivate?: boolean;
}

async function networkSink() {
  const server = createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") { server.close(); throw new Error("Browser network sink did not bind"); }
  return {
    server: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function rendererTransport(request: RenderRequest) {
  const controller = new AbortController();
  const signal = request.signal ? AbortSignal.any([request.signal, controller.signal]) : controller.signal;
  const fetch = request.guardedFetch ?? safeFetch;
  const waiting = new Set<() => void>();
  let requests = 0;
  let bytes = 0;
  let reserved = 0;
  let active = 0;
  const byteLimit = 10 * 1024 * 1024;
  const wake = () => { for (const resolve of waiting) resolve(); waiting.clear(); };
  signal.addEventListener("abort", wake, { once: true });
  const stop = (message: string): never => { const error = new Error(message); controller.abort(error); throw error; };
  return {
    signal,
    async fetch(url: string, options: SafeFetchOptions): Promise<SafeResponse> {
      if (++requests > 100) stop("Browser rendering stopped: 100 request limit reached");
      for (;;) {
        signal.throwIfAborted();
        if (bytes >= byteLimit) stop("Browser rendering stopped: 10 MiB resource limit reached");
        if (active < 2 && bytes + reserved < byteLimit) break;
        await new Promise<void>((resolve) => waiting.add(resolve));
      }
      const reservation = Math.min(options.maxBytes ?? 5 * 1024 * 1024, byteLimit - bytes - reserved);
      reserved += reservation;
      active++;
      let charged = false;
      try {
        const response = await fetch(url, { ...options, maxBytes: reservation, signal, includeBodyBytes: true });
        bytes += response.bytesRead ?? response.bodyBytes?.byteLength ?? Buffer.byteLength(response.body);
        charged = true;
        if (response.truncated || bytes >= byteLimit) stop("Browser rendering stopped: resource byte limit reached");
        return response;
      } catch (error) {
        // Failed redirect chains can already have consumed bodies before their final URL is rejected.
        if (!charged) {
          bytes += reservation;
          if (bytes >= byteLimit) stop("Browser rendering stopped: resource byte limit reached");
        }
        throw error;
      } finally {
        active--;
        reserved -= reservation;
        wake();
      }
    },
    close() { controller.abort(); signal.removeEventListener("abort", wake); },
  };
}

export class HttpRenderer implements Renderer {
  readonly mode = "none" as const;
  constructor(private readonly defaults: SafeFetchOptions = {}) {}
  async render(request: RenderRequest): Promise<RenderResult> {
    const response = await (request.guardedFetch ?? safeFetch)(request.url, {
      ...this.defaults,
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      ...(request.userAgent === undefined ? {} : { userAgent: request.userAgent }),
      ...(request.signal === undefined ? {} : { signal: request.signal }),
    });
    return { ...response, consoleErrors: 0 };
  }
  async close(): Promise<void> {}
}

abstract class CdpBrowserRenderer implements Renderer {
  abstract readonly mode: RendererMode;
  private browserPromise: Promise<Browser> | undefined;
  protected abstract connect(): Promise<Browser>;
  constructor(protected readonly options: BrowserRendererOptions = {}) {}

  async render(request: RenderRequest): Promise<RenderResult> {
    const transport = rendererTransport(request);
    try {
      const raw = await transport.fetch(request.url, {
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
        ...(request.userAgent ?? this.options.userAgent ? { userAgent: request.userAgent ?? this.options.userAgent } : {}),
        ...(request.signal ? { signal: request.signal } : {}),
      });
      const browser = await (this.browserPromise ??= this.connect());
      const proxy = await networkSink();
      try {
        const context: BrowserContext = await browser.newContext({
          serviceWorkers: "block",
          // Intercepted traffic is fulfilled below; missed browser HTTP requests must fail closed.
          proxy: { server: proxy.server, bypass: "<-loopback>" },
          ...(request.userAgent ?? this.options.userAgent ? { userAgent: request.userAgent ?? this.options.userAgent } : {}),
        });
        const signal = transport.signal;
        const cancel = () => { void context.close().catch(() => undefined); };
        try {
          signal.throwIfAborted();
          signal.addEventListener("abort", cancel, { once: true });
          await context.routeWebSocket(/.*/, (socket) => socket.close({ code: 1008, reason: "Audit renderer blocks WebSockets" }));
          await context.route("**/*", async (route: Route) => {
            try {
              const browserRequest = route.request();
              // Audits only read pages; mutation requests and arbitrary browser protocols are unsupported.
              if (browserRequest.method() !== "GET") { await route.abort("blockedbyclient"); return; }
              const resource = browserRequest.resourceType();
              if ((request.blockHeavyResources ?? this.options.blockHeavyResources) && ["font", "media"].includes(resource)) {
                await route.abort("blockedbyclient");
                return;
              }
              const browserHeaders = browserRequest.headers();
              const response = await transport.fetch(browserRequest.url(), {
                includeBodyBytes: true,
                headers: { ...(browserHeaders["accept"] ? { accept: browserHeaders["accept"] } : {}), ...(browserHeaders["accept-language"] ? { "accept-language": browserHeaders["accept-language"] } : {}) },
                ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
                ...(request.userAgent ?? this.options.userAgent ? { userAgent: request.userAgent ?? this.options.userAgent } : {}),
                signal,
              });
              const headers = { ...response.headers };
              for (const name of ["content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive", "proxy-connection", "te", "trailer", "location"]) delete headers[name];
              // Workers and embedded plugins would introduce execution contexts outside the page init script.
              headers["content-security-policy"] = [headers["content-security-policy"], "worker-src 'none'; object-src 'none'"].filter(Boolean).join(", ");
              await route.fulfill({ status: response.status, headers, body: response.bodyBytes ? Buffer.from(response.bodyBytes) : response.body });
            } catch {
              await route.abort("blockedbyclient").catch(() => undefined);
            }
          });
          await context.addInitScript(() => {
            for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection", "WebTransport", "Worker", "SharedWorker"]) {
              Object.defineProperty(globalThis, name, { value: undefined, configurable: false, writable: false });
            }
          });
          const page = await context.newPage();
          let consoleErrors = 0;
          page.on("console", (message: ConsoleMessage) => { if (message.type() === "error") consoleErrors++; });
          page.on("pageerror", () => { consoleErrors++; });
          await page.addInitScript(() => {
            const w = globalThis as unknown as { __aeoMetrics?: { lcp?: number; cls: number; longTasks: number } };
            w.__aeoMetrics = { cls: 0, longTasks: 0 };
            try {
              const Observer = (globalThis as unknown as { PerformanceObserver: new (callback: (list: { getEntries(): Array<{ startTime: number }> }) => void) => { observe(options: { type: string; buffered: boolean }): void } }).PerformanceObserver;
              new Observer((list) => {
                const entries = list.getEntries();
                const last = entries.at(-1);
                if (last && w.__aeoMetrics) w.__aeoMetrics.lcp = last.startTime;
              }).observe({ type: "largest-contentful-paint", buffered: true });
              const LayoutObserver = (globalThis as unknown as { PerformanceObserver: new (callback: (list: { getEntries(): Array<{ hadRecentInput?: boolean; value?: number }> }) => void) => { observe(options: { type: string; buffered: boolean }): void } }).PerformanceObserver;
              new LayoutObserver((list) => {
                if (!w.__aeoMetrics) return;
                for (const entry of list.getEntries()) {
                  if (!entry.hadRecentInput) w.__aeoMetrics.cls += entry.value ?? 0;
                }
                }).observe({ type: "layout-shift", buffered: true });
              const LongTaskObserver = (globalThis as unknown as { PerformanceObserver: new (callback: (list: { getEntries(): unknown[] }) => void) => { observe(options: { type: string; buffered: boolean }): void } }).PerformanceObserver;
              new LongTaskObserver((list) => {
                if (!w.__aeoMetrics) return;
                w.__aeoMetrics.longTasks += list.getEntries().length;
              }).observe({ type: "longtask", buffered: true });
            } catch { /* PerformanceObserver types vary by browser. */ }
          });
          const started = performance.now();
          await page.goto(raw.finalUrl, { waitUntil: "domcontentloaded", timeout: request.timeoutMs ?? 15_000 });
          const domReadyMs = Math.round(performance.now() - started);
          // Bounded network quiet approximation: allow hydration a short window, but never wait on analytics forever.
          await page.waitForLoadState("networkidle", { timeout: Math.min(2_000, request.timeoutMs ?? 15_000) }).catch(() => undefined);
          const renderedHtml = await page.locator("html").evaluate((element: { outerHTML: string }) => element.outerHTML);
          const metrics = await page.evaluate(() => (globalThis as unknown as { __aeoMetrics?: { lcp?: number; cls: number; longTasks: number } }).__aeoMetrics);
          signal.throwIfAborted();
          return {
            ...raw,
            finalUrl: page.url(),
            renderedHtml,
            renderer: this.mode,
            consoleErrors,
            renderTiming: {
              navigationMs: Math.round(performance.now() - started),
              domReadyMs,
              ...(metrics?.lcp === undefined ? {} : { lcpMs: Math.round(metrics.lcp) }),
              ...(metrics === undefined ? {} : { cls: metrics.cls }),
              ...(metrics?.longTasks === undefined ? {} : { longTasks: metrics.longTasks }),
            },
          };
        } finally {
          signal.removeEventListener("abort", cancel);
          await context.close();
        }
      } finally {
        await proxy.close();
      }
    } catch (error) {
      transport.signal.throwIfAborted();
      throw error;
    } finally {
      transport.close();
    }
  }

  async close(): Promise<void> {
    if (this.browserPromise) {
      const browser = await this.browserPromise.catch(() => undefined);
      await browser?.close();
      this.browserPromise = undefined;
    }
  }
}

export class PlaywrightRenderer extends CdpBrowserRenderer {
  readonly mode = "chromium" as const;
  protected async connect(): Promise<Browser> {
    const { chromium } = await import("playwright-core");
    return chromium.launch({ headless: true, args: ["--disable-quic", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"] });
  }
}

export class CdpRenderer extends CdpBrowserRenderer {
  readonly mode: RendererMode = "cdp";
  protected async connect(): Promise<Browser> {
    if (!this.options.cdpEndpoint) throw new Error("A CDP WebSocket endpoint is required");
    const endpoint = new URL(this.options.cdpEndpoint);
    if ((endpoint.protocol !== "ws:" && endpoint.protocol !== "wss:") || endpoint.username || endpoint.password) {
      throw new Error("CDP endpoint must be a credential-free ws:// or wss:// URL");
    }
    const hostname = endpoint.hostname.replace(/^\[|\]$/g, "");
    const loopbackEndpoint = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
    if (!loopbackEndpoint && (hostname.endsWith(".localhost") || hostname.endsWith(".internal") || hostname.endsWith(".local"))) {
      throw new Error("CDP endpoint host is not allowed");
    }
    if (!loopbackEndpoint) {
      const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
      if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address.address))) {
        throw new Error("CDP endpoint resolves to a non-public address");
      }
    }
    const { chromium } = await import("playwright-core");
    return chromium.connectOverCDP(this.options.cdpEndpoint);
  }
}

export class LightpandaRenderer extends CdpRenderer {
  override readonly mode = "lightpanda" as const;
}
