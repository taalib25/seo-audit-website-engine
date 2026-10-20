import { randomUUID } from "node:crypto";
import { createPageContext, type Check, type CheckOutcome, type Services } from "./check.ts";
import type { CheckRegistry } from "./registry.ts";
import type { AuditReport } from "./report.ts";
import { scorePillars } from "./scoring.ts";
import type { SiteSnapshot } from "./snapshot.ts";
import type { CheckResult, Pillar, Requirement, Status } from "./types.ts";

export interface RunOptions {
  ids?: readonly string[];
  pillars?: readonly Pillar[];
  services?: Services;
  signal?: AbortSignal;
  /** Max checks in flight; LLM/external checks dominate wall time. */
  concurrency?: number;
  stack?: string[];
  onResult?: (result: CheckResult) => void;
}

const DEFAULT_SCORE: Record<Exclude<Status, "error">, number> = {
  pass: 1,
  warn: 0.5,
  fail: 0,
  skip: 1,
};

/** Which requirements this snapshot + services can satisfy. */
export function capabilitiesOf(site: SiteSnapshot, services: Services): Set<Requirement> {
  const caps = new Set<Requirement>(["raw-html", "headers", "crawl-graph"]);
  if (site.pages.some((p) => p.renderedHtml !== undefined)) caps.add("rendered-dom");
  if (site.robotsTxt) caps.add("robots");
  if (site.sitemaps.length > 0) caps.add("sitemap");
  if (site.llmsTxt) caps.add("llms-txt");
  if (services.llm) caps.add("llm");
  if (services.gsc) caps.add("gsc");
  if (services.bing) caps.add("bing");
  if (services.probe) caps.add("probe");
  return caps;
}

export async function runAudit(
  site: SiteSnapshot,
  registry: CheckRegistry,
  opts: RunOptions = {},
): Promise<AuditReport> {
  const started = Date.now();
  const services = opts.services ?? {};
  const signal = opts.signal ?? new AbortController().signal;
  const caps = capabilitiesOf(site, services);
  const filter: { ids?: readonly string[]; pillars?: readonly Pillar[] } = {};
  if (opts.ids) filter.ids = opts.ids;
  if (opts.pillars) filter.pillars = opts.pillars;
  const checks = registry.list(filter);

  const jobs: (() => Promise<CheckResult>)[] = [];
  for (const check of checks) {
    const missing = check.requires.filter((r) => !caps.has(r));
    if (check.scope === "site") {
      jobs.push(() => execute(check, undefined, missing, () => check.run({ site, services, signal })));
    } else {
      for (const page of site.pages) {
        // With render=auto only some pages are rendered; raw-vs-rendered checks must skip the rest.
        const pageMissing =
          check.requires.includes("rendered-dom") && page.renderedHtml === undefined && !missing.includes("rendered-dom")
            ? [...missing, "rendered-dom" as const]
            : missing;
        jobs.push(() =>
          execute(check, page.finalUrl, pageMissing, () =>
            check.run(createPageContext(page, { site, services, signal })),
          ),
        );
      }
    }
  }

  const results = await pool(jobs, opts.concurrency ?? 8, signal, opts.onResult);
  const weights = new Map(checks.map((c) => [c.id, c.weight]));

  return {
    schemaVersion: 1,
    id: randomUUID(),
    startUrl: site.startUrl,
    origin: site.origin,
    createdAt: new Date(started).toISOString(),
    durationMs: Date.now() - started,
    pagesCrawled: site.pages.length,
    capabilities: [...caps].sort(),
    scores: scorePillars(results, weights),
    results,
    stack: opts.stack ?? [],
  };
}

async function execute(
  check: Check,
  url: string | undefined,
  missing: readonly Requirement[],
  run: () => CheckOutcome | Promise<CheckOutcome>,
): Promise<CheckResult> {
  const base = {
    id: check.id,
    pillar: check.pillar,
    category: check.category,
    kind: check.kind,
    severity: check.severity,
    title: check.title,
    rationale: check.rationale,
    ...(check.docs === undefined ? {} : { docs: check.docs }),
    ...(url === undefined ? {} : { url }),
  };
  if (missing.length > 0) {
    return {
      ...base,
      status: "skip",
      score: 1,
      message: `Skipped: requires ${missing.join(", ")}`,
      evidence: { missing },
    };
  }
  const t0 = Date.now();
  try {
    const outcome = await run();
    return {
      ...base,
      status: outcome.status,
      score: clamp(outcome.score ?? DEFAULT_SCORE[outcome.status]),
      message: outcome.message,
      evidence: outcome.evidence ?? {},
      ...fixFor(check, outcome),
      durationMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      ...base,
      status: "error",
      score: 0,
      message: `Check failed to run: ${err instanceof Error ? err.message : String(err)}`,
      evidence: {},
      durationMs: Date.now() - t0,
    };
  }
}

function fixFor(check: Check, outcome: CheckOutcome): { fix?: CheckResult["fix"] } {
  if (outcome.fix) return { fix: outcome.fix };
  if ((outcome.status === "warn" || outcome.status === "fail") && check.remedy) {
    return { fix: { summary: check.remedy } };
  }
  return {};
}

const clamp = (n: number) => Math.min(1, Math.max(0, n));

async function pool<T>(
  jobs: readonly (() => Promise<T>)[],
  size: number,
  signal: AbortSignal,
  onResult?: (r: T) => void,
): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      signal.throwIfAborted();
      const i = next++;
      const job = jobs[i];
      if (!job) continue;
      const r = await job();
      out[i] = r;
      onResult?.(r);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, worker));
  return out;
}
