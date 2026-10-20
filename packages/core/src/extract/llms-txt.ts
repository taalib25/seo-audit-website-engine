/**
 * llms.txt parser and draft generator.
 *
 * Spec (llmstxt.org): one H1 with the project name, an optional blockquote
 * summary, then H2 sections containing Markdown link lists:
 *
 *   # Acme
 *   > One sentence summary.
 *   ## Docs
 *   - [Getting started](https://acme.test/docs): Install and first run
 *
 * This is an optional convention, not a crawler protocol. The parser reports
 * malformed structure instead of throwing so the audit can explain the fix.
 */

export interface LlmsTxtLink {
  name: string;
  url: string;
  note?: string;
  line: number;
  section: string;
  /** True when the URL parses as an absolute http(s) URL. */
  absolute: boolean;
  problems: string[];
}

export interface LlmsTxtSection {
  title: string;
  line: number;
  links: LlmsTxtLink[];
}

export interface LlmsTxtParseResult {
  hasH1: boolean;
  title?: string;
  summary?: string;
  sections: LlmsTxtSection[];
  links: LlmsTxtLink[];
  errors: string[];
  warnings: string[];
  lineCount: number;
  nonEmptyLineCount: number;
  valid: boolean;
}

const LINK_ITEM = /^[-*]\s+\[([^\]]+)\]\(([^)\s]+)\)(?:\s*:\s*(.*))?$/;
const H1 = /^#\s+(.+)$/;
const H2 = /^##\s+(.+)$/;
const DEEPER_HEADING = /^#{3,}\s+/;

function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Parses an llms.txt body. Never throws. */
export function parseLlmsTxt(body: string): LlmsTxtParseResult {
  const lines = body.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  const errors: string[] = [];
  const warnings: string[] = [];
  const sections: LlmsTxtSection[] = [];
  const links: LlmsTxtLink[] = [];

  let hasH1 = false;
  let title: string | undefined;
  let summary: string | undefined;
  let current: LlmsTxtSection | undefined;
  let sawSection = false;
  let optionalSeen = false;
  let nonEmptyLineCount = 0;

  const summaryParts: string[] = [];

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (line === "") return;
    nonEmptyLineCount += 1;

    if (!hasH1 && nonEmptyLineCount === 1 && !line.startsWith("#")) {
      errors.push(`Line ${lineNumber}: the file must start with an H1 title (# Name).`);
    }

    const h1 = H1.exec(line);
    if (h1) {
      if (hasH1) {
        errors.push(`Line ${lineNumber}: more than one H1 heading.`);
      } else {
        hasH1 = true;
        title = (h1[1] ?? "").trim();
        if (title === "") errors.push(`Line ${lineNumber}: H1 title is empty.`);
      }
      return;
    }

    const h2 = H2.exec(line);
    if (h2) {
      if (!hasH1) errors.push(`Line ${lineNumber}: an H2 section appears before the H1 title.`);
      sawSection = true;
      const sectionTitle = (h2[1] ?? "").trim();
      if (sectionTitle === "") errors.push(`Line ${lineNumber}: H2 section title is empty.`);
      if (optionalSeen) {
        warnings.push(`Line ${lineNumber}: content after "## Optional"; the spec puts it last.`);
      }
      if (sectionTitle.toLowerCase() === "optional") optionalSeen = true;
      const section: LlmsTxtSection = { title: sectionTitle, line: lineNumber, links: [] };
      sections.push(section);
      current = section;
      return;
    }

    if (DEEPER_HEADING.test(line)) {
      errors.push(`Line ${lineNumber}: heading deeper than H2 is not part of the llms.txt structure.`);
      return;
    }

    if (line.startsWith(">")) {
      if (!sawSection) {
        const part = line.replace(/^>\s?/, "").trim();
        if (part !== "") summaryParts.push(part);
      } else {
        warnings.push(`Line ${lineNumber}: blockquote inside a section is ignored.`);
      }
      return;
    }

    if (LINK_ITEM.test(line) || /^[-*]\s+\[/.test(line)) {
      const match = LINK_ITEM.exec(line);
      const sectionTitle = current?.title ?? "(no section)";
      if (!match) {
        errors.push(`Line ${lineNumber}: malformed link item; expected "- [name](url): note".`);
        return;
      }
      const name = (match[1] ?? "").trim();
      const url = (match[2] ?? "").trim();
      const note = match[3]?.trim();
      const problems: string[] = [];
      if (name === "") problems.push("empty link name");
      if (url === "") problems.push("empty URL");
      const absolute = isAbsoluteHttpUrl(url);
      if (url !== "" && !absolute) problems.push("URL is not absolute http(s)");
      if (current === undefined) warnings.push(`Line ${lineNumber}: link appears before any H2 section.`);
      const link: LlmsTxtLink = note === undefined || note === ""
        ? { name, url, line: lineNumber, section: sectionTitle, absolute, problems }
        : { name, url, note, line: lineNumber, section: sectionTitle, absolute, problems };
      links.push(link);
      if (current) current.links.push(link);
      else {
        const orphan: LlmsTxtSection = { title: "(no section)", line: lineNumber, links: [link] };
        sections.push(orphan);
        current = orphan;
      }
      return;
    }

    if (sawSection && /^[-*]\s+/.test(line)) {
      errors.push(`Line ${lineNumber}: list item is not a Markdown link.`);
      return;
    }
  });

  if (!hasH1) errors.push("Missing H1 title.");
  if (summaryParts.length > 0) summary = summaryParts.join(" ").trim();
  if (summary === undefined) warnings.push("Missing blockquote summary (> ...).");
  if (links.length === 0) warnings.push("No Markdown link entries found.");
  for (const link of links) {
    for (const problem of link.problems) {
      if (problem === "URL is not absolute http(s)") {
        warnings.push(`Line ${link.line}: ${problem} (${link.url}).`);
      }
    }
  }

  const result: LlmsTxtParseResult = {
    hasH1,
    sections,
    links,
    errors,
    warnings,
    lineCount: lines.length,
    nonEmptyLineCount,
    valid: errors.length === 0 && hasH1,
  };
  if (title !== undefined) result.title = title;
  if (summary !== undefined) result.summary = summary;
  return result;
}

