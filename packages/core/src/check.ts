import * as cheerio from "cheerio";
import type { z } from "zod";
import type { PageSnapshot, SiteSnapshot } from "./snapshot.ts";
import type {
  Category,
  CheckKind,
  Fix,
  Pillar,
  Requirement,
  Scope,
  Severity,
  Status,
} from "./types.ts";

/** What a check returns; the runner adds id/pillar/severity/url/timing. */
export interface CheckOutcome {
  status: Exclude<Status, "error">;
  /** Defaults: pass=1, warn=0.5, fail=0, skip=1. */
  score?: number;
  message: string;
  evidence?: Record<string, unknown>;
  fix?: Fix;
}

export interface LlmJudgeRequest<T> {
  /** Stable task name, used for logging and model routing (e.g. "aeo.answerability"). */
  task: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Overrides the configured default model for this task. */
  model?: string;
  signal?: AbortSignal;
}

export interface LlmClient {
  judge<T>(req: LlmJudgeRequest<T>): Promise<T>;
}

/** Third-party integrations, present only when configured/authorized. */
export interface Services {
  llm?: LlmClient;
  /** Implementations live in their own modules; checks narrow these with their own types. */
  gsc?: unknown;
  bing?: unknown;
  probe?: unknown;
}

interface BaseContext {
  site: SiteSnapshot;
  services: Services;
  signal: AbortSignal;
}

export interface PageContext extends BaseContext {
  page: PageSnapshot;
  /** Parsed served HTML (what non-JS crawlers see). */
  raw: () => cheerio.CheerioAPI;
  /** Parsed rendered DOM, falling back to raw when no renderer ran. */
  dom: () => cheerio.CheerioAPI;
}

export type SiteContext = BaseContext;

interface CheckMeta {
  /** Stable dotted id, e.g. "seo.title.length". Fix prompts and `verify` reference it. */
  id: string;
  title: string;
  pillar: Pillar;
  category: Category;
  kind: CheckKind;
  severity: Severity;
  /** Relative importance inside its pillar score. */
  weight: number;
  requires: readonly Requirement[];
  /** One line: why it matters. Shown in reports and fix prompts. */
  rationale: string;
  docs?: string;
}

export interface PageCheck extends CheckMeta {
  scope: "page";
  run: (ctx: PageContext) => CheckOutcome | Promise<CheckOutcome>;
}

export interface SiteCheck extends CheckMeta {
  scope: "site";
  run: (ctx: SiteContext) => CheckOutcome | Promise<CheckOutcome>;
}

export type Check = PageCheck | SiteCheck;
export type { Scope };

export function definePageCheck(check: Omit<PageCheck, "scope">): PageCheck {
  return { ...check, scope: "page" };
}

export function defineSiteCheck(check: Omit<SiteCheck, "scope">): SiteCheck {
  return { ...check, scope: "site" };
}

/** Builds a page context with memoized parsers. */
export function createPageContext(
  page: PageSnapshot,
  base: BaseContext,
): PageContext {
  let raw: cheerio.CheerioAPI | undefined;
  let dom: cheerio.CheerioAPI | undefined;
  return {
    ...base,
    page,
    raw: () => (raw ??= cheerio.load(page.rawHtml)),
    dom: () => {
      if (page.renderedHtml === undefined) return (raw ??= cheerio.load(page.rawHtml));
      return (dom ??= cheerio.load(page.renderedHtml));
    },
  };
}

export const pass = (message: string, extra: Partial<CheckOutcome> = {}): CheckOutcome => ({
  status: "pass",
  message,
  ...extra,
});
export const warn = (message: string, extra: Partial<CheckOutcome> = {}): CheckOutcome => ({
  status: "warn",
  message,
  ...extra,
});
export const fail = (message: string, extra: Partial<CheckOutcome> = {}): CheckOutcome => ({
  status: "fail",
  message,
  ...extra,
});
export const skip = (message: string): CheckOutcome => ({ status: "skip", message });
