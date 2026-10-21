/**
 * "How much can the AI agent see?" — a per-agent view of a crawled site.
 *
 * Pure and deterministic: reads a `SiteSnapshot` and never fetches anything.
 * Agents that execute JavaScript see the rendered DOM; every other agent sees
 * the HTML as served.
 */
import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import { extractJsonLd } from "./extract/jsonld.ts";
import { extractLinks } from "./extract/links.ts";
import { matchRobots, parseRobots } from "./extract/robots.ts";
import { mainText, normalizeText, wordCount } from "./extract/text.ts";
import type { AgentPageView, AgentView } from "./report.ts";
import type { PageSnapshot, SiteSnapshot } from "./snapshot.ts";

export type AgentPurpose = "search" | "training" | "user-fetch" | "browser";

export interface AgentDefinition {
  /** Bot token used in robots.txt, or "browser" for a JS-executing agent. */
  agent: string;
  vendor: string;
  purpose: AgentPurpose;
  executesJs: boolean;
}

/** Agent classes the report measures, in stable display order. */
export const AGENT_DEFINITIONS: readonly AgentDefinition[] = [
  { agent: "OAI-SearchBot", vendor: "OpenAI", purpose: "search", executesJs: false },
  { agent: "GPTBot", vendor: "OpenAI", purpose: "training", executesJs: false },
  { agent: "ChatGPT-User", vendor: "OpenAI", purpose: "user-fetch", executesJs: false },
  { agent: "ClaudeBot", vendor: "Anthropic", purpose: "training", executesJs: false },
  { agent: "Claude-SearchBot", vendor: "Anthropic", purpose: "search", executesJs: false },
  { agent: "Claude-User", vendor: "Anthropic", purpose: "user-fetch", executesJs: false },
  { agent: "PerplexityBot", vendor: "Perplexity", purpose: "search", executesJs: false },
  { agent: "Perplexity-User", vendor: "Perplexity", purpose: "user-fetch", executesJs: false },
  { agent: "Google-Extended", vendor: "Google", purpose: "training", executesJs: false },
  { agent: "Googlebot", vendor: "Google", purpose: "search", executesJs: true },
  { agent: "Applebot", vendor: "Apple", purpose: "search", executesJs: false },
  { agent: "CCBot", vendor: "Common Crawl", purpose: "training", executesJs: false },
  { agent: "browser", vendor: "Browser", purpose: "browser", executesJs: true },
];

const EXCERPT_LIMIT = 400;
const MISSING_LIMIT = 8;
const BLOCK_MIN_CHARS = 12;

interface DocumentFacts {
  /** Main-content text exactly as this document exposes it. */
  main: string;
  normalized: string;
  words: number;
  headings: number;
  links: number;
  jsonLd: boolean;
  /** Heading and block texts, used to name what an agent is missing. */
  blocks: string[];
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: readonly string[]): string[] {
  const out: string[] = [];
  for (const value of values) if (!out.includes(value)) out.push(value);
  return out;
}

function truncateBlock(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function documentFacts(
  $: CheerioAPI,
  page: PageSnapshot,
  origin: string,
  source: "raw" | "dom",
): DocumentFacts {
  const main = mainText($);
  const headingTexts = $("h1, h2, h3")
    .toArray()
    .map((element) => clean($(element).text()))
    .filter((text) => text !== "");
  const blockTexts = $("p, li")
    .toArray()
    .map((element) => clean($(element).text()))
    .filter((text) => text.length >= BLOCK_MIN_CHARS);
  return {
    main,
    normalized: normalizeText(main),
    words: wordCount(main),
    headings: headingTexts.length,
    links: extractLinks($, page.finalUrl, origin).length,
    jsonLd: extractJsonLd($, source).nodes.length > 0,
    blocks: unique([...headingTexts, ...blockTexts]),
  };
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function missingBlocks(total: DocumentFacts, seen: DocumentFacts): string[] {
  const out: string[] = [];
  for (const block of total.blocks) {
    const key = normalizeText(block);
    if (key === "" || seen.normalized.includes(key)) continue;
    out.push(truncateBlock(block));
    if (out.length >= MISSING_LIMIT) break;
  }
  return out;
}

function pageView(
  page: PageSnapshot,
  def: AgentDefinition,
  total: DocumentFacts,
  seen: DocumentFacts,
  allowed: boolean,
): AgentPageView {
  const wordsSeen = allowed ? seen.words : 0;
  const headingsSeen = allowed ? seen.headings : 0;
  const linksSeen = allowed ? seen.links : 0;
  const coverage = !allowed
    ? 0
    : total.words === 0
      ? 1
      : round(Math.min(1, wordsSeen / total.words));
  const missing = allowed
    ? missingBlocks(total, seen)
    : total.blocks.slice(0, MISSING_LIMIT).map(truncateBlock);
  return {
    url: page.finalUrl,
    agent: def.agent,
    executesJs: def.executesJs,
    allowedByRobots: allowed,
    wordsSeen,
    wordsTotal: total.words,
    coverage,
    headingsSeen,
    headingsTotal: total.headings,
    linksSeen,
    linksTotal: total.links,
    jsonLdSeen: allowed ? seen.jsonLd : false,
    excerpt: allowed ? seen.main.slice(0, EXCERPT_LIMIT) : "",
    missing,
  };
}

/** Builds the per-agent visibility report for every crawled page. */
export function computeAgentView(site: SiteSnapshot): AgentView {
  const robots = site.robotsTxt ? parseRobots(site.robotsTxt.body) : undefined;
  const estimated = site.pages.every((page) => page.renderedHtml === undefined);
  const pages: AgentPageView[] = [];

  for (const page of site.pages) {
    const rawFacts = documentFacts(cheerio.load(page.rawHtml), page, site.origin, "raw");
    const renderedFacts =
      page.renderedHtml === undefined
        ? rawFacts
        : documentFacts(cheerio.load(page.renderedHtml), page, site.origin, "dom");
    const total = renderedFacts;
    for (const def of AGENT_DEFINITIONS) {
      const allowed = robots ? matchRobots(robots, def.agent, page.finalUrl).allowed : true;
      const seen = def.executesJs ? renderedFacts : rawFacts;
      pages.push(pageView(page, def, total, seen, allowed));
    }
  }

  const agents = AGENT_DEFINITIONS.map((def) => {
    const rows = pages.filter((row) => row.agent === def.agent);
    const coverage =
      rows.length === 0
        ? 0
        : round(rows.reduce((sum, row) => sum + row.coverage, 0) / rows.length);
    return {
      agent: def.agent,
      vendor: def.vendor,
      purpose: def.purpose,
      executesJs: def.executesJs,
      coverage,
      pagesBlocked: rows.filter((row) => !row.allowedByRobots).length,
    };
  });

  return { agents, pages, estimated };
}
