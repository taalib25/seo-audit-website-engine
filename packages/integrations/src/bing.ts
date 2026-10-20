import { z } from "zod";
import type { FetchLike } from "./http.ts";
import { jsonRequest } from "./http.ts";

const BingSites = z.object({ sites: z.array(z.object({ url: z.string(), verified: z.boolean().optional(), isVerified: z.boolean().optional() })).optional() });
const UrlInfo = z.object({ url: z.string().optional(), indexed: z.boolean().optional(), isIndexed: z.boolean().optional(), lastCrawled: z.string().optional(), crawlErrors: z.array(z.string()).optional(), errors: z.array(z.string()).optional() });
const Crawl = z.object({ issues: z.array(z.object({ url: z.string().optional(), issue: z.string().optional(), severity: z.string().optional() })).optional(), crawlErrors: z.array(z.string()).optional() });
export interface BingClient { listSites(): Promise<z.infer<typeof BingSites>["sites"]>; urlInfo(siteUrl: string, url: string): Promise<z.infer<typeof UrlInfo>>; crawlIssues(siteUrl: string): Promise<z.infer<typeof Crawl>>; }
/** Endpoint paths can be supplied to track Microsoft's evolving REST surface. */
export function createBingClient(credential: { apiKey?: string; accessToken?: string }, options: { fetch?: FetchLike; baseUrl?: string; paths?: { sites?: string; urlInfo?: string; crawlIssues?: string } } = {}): BingClient {
  if (!credential.apiKey && !credential.accessToken) throw new Error("Bing API key or OAuth access token is required");
  const fetcher = options.fetch ?? fetch; const base = (options.baseUrl ?? "https://www.bing.com/webmaster/api/v1").replace(/\/$/, "");
  const headers = credential.accessToken ? { authorization: `Bearer ${credential.accessToken}` } : { "Ocp-Apim-Subscription-Key": credential.apiKey ?? "" };
  const get = async <T>(path: string, schema: z.ZodType<T>, params: Record<string, string> = {}) => { const url = new URL(`${base}/${path.replace(/^\//, "")}`); for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v); return jsonRequest(fetcher, url.href, { headers }, schema); };
  return {
    async listSites() { const data = await get(options.paths?.sites ?? "sites", BingSites); return data.sites ?? []; },
    async urlInfo(siteUrl, url) { return get(options.paths?.urlInfo ?? "urlinfo", UrlInfo, { siteUrl, url }); },
    async crawlIssues(siteUrl) { return get(options.paths?.crawlIssues ?? "crawlissues", Crawl, { siteUrl }); },
  };
}
