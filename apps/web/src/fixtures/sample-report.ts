import type { AuditReport } from "@aeo/core";

export const sampleReport: AuditReport = {
  schemaVersion: 1,
  id: "demo",
  startUrl: "https://northstar.studio/",
  origin: "https://northstar.studio",
  createdAt: "2026-10-20T08:30:00.000Z",
  durationMs: 1840,
  pagesCrawled: 1,
  capabilities: ["raw-html", "headers", "crawl-graph", "rendered-dom"],
  scores: { overall: 74, pillars: [
    { pillar: "seo", score: 86, passed: 8, warned: 2, failed: 1, skipped: 0 },
    { pillar: "aeo", score: 72, passed: 5, warned: 3, failed: 1, skipped: 1 },
    { pillar: "geo", score: 64, passed: 4, warned: 3, failed: 2, skipped: 1 },
  ] },
  results: [
    { id: "seo.on-page.title", pillar: "seo", category: "on-page", kind: "deterministic", severity: "high", status: "fail", score: 0, title: "Page title is missing", message: "The page does not define a descriptive title, making it harder to understand in search results.", url: "https://northstar.studio/", evidence: { title: null, url: "https://northstar.studio/" }, fix: { summary: "Add a concise title that describes this page and includes its primary topic.", snippet: "<title>Northstar Studio — Product design for ambitious teams</title>", snippetLang: "html" } },
    { id: "aeo.content.answers", pillar: "aeo", category: "content", kind: "deterministic", severity: "medium", status: "warn", score: 0.5, title: "Key answers need clearer structure", message: "Important information is present, but visitors and answer engines would benefit from direct question-led sections.", url: "https://northstar.studio/", evidence: { h2Count: 2, questionHeadings: 0 }, fix: { summary: "Add question-led headings followed by concise, self-contained answers.", snippet: "<h2>What does Northstar Studio do?</h2>\n<p>Northstar Studio helps teams design clear, useful digital products.</p>", snippetLang: "html" } },
    { id: "geo.entity.organization", pillar: "geo", category: "entity", kind: "deterministic", severity: "high", status: "fail", score: 0, title: "Organization identity is unclear", message: "No Organization structured data was found to connect the brand with its website and profiles.", url: "https://northstar.studio/", evidence: { organizationSchema: false, sameAsLinks: [] }, fix: { summary: "Add Organization structured data with a canonical URL and official profile links.", snippet: "{\n  \"@context\": \"https://schema.org\",\n  \"@type\": \"Organization\",\n  \"name\": \"Northstar Studio\",\n  \"url\": \"https://northstar.studio/\"\n}", snippetLang: "json" } },
  ],
  stack: [],
  agentView: demoAgentView(),
};

function demoAgentView(): NonNullable<AuditReport["agentView"]> {
  const definitions = [
    { agent: "OAI-SearchBot", vendor: "OpenAI", purpose: "search", executesJs: false },
    { agent: "GPTBot", vendor: "OpenAI", purpose: "training", executesJs: false },
    { agent: "ClaudeBot", vendor: "Anthropic", purpose: "training", executesJs: false },
    { agent: "PerplexityBot", vendor: "Perplexity", purpose: "search", executesJs: false },
    { agent: "browser", vendor: "Browser", purpose: "browser", executesJs: true },
  ] satisfies Pick<NonNullable<AuditReport["agentView"]>["agents"][number], "agent" | "vendor" | "purpose" | "executesJs">[];
  const pages = definitions.map((definition) => {
    const allowed = definition.agent !== "GPTBot";
    const browser = definition.executesJs;
    const wordsSeen = !allowed ? 0 : browser ? 612 : 214;
    return {
      url: "https://northstar.studio/", agent: definition.agent, executesJs: browser, allowedByRobots: allowed,
      wordsSeen, wordsTotal: 612, coverage: wordsSeen / 612,
      headingsSeen: !allowed ? 0 : browser ? 5 : 2, headingsTotal: 5,
      linksSeen: !allowed ? 0 : browser ? 18 : 7, linksTotal: 18, jsonLdSeen: false,
      excerpt: !allowed ? "" : browser ? "Northstar Studio. Product design for ambitious teams. What we build: strategy, design systems and engineering. How we work: a small team from discovery to delivery." : "Northstar Studio. Product design for ambitious teams. We design and build useful digital products.",
      missing: browser ? [] : ["What we build", "How we work", "Selected work"],
    };
  });
  return { estimated: false, pages, agents: definitions.map((definition, index) => ({ ...definition, coverage: pages[index]?.coverage ?? 0, pagesBlocked: definition.agent === "GPTBot" ? 1 : 0 })) };
}
