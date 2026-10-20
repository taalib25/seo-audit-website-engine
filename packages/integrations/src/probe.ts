import type { ProbeResult } from "./types.ts";

export interface ProbeCitation { url: string; }
export interface LlmClientLike { complete(model: string, prompt: string): Promise<{ text: string; citations: ProbeCitation[] }>; }
export interface ProbeQuery { query: string; model: string; samples?: number; competitors?: string[]; }
export interface ProbeReport extends ProbeResult { site: string; queryCount: number; sampleCount: number; estimatedCostUsd: number; results: Array<{ query: string; model: string; cited: boolean; brandMentioned: boolean; citedCompetitors: string[]; citations: string[] }>; }
export interface Prober { estimateCostUsd(): number; run(siteUrl: string): Promise<ProbeReport>; }
export function estimateProbeCost(queryCount: number, samples: number, costPerSampleUsd = 0): number { return Math.max(0, queryCount) * Math.max(0, samples) * Math.max(0, costPerSampleUsd); }
export function createProber(args: { llmClientLike: LlmClientLike; queries: ProbeQuery[]; samples?: number; costPerSampleUsd?: number }): Prober {
  const sampleCount = args.samples ?? 1;
  const reports = new Map<string, Promise<ProbeReport>>();
  return {
    estimateCostUsd: () => estimateProbeCost(args.queries.length, sampleCount, args.costPerSampleUsd),
    run(siteUrl) {
      const cached = reports.get(siteUrl);
      if (cached) return cached;
      const report = (async () => {
      const site = new URL(siteUrl).hostname.toLowerCase(); const results: ProbeReport["results"] = [];
      for (const item of args.queries) for (let n = 0; n < (item.samples ?? sampleCount); n++) {
        const response = await args.llmClientLike.complete(item.model, `Answer this search-grounded question: ${item.query}. Include sources when available.`);
        const citations = response.citations.map((c) => c.url); const cited = citations.some((value) => { try { return new URL(value).hostname.toLowerCase().replace(/^www\./, "") === site.replace(/^www\./, ""); } catch { return false; } });
        const citedCompetitors = (item.competitors ?? []).filter((competitor) => citations.some((value) => value.toLowerCase().includes(competitor.toLowerCase())));
        results.push({ query: item.query, model: item.model, cited, brandMentioned: response.text.toLowerCase().includes(site.split(".")[0] ?? site), citedCompetitors, citations });
      }
      const total = results.length; const cited = results.filter((r) => r.cited).length; const mentioned = results.filter((r) => r.brandMentioned).length;
      return { site, queryCount: args.queries.length, sampleCount: total, estimatedCostUsd: estimateProbeCost(args.queries.length, sampleCount, args.costPerSampleUsd), citedRate: total ? cited / total : 0, brandMentionRate: total ? mentioned / total : 0, citedCompetitors: [...new Set(results.flatMap((r) => r.citedCompetitors))], results };
      })();
      reports.set(siteUrl, report);
      return report;
    },
  };
}
