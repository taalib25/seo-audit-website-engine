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

User URLs and all HTTP redirects go through `safeFetch`. Browser requests are intercepted and checked against `assertSafeUrl` and DNS public-address checks. The crawler defaults to 10 pages, depth 3, four configured workers with at most two same-host page fetches at once, a 15 second per-page timeout, and a 25 MiB page-body budget. Hard caps are 200 pages, 16 configured workers, and a five second robots crawl delay. Robots are respected by default. `testOnlyAllowPrivate` exists only for local HTTP fixture tests and must never be set for user input.

The browser DNS check is defense in depth; deploy browser workers with network egress controls so intercepted browser requests cannot reach private services if DNS changes between validation and connection.

Known media, archive, font, and script URLs discovered in links are recorded in `uncrawled` and skipped before fetching, so their downloads cannot exhaust the HTML page budget. Extensionless downloads still count toward the byte budget; responses are checked for HTML content type before creating a page snapshot.
