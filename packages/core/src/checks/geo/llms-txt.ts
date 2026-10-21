import { defineSiteCheck, fail, pass, skip, warn, type SiteContext } from "../../check.ts";
import { draftLlmsTxt, parseLlmsTxt, type LlmsTxtDraftPage } from "../../extract/llms-txt.ts";
import { snapshotPageData } from "../schema/shared.ts";

function draftFor(site: SiteContext["site"]): string {
  const pages: LlmsTxtDraftPage[] = [];
  for (const page of site.pages.slice(0, 12)) {
    const data = snapshotPageData(page);
    const title =
      data.dom$("h1").first().text().replace(/\s+/g, " ").trim() ||
      data.dom$("title").first().text().replace(/\s+/g, " ").trim();
    const description = data.dom$('meta[name="description"]').attr("content")?.trim();
    pages.push({
      url: page.finalUrl,
      title: title === "" ? "REPLACE_WITH_PAGE_TITLE" : title,
      ...(description !== undefined && description !== "" ? { description } : {}),
    });
  }
  const home = site.pages[0];
  const homeData = home === undefined ? undefined : snapshotPageData(home);
  const siteName = homeData?.dom$('meta[property="og:site_name"]').attr("content")?.trim();
  const summary = homeData?.dom$('meta[name="description"]').attr("content")?.trim();
  return draftLlmsTxt({
    origin: site.origin,
    ...(siteName !== undefined && siteName !== "" ? { siteName } : {}),
    ...(summary !== undefined && summary !== "" ? { summary } : {}),
    pages,
  });
}

export const llmsTxtAvailable = defineSiteCheck({
  id: "geo.llms-txt.available",
  title: "llms.txt is published",
  pillar: "geo",
  category: "ai-access",
  kind: "deterministic",
  severity: "low",
  weight: 2,
  requires: [],
  rationale: "llms.txt gives AI systems a curated map of the site's most useful content.",
  docs: "https://llmstxt.org/",
  run: ({ site }) => {
    const file = site.llmsTxt;
    const fix = { summary: "Publish /llms.txt from the site root.", snippet: draftFor(site), snippetLang: "markdown" };
    if (file === undefined) {
      return warn("No /llms.txt found at the site root.", { evidence: { url: new URL("/llms.txt", site.startUrl).href }, fix });
    }
    const evidence = {
      url: file.url,
      status: file.status,
      bytes: file.body.length,
      lineCount: file.body === "" ? 0 : file.body.split(/\r?\n/).length,
    };
    if (file.status < 200 || file.status >= 300) {
      return fail(`/llms.txt responded with HTTP ${file.status}.`, { evidence, fix });
    }
    if (file.body.trim() === "") {
      return fail("/llms.txt is empty.", { evidence, fix });
    }
    return pass(`/llms.txt is available (HTTP ${file.status}, ${file.body.length} bytes).`, { evidence });
  },
});

export const llmsTxtFormat = defineSiteCheck({
  id: "geo.llms-txt.format",
  title: "llms.txt follows the published format",
  pillar: "geo",
  category: "ai-access",
  kind: "deterministic",
  severity: "low",
  weight: 2,
  requires: [],
  rationale: "The llms.txt convention expects an H1 title, an optional summary, and H2 sections of links.",
  docs: "https://llmstxt.org/",
  run: ({ site }) => {
    const file = site.llmsTxt;
    if (file === undefined) return skip("No /llms.txt to validate.");
    if (file.status < 200 || file.status >= 300) return skip(`/llms.txt responded with HTTP ${file.status}.`);
    if (file.body.trim() === "") return skip("/llms.txt is empty.");

    const parsed = parseLlmsTxt(file.body);
    const evidence = {
      url: file.url,
      title: parsed.title ?? null,
      summary: parsed.summary ?? null,
      sections: parsed.sections.map((section) => ({
        title: section.title,
        links: section.links.length,
      })),
      links: parsed.links.length,
      errors: parsed.errors,
      warnings: parsed.warnings,
    };
    const fix = { summary: "Start with one H1 title, a blockquote summary, then H2 sections of markdown links.", snippet: draftFor(site), snippetLang: "markdown" };

    if (parsed.errors.length > 0) {
      return fail(parsed.errors[0] ?? "llms.txt does not follow the convention.", { evidence, fix });
    }
    if (parsed.links.length === 0) {
      return fail("llms.txt contains no markdown links.", { evidence, fix });
    }
    if (parsed.warnings.length > 0) {
      return warn(parsed.warnings[0] ?? "llms.txt has format warnings.", { evidence, fix });
    }
    if (parsed.sections.length === 0) {
      return warn("llms.txt has links but no H2 sections.", { evidence, fix });
    }
    return pass(
      `llms.txt has an H1 title, ${parsed.sections.length} section(s) and ${parsed.links.length} link(s).`,
      { evidence },
    );
  },
});

export const llmsTxtChecks = [llmsTxtAvailable, llmsTxtFormat];
