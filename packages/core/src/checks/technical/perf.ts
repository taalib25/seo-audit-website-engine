import {
  definePageCheck,
  defineSiteCheck,
  fail,
  pass,
  skip,
  warn,
} from "../../check.ts";
import type { PageCheck, SiteCheck } from "../../check.ts";
import { header } from "../../extract/headers.ts";
import type { PageSnapshot, SiteSnapshot } from "../../snapshot.ts";
import { pageMeta } from "./shared.ts";

export const fieldLcp = definePageCheck({
  ...pageMeta(
    "perf.cwv.lcp",
    "Field LCP",
    "performance",
    "high",
    4,
    ["headers", "rendered-dom"],
    "LCP measures loading experience.",
    "https://developers.google.com/search/docs/appearance/core-web-vitals",
  ),
  run: () =>
    skip(
      "Field LCP p75 data is not included in the snapshot; no CWV verdict is inferred.",
    ),
});

export const fieldInp = definePageCheck({
  ...pageMeta(
    "perf.cwv.inp",
    "Field INP",
    "performance",
    "high",
    4,
    ["rendered-dom"],
    "INP measures responsiveness across interactions.",
    "https://developers.google.com/search/docs/appearance/core-web-vitals",
  ),
  run: () =>
    skip(
      "Field INP p75 data is not included in the snapshot; no CWV verdict is inferred.",
    ),
});

export const fieldCls = definePageCheck({
  ...pageMeta(
    "perf.cwv.cls",
    "Field CLS",
    "performance",
    "medium",
    3,
    ["rendered-dom"],
    "CLS measures visual stability.",
    "https://developers.google.com/search/docs/appearance/core-web-vitals",
  ),
  run: () =>
    skip(
      "Field CLS p75 data is not included in the snapshot; no CWV verdict is inferred.",
    ),
});

export const labLcpProxy = definePageCheck({
  ...pageMeta(
    "perf.lab.lcp",
    "Lab load proxy",
    "performance",
    "medium",
    2,
    ["rendered-dom"],
    "Lab runs find regressions before enough field traffic exists.",
    "https://web.dev/articles/lcp",
  ),
  run: ({ page: p }) => {
    if (!p.renderedHtml) return skip("Rendered DOM is unavailable.");
    const lcp = p.renderMetrics?.lcpMs;
    if (lcp === undefined)
      return skip(
        "LCP was not captured during the single render; no lab verdict is inferred.",
      );
    const ev = {
      lcpMs: lcp,
      measuredScope: "single lab render (load only); field p75 is not inferred",
    };
    if (lcp <= 2_500)
      return pass(`Lab LCP is ${lcp} ms, below the 2,500 ms good threshold.`, {
        evidence: ev,
      });
    if (lcp <= 4_000)
      return warn(`Lab LCP is ${lcp} ms, between 2,500 and 4,000 ms.`, {
        evidence: ev,
      });
    return fail(`Lab LCP is ${lcp} ms, above the 4,000 ms poor threshold.`, {
      evidence: ev,
    });
  },
});

export const longTaskProxy = definePageCheck({
  ...pageMeta(
    "perf.lab.long-task",
    "Main-thread long task proxy",
    "performance",
    "medium",
    2,
    ["rendered-dom"],
    "Long tasks can delay interactions and content parsing.",
    "https://web.dev/articles/optimize-long-tasks",
  ),
  run: ({ page: p, dom }) => {
    if (!p.renderedHtml) return skip("Rendered DOM is unavailable.");
    const measured = p.renderMetrics?.longTasks;
    if (measured !== undefined) {
      const ev = { longTasks: measured, measuredScope: "single lab render (load only)" };
      return measured === 0
        ? pass("No long tasks ran during the lab render.", { evidence: ev })
        : measured <= 5
          ? warn(`${measured} long task(s) ran during the lab render.`, {
              evidence: ev,
            })
          : fail(`${measured} long tasks ran during the lab render; the main thread is frequently blocked.`, {
              evidence: ev,
            });
    }
    const scripts = dom()("script")
      .toArray()
      .filter(
        (x) =>
          !dom()(x).attr("async") &&
          !dom()(x).attr("defer") &&
          !dom()(x).attr("type")?.includes("module"),
      );
    const n = scripts.length;
    const ev = { blockingScripts: n, proxyOnly: true };
    return n <= 2
      ? pass(
          "At most two parser-blocking scripts are present; this is a lab proxy, not measured long tasks.",
          { evidence: ev },
        )
      : n <= 5
        ? warn(
            `${n} parser-blocking scripts are a potential main-thread proxy.`,
            { evidence: ev },
          )
        : fail(`${n} parser-blocking scripts are a high main-thread proxy.`, {
            evidence: ev,
          });
  },
});

export const payloadOversize = definePageCheck({
  ...pageMeta(
    "perf.payload.oversize",
    "Initial transfer payload",
    "performance",
    "low",
    1,
    ["headers"],
    "Large payloads burden constrained devices and networks.",
    "https://web.dev/fast/",
  ),
  run: ({ page: p }) => {
    const bytes = Number(header(p.headers, "content-length"));
    if (!Number.isFinite(bytes) || bytes <= 0)
      return skip(
        "Transfer size is unavailable; snapshot does not include compressed resource sizes.",
      );
    const mb = bytes / 1_000_000;
    const ev = {
      htmlBytes: bytes,
      measuredScope:
        "HTML response only; CSS, JS, and images are not represented",
    };
    if (mb <= 2)
      return pass(
        "HTML response is at most 2 MB; this does not measure the complete initial payload.",
        { evidence: ev },
      );
    if (mb <= 5)
      return warn(
        "HTML response is 2–5 MB; this does not measure the complete initial payload.",
        { evidence: ev },
      );
    return fail("HTML response exceeds 5 MB.", { evidence: ev });
  },
});

export const performanceChecks = [
  fieldLcp,
  fieldInp,
  fieldCls,
  labLcpProxy,
  longTaskProxy,
  payloadOversize,
];
