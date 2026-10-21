# Branch review — 2026-10-21

Reviewed `feat/aeo-geo-engine` at `38badb4faf1fc03c1f206e4aee02218d2ba767be`, against `master...HEAD` (merge-base `57dbd72bd83b7c52455c9aeb280e16f9b3401a08`). Read `docs/ENGINEERING.md`, the TypeScript best-practices skill and its type-system-discipline prerequisite. Source remained read-only; no git mutations, subagents, paid calls or external requests were used.

**Summary: 6 findings — 3 high, 3 medium.** Top five, in priority order: browser SSRF through redirects/unpinned DNS; unlimited anonymous queue/report retention; incomplete crawl work budgets; canonical-origin redirects lose crawl scope; missing provider cost defeats LLM spend caps. The sixth finding is missing rendered-link discovery.

## 1. High — browser requests can bypass the SSRF guard

**Location:** `packages/crawler/src/renderers.ts:72`, especially `:76` and `:86`; context creation at `:64`.

The route handler validates a URL and separately resolves its hostname, then calls `route.continue()`. This does not pin the browser connection to the checked IP. More directly, Playwright only invokes this handler for the first URL in an HTTP redirect chain. The initial `safeFetch` protects the raw document request, not subsequent browser subresources or the browser's second navigation request.

**Concrete reproduction:** Enable browser rendering and audit a controlled public page containing `<img src="https://controlled-public-host/jump">`. Let `/jump` return `302 Location: http://127.0.0.1:8080/probe`, with a harmless local HTTP listener on port 8080. The public `/jump` passes the handler, which continues it; the redirected request does not enter the handler, so the local listener can be reached. A public iframe redirect provides the same path without relying on reading the response. Alternatively, return a public IP to the handler's DNS query and a private IP to the browser's later query: the browser receives no pinned address.

**Evidence level:** Confirmed from the implementation and the installed dependency's explicit contract, not a live SSRF attempt. `node_modules/.bun/playwright-core@1.64.1/node_modules/playwright-core/types/types.d.ts:4441` says: “The handler will only be called for the first url if the response is a redirect.” Adjacent documentation at `:4444` also says routing does not intercept requests intercepted by a Service Worker; this context does not set `serviceWorkers: "block"`.

**Smallest safe fix:** Stop continuing untrusted browser traffic directly. Route it through a transport/proxy that pins vetted DNS answers and validates every redirect/connection, and block service workers. For a GET-only audit renderer, a bounded `safeFetch`-backed fulfillment path is a smaller option, provided it preserves response bytes/MIME types and rejects unsupported methods; the current string-body fetch API needs care for binary assets. Disabling browser rendering for public jobs until that protection exists is a valid immediate containment.

## 2. High — anonymous jobs accumulate without admission or retention limits

**Location:** `apps/web/src/server/jobs.ts:24` and `:45`; request entry `apps/web/src/routes/api.audits.index.ts:11`.

The queue limits running tasks to two but has no waiting limit. Every accepted request first creates a permanently retained job. Completed reports, prompt traces and per-check events also remain in the map forever. Thus steady valid traffic eventually exhausts memory, even when each crawl is individually bounded. Slow audits make queue accumulation much faster. The local per-IP limiter does not provide a global capacity bound.

**Concrete reproduction, executed locally without any audit/network calls:**

```ts
import { MemoryJobStore, InProcessQueue } from './apps/web/src/server/jobs.ts';
const store = new MemoryJobStore();
const queue = new InProcessQueue(2);
let started = 0;
const ids = [];
for (let i = 0; i < 100; i++) {
  ids.push(store.create({ url: 'https://example.test', maxPages: 1,
    render: false, llm: false, probe: false }).id);
  queue.enqueue(async () => { started++; await new Promise(() => {}); });
}
console.log({ started, stored: ids.filter(id => store.get(id)).length });
// Observed: { started: 2, stored: 100 }; all remaining work stays queued.
```

On a directly exposed server, `clientIp` at `apps/web/src/server/security.ts:20` also trusts an arbitrary caller's first `x-forwarded-for` value. A local test using 100 distinct supplied values accepted all 100 token-bucket requests. The README requires a trusted overwriting proxy; that deployment prerequisite does not solve the unbounded retention/admission defect even when satisfied.

**Smallest fix:** Atomically reject new jobs with 429/503 when the waiting queue or retained-job budget is full, before creating a job. Expire completed/failed jobs and their events/traces with a bounded TTL and count/byte limit. Derive client identity from a trusted proxy arrangement rather than arbitrary headers when directly exposed. These protections are needed in a single process too; replacing storage with Redis alone is insufficient.

## 3. High — discovery and failed attempts escape the crawl work limits

**Location:** `packages/crawler/src/crawl.ts:80`, `:101`, `:164`, and the main loop at `:239`; engine call `packages/engine/src/index.ts:71`.

