import { z } from "zod";
import type { Check, CheckResult } from "@aeo/core";

export const AuditFlags = z.object({
  pages: z.coerce.number().int().min(1),
  render: z.enum(["auto", "always", "never"]),
  renderer: z.enum(["chromium", "lightpanda", "cdp"]).optional(),
});

export function defaultVerificationPages(checks: readonly Pick<Check, "scope">[]): number {
  return checks.every((check) => check.scope === "page") ? 1 : 20;
}

export function verificationPassed(ids: readonly string[], results: readonly Pick<CheckResult, "id" | "status">[]): boolean {
  return ids.length > 0 && ids.every((id) => results.some((result) => result.id === id))
    && results.length > 0 && results.every((result) => result.status === "pass");
}

export function estimateProbeSpend(env: NodeJS.ProcessEnv): number {
  const samples = z.coerce.number().int().min(1).max(20).parse(env.PROBE_SAMPLES ?? "1");
  const cost = z.coerce.number().finite().min(0).parse(env.PROBE_COST_PER_SAMPLE_USD ?? "0");
  const queries = z.array(z.object({ query: z.string(), model: z.string(), samples: z.number().int().positive().optional() }))
    .min(1).parse(JSON.parse(env.PROBE_QUERIES ?? "[]"));
  return queries.reduce((total, query) => total + (query.samples ?? samples) * cost, 0);
}
