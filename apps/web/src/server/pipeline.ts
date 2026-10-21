import { AuditReport, type AuditReport as AuditReportType } from "@aeo/core";
import { runFullAudit } from "@aeo/engine";
import type { AuditPipeline, AuditJob } from "./jobs";

export const runPipeline: AuditPipeline["run"] = async (job, progress, engineEvent, signal) => {
  const result = await runFullAudit({
    url: job.options.url, maxPages: job.options.maxPages, render: job.options.render ? "auto" : "never",
    ...(job.options.renderer ? { renderer: job.options.renderer } : {}), ...(job.options.cdpEndpoint ? { cdpEndpoint: job.options.cdpEndpoint } : {}),
    llm: job.options.llm, probe: job.options.probe, signal,
    onProgress: (event) => {
      engineEvent(event);
      if (event.type === "crawl:start") progress("Crawling site", 15);
      else if (event.type === "crawl:page") progress(`Crawled ${event.index ?? 0} page${event.index === 1 ? "" : "s"}`, Math.min(50, 15 + (event.index ?? 0) * 3));
      else if (event.type === "checks:start") progress(`Running ${event.count} checks`, 55);
      else if (event.type === "done") progress("Preparing report", 90);
    },
  });
  return { ...result, report: AuditReport.parse({ ...result.report, id: job.id }) };
};

export function reportAsJson(report: AuditReportType) { return JSON.stringify(report, null, 2); }
