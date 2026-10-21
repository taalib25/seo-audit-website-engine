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

/** What one class of AI agent can actually read on one page. */
export const AgentPageView = z.object({
  url: z.string(),
  /** Bot token, e.g. "GPTBot", or "browser" for a JS-executing agent. */
  agent: z.string(),
  executesJs: z.boolean(),
  allowedByRobots: z.boolean(),
  /** Visible words this agent receives vs words a human sees in the rendered page. */
  wordsSeen: z.number(),
  wordsTotal: z.number(),
  /** 0..1 = wordsSeen / wordsTotal (0 when blocked). */
  coverage: z.number(),
  headingsSeen: z.number(),
  headingsTotal: z.number(),
  linksSeen: z.number(),
  linksTotal: z.number(),
  jsonLdSeen: z.boolean(),
  /** Short excerpt of the main text exactly as this agent receives it (truncated). */
  excerpt: z.string(),
  /** Notable content humans see but this agent doesn't (headings / first words of missing blocks). */
  missing: z.array(z.string()).default([]),
});
export type AgentPageView = z.infer<typeof AgentPageView>;

export const AgentView = z.object({
  /** Site-wide coverage per agent (mean over audited pages, 0..1). */
  agents: z.array(
    z.object({
      agent: z.string(),
      vendor: z.string(),
      purpose: z.enum(["search", "training", "user-fetch", "browser"]),
      executesJs: z.boolean(),
      coverage: z.number(),
      pagesBlocked: z.number(),
    }),
  ),
  pages: z.array(AgentPageView),
  /** True when no page had a rendered DOM, so "total" is estimated from raw HTML. */
  estimated: z.boolean(),
});
export type AgentView = z.infer<typeof AgentView>;

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
  /** "How much can the agent see" — per-AI-agent visibility of the audited pages. */
  agentView: AgentView.optional(),
});
export type AuditReport = z.infer<typeof AuditReport>;
