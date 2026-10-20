import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Browser, BrowserContext, ConsoleMessage, Route } from "playwright-core";
import { assertSafeUrl, safeFetch, type SafeFetchOptions, type SafeResponse } from "@aeo/core";
import { isPublicAddress } from "@aeo/core";

export type RendererMode = "none" | "chromium" | "lightpanda" | "cdp";

export interface RenderRequest {
  url: string;
  timeoutMs?: number;
  userAgent?: string;
  signal?: AbortSignal;
  blockHeavyResources?: boolean;
}

export interface RenderResult extends SafeResponse {
  renderedHtml?: string;
  renderer?: string;
  consoleErrors: number;
  renderTiming?: { navigationMs: number; domReadyMs: number; lcpMs?: number; cls?: number };
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
}

export class HttpRenderer implements Renderer {
  readonly mode = "none" as const;
  constructor(private readonly defaults: SafeFetchOptions = {}) {}
  async render(request: RenderRequest): Promise<RenderResult> {
    const response = await safeFetch(request.url, {
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
    const raw = await safeFetch(request.url, {
      ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
      ...(request.userAgent ?? this.options.userAgent ? { userAgent: request.userAgent ?? this.options.userAgent } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    });
    const browser = await (this.browserPromise ??= this.connect());
    const context: BrowserContext = await browser.newContext({
      ...(request.userAgent ?? this.options.userAgent ? { userAgent: request.userAgent ?? this.options.userAgent } : {}),
    });
    try {
      const page = await context.newPage();
      let consoleErrors = 0;
      page.on("console", (message: ConsoleMessage) => { if (message.type() === "error") consoleErrors++; });
      page.on("pageerror", () => { consoleErrors++; });
      await page.route("**/*", async (route: Route) => {
        const target = route.request().url();
        try {
          const checked = assertSafeUrl(target);
          const addresses = await lookup(checked.hostname, { all: true, verbatim: true });
          if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address.address))) {
            await route.abort("blockedbyclient");
            return;
          }
          const resource = route.request().resourceType();
          if ((request.blockHeavyResources ?? this.options.blockHeavyResources) && ["font", "media"].includes(resource)) {
            await route.abort("blockedbyclient");
            return;
          }
          await route.continue();
        } catch {
          await route.abort("blockedbyclient");
        }
      });
      await page.addInitScript(() => {
        const w = globalThis as unknown as { __aeoMetrics?: { lcp?: number; cls: number } };
        w.__aeoMetrics = { cls: 0 };
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
        } catch { /* PerformanceObserver types vary by browser. */ }
      });
      const started = performance.now();
      await page.goto(raw.finalUrl, { waitUntil: "domcontentloaded", timeout: request.timeoutMs ?? 15_000 });
      const domReadyMs = Math.round(performance.now() - started);
      // Bounded network quiet approximation: allow hydration a short window, but never wait on analytics forever.
      await page.waitForLoadState("networkidle", { timeout: Math.min(2_000, request.timeoutMs ?? 15_000) }).catch(() => undefined);
      const renderedHtml = await page.locator("html").evaluate((element: { outerHTML: string }) => element.outerHTML);
      const metrics = await page.evaluate(() => (globalThis as unknown as { __aeoMetrics?: { lcp?: number; cls: number } }).__aeoMetrics);
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
        },
      };
    } finally {
      await context.close();
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
    return chromium.launch({ headless: true });
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
