import { z } from "zod";

export const Pillar = z.enum(["seo", "aeo", "geo"]);
export type Pillar = z.infer<typeof Pillar>;

/** Grouping inside a pillar, used for report sections. */
export const Category = z.enum([
  "crawlability",
  "ai-access",
  "on-page",
  "content",
  "structured-data",
  "entity",
  "links",
  "media",
  "performance",
  "international",
  "security",
  "site",
  "visibility",
]);
export type Category = z.infer<typeof Category>;

export const Severity = z.enum(["critical", "high", "medium", "low", "info"]);
export type Severity = z.infer<typeof Severity>;

export const Status = z.enum(["pass", "warn", "fail", "skip", "error"]);
export type Status = z.infer<typeof Status>;

/** deterministic = pure function of collected data; llm = model-judged; external = third-party API (GSC, Bing, probes). */
export const CheckKind = z.enum(["deterministic", "llm", "external"]);
export type CheckKind = z.infer<typeof CheckKind>;

export const Scope = z.enum(["page", "site"]);
export type Scope = z.infer<typeof Scope>;

/** Inputs a check needs; the runner skips the check when one is unavailable. */
export const Requirement = z.enum([
  "raw-html",
  "rendered-dom",
  "headers",
  "robots",
  "sitemap",
  "llms-txt",
  "crawl-graph",
  "llm",
  "gsc",
  "bing",
  "probe",
]);
export type Requirement = z.infer<typeof Requirement>;

const JsonValue: z.ZodType<unknown> = z.unknown();

export const Fix = z.object({
  /** One-line instruction for a human or agent. */
  summary: z.string(),
  /** Optional ready-to-paste snippet (JSON-LD, meta tag, robots line…). */
  snippet: z.string().optional(),
  snippetLang: z.string().optional(),
});
export type Fix = z.infer<typeof Fix>;

export const CheckResult = z.object({
  id: z.string(),
  pillar: Pillar,
  category: Category,
  kind: CheckKind,
  severity: Severity,
  status: Status,
  /** 0..1, where 1 is fully passing. */
  score: z.number().min(0).max(1),
  title: z.string(),
  message: z.string(),
  /** Page URL for page-scoped checks; omitted for site-scoped. */
  url: z.string().optional(),
  /** Machine-readable facts the verdict was based on (actual values found). */
  evidence: z.record(z.string(), JsonValue).default({}),
  fix: Fix.optional(),
  durationMs: z.number().optional(),
});
export type CheckResult = z.infer<typeof CheckResult>;