The total time check only runs when entering `crawlOne`, after all robots, llms and recursive sitemap fetches have completed. Discovery requests use independent 15-second deadlines and do not consume the shared byte budget. The engine supplies no `totalBudgetMs` at all. In addition, `maxPages` counts only HTML snapshots, so a sitemap with 5,000 failed/non-HTML destinations can make thousands of paced fetches while `pages.length` stays zero. Two such anonymous audits occupy both workers for many minutes or hours despite asking for one page.

**Concrete reproduction, executed against a local `node:http` fixture:** Serve `/robots.txt`, `/llms.txt`, `/llms-full.txt` and `/sitemap.xml` after a 15 ms delay each. Sitemap XML contains eight absolute same-origin `/bad-N` locations; all other responses are a small `404 text/plain` body. Call `crawlSite(origin, { testOnlyAllowPrivate: true, render: 'never', maxPages: 1, totalBudgetMs: 1 })`. Observed **126 ms and all four discovery requests**, even though the total budget was 1 ms. Repeat without `totalBudgetMs`: observed **13 requests, zero pages, 1,302 ms**, including the root and all eight sitemap destinations. The private fixture flag was used only for the local test; public sites follow the same scheduling logic.

The sitemap recursion cap limits the number of files, but still permits 20 separate discovery deadlines plus the initial text-file deadlines. The page limit does not bound unsuccessful attempts.

**Smallest fix:** Create a default whole-crawl deadline at entry, combine it with caller cancellation, and pass it through discovery, page fetching, pacing and rendering. Apply one byte/request-attempt budget across discovery and pages, and stop dequeueing once exhausted. Count attempted destinations independently from successful page snapshots. Make the shared engine select finite production defaults rather than relying on an optional caller limit.

## 4. Medium — canonical-origin redirects silently reduce a multi-page audit to one page

**Location:** `packages/crawler/src/crawl.ts:65` and `:198`; sitemap scope check at `:123`.

`origin` remains the origin of the submitted URL. After a normal HTTP-to-HTTPS or bare-domain-to-www redirect, links resolve against `response.finalUrl`, but scope checks compare them with the old origin. Canonical-origin sitemap entries are rejected too. The resulting report can claim to have audited the site while never following its internal navigation, and site-origin integrations/text discovery use the old origin.

**Concrete reproduction, executed locally:** Start two loopback HTTP servers A and B on different ports. A's `/` responds `302` to B's `/`; other A paths return 404. B returns HTML with `<a href="B/about">About</a>`. Call `crawlSite(A, { testOnlyAllowPrivate: true, render: 'never', maxPages: 3 })`. Observed `pages: 1`, `links: []`, `origin: A`, and `pages[0].finalUrl: B/`. Different local ports reproduce the same origin comparison used for an HTTP-to-HTTPS redirect.

**Smallest fix:** Resolve and validate the seed's redirect destination before establishing canonical crawl scope and collecting root text files/sitemaps. Preserve the originally requested URL separately for redirect evidence. Adopt the vetted canonical origin for subsequent scope checks; do not broaden scope for arbitrary later redirects.

## 5. Medium — missing provider cost makes the LLM spend cap ineffective

**Location:** `packages/llm/src/client.ts:94` and `:115`.

The cap only compares `usage.costUsd`, but responses without the optional provider-specific `usage.cost` are booked as zero dollars. This is a supported response shape for an OpenAI-compatible client, so a positive configured cap never trips for those providers. Requests also omit an output-token bound. Configuring a small cap therefore does not constrain these public, user-triggered LLM audits.

**Concrete reproduction, executed using the injected fake fetch, with no provider request:**

```ts
import { createLlmClient } from './packages/llm/src/client.ts';
import { z } from 'zod';
let calls = 0;
const client = createLlmClient({ apiKey: 'fake-key',
  baseURL: 'https://provider.invalid/v1', maxSpendPerAuditUsd: 0.000001,
  maxRetries: 0 }, { fetch: async () => {
  calls++;
  return Response.json({ id: 'test', object: 'chat.completion', created: 0,
    model: 'test', choices: [{ index: 0, message: { role: 'assistant',
      content: '{"ok":true}' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100000, completion_tokens: 100000,
      total_tokens: 200000 } });
} });
for (let i = 0; i < 3; i++) await client.judge({ task: 'test', system: 'test',
  user: 'test', schema: z.object({ ok: z.boolean() }) });
console.log({ calls, usage: client.getUsage() });
// Observed: calls=3, inputTokens=300000, outputTokens=300000, costUsd=0.
```

**Smallest fix:** Treat absent cost as unknown rather than zero. When enforcing a dollar cap, require configured model pricing or a provider with authoritative cost reporting; stop further calls when neither is available. Bound output tokens and reserve an upper-bound cost before dispatching concurrent requests, including fallback/repair calls. Do not report unknown spend as $0.

