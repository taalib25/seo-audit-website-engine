import { AuditReport, createDefaultRegistry, runAudit, safeFetch, type AuditReport as AuditReportType, type PageSnapshot, type SiteSnapshot } from "@aeo/core";
import type { AuditPipeline, AuditJob } from "./jobs";

export const runPipeline: AuditPipeline["run"] = async (job, progress) => {
  progress("Fetching page", 15);
  const response = await safeFetch(job.options.url, { timeoutMs: 15_000, maxBytes: 5 * 1024 * 1024 });
  const page: PageSnapshot = {
    url: job.options.url,
    finalUrl: response.finalUrl,
    status: response.status,
    redirectChain: response.redirectChain,
    headers: response.headers,
    rawHtml: response.body,
    timing: response.timing,
    depth: 0,
  };
  const site: SiteSnapshot = {
    startUrl: job.options.url,
    origin: new URL(job.options.url).origin,
    sitemaps: [],
    pages: [page],
    links: [],
    uncrawled: [],
    crawledAt: new Date().toISOString(),
  };
  // seam: @aeo/crawler crawlSite()
  progress("Running audit checks", 55);
  const report = await runAudit(site, createDefaultRegistry());
  progress("Preparing report", 90);
  return AuditReport.parse({ ...report, id: job.id });
};

export function reportAsJson(report: AuditReportType) { return JSON.stringify(report, null, 2); }
