import { CheckRegistry, builtinChecks, computeAgentView, runAudit, type AuditReport, type Check, type CheckResult, type Pillar, type Services } from "@aeo/core";
import { buildServices, integrationChecks } from "@aeo/integrations";
import { createLlmClient, llmChecks, loadLlmConfig, type ConfiguredLlmClient, type PromptTrace, type UsageSummary } from "@aeo/llm";
import { buildFixPrompt, type FixTask } from "@aeo/prompt";
import { crawlSite, detectStack, type RendererMode } from "@aeo/crawler";
import { z } from "zod";

export interface FullAuditInput {
  url: string;
  maxPages: number;
  render: "auto" | "always" | "never";
  renderer?: string | { mode: string; cdpEndpoint?: string };
  cdpEndpoint?: string;
  llm: boolean;
  probe: boolean;
  pillars?: Pillar[];
  ids?: string[];
  signal?: AbortSignal;
  onProgress?: (event: EngineProgress) => void;
}

export type EngineProgress =
  | { type: "crawl:start"; url: string; maxPages: number }
  | { type: "crawl:page"; url?: string; index?: number; total?: number }
  | { type: "checks:start"; count: number }
  | { type: "check:result"; id: string; status: string; title: string; result: CheckResult }
  | { type: "llm:usage"; usage: UsageSummary }
  | { type: "done"; pages: number }
  | { type: "error"; message: string };

export interface FullAuditResult {
  report: AuditReport;
  prompt: { markdown: string; tasks: FixTask[] };
  traces: PromptTrace[];
  usage: UsageSummary;
}

export interface EngineDependencies {
  env?: NodeJS.ProcessEnv;
  crawl?: typeof crawlSite;
  detectStack?: typeof detectStack;
  checks?: Check[];
  createClient?: typeof createLlmClient;
  serviceBuilder?: typeof buildServices;
}

const emptyUsage = (): UsageSummary => ({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
const onlineAnswer = z.object({ text: z.string(), citations: z.array(z.object({ url: z.string() })) });

function redact(value: string, secrets: string[]): string {
  let output = value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  for (const secret of secrets) if (secret) output = output.replaceAll(secret, "[redacted]");
  return output;
}

function safeTraces(traces: readonly PromptTrace[], secrets: string[]): PromptTrace[] {
  return traces.map((trace) => ({ ...trace, system: redact(trace.system, secrets), user: redact(trace.user, secrets), rawOutput: redact(trace.rawOutput, secrets), ...(trace.error ? { error: redact(trace.error, secrets) } : {}) }));
}

export async function runFullAudit(input: FullAuditInput, deps: EngineDependencies = {}): Promise<FullAuditResult> {
  const work = new AbortController();
  const signal = input.signal ? AbortSignal.any([input.signal, work.signal]) : work.signal;
  const env = deps.env ?? process.env;
  const crawl = deps.crawl ?? crawlSite;
  const stackDetector = deps.detectStack ?? detectStack;
  const secrets = [env.OPENROUTER_API_KEY, env.LLM_API_KEY, env.BRAVE_SEARCH_API_KEY, env.BING_API_KEY, env.BING_ACCESS_TOKEN, env.GSC_ACCESS_TOKEN].filter((value): value is string => Boolean(value));
  const llmAvailable = Boolean(env.LLM_API_KEY || env.OPENROUTER_API_KEY);
  let client: ConfiguredLlmClient | undefined;
  try {
    const rendererMode = typeof input.renderer === "object" ? input.renderer.mode : input.renderer;
    const mode: RendererMode | undefined = rendererMode ? z.enum(["none", "chromium", "lightpanda", "cdp"]).parse(rendererMode) : undefined;
    const renderer = mode ? { mode, ...(typeof input.renderer === "object" && input.renderer.cdpEndpoint ? { cdpEndpoint: input.renderer.cdpEndpoint } : input.cdpEndpoint ? { cdpEndpoint: input.cdpEndpoint } : {}) } : undefined;
    input.onProgress?.({ type: "crawl:start", url: input.url, maxPages: input.maxPages });
    const site = await crawl(input.url, {
      maxPages: input.maxPages,
      render: input.render,
      ...(renderer ? { renderer } : {}),
      signal,
      onProgress: (event) => { if (event.type === "page") input.onProgress?.({ type: "crawl:page", ...(event.url ? { url: event.url } : {}), ...(event.index === undefined ? {} : { index: event.index }), ...(event.total === undefined ? {} : { total: event.total }) }); },
    });
    const stack = site.pages[0] ? stackDetector(site.pages[0]) : [];
    if ((input.llm || input.probe) && llmAvailable) client = (deps.createClient ?? createLlmClient)(loadLlmConfig(env));
    let services: Services = (deps.serviceBuilder ?? buildServices)(env);
    if (input.llm && client) services = { ...services, llm: client };
    if (input.probe && client) {
      const probeLlm = client;
      const probeClient = { complete: async (model: string, prompt: string) => probeLlm.judge({ task: "geo.visibility.probe", system: "Answer this sampled visibility question concisely. Cite sources only when available; never invent citations or claim a live search was performed without retrieval access.", user: prompt, schema: onlineAnswer, model, signal }) };
      services = { ...services, ...(deps.serviceBuilder ?? buildServices)(env, { probeClient }) };
    }
    const checks = [...(deps.checks ?? builtinChecks), ...llmChecks, ...integrationChecks];
    const registry = new CheckRegistry().register(...checks);
    const filters: { ids?: string[]; pillars?: Pillar[] } = {};
    if (input.ids) filters.ids = input.ids;
    if (input.pillars) filters.pillars = input.pillars;
    input.onProgress?.({ type: "checks:start", count: registry.list(filters).length });
    const report = await runAudit(site, registry, {
      services, stack, ...(input.ids ? { ids: input.ids } : {}), ...(input.pillars ? { pillars: input.pillars } : {}),
      signal,
      onResult: (result) => input.onProgress?.({ type: "check:result", id: result.id, status: result.status, title: result.title, result }),
    });
    report.agentView = computeAgentView(site);
    const prompt = buildFixPrompt(report);
    const usage = client?.getUsage() ?? emptyUsage();
    input.onProgress?.({ type: "llm:usage", usage });
    input.onProgress?.({ type: "done", pages: site.pages.length });
    return { report, prompt, traces: safeTraces(client?.getPromptTraces() ?? [], secrets), usage };
  } catch (error) {
    work.abort(error);
    const message = redact(error instanceof Error ? error.message : String(error), secrets);
    input.onProgress?.({ type: "error", message });
    throw error instanceof Error ? new Error(message, { cause: error }) : new Error(message);
  }
}

export async function listEngineChecks(): Promise<Check[]> { return [...builtinChecks, ...llmChecks, ...integrationChecks]; }
