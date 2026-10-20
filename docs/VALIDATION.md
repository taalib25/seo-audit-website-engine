# Recovery and validation — 2026-10-20

Stopped the inactive OpenCode crawler and bookmark slice 2 runs and completed their work with Codex agents. Changes remain in the current checkout.

## Completed

- Crawler skips known media/download paths before fetching, preserving the HTML byte budget. The live five-page crawl now fills its requested page limit.
- Private literal IPs, encoded IPv4 and mapped IPv6 are blocked before connection. Fetch deadlines cover redirects and streamed response bodies.
- Verification requires every requested check to run and pass. Site checks default to 20 pages; generated commands retain the original page budget. Audit and verify share probe cost confirmation.
- LLM checks remain registered when unavailable and report skips. The duplicate question-heading judge ID is now `aeo.question-headings.judge`. Probe calls use each configured query model.
- Real SSE events carry findings for the checklist. Per-page row identities prevent collisions. Client schemas use a browser-safe core export. Reduced motion also disables score-ring counting.
- Bookmark findings improve grounded rubrics and fix prompts. Retrieval policy repair preserves private paths and training-bot choices. Speculative conversion thresholds were deferred.
- Blank optional provider settings are accepted. Root commands and README now point to the workspace app.
- Generated prompts use the locally linked CLI with source-checkout invocation instructions, rather than downloading the private unpublished package from a registry.

## Verification

The complete workspace typecheck and test commands passed. After the final probe regression additions, engine tests passed 3/3 and integration tests passed 8/8; the other passing suites cover core (162), crawler (5), LLM (8), prompt (8), CLI (4) and web rate limiting (1). The production web build passed.

A Playwright check against the running app verified the demo, mobile layout without horizontal overflow, a real example.com audit, full SSE findings, private-IP rejection, report/prompt downloads and clipboard copying. No browser page errors were recorded. Browser artifacts are local under `.audits/`.

The fresh raw-HTML audit of `https://www.eight25media.com` crawled five pages and scored SEO 92, AEO 90 and GEO 54 (overall 79). Its report and fix prompt are under `.audits/final-validation/`. Exit code 1 represents audit findings, not a failed execution. These readiness scores are specific to this sample, not ranking measurements.

## Limits

Live paid LLM, GSC and Bing calls were not exercised. Windows Lightpanda needs WSL2/Docker or a remote CDP endpoint. Web jobs and rate limits remain process-local. No production deployment was performed.
