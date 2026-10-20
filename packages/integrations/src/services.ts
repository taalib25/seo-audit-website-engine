import { z } from "zod";
import type { Services } from "@aeo/core";
import { createGscClient } from "./gsc.ts";
import { createBingClient } from "./bing.ts";
import { createProber, type LlmClientLike, type ProbeQuery } from "./probe.ts";
import { createBraveSearchProvider } from "./presence.ts";

const EnvSchema = z.object({ GSC_ACCESS_TOKEN: z.string().min(1).optional(), BING_API_KEY: z.string().min(1).optional(), BING_ACCESS_TOKEN: z.string().min(1).optional(), INDEXNOW_KEY: z.string().regex(/^[a-zA-Z0-9-]{8,128}$/).optional(), BRAVE_SEARCH_API_KEY: z.string().min(1).optional(), PROBE_QUERIES: z.string().optional(), PROBE_SAMPLES: z.coerce.number().int().min(1).max(20).optional(), PROBE_COST_PER_SAMPLE_USD: z.coerce.number().min(0).optional() });
export function buildServices(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env, adapters: { probeClient?: LlmClientLike } = {}): Services {
  const cfg = EnvSchema.parse(env); const services: Services & { indexNowKey?: string; presence?: ReturnType<typeof createBraveSearchProvider> } = {};
  if (cfg.GSC_ACCESS_TOKEN) services.gsc = createGscClient(cfg.GSC_ACCESS_TOKEN);
  if (cfg.BING_API_KEY || cfg.BING_ACCESS_TOKEN) services.bing = createBingClient({ ...(cfg.BING_API_KEY ? { apiKey: cfg.BING_API_KEY } : {}), ...(cfg.BING_ACCESS_TOKEN ? { accessToken: cfg.BING_ACCESS_TOKEN } : {}) });
  if (cfg.INDEXNOW_KEY) services.indexNowKey = cfg.INDEXNOW_KEY;
  if (cfg.BRAVE_SEARCH_API_KEY) services.presence = createBraveSearchProvider(cfg.BRAVE_SEARCH_API_KEY);
  if (cfg.PROBE_QUERIES && adapters.probeClient) {
    const queries = z.array(z.object({ query: z.string(), model: z.string(), samples: z.number().int().positive().optional(), competitors: z.array(z.string()).optional() })).parse(JSON.parse(cfg.PROBE_QUERIES)) as ProbeQuery[];
    services.probe = createProber({ llmClientLike: adapters.probeClient, queries, ...(cfg.PROBE_SAMPLES ? { samples: cfg.PROBE_SAMPLES } : {}), ...(cfg.PROBE_COST_PER_SAMPLE_USD !== undefined ? { costPerSampleUsd: cfg.PROBE_COST_PER_SAMPLE_USD } : {}) });
  }
  return services;
}
