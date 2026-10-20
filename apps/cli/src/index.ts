#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Command } from "@commander-js/extra-typings";
import { z } from "zod";
import { AuditReport } from "@aeo/core";
import { buildFixPrompt } from "@aeo/prompt";
import { executeAudit, listChecks, pillarsFrom } from "./engine.ts";

export const EXIT_CODES = { success: 0, auditFindings: 1, usage: 2, runtime: 3, probeConfirmation: 4 } as const;
const program = new Command().name("aeo").description("SEO/AEO/GEO site auditing").showHelpAfterError();
const renderChoice = ["auto", "always", "never"] as const;
const rendererChoice = ["chromium", "lightpanda", "cdp"] as const;

program.command("audit <url>")
  .option("--pages <number>", "maximum pages", "20")
  .option("--render <mode>", "rendering mode", "auto")
  .option("--renderer <name>", "renderer")
  .option("--cdp-url <url>", "CDP endpoint")
  .option("--llm", "enable LLM judged checks")
  .option("--probe", "enable AI visibility probes")
  .option("--pillars <pillars>", "comma separated pillars", "seo,aeo,geo")
  .option("--json", "print report JSON")
  .option("--out <directory>", "output root", ".audits")
  .option("--prompt", "print fix prompt only")
  .option("--yes", "confirm estimated probe spend")
  .action(async (url: string, opts: { pages: string; render: string; renderer?: string; cdpUrl?: string; llm?: boolean; probe?: boolean; pillars: string; json?: boolean; out: string; prompt?: boolean; yes?: boolean }) => {
    try {
      if (!renderChoice.includes(opts.render as (typeof renderChoice)[number])) throw new Error("--render must be auto, always, or never");
      if (opts.renderer && !rendererChoice.includes(opts.renderer as (typeof rendererChoice)[number])) throw new Error("--renderer must be chromium, lightpanda, or cdp");
      if (opts.probe) {
        const querySchema = z.array(z.unknown());
        let queryCount = 0;
        if (process.env.PROBE_QUERIES) {
          try { queryCount = querySchema.parse(JSON.parse(process.env.PROBE_QUERIES) as unknown).length; }
          catch { throw new Error("PROBE_QUERIES must be a JSON array when --probe is enabled"); }
        }
        const estimate = queryCount * Number(process.env.PROBE_COST_PER_SAMPLE_USD ?? "0") * Number(process.env.PROBE_SAMPLES ?? "1");
        if (estimate > 0.5 && !opts.yes) { console.error(`Estimated probe cost $${estimate.toFixed(2)} exceeds $0.50. Re-run with --yes.`); process.exitCode = EXIT_CODES.probeConfirmation; return; }
        console.error(`Estimated probe cost: $${estimate.toFixed(2)}`);
      }
      const report = await executeAudit(url, { pages: Math.max(1, Number(opts.pages) || 20), render: opts.render, ...(opts.renderer ? { renderer: opts.renderer } : {}), ...(opts.cdpUrl ? { cdpUrl: opts.cdpUrl } : {}), llm: opts.llm ?? false, probe: opts.probe ?? false, pillars: pillarsFrom(opts.pillars) });
      const promptText = buildFixPrompt(report).markdown;
      const folder = join(opts.out, new URL(report.startUrl).host, report.createdAt.replace(/[:.]/g, "-"));
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
      await writeFile(join(folder, "fix-prompt.md"), promptText);
      if (opts.prompt) { process.stdout.write(promptText); return; }
      if (opts.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      else printSummary(report, process.env.NO_COLOR === undefined && process.stdout.isTTY);
      if (report.results.some((result) => result.status === "fail")) process.exitCode = EXIT_CODES.auditFindings;
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = EXIT_CODES.runtime; }
  });

program.command("verify <url>")
  .requiredOption("--ids <ids>", "comma separated check ids")
  .option("--pages <number>", "maximum pages (default 1 for scoped checks)")
  .option("--render <mode>", "rendering mode", "auto")
  .option("--renderer <name>", "renderer")
  .option("--cdp-url <url>", "CDP endpoint")
  .option("--llm", "enable LLM judged checks")
  .option("--probe", "enable AI visibility probes")
  .option("--yes", "confirm estimated probe spend")
  .action(async (url: string, opts: { ids: string; pages?: string; render: string; renderer?: string; cdpUrl?: string; llm?: boolean; probe?: boolean; yes?: boolean }) => {
    try {
      const ids = opts.ids.split(",").map((id) => id.trim()).filter(Boolean);
      const all = await listChecks();
      const selected = ids.map((id) => all.find((check) => check.id === id)).filter((check) => check !== undefined);
      if (selected.length !== ids.length) { console.error(`Unknown check id(s): ${ids.filter((id) => !selected.some((check) => check.id === id)).join(", ")}`); process.exitCode = EXIT_CODES.usage; return; }
      const pageOnlyStartUrl = selected.every((check) => check.scope === "site" || check.scope === "page");
      const pages = Number(opts.pages ?? (pageOnlyStartUrl ? "1" : "20"));
      const report = await executeAudit(url, { pages: Math.max(1, pages), render: opts.render, ...(opts.renderer ? { renderer: opts.renderer } : {}), ...(opts.cdpUrl ? { cdpUrl: opts.cdpUrl } : {}), llm: opts.llm ?? false, probe: opts.probe ?? false, pillars: [...new Set(selected.map((check) => check.pillar))], ids });
      for (const result of report.results) process.stdout.write(`${result.id}\t${result.status}\t${result.message}\n`);
      if (report.results.some((result) => result.status !== "pass" && result.status !== "skip")) process.exitCode = EXIT_CODES.auditFindings;
    } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = EXIT_CODES.runtime; }
  });

program.command("prompt <report.json>").action(async (file: string) => {
  try { const report = AuditReport.parse(JSON.parse(await readFile(file, "utf8")) as unknown); process.stdout.write(buildFixPrompt(report).markdown); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = EXIT_CODES.runtime; }
});

program.command("checks").action(async () => {
  const checks = await listChecks();
  for (const check of checks) process.stdout.write(`${check.id}\t${check.title}\t${check.pillar}\t${check.scope}\n`);
});

function printSummary(report: AuditReport, colors: boolean): void {
  const failed = report.results.filter((result) => result.status === "fail" || result.status === "warn").sort((a, b) => a.severity.localeCompare(b.severity) || a.id.localeCompare(b.id));
  const color = (value: string, code: number) => colors ? `\u001b[${code}m${value}\u001b[0m` : value;
  process.stdout.write(`Audit ${report.origin} · ${report.pagesCrawled} pages · overall ${color(`${Math.round(report.scores.overall)}/100`, 36)}\n`);
  for (const score of report.scores.pillars) process.stdout.write(`  ${score.pillar}: ${Math.round(score.score)}/100 (${score.failed} failed, ${score.warned} warnings)\n`);
  for (const result of failed.slice(0, 8)) process.stdout.write(`  ${color(result.status.toUpperCase(), result.status === "fail" ? 31 : 33)} ${result.id}${result.url ? ` ${result.url}` : ""}: ${result.message}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const colors = process.env.NO_COLOR === undefined && process.stdout.isTTY;
  if (!colors) process.env.FORCE_COLOR = "0";
  void program.parseAsync(process.argv);
}
