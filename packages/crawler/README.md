# @aeo/crawler

`crawlSite(startUrl, options)` returns the core `SiteSnapshot`: raw response HTML, link edges, robots/llms files, sitemap entries, crawl depth, redirects, headers, and fetch timing. `detectStack(page)` reports framework, CMS, and hosting hints. `needsRendering(html)` is exported for callers that want the crawler's static rendering heuristic.

## Rendering

The default `render: "auto"` uses Chromium for pages that look JS dependent. Set `render: "always"` or `"never"` to override. Select a renderer with `renderer: "none" | "chromium" | "lightpanda" | "cdp"`; Lightpanda and remote CDP use `{ mode: "lightpanda" | "cdp", cdpEndpoint: "wss://..." }`. Failed or empty Lightpanda/CDP results fall back to local Chromium. `blockHeavyResources` can be set on renderer config to block fonts and media.

Install a matching headless browser after installing workspace dependencies:

```sh
node packages/crawler/node_modules/playwright-core/cli.js install chromium-headless-shell
```

`playwright-core` does not download a browser during package installation. CDP endpoints can also be supplied by application configuration; do not put provider credentials in logs or reports.

On Windows, Lightpanda needs WSL2 or Docker; installing this workspace does not install or start it. Run `lightpanda serve` in that environment, then supply its reachable CDP WebSocket endpoint through `cdpEndpoint`. See the [Lightpanda quickstart](https://lightpanda.io/docs/quickstart/). Local Chromium works directly on Windows and is the fallback when Lightpanda is unavailable.

## Safety and limits

User URLs and all HTTP redirects go through DNS-pinned `safeFetch`. Browser HTTP routes are fulfilled through that guarded transport, including redirect validation and binary response bytes. A rejecting proxy closes browser network paths that miss interception. Service workers, WebSockets, workers, peer connections, embedded plugins, and non-GET mutation requests are blocked. Deploy browser workers with network egress isolation as an additional boundary. The crawler defaults to 10 pages, depth 3, four configured workers with at most two same-host page fetches at once, a 15 second per-page timeout, and a 25 MiB shared decoded-body budget. Hard caps are 200 pages, 16 configured workers, and a five second robots crawl delay. Robots are respected by default. `testOnlyAllowPrivate` exists only for local HTTP fixture tests and must never be set for user input.

Discovery files, raw pages, browser navigation, and browser resources share that byte budget and a 120 second crawl deadline (`totalBudgetMs`, capped at 10 minutes). Binary bodies and redirect bodies count by decoded bytes. Cancellation also interrupts request pacing. Failed HTTP transfers conservatively consume their byte and redirect-slot reservations. All HTTP requests, including redirects, share a 1,024-operation hard cap (`maxRequests`, lower values supported). Discovery additionally permits at most 24 guarded fetch operations (`maxDiscoveryRequests`), including robots, llms files, and sitemap documents. Frontier inspection is independently limited to `maxPages * 5` candidates by default (`maxPageAttempts`, capped at 1,000 and at least `maxPages`), including skipped resources and failed/non-HTML pages. Remaining frontier URLs are returned in `uncrawled`. Each browser render also has its own 100-fetch / 10 MiB limits and at most two resource transfers in flight.

The initial response is reused after discovery. A seed redirect may establish the canonical origin only for the same hostname or its exact `www` alias, with the same port and either the same protocol or HTTP to HTTPS. Root discovery then uses that canonical origin; unrelated domains and later page redirects do not expand scope. `startUrl` preserves the original request and page snapshots preserve redirect evidence.

Link discovery uses the union of raw and successfully rendered HTML, with identical edges and frontier URLs deduplicated. Each retains its own HTML in the snapshot so checks can distinguish visibility before and after JavaScript.

Rendering is a bounded GET-only approximation: sites that require POST requests or workers may not fully hydrate. Resource redirects are followed inside the transport, with final bytes fulfilled at the requested browser URL, so relative resource bases can differ from a normal browser redirect. Renderer timing measures this guarded audit environment and is not a substitute for field performance data.

Known media, archive, font, and script URLs discovered in links are recorded in `uncrawled` and skipped before fetching, so their downloads cannot exhaust the HTML page budget. Extensionless downloads still count toward the byte budget; responses are checked for HTML content type before creating a page snapshot.
