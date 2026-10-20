import { z } from "zod";
import type { FetchLike } from "./http.ts";
import { jsonRequest } from "./http.ts";
const Search = z.object({ web: z.object({ results: z.array(z.object({ url: z.string() })).optional() }).optional() });
export interface PresenceResult { provider: string; found: boolean; matchedUrl?: string; checkedAt: string; heuristic: true; }
export interface SearchProvider { checkPresence(input: { url: string; locale?: string }): Promise<PresenceResult>; }
export function createBraveSearchProvider(apiKey: string, options: { fetch?: FetchLike; endpoint?: string } = {}): SearchProvider {
  return { async checkPresence({ url, locale }) {
    const host = new URL(url).hostname; const q = `site:${host} ${url}`; const endpoint = new URL(options.endpoint ?? "https://api.search.brave.com/res/v1/web/search"); endpoint.searchParams.set("q", q); if (locale) endpoint.searchParams.set("country", locale);
    const result = await jsonRequest(options.fetch ?? fetch, endpoint.href, { headers: { accept: "application/json", "X-Subscription-Token": apiKey } }, Search);
    const match = result.web?.results?.find((item) => { try { return new URL(item.url).hostname === host; } catch { return false; } });
    return { provider: "brave", found: match !== undefined, ...(match ? { matchedUrl: match.url } : {}), checkedAt: new Date().toISOString(), heuristic: true };
  } };
}