## 6. Medium — rendered navigation is never added to the crawl graph

**Location:** `packages/crawler/src/crawl.ts:192`, `:209`, and `:229`.

Link extraction happens exclusively from `response.body` before rendering. Rendered HTML is saved on the snapshot but never parsed for discovery. A client-rendered site with no sitemap and no raw anchors therefore stays at one page even when browser rendering succeeds. Internal-link, orphan and site-wide checks receive an incomplete graph that rendering was intended to recover.

**Concrete reproduction, executed locally:** Serve `/` as `<html><body><div id="root"></div><script src="/bundle.js"></script></body></html>` and return 404 for discovery files. For an isolated test, replace `PlaywrightRenderer.prototype.render` in memory with a renderer returning `<html><body><h1>Hydrated</h1><a href="/about">About</a></body></html>` as `renderedHtml`. Call `crawlSite(origin, { testOnlyAllowPrivate: true, render: 'always', maxPages: 3 })`. Observed the rendered HTML stored correctly, but **one page and `links: []`**. No browser or external site was involved in this reproduction.

**Smallest fix:** After rendering, extract/deduplicate in-scope anchors from the rendered DOM and add them to the graph/frontier using the same depth, robots and resource limits. Keep raw HTML unchanged so checks can still distinguish raw and rendered visibility.

## Validation and earlier fixes

- `bun run --filter '*' typecheck`: passed in all eight workspaces.
- `bun run --filter '*' test`: passed, 199 tests total (core 162, crawler 5, llm 8, integrations 8, prompt 8, engine 3, CLI 4, web 1).
- Literal/encoded/mapped private-IP cases passed the existing 30-case IP guard suite. HTTP lookup rejects non-public answers at connect time. The browser finding above is a separate transport path, not a repeat of the fixed literal-IP issue.
- Absolute `safeFetch` deadline tests passed for streaming bodies, redirects and cancellation. The remaining crawl-budget finding concerns the aggregate across separate requests, not those fixed per-fetch deadlines.
- CLI tests confirmed skip/missing/empty verification fails and site-check default page selection. Registry/engine tests passed with the renamed `.judge` check.
- Crawler media-budget regression passed. Prompt policy-preservation tests, blank-environment normalization tests and integration 15-second deadline tests passed.
- Static inspection of deterministic check implementations found no network calls, wall-clock reads or randomness; `Date.parse` is used on snapshot values. No separate confirmed XSS or direct secret-disclosure finding was established in this bounded review. Untrusted page values in the inspected UI are rendered as React text; LLM checks wrap page text and instruct the model to treat it as data.

The browser SSRF finding is supported by source plus the installed Playwright contract; its end-to-end browser exploit was not executed. Other reproduction results above came from local HTTP fixtures, injected responses or in-memory objects. This document is the only authored file.

## Implementation response

The original evidence above describes commit `38badb4`. The follow-up fixes are recorded here separately:

| Finding | Response |
| --- | --- |
| 1 — Browser SSRF | Browser GETs are fulfilled through binary-preserving `safeFetch`, which pins vetted DNS and validates redirects. Service workers, WebSockets, workers, mutation methods and direct transport paths are blocked. Browser fixtures cover unsafe redirects, binary assets, hydration and unsupported requests. |
| 2 — Queue and retention | Admission is bounded to two active and ten waiting jobs. Retention is bounded by count, TTL and bytes, including event/trace output. API bodies and token-bucket key counts are bounded; forwarded identities require explicit proxy trust. Capacity errors return 503; oversized requests return 413. The pipeline receives a five-minute cancellation signal. |
| 3 — Crawl budgets | Discovery, raw fetching and renderer traffic share finite request/byte/time budgets. Redirect bytes and failed attempts are charged; pacing and browser activity respond to cancellation. Renderer resource caps add a second bound. |
| 4 — Canonical origin | Same-host/www and HTTP-to-HTTPS seed redirects establish canonical discovery and scope; unrelated redirects do not expand scope. Original request and redirect evidence are preserved. |
| 5 — LLM metering | Missing or invalid costs stop further dispatch and mark the total unknown. Requests are serialized, repairs are re-metered, output tokens are bounded, and active meter resets are rejected. One already-dispatched call can exceed the remaining budget; a hard billing cap requires provider-side enforcement. |
| 6 — Rendered links | The frontier and graph use a deduplicated union of raw and rendered anchors, while snapshots retain separate HTML sources. |

These responses are implementation and regression-test evidence, not a claim that an independent second security review or production penetration test was performed. Browser workers should still run with network egress isolation. GET-only audited rendering can differ from authenticated, worker-dependent or mutation-driven browser sessions; redirected resource base URLs and timings can differ under guarded fulfillment. Web persistence remains process-local and bounded.
