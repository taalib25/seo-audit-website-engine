import { randomBytes } from "node:crypto";
import { safeFetch, type SafeFetchOptions } from "@aeo/core";
import { z } from "zod";
import type { FetchLike } from "./http.ts";

export function generateIndexNowKey(): string { return randomBytes(16).toString("hex"); }
export function indexNowKeyFile(key: string): { content: string; location: string } {
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) throw new Error("IndexNow key must be 8-128 alphanumeric or hyphen characters");
  return { content: key, location: `/{key}.txt`.replace("{key}", key) };
}
const Reply = z.object({ code: z.number().optional(), message: z.string().optional() }).passthrough();
export interface IndexNowClient { submitUrls(urls: string[]): Promise<{ status: number; accepted: boolean }>; }
export function createIndexNowClient(args: { key: string; origin: string; keyLocation?: string; fetch?: FetchLike }): IndexNowClient {
  const host = new URL(args.origin).host; const location = args.keyLocation ?? `${new URL(args.origin).origin}/${args.key}.txt`;
  return { async submitUrls(urls) {
    if (!urls.length || urls.length > 10000) throw new Error("IndexNow accepts 1-10,000 URLs per request");
    const parsed = urls.map((url) => new URL(url)); if (parsed.some((url) => url.host !== host)) throw new Error("All URLs must belong to the configured host");
    const response = await (args.fetch ?? fetch)("https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ host, key: args.key, keyLocation: location, urlList: urls }) });
    if (![200, 202].includes(response.status)) { await Reply.safeParseAsync(await response.json().catch(() => ({}))); throw new Error(`IndexNow submission failed (${response.status})`); }
    return { status: response.status, accepted: true };
  } };
}
export async function checkIndexNowKeyFile(origin: string, key: string, options: { fetch?: FetchLike; safeFetchOptions?: SafeFetchOptions } = {}): Promise<{ reachable: boolean; status: number; matches: boolean }> {
  const url = new URL(`${key}.txt`, origin).href;
  const result = options.fetch ? await options.fetch(url) : await safeFetch(url, options.safeFetchOptions);
  const body = options.fetch ? await (result as Response).text() : (result as Awaited<ReturnType<typeof safeFetch>>).body;
  return { reachable: result.status >= 200 && result.status < 300, status: result.status, matches: body.trim() === key };
}