export interface LlmsTxtDraftPage {
  url: string;
  title: string;
  description?: string;
}

export interface LlmsTxtDraftInput {
  origin: string;
  siteName?: string;
  summary?: string;
  pages: readonly LlmsTxtDraftPage[];
  /** Max entries, default 12. */
  limit?: number;
}

function cleanInline(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function linkName(value: string): string {
  return cleanInline(value).replace(/[[\]]/g, "").slice(0, 90);
}

function noteFor(page: LlmsTxtDraftPage): string | undefined {
  const description = page.description === undefined ? "" : cleanInline(page.description);
  if (description === "") return undefined;
  const firstSentence = description.split(/(?<=[.!?])\s+/)[0] ?? description;
  return firstSentence.slice(0, 160);
}

/**
 * Builds a paste-ready llms.txt from crawled pages. Only real titles,
 * descriptions and URLs are used; unknowns become explicit placeholders.
 */
export function draftLlmsTxt(input: LlmsTxtDraftInput): string {
  const limit = input.limit ?? 12;
  const seen = new Set<string>();
  const pages: LlmsTxtDraftPage[] = [];
  for (const page of input.pages) {
    const key = page.url.replace(/#.*$/, "").replace(/\/$/, "");
    if (seen.has(key)) continue;
    if (/\/(llms(-full)?\.txt|robots\.txt)$/i.test(key)) continue;
    seen.add(key);
    pages.push(page);
    if (pages.length >= limit) break;
  }

  const heading = input.siteName === undefined || input.siteName.trim() === ""
    ? "REPLACE_WITH_SITE_NAME"
    : cleanInline(input.siteName);
  const summary = input.summary === undefined || input.summary.trim() === ""
    ? "REPLACE_WITH_ONE_SENTENCE_SUMMARY_OF_THE_SITE"
    : cleanInline(input.summary);

  const groups = new Map<string, LlmsTxtDraftPage[]>();
  const groupFor = (page: LlmsTxtDraftPage): string => {
    try {
      const path = new URL(page.url).pathname;
      if (/\/(docs?|guides?|reference|api)(\/|$)/i.test(path)) return "Documentation";
      if (/\/(blog|news|articles?)(\/|$)/i.test(path)) return "Articles";
      return "Pages";
    } catch {
      return "Pages";
    }
  };
  for (const page of pages) {
    const name = groupFor(page);
    const group = groups.get(name);
    if (group) group.push(page);
    else groups.set(name, [page]);
  }

  const out: string[] = [`# ${heading}`, "", `> ${summary}`, ""];
  for (const [name, group] of groups) {
    out.push(`## ${name}`, "");
    for (const page of group) {
      const label = linkName(page.title === "" ? page.url : page.title);
      const note = noteFor(page);
      out.push(note === undefined ? `- [${label}](${page.url})` : `- [${label}](${page.url}): ${note}`);
    }
    out.push("");
  }
  if (pages.length === 0) {
    out.push("## Pages", "", "- [REPLACE_WITH_PAGE_TITLE](REPLACE_WITH_PAGE_URL): REPLACE_WITH_ONE_LINE_DESCRIPTION", "");
  }
  out.push("## Optional", "", "- [REPLACE_WITH_OPTIONAL_URL](REPLACE_WITH_OPTIONAL_URL): REPLACE_WITH_ONE_LINE_DESCRIPTION", "");
  return out.join("\n");
}
