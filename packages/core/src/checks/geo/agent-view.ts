import { defineSiteCheck, fail, pass, skip, warn } from "../../check.ts";
import { computeAgentView } from "../../agent-view.ts";

const FAIL_BELOW = 0.5;
const WARN_BELOW = 0.8;

const pct = (value: number): string => `${Math.round(value * 100)}%`;

/**
 * Answers "how much can the AI agent see?" with a verdict: search and
 * user-fetch agents that receive less than half of the page content cannot
 * cite it, which silently removes the site from AI answers.
 */
export const geoAgentViewCoverage = defineSiteCheck({
  id: "geo.agent-view.coverage",
  title: "AI agents can read the page content",
  pillar: "geo",
  category: "ai-access",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["raw-html", "robots"],
  rationale:
    "AI crawlers that do not execute JavaScript only see the served HTML; content rendered client-side is invisible, so assistants cannot quote or cite it.",
  docs: "https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics",
  run: ({ site }) => {
    if (!site.robotsTxt) return skip("robots.txt was not collected.");
    if (site.pages.length === 0) return skip("No pages were crawled.");

    const view = computeAgentView(site);
    const retrieval = view.agents.filter(
      (agent) => agent.purpose === "search" || agent.purpose === "user-fetch",
    );
    if (retrieval.length === 0) return skip("No search or user-fetch agents to evaluate.");

    const worst = [...retrieval].sort(
      (a, b) => a.coverage - b.coverage || a.agent.localeCompare(b.agent),
    )[0];
    const score = worst?.coverage ?? 1;
    const blockedPairs = retrieval.reduce((sum, agent) => sum + agent.pagesBlocked, 0);
    const gaps = view.pages
      .filter((row) => row.missing.length > 0 && retrieval.some((agent) => agent.agent === row.agent))
      .map((row) => ({
        url: row.url,
        agent: row.agent,
        coverage: row.coverage,
        blocked: !row.allowedByRobots,
        missing: row.missing.slice(0, 4),
      }));
    const evidence = {
      estimated: view.estimated,
      checkedPages: site.pages.length,
      blockedPairs,
      agents: retrieval.map((agent) => ({
        agent: agent.agent,
        purpose: agent.purpose,
        coverage: agent.coverage,
        blocked: agent.pagesBlocked,
      })),
      contentGaps: gaps.slice(0, 8),
    };

    const missingHeadings = [...new Set(gaps.flatMap((gap) => gap.missing))]
      .filter((block) => block.length <= 120)
      .slice(0, 5);
    const blockedAgents = retrieval
      .filter((agent) => agent.pagesBlocked > 0)
      .map((agent) => agent.agent);
    const named = missingHeadings.slice(0, 3).map((heading) => `"${heading}"`).join(", ");
    const remainder =
      missingHeadings.length > 3 ? ` (+${missingHeadings.length - 3} more)` : "";
    const fixParts: string[] = [];
    if (missingHeadings.length > 0) {
      fixParts.push(
        `Server-render or pre-render the content non-JS agents miss (${named}${remainder}) so it is present in the served HTML.`,
      );
    }
    if (blockedAgents.length > 0) {
      fixParts.push(`Or allow ${blockedAgents.join(", ")} in robots.txt if their access is intended.`);
    }
    const fix = fixParts.length > 0 ? { summary: fixParts.join(" ") } : undefined;

    const message = worst
      ? `Lowest search/user-fetch coverage: ${pct(score)} (${worst.agent})${
          blockedPairs > 0 ? `; ${blockedPairs} blocked agent/page pair(s) in robots.txt` : ""
        }.`
      : "No search or user-fetch agents to evaluate.";
    const outcome = { evidence, score, ...(fix ? { fix } : {}) };

    if (score < FAIL_BELOW) return fail(message, outcome);
    if (score < WARN_BELOW) return warn(message, outcome);
    return pass(message, outcome);
  },
});

export const agentViewChecks = [geoAgentViewCoverage];
