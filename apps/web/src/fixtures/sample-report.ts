import type { AuditReport } from "@aeo/core";

export const sampleReport: AuditReport = {
  schemaVersion: 1,
  id: "demo",
  startUrl: "https://northstar.studio/",
  origin: "https://northstar.studio",
  createdAt: "2026-10-20T08:30:00.000Z",
  durationMs: 1840,
  pagesCrawled: 1,
  capabilities: ["raw-html", "headers", "crawl-graph"],
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
  agentView: {
    agents: [
      { agent: "GPTBot", vendor: "OpenAI", purpose: "training", executesJs: false, coverage: 0.21, pagesBlocked: 1 },
      { agent: "OAI-SearchBot", vendor: "OpenAI", purpose: "search", executesJs: false, coverage: 0.47, pagesBlocked: 0 },
      { agent: "ClaudeBot", vendor: "Anthropic", purpose: "training", executesJs: false, coverage: 0.62, pagesBlocked: 0 },
      { agent: "PerplexityBot", vendor: "Perplexity", purpose: "user-fetch", executesJs: false, coverage: 0.83, pagesBlocked: 0 },
      { agent: "browser", vendor: "Any agent with a browser", purpose: "browser", executesJs: true, coverage: 0.96, pagesBlocked: 0 },
    ],
    pages: [
      {
        url: "https://northstar.studio/", agent: "browser", executesJs: true, allowedByRobots: true,
        wordsSeen: 590, wordsTotal: 612, coverage: 0.96, headingsSeen: 5, headingsTotal: 5, linksSeen: 18, linksTotal: 18, jsonLdSeen: false,
        excerpt: "Northstar Studio — Product design for ambitious teams. We design and build clear, useful digital products for teams that outgrew their first website. Strategy  Design  Systems  Engineering. Selected work: Fjord Analytics, Meridian Health, Castledown…",
        missing: [],
      },
      {
        url: "https://northstar.studio/", agent: "GPTBot", executesJs: false, allowedByRobots: false,
        wordsSeen: 0, wordsTotal: 612, coverage: 0, headingsSeen: 0, headingsTotal: 5, linksSeen: 0, linksTotal: 18, jsonLdSeen: false,
        excerpt: "", missing: ["Product design for ambitious teams", "What we build", "How we work", "Fjord Analytics", "Castledown"],
      },
      {
        url: "https://northstar.studio/", agent: "OAI-SearchBot", executesJs: false, allowedByRobots: true,
        wordsSeen: 214, wordsTotal: 612, coverage: 0.35, headingsSeen: 2, headingsTotal: 5, linksSeen: 7, linksTotal: 18, jsonLdSeen: false,
        excerpt: "Northstar Studio — Product design for ambitious teams. We design and build clear,…",
        missing: ["What we build", "Capabilities & process", "A day-trading dashboard rebuilt around focus"],
      },
      {
        url: "https://northstar.studio/", agent: "ClaudeBot", executesJs: false, allowedByRobots: true,
        wordsSeen: 389, wordsTotal: 612, coverage: 0.64, headingsSeen: 3, headingsTotal: 5, linksSeen: 12, linksTotal: 18, jsonLdSeen: false,
        excerpt: "Northstar Studio — Product design for ambitious teams. We design and build clear, useful digital products… Selected work: Fjord Analytics, Meridian Health…",
        missing: ["Capabilities & process", "A day-trading dashboard rebuilt around focus"],
      },
      {
        url: "https://northstar.studio/", agent: "PerplexityBot", executesJs: false, allowedByRobots: true,
        wordsSeen: 512, wordsTotal: 612, coverage: 0.84, headingsSeen: 5, headingsTotal: 5, linksSeen: 16, linksTotal: 18, jsonLdSeen: false,
        excerpt: "Northstar Studio — Product design for ambitious teams. We design and build clear, useful digital products… Selected work…",
        missing: ["A day-trading dashboard rebuilt around focus"],
      },
      {
        url: "https://northstar.studio/services", agent: "browser", executesJs: true, allowedByRobots: true,
        wordsSeen: 728, wordsTotal: 744, coverage: 0.98, headingsSeen: 6, headingsTotal: 6, linksSeen: 21, linksTotal: 21, jsonLdSeen: false,
        excerpt: "Services — what we deliver. Audit  Design  Build  Verify. Every engagement starts with an audit and ends with a verified fix list, shipped by your own team…",
        missing: [],
      },
      {
        url: "https://northstar.studio/services", agent: "GPTBot", executesJs: false, allowedByRobots: true,
        wordsSeen: 163, wordsTotal: 744, coverage: 0.22, headingsSeen: 1, headingsTotal: 6, linksSeen: 5, linksTotal: 21, jsonLdSeen: false,
        excerpt: "Services — what we deliver. Audit  Design…",
        missing: ["Frequently asked questions", "Pricing built for small teams", "Engagement models"],
      },
      {
        url: "https://northstar.studio/services", agent: "OAI-SearchBot", executesJs: false, allowedByRobots: true,
        wordsSeen: 410, wordsTotal: 744, coverage: 0.55, headingsSeen: 4, headingsTotal: 6, linksSeen: 14, linksTotal: 21, jsonLdSeen: false,
        excerpt: "Services — what we deliver. Audit  Design  Build  Verify. Every engagement starts…",
        missing: ["Frequently asked questions"],
      },
      {
        url: "https://northstar.studio/services", agent: "ClaudeBot", executesJs: false, allowedByRobots: true,
        wordsSeen: 479, wordsTotal: 744, coverage: 0.64, headingsSeen: 4, headingsTotal: 6, linksSeen: 15, linksTotal: 21, jsonLdSeen: false,
        excerpt: "Services — what we deliver. Audit  Design  Build  Verify…",
        missing: ["Frequently asked questions", "Pricing built for small teams"],
      },
      {
        url: "https://northstar.studio/services", agent: "PerplexityBot", executesJs: false, allowedByRobots: true,
        wordsSeen: 690, wordsTotal: 744, coverage: 0.93, headingsSeen: 6, headingsTotal: 6, linksSeen: 20, linksTotal: 21, jsonLdSeen: false,
        excerpt: "Services — what we deliver. Audit  Design  Build  Verify. Every engagement starts with an audit…",
        missing: [],
      },
      {
        url: "https://northstar.studio/about", agent: "browser", executesJs: true, allowedByRobots: true,
        wordsSeen: 421, wordsTotal: 421, coverage: 1, headingsSeen: 4, headingsTotal: 4, linksSeen: 17, linksTotal: 17, jsonLdSeen: false,
        excerpt: "About Northstar. A four-person studio in Portland, Oregon. We have shipped for banks, clinics and two nobody-will-let-us-talk-about startups…",
        missing: [],
      },
      {
        url: "https://northstar.studio/about", agent: "GPTBot", executesJs: false, allowedByRobots: true,
        wordsSeen: 88, wordsTotal: 421, coverage: 0.21, headingsSeen: 1, headingsTotal: 4, linksSeen: 4, linksTotal: 17, jsonLdSeen: false,
        excerpt: "About Northstar. A four-person studio…",
        missing: ["The studio behind your last rebrand", "Working with us", "Norrland — the tool we built to audit ourselves"],
      },
      {
        url: "https://northstar.studio/about", agent: "OAI-SearchBot", executesJs: false, allowedByRobots: true,
        wordsSeen: 240, wordsTotal: 421, coverage: 0.57, headingsSeen: 2, headingsTotal: 4, linksSeen: 10, linksTotal: 17, jsonLdSeen: false,
        excerpt: "About Northstar. A four-person studio in Portland, Oregon…",
        missing: ["Norrland — the tool we built to audit ourselves"],
      },
      {
        url: "https://northstar.studio/about", agent: "ClaudeBot", executesJs: false, allowedByRobots: true,
        wordsSeen: 289, wordsTotal: 421, coverage: 0.69, headingsSeen: 3, headingsTotal: 4, linksSeen: 11, linksTotal: 17, jsonLdSeen: false,
        excerpt: "About Northstar. A four-person studio in Portland, Oregon. We have shipped for banks…",
        missing: ["Working with us"],
      },
      {
        url: "https://northstar.studio/about", agent: "PerplexityBot", executesJs: false, allowedByRobots: true,
        wordsSeen: 377, wordsTotal: 421, coverage: 0.9, headingsSeen: 4, headingsTotal: 4, linksSeen: 16, linksTotal: 17, jsonLdSeen: false,
        excerpt: "About Northstar. A four-person studio in Portland, Oregon. We have shipped for banks, clinics…",
        missing: [],
      },
    ],
    estimated: true,
  },
};
