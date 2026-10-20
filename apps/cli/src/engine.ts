import type { AuditReport, Check, Pillar, Services, SiteSnapshot } from "@aeo/core";
import { z } from "zod";

export interface AuditOptions { pages: number; render: string; renderer?: string; cdpUrl?: string; llm: boolean; probe: boolean; pillars: Pillar[]; ids?: string[]; }
type CrawlerModule = { crawlSite: (url: string, opts: Record<string, unknown>) => Promise<SiteSnapshot>; detectStack: (page: unknown) => string[] };

export async function executeAudit(url: string, options: AuditOptions): Promise<AuditReport> {
  try {
    const [crawler, core, integrationModule] = await Promise.all([
      import("@aeo/crawler") as Promise<CrawlerModule>, import("@aeo/core"), import("@aeo/integrations"),
    ]);
    const renderer = options.renderer === "cdp"
      ? { mode: "cdp", ...(options.cdpUrl ? { cdpEndpoint: options.cdpUrl } : {}) }
      : options.renderer;
    const site = await crawler.crawlSite(url, { maxPages: options.pages, render: options.render, ...(renderer ? { renderer } : {}) });
    const firstPage = site.pages[0];
    const stack = firstPage ? crawler.detectStack(firstPage) : [];
    const checks: Check[] = [...core.builtinChecks, ...(options.llm ? (await import("@aeo/llm")).llmChecks : []), ...integrationModule.integrationChecks];
    let services: Services = integrationModule.buildServices(process.env);
    if (options.llm || options.probe) {
      const llmModule = await import("@aeo/llm");
      const client = llmModule.createLlmClient(llmModule.loadLlmConfig(process.env));
      services = { ...services, ...(options.llm ? { llm: client } : {}) };
      if (options.probe) {
        const probeClient = { complete: async (model: string, prompt: string) => {
          const result = await client.judge({ task: "geo.visibility.probe", system: "Answer this search visibility probe concisely and cite sources when available.", user: prompt, schema: z.object({ text: z.string(), citations: z.array(z.object({ url: z.string() })) }), model });
          return result;
        } };
        services = { ...services, ...integrationModule.buildServices(process.env, { probeClient }) };
      }
    }
    const registry = new core.CheckRegistry().register(...checks);
    return core.runAudit(site, registry, { services, stack, ...(options.ids ? { ids: options.ids } : {}), pillars: options.pillars });
  } catch (error) {
    throw new Error(`Audit engine is unavailable or failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function listChecks(): Promise<Check[]> {
  const core = await import("@aeo/core");
  const checks = [...core.builtinChecks];
  try { checks.push(...(await import("@aeo/llm")).llmChecks); } catch { /* optional workspace package */ }
  try { checks.push(...(await import("@aeo/integrations")).integrationChecks); } catch { /* optional workspace package */ }
  return checks;
}
export function isPageOrSiteScoped(check: Check): boolean { return check.scope === "page" || check.scope === "site"; }
export function pillarsFrom(value: string): Pillar[] { return value.split(",").map((part) => part.trim()).filter((part): part is Pillar => part === "seo" || part === "aeo" || part === "geo"); }
