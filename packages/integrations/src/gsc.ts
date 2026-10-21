import { z } from "zod";
import type { FetchLike } from "./http.ts";
import { jsonHeaders, jsonRequest } from "./http.ts";

const Sites = z.object({ siteEntry: z.array(z.object({ siteUrl: z.string(), permissionLevel: z.string() })) });
const Analytics = z.object({ rows: z.array(z.object({ keys: z.array(z.string()), clicks: z.number(), impressions: z.number(), ctr: z.number(), position: z.number() })).optional() });
const Sitemaps = z.object({ sitemap: z.array(z.object({ path: z.string(), lastDownloaded: z.string().optional(), isPending: z.boolean().optional(), errors: z.number().optional(), warnings: z.number().optional() })) });
const Inspection = z.object({ inspectionResult: z.object({ indexStatusResult: z.object({ verdict: z.string().optional(), coverageState: z.string().optional(), indexingState: z.string().optional(), lastCrawlTime: z.string().optional(), googleCanonical: z.string().optional(), userCanonical: z.string().optional() }).optional() }) });
const Token = z.object({ access_token: z.string(), expires_in: z.number().optional(), refresh_token: z.string().optional(), token_type: z.string().optional(), scope: z.string().optional() });
export type GscRow = z.infer<typeof Analytics>["rows"] extends (infer R)[] | undefined ? R : never;
export type GscSitemap = z.infer<typeof Sitemaps>["sitemap"][number];
export interface GscClient { listSites(): Promise<z.infer<typeof Sites>["siteEntry"]>; searchAnalytics(siteUrl: string, options?: { startDate?: string; endDate?: string; dimensions?: string[]; rowLimit?: number; startRow?: number }): Promise<NonNullable<z.infer<typeof Analytics>["rows"]>>; inspectUrl(siteUrl: string, inspectionUrl: string): Promise<z.infer<typeof Inspection>["inspectionResult"]>; listSitemaps(siteUrl: string): Promise<GscSitemap[]>; }
export function buildGscOAuthUrl(options: { clientId: string; redirectUri: string; state: string; accessType?: "online" | "offline" }): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({ client_id: options.clientId, redirect_uri: options.redirectUri, response_type: "code", scope: "https://www.googleapis.com/auth/webmasters.readonly", state: options.state, access_type: options.accessType ?? "offline", prompt: "consent" }).toString(); return u.href;
}
export async function exchangeGscCode(args: { clientId: string; clientSecret: string; code: string; redirectUri: string; fetch?: FetchLike }): Promise<z.infer<typeof Token>> {
  const fetcher = args.fetch ?? fetch;
  const body = new URLSearchParams({ client_id: args.clientId, client_secret: args.clientSecret, code: args.code, redirect_uri: args.redirectUri, grant_type: "authorization_code" });
  return jsonRequest(fetcher, "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }, Token);
}
export async function refreshGscToken(args: { clientId: string; clientSecret: string; refreshToken: string; fetch?: FetchLike }): Promise<z.infer<typeof Token>> {
  const fetcher = args.fetch ?? fetch; const body = new URLSearchParams({ client_id: args.clientId, client_secret: args.clientSecret, refresh_token: args.refreshToken, grant_type: "refresh_token" });
  return jsonRequest(fetcher, "https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }, Token);
}
export function createGscClient(accessToken: string, options: { fetch?: FetchLike; minIntervalMs?: number } = {}): GscClient {
  const fetcher = options.fetch ?? fetch; const minInterval = options.minIntervalMs ?? 50; let nextAt = 0;
  const request = async <T>(url: string, schema: z.ZodType<T>, body?: unknown): Promise<T> => {
    const wait = Math.max(0, nextAt - Date.now()); if (wait) await new Promise((r) => setTimeout(r, wait)); nextAt = Date.now() + minInterval;
    return jsonRequest(fetcher, url, { method: body === undefined ? "GET" : "POST", headers: { ...jsonHeaders, authorization: `Bearer ${accessToken}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, schema);
  };
  const base = "https://www.googleapis.com/webmasters/v3";
  return {
    async listSites() { return (await request(`${base}/sites`, Sites)).siteEntry; },
    async searchAnalytics(siteUrl, opts = {}) { const now = new Date(); const end = opts.endDate ?? new Date(now.getTime() - 3 * 86400000).toISOString().slice(0, 10); const start = opts.startDate ?? new Date(now.getTime() - 31 * 86400000).toISOString().slice(0, 10); return (await request(`${base}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, Analytics, { startDate: start, endDate: end, dimensions: opts.dimensions ?? ["page"], rowLimit: Math.min(opts.rowLimit ?? 1000, 25000), startRow: opts.startRow ?? 0, type: "web" })).rows ?? []; },
    async inspectUrl(siteUrl, inspectionUrl) { return (await request("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", Inspection, { siteUrl, inspectionUrl })).inspectionResult; },
    async listSitemaps(siteUrl) { return (await request(`${base}/sites/${encodeURIComponent(siteUrl)}/sitemaps`, Sitemaps)).sitemap; },
  };
}
