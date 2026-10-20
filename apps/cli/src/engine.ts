import type { AuditReport, Check, Pillar } from "@aeo/core";
import { listEngineChecks, runFullAudit } from "@aeo/engine";
import type { FullAuditInput } from "@aeo/engine";

export interface AuditOptions { pages: number; render: FullAuditInput["render"]; renderer?: string; cdpUrl?: string; llm: boolean; probe: boolean; pillars: Pillar[]; ids?: string[] }

export async function executeAudit(url: string, options: AuditOptions): Promise<AuditReport> {
  try {
    if ((options.llm || options.probe) && !process.env.LLM_API_KEY && !process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY or LLM_API_KEY is required when --llm or --probe is enabled");
    }
    return (await runFullAudit({
      url, maxPages: options.pages, render: options.render, ...(options.renderer ? { renderer: options.renderer } : {}),
      ...(options.cdpUrl ? { cdpEndpoint: options.cdpUrl } : {}), llm: options.llm, probe: options.probe,
      pillars: options.pillars, ...(options.ids ? { ids: options.ids } : {}),
    })).report;
  } catch (error) {
    throw new Error(`Audit engine is unavailable or failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listChecks(): Promise<Check[]> { return listEngineChecks(); }
export function pillarsFrom(value: string): Pillar[] { return value.split(",").map((part) => part.trim()).filter((part): part is Pillar => part === "seo" || part === "aeo" || part === "geo"); }
