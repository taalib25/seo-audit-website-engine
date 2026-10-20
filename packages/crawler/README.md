# @aeo/crawler

`crawlSite(startUrl, options)` returns the core `SiteSnapshot`: raw response HTML, link edges, robots/llms files, sitemap entries, crawl depth, redirects, headers, and fetch timing. `detectStack(page)` reports framework, CMS, and hosting hints. `needsRendering(html)` is exported for callers that want the crawler's static rendering heuristic.

## Rendering

The default `render: "auto"` uses Chromium for pages that look JS dependent. Set `render: "always"` or `"never"` to override. Select a renderer with `renderer: "none" | "chromium" | "lightpanda" | "cdp"`; Lightpanda and remote CDP use `{ mode: "lightpanda" | "cdp", cdpEndpoint: "wss://..." }`. Failed or empty Lightpanda/CDP results fall back to local Chromium. `blockHeavyResources` can be set on renderer config to block fonts and media.

Install a matching headless browser after installing workspace dependencies:

```sh
bunx playwright install chromium-headless-shell
```

`playwright-core` does not download a browser during package installation. CDP endpoints can also be supplied by application configuration; do not put provider credentials in logs or reports.

## Safety and limits

User URLs and all HTTP redirects go through `safeFetch`. Browser requests are intercepted and checked against `assertSafeUrl` and DNS public-address checks. The crawler defaults to 10 pages, depth 3, four configured workers with at most two same-host page fetches at once, a 15 second per-page timeout, and a 25 MiB page-body budget. Hard caps are 200 pages, 16 configured workers, and a five second robots crawl delay. Robots are respected by default. `testOnlyAllowPrivate` exists only for local HTTP fixture tests and must never be set for user input.

The browser DNS check is defense in depth; deploy browser workers with network egress controls so intercepted browser requests cannot reach private services if DNS changes between validation and connection.
