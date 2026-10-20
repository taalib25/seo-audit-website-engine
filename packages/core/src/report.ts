import { z } from "zod";
import { CheckResult, Pillar } from "./types.ts";

export const PillarScore = z.object({
  pillar: Pillar,
  /** 0..100 weighted by check weight × severity. */
  score: z.number(),
  passed: z.number(),
  warned: z.number(),
  failed: z.number(),
  skipped: z.number(),
});
export type PillarScore = z.infer<typeof PillarScore>;

export const AuditReport = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  startUrl: z.string(),
  origin: z.string(),
  createdAt: z.string(),
  durationMs: z.number(),
  pagesCrawled: z.number(),
  /** Capabilities that were available for this run (e.g. "rendered-dom", "llm"). */
  capabilities: z.array(z.string()),
  scores: z.object({
    overall: z.number(),
    pillars: z.array(PillarScore),
  }),
  results: z.array(CheckResult),
  /** Framework/CMS hints detected from markup, used by the fix prompt. */
  stack: z.array(z.string()).default([]),
});
export type AuditReport = z.infer<typeof AuditReport>;
