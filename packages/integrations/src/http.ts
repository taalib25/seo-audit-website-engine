import { z } from "zod";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
export async function jsonRequest<T>(fetcher: FetchLike, url: string, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const deadline = AbortSignal.timeout(15_000);
  const signal = init.signal ? AbortSignal.any([init.signal, deadline]) : deadline;
  const response = await fetcher(url, { ...init, signal });
  if (!response.ok) throw new Error(`Integration request failed (${response.status})`);
  return schema.parse(await response.json());
}
export const jsonHeaders = { accept: "application/json", "content-type": "application/json" };
