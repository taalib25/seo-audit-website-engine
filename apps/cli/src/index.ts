#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Command } from "@commander-js/extra-typings";
import { AuditReport } from "@aeo/core";
import { buildFixPrompt } from "@aeo/prompt";
import { executeAudit, listChecks, pillarsFrom } from "./engine.ts";
import { AuditFlags, defaultVerificationPages, estimateProbeSpend, verificationPassed } from "./options.ts";

export const EXIT_CODES = { success: 0, auditFindings: 1, usage: 2, runtime: 3, probeConfirmation: 4 } as const;
const program = new Command().name("aeo").description("SEO/AEO/GEO site auditing").showHelpAfterError();
function confirmProbeSpend(enabled: boolean | undefined, confirmed: boolean | undefined): boolean {
  if (!enabled) return true;
  const estimate = estimateProbeSpend(process.env);
  if (estimate > 0.5 && !confirmed) {
    console.error(`Estimated probe cost $${estimate.toFixed(2)} exceeds $0.50. Re-run with --yes.`);
    process.exitCode = EXIT_CODES.probeConfirmation;
    return false;
  }
  console.error(`Estimated probe cost: $${estimate.toFixed(2)}`);
  return true;
}

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
      const flags = AuditFlags.parse(opts);
      if (!confirmProbeSpend(opts.probe, opts.yes)) return;
      const report = await executeAudit(url, { pages: flags.pages, render: flags.render, ...(flags.renderer ? { renderer: flags.renderer } : {}), ...(opts.cdpUrl ? { cdpUrl: opts.cdpUrl } : {}), llm: opts.llm ?? false, probe: opts.probe ?? false, pillars: pillarsFrom(opts.pillars) });
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
  .option("--pages <number>", "maximum pages (default 1 for page checks, 20 for site checks)")
  .option("--render <mode>", "rendering mode", "auto")
  .option("--renderer <name>", "renderer")
  .option("--cdp-url <url>", "CDP endpoint")
  .option("--llm", "enable LLM judged checks")
  .option("--probe", "enable AI visibility probes")
  .option("--yes", "confirm estimated probe spend")
  .action(async (url: string, opts: { ids: string; pages?: string; render: string; renderer?: string; cdpUrl?: string; llm?: boolean; probe?: boolean; yes?: boolean }) => {
    try {
      const ids = [...new Set(opts.ids.split(",").map((id) => id.trim()).filter(Boolean))];
      if (!ids.length) { console.error("--ids must contain at least one check id."); process.exitCode = EXIT_CODES.usage; return; }
      const all = await listChecks();
      const selected = ids.map((id) => all.find((check) => check.id === id)).filter((check) => check !== undefined);
      if (selected.length !== ids.length) { console.error(`Unknown check id(s): ${ids.filter((id) => !selected.some((check) => check.id === id)).join(", ")}`); process.exitCode = EXIT_CODES.usage; return; }
      const flags = AuditFlags.parse({ ...opts, pages: opts.pages ?? defaultVerificationPages(selected) });
      if (!confirmProbeSpend(opts.probe, opts.yes)) return;
      const report = await executeAudit(url, { pages: flags.pages, render: flags.render, ...(flags.renderer ? { renderer: flags.renderer } : {}), ...(opts.cdpUrl ? { cdpUrl: opts.cdpUrl } : {}), llm: opts.llm ?? false, probe: opts.probe ?? false, pillars: [...new Set(selected.map((check) => check.pillar))], ids });
      for (const result of report.results) process.stdout.write(`${result.id}\t${result.status}\t${result.message}\n`);
      if (!verificationPassed(ids, report.results)) { console.error("Verification incomplete: every requested check must run and pass; skipped checks do not verify a fix."); process.exitCode = EXIT_CODES.auditFindings; }
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
