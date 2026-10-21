# Browser and crawl research

**Checked:** 2026-10-20 · Primary sources and current package releases where verifiable.

## Verdict

Build a two-stage crawler: use bounded plain HTTP + Cheerio for discovery and the default raw-HTML audit; render pages when hydrated DOM, browser timing, or screenshots are requested or when static signals say the page is JS-dependent. Start with local Chromium through `playwright-core` as the rendering default. Keep the renderer behind an interface so Lightpanda can be trialed as a lower-cost DOM renderer and remote CDP providers can be configured later. Always retain a Chromium fallback for pages Lightpanda cannot render correctly. Never make an arbitrary public URL fetch directly from the web app process without an egress-isolated worker/proxy.

This is the practical meaning of “lighter but works”: most URLs do not need a browser; Chromium is the known-compatible option for the minority that do. Lightpanda’s claimed savings are interesting, but its supported APIs are partial and screenshots/layout are outside its design.

## Browser and renderer options

### Lightpanda

- Zig browser from scratch, not Chromium/WebKit. The project currently labels it **Beta / work in progress** despite stable `1.0.x` browser tags. The repo lists HTML/DOM, V8, Fetch/XHR, CDP, cookies, headers, proxying, and network interception, while explicitly saying Web API coverage is incomplete and may error or crash on sites. JS execution works for some SPA-style pages; it is not a Chrome-equivalent compatibility target. [README/status and API list](https://github.com/lightpanda-io/browser#status) · [releases](https://github.com/lightpanda-io/browser/releases)
- **Windows:** no native Windows binary is offered in the install instructions; use WSL2 or Docker on a Windows dev machine. The supported deploy path is Linux containers. [Install/quickstart](https://lightpanda.io/docs/quickstart/)
- **CDP clients:** documented examples use `puppeteer-core.connect({ browserWSEndpoint })` and `chromium.connectOverCDP(...)` from `playwright-core`; integration is real, but a partial browser means some client APIs/features may still fail. [Puppeteer/CDP](https://lightpanda.io/docs/usage/cdp/puppeteer) · [Playwright quickstart](https://lightpanda.io/docs/quickstart/installation-and-setup)
- **Cloud:** Lightpanda Cloud exposes `wss://` CDP endpoints, including EU West and US West. [Cloud endpoints](https://lightpanda.io/docs/usage/cdp/puppeteer)
- **Version/maturity detail:** GitHub’s latest browser tag is 1.0.1 (Oct 15, 2026); npm’s `@lightpanda/browser` wrapper is 1.6.0. Pin/check the wrapper and downloaded binary together. [npm package/version](https://www.npmjs.com/package/@lightpanda/browser)
- **Performance:** the project currently advertises around 9x less memory and 11x faster than Chrome on npm; its docs/repo have used other figures (e.g. 16x/9x). These are vendor benchmarks, workload-dependent and not an SLA; benchmark representative sites before using them for capacity planning. [npm benchmark claims](https://www.npmjs.com/package/@lightpanda/browser) · [benchmark method/repo](https://github.com/lightpanda-io/browser#benchmarks)
- **Failure modes / feature fit:** unsupported browser APIs and site-specific JS/runtime assumptions; possible render errors/crashes. No layout/rendering engine means no faithful visual screenshot and no layout metrics. Use it only for DOM extraction/timing experiments and fall back to Chromium on errors, empty/obviously incomplete DOM, or audit features requiring screenshots.

### agent-browser

`agent-browser` is a browser-automation **CLI for AI agents**, not a crawl framework or a Node browser API. It exposes actions/snapshots, accessibility refs, sessions, and screenshots. Current architecture is a Rust CLI/daemon controlling Chrome for Testing over CDP; `--engine lightpanda` is also available. Latest release verified: **v0.39.1 (Oct 13, 2026)**; the repo shows active releases through October and supports Windows x64. Its programmatic integration from Node is subprocess/CLI (or direct CDP with a separate browser client), not a stable crawler-oriented typed API. Good for agent QA and manual/exploratory automation; poor fit as the engine’s crawl backend because URL queueing, robots policy, crawl scope, and extraction orchestration remain yours. [Releases/activity](https://github.com/vercel-labs/agent-browser/releases) · [README/architecture/platforms](https://github.com/vercel-labs/agent-browser)

### Chromium, Puppeteer, and remote browsers

- **Recommended renderer:** `playwright-core` 1.63.0 plus a pinned Chromium build installed by Playwright. `playwright-core` avoids bundling a browser in the package; deploy the matching browser in the worker/container image. Playwright installs a regular Chromium and a separate Chromium headless shell; shell is a good headless default, and `channel: "chromium"` selects new headless mode if needed. Its browser distribution works on Windows, Linux, and macOS. [Browser install/headless shell](https://playwright.dev/docs/browsers) · [release notes](https://playwright.dev/docs/release-notes)
- **CDP / Puppeteer:** `puppeteer-core` 25.14.0 is also current and works well if using a direct Chromium/CDP surface. It does not download Chrome. Playwright is the better default here for explicit browser management, contexts, routing, and richer cross-browser API; Puppeteer is a credible smaller alternative if Chrome-only and its API suits the team. [Puppeteer core](https://www.npmjs.com/package/puppeteer-core) · [connect API](https://pptr.dev/api/puppeteer.puppeteer.connect)
- **Cloudflare Browser Run** (renamed from Browser Rendering in 2026): options include a browser session via `@cloudflare/puppeteer` 1.1.0 / browser binding or generic CDP; plus quick-action `/crawl`, `/markdown`, `/screenshot`, and related endpoints. `/crawl` can discover links/sitemaps, render or static fetch, and return HTML/Markdown/JSON; it respects robots.txt and crawl-delay, but cannot bypass CAPTCHA/bot detection. This is compelling if deployed on Workers and the endpoint’s managed crawl behavior is acceptable; it gives less control over per-page raw-vs-rendered comparison, SSRF policy, and audit timing than owning the queue. Current free limits include 5 crawl jobs/day and 100 pages/job; paid limits/pricing can change. [Crawl endpoint](https://developers.cloudflare.com/api/resources/browser_rendering/subresources/crawl/methods/create/) · [crawl launch details](https://developers.cloudflare.com/changelog/post/2026-03-10-br-crawl-endpoint/) · [Puppeteer binding](https://developers.cloudflare.com/browser-run/puppeteer/) · [limits](https://developers.cloudflare.com/browser-run/limits/)
- **Browserbase, Steel, Hyperbrowser:** managed remote Chrome/CDP services; connect Playwright/Puppeteer to a per-job session WebSocket, use provider lifecycle APIs, and keep the same `Renderer` contract. Useful to avoid hosting browser binaries and for burst concurrency, but they add cost, data-transfer/privacy considerations, vendor limits, and another SSRF/network boundary. Browserbase supports CDP sessions; Steel has hosted and self-hosted options; Hyperbrowser provides session creation plus `wsEndpoint`. Choose one only after measuring local/container ops or regional concurrency needs. [Browserbase quickstart](https://docs.browserbase.com/quickstart) · [Steel CDP](https://docs.steel.dev/overview/authentication) · [Steel self-hosted/local runtime](https://docs.steel.dev/overview/steel-cli) · [Hyperbrowser sessions](https://www.hyperbrowser.ai/browser-sessions)
- **CUA/computer-use:** not suitable for the crawl backend. Screenshot → vision → mouse/keyboard is slower, less deterministic, and aimed at agents operating interfaces. Use DOM/CDP automation for extraction; CUA may be an optional human/agent remediation feature, not crawl infrastructure.

## Crawl orchestration

Use **Crawlee 3.18.2** (stable) if you want an established queue/retry/session/concurrency layer. It offers separate Cheerio and Playwright crawlers with a shared style of request handling. Crawlee v4 is still beta/RC churn as of this research, so do not start a product backend on it without a targeted evaluation. An adaptive design can first fetch with Cheerio and enqueue only pages needing render; Crawlee’s v4 docs explicitly show Cheerio + Playwright crawler composition, while v3 lets you implement the decision in the shared queue/request handler. [Crawlee npm](https://www.npmjs.com/package/crawlee) · [crawler selection](https://crawlee.dev/js/docs/3.12/quick-start) · [v4 status/docs](https://crawlee.dev/js/docs/next/upgrading/upgrading-to-v4)

If the team wants tight control, a small custom queue is reasonable: current project already has Cheerio; add `p-queue` 9.3.3 for bounded concurrency and `robots-parser` 3.0.1 for robots policy. Add sitemap XML parsing or a small strict parser; read sitemap indexes and `Sitemap:` declarations from robots.txt. Do not recursively crawl arbitrary external hosts by default. [p-queue](https://www.npmjs.com/package/p-queue) · [robots-parser](https://www.npmjs.com/package/robots-parser) · [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html)

Required crawler behavior regardless of library:

1. Normalize URLs with `URL`: allow only `http:`/`https:`, remove fragments, lowercase hostname, normalize default ports, resolve relative links, and decide explicitly whether query parameters/trailing slash variants are equivalent. Preserve meaningful query strings. Deduplicate by normalized URL and enforce same registrable host plus explicit subdomain policy.
2. Fetch robots.txt once per origin, cache it briefly, choose a clear audit user-agent, obey disallow/allow and `Crawl-delay` where present. robots.txt is a request for crawler behavior, **not** access control. Seed from sitemap(s), then same-site links; cap pages/depth/bytes and per-host concurrency; use a modest delay and exponential backoff for 429/5xx.
3. Store for each URL the original response status/headers/raw HTML, final URL/redirect chain, fetch timing, rendered DOM, console/network errors, render timing, and optional screenshot as separate artifacts. Extract comparable SEO fields from both raw and rendered DOM so a finding can state “missing to bots / present after JS.”
4. Use deterministic browser readiness: `domcontentloaded`, bounded wait for network quiet or known selectors, and a hard wall-clock deadline. Avoid indefinite `networkidle` on analytics/polling pages. Capture navigation timing/response timing and screenshot only when requested.

## Public-URL security (launch blocker)

The audit endpoint is an SSRF-capable proxy unless every fetch is constrained. Apply defenses to the HTTP fetcher **and** browser subrequests/redirects:

- Permit only HTTP(S), reject credentials in URLs, unusual ports by policy, IP literal targets unless a rigorously checked public IP, and all non-global IPv4/IPv6 ranges (loopback, RFC1918, link-local, multicast, unspecified, IPv4-mapped IPv6, carrier-grade NAT, IPv6 ULA). Resolve hostnames and reject if any answer is non-public.
- Prevent DNS rebinding/TOCTOU: connect through an egress proxy/resolver that pins the validated address or revalidates every new connection. Re-check every redirect target and every browser navigation/subresource; browser routing rules alone are defense-in-depth, not the network boundary.
- Deny metadata endpoints (e.g. 169.254.169.254 and cloud/cluster equivalents), internal DNS suffixes, service networks, and access to the application/control plane. Put render workers in isolated containers/microVMs with no credentials/secrets, no host mounts, non-root, seccomp/AppArmor where available, and network egress allow rules that only permit public internet destinations through the guard proxy.
- Enforce per-job total deadline, page count/depth, response/body bytes, download denial, CPU/memory/process limits, browser contexts/process count, and concurrency. Kill the whole browser process tree on timeout. Limit redirects and reject schemes such as `file:`, `data:`, `javascript:`, `ws:` unless a specific feature requires them.
- Keep browser and parser workers separate from the web/API process. Validate and log the resolved destination and redirect chain without logging sensitive query tokens. Never pass user URLs into shell strings.

OWASP explicitly calls out redirects, DNS rebinding, and cloud metadata targets; Chromium’s own URL blocklist/network interception is documented as incomplete and recommends OS/container network sandboxing. [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html) · [Puppeteer network blocklist caveat](https://pptr.dev/api/puppeteer.connectoptions)

## Suggested TypeScript boundary

```ts
export type RenderMode = "http" | "lightpanda" | "chromium" | "remote-cdp";

export interface RenderRequest {
  url: string;
  timeoutMs: number;
  screenshot?: boolean;
  waitFor?: { selector?: string; state?: "domcontentloaded" | "load" };
  signal?: AbortSignal;
}

export interface RenderResult {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  headers: Record<string, string>;
  rawHtml: string;       // initial HTTP response, captured before JS
  renderedHtml?: string; // DOM serialization after selected readiness rule
  screenshot?: Uint8Array;
  timings: { fetchMs: number; navigationMs?: number; domReadyMs?: number };
  errors: Array<{ phase: "fetch" | "navigation" | "script"; message: string }>;
}

export interface Renderer {
  readonly mode: RenderMode;
  render(request: RenderRequest): Promise<RenderResult>;
  close(): Promise<void>;
}
```

Implement `HttpRenderer` (fetch + Cheerio) and `PlaywrightRenderer` first. `LightpandaRenderer` and `RemoteCdpRenderer` can share a CDP adapter, but the provider-specific session lifecycle belongs in the adapter. Fetch raw HTML via the same SSRF-guarded HTTP path before rendering; browser DOM serialization is not a substitute for the source response.

## Suggested starting dependencies (pin these versions)

Current project already has `cheerio@^1.2.0`. Suggested additions:

```text
playwright-core@1.63.0       # renderer/CDP client; install matching chromium in image
crawlee@3.18.2               # optional queue framework; choose instead of custom p-queue
p-queue@9.3.3                 # custom bounded queue alternative
robots-parser@3.0.1            # robots rules parser
puppeteer-core@25.14.0         # optional alternative CDP client, not needed alongside Playwright
@lightpanda/browser@1.6.0      # optional experimental renderer; no native Windows binary
```

Do not add both Crawlee and a separate queue package unless a real requirement calls for both. Keep the renderer choice in config; default local/dev and self-hosted production to Playwright Chromium for fidelity. Consider remote CDP when managed browser operations are preferable. Enable Lightpanda only behind a per-site/feature flag after a fixture set demonstrates equivalent extracted DOM for target frameworks; fallback to Chromium on renderer error, missing expected content, or screenshot request.
