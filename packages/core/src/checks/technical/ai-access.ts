import {
  definePageCheck,
  defineSiteCheck,
  fail,
  pass,
  skip,
  warn,
} from "../../check.ts";
import type { PageCheck, SiteCheck } from "../../check.ts";
import { matchRobots } from "../../extract/robots.ts";
import type { PageSnapshot, SiteSnapshot } from "../../snapshot.ts";
import { robots, siteMeta } from "./shared.ts";

const aiBots = [
  {
    id: "ai-crawl.openai.searchbot",
    token: "OAI-SearchBot",
    title: "OAI-SearchBot access policy",
    severity: "high" as const,
    weight: 4,
    retrieval: true,
    why: "OpenAI identifies this crawler with ChatGPT search results.",
    docs: "https://developers.openai.com/api/docs/bots",
  },
  {
    id: "ai-crawl.openai.gptbot",
    token: "GPTBot",
    title: "GPTBot training access policy",
    severity: "info" as const,
    weight: 2,
    retrieval: false,
    why: "GPTBot is a distinct training crawler, not the search bot.",
    docs: "https://developers.openai.com/api/docs/bots",
  },
  {
    id: "ai-crawl.anthropic.searchbot",
    token: "Claude-SearchBot",
    title: "Claude-SearchBot access policy",
    severity: "high" as const,
    weight: 3,
    retrieval: true,
    why: "Anthropic distinguishes search indexing from other crawlers.",
    docs: "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
  },
  {
    id: "ai-crawl.anthropic.claudebot",
    token: "ClaudeBot",
    title: "ClaudeBot training access policy",
    severity: "info" as const,
    weight: 2,
    retrieval: false,
    why: "Training crawler policy is separable from search retrieval.",
    docs: "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
  },
  {
    id: "ai-crawl.anthropic.user-fetch",
    token: "Claude-User",
    title: "Claude-User access policy",
    severity: "medium" as const,
    weight: 2,
    retrieval: true,
    why: "User-triggered fetching is distinct from training and search.",
    docs: "https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler",
  },
  {
    id: "ai-crawl.perplexity.searchbot",
    token: "PerplexityBot",
    title: "PerplexityBot access policy",
    severity: "high" as const,
    weight: 3,
    retrieval: true,
    why: "PerplexityBot is its search indexing crawler.",
    docs: "https://docs.perplexity.ai/docs/resources/perplexity-crawlers",
  },
  {
    id: "ai-crawl.google.extended",
    token: "Google-Extended",
    title: "Google-Extended training and grounding access",
    severity: "info" as const,
    weight: 1,
    retrieval: false,
    why: "Google-Extended is an operator-controlled training and grounding choice.",
    docs: "https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers",
  },
  {
    id: "ai-crawl.apple.extended",
    token: "Applebot-Extended",
    title: "Applebot-Extended training access",
    severity: "info" as const,
    weight: 1,
    retrieval: false,
    why: "Applebot-Extended is a separate generative training opt-out token.",
    docs: "https://support.apple.com/en-us/119829",
  },
  {
    id: "ai-crawl.commoncrawl.ccbot",
    token: "CCBot",
    title: "CCBot training access",
    severity: "info" as const,
    weight: 1,
    retrieval: false,
    why: "CCBot is a Common Crawl data collection crawler.",
    docs: "https://blog.commoncrawl.org/ccbot",
  },
  {
    id: "ai-crawl.bytespider",
    token: "Bytespider",
    title: "Bytespider access policy",
    severity: "info" as const,
    weight: 1,
    retrieval: false,
    why: "Bytespider is retained as a vendor token; purpose is not first-party verified.",
    docs: "https://developers.google.com/search/docs/crawling-indexing/robots/intro",
  },
  {
    id: "ai-crawl.meta.externalagent",
    token: "Meta-ExternalAgent",
    title: "Meta-ExternalAgent access policy",
    severity: "info" as const,
    weight: 1,
    retrieval: false,
    why: "Meta crawler access is an operator-controlled policy choice.",
    docs: "https://developers.facebook.com/docs/sharing/webmasters/web-crawlers/",
  },
  {
    id: "ai-crawl.amazonbot",
    token: "Amazonbot",
    title: "Amazonbot access policy",
    severity: "info" as const,
    weight: 1,
    retrieval: false,
    why: "Amazonbot access is an operator-controlled policy choice.",
    docs: "https://developer.amazon.com/amazonbot",
  },
];

export const aiBotChecks: SiteCheck[] = aiBots.map((b) =>
  defineSiteCheck({
    ...siteMeta(
      b.id,
      b.title,
      "ai-access",
      b.severity,
      b.weight,
      ["robots"],
      b.why,
      b.docs,
    ),
    run: ({ site: s }) => {
      const d = robots(s);
      if (!d) return skip("robots.txt was not collected.");
      const urls = [
        ...new Set([s.startUrl, ...s.pages.map((p) => p.finalUrl)]),
      ];
      const results = urls.map((url) => ({
        url,
        ...matchRobots(d, b.token, url),
      }));
      const blocked = results.filter((r) => !r.allowed);
      const explicit = results.some((r) =>
        r.groupAgents.some((a) => a === b.token.toLowerCase()),
      );
      const startUrlBlocked = blocked.some(
        (result) => result.url === s.startUrl,
      );
      const importantBlocks = blocked.filter(
        (result) => result.url !== s.startUrl,
      );
      const evidence = {
        bot: b.token,
        policy: b.retrieval ? "search/retrieval" : "training/operator-choice",
        urls: results.map((r) => ({
          url: r.url,
          allowed: r.allowed,
          matchingRule: r.rule,
          groupAgents: r.groupAgents,
        })),
        explicitRule: explicit,
        note: b.retrieval
          ? explicit
            ? "A bot-specific rule applies."
            : "Wildcard/default access is allowed and is treated as the desired state."
          : "Training access is an operator choice; either policy is acceptable.",
      };
      if (!b.retrieval)
        return pass(
          `${b.token} access is an operator choice (${blocked.length ? "blocked" : "allowed"}).`,
          { evidence },
        );
      if (startUrlBlocked)
        return fail(`${b.token} is disallowed on the start URL.`, {
          evidence,
          fix: {
            summary:
              "Allow this search or user-fetch crawler if its visibility is desired.",
            snippet: `User-agent: ${b.token}\nAllow: /`,
          },
        });
      if (importantBlocks.length)
        return warn(
          `${b.token} is disallowed on ${importantBlocks.length} non-start URL(s).`,
          { evidence },
        );
      if (!explicit)
        return pass(`${b.token} is allowed by wildcard/default policy.`, {
          evidence,
        });
      return pass(`${b.token} is allowed on checked URLs.`, { evidence });
    },
  }),
);

export const chatgptUserReachability = defineSiteCheck({
  ...siteMeta(
    "ai-crawl.openai.user-fetch",
    "ChatGPT-User request reachability",
    "ai-access",
    "medium",
    3,
    ["headers"],
    "User-triggered fetches differ from automated indexing crawls; robots.txt may not apply to user-initiated requests.",
    "https://developers.openai.com/api/docs/bots",
  ),
  run: () =>
    skip("No verified provider request result is present in the snapshot."),
});

export const aiBotRuleAudit = defineSiteCheck({
  ...siteMeta(
    "ai-crawl.ai-bot.rule-audit",
    "AI bot rules cover current named tokens",
    "ai-access",
    "medium",
    3,
    ["robots"],
    "Bot tokens and purposes differ and change over time.",
    "https://developers.openai.com/api/docs/bots",
  ),
  run: ({ site: s }) => {
    const d = robots(s);
    if (!d) return skip("robots.txt was not collected.");
    const tokens = [
      "OAI-SearchBot",
      "GPTBot",
      "ChatGPT-User",
      "ClaudeBot",
      "Claude-SearchBot",
      "Claude-User",
      "PerplexityBot",
      "Google-Extended",
      "Applebot-Extended",
      "CCBot",
      "Bytespider",
    ];
    const urls = [...new Set([s.startUrl, ...s.pages.map((p) => p.finalUrl)])];
    const bots = tokens.map((bot) => ({
      bot,
      urls: urls.map((url) => ({ url, ...matchRobots(d, bot, url) })),
    }));
    return pass(
      "Evaluated all named crawler tokens against the start URL and crawled pages.",
      { evidence: { bots } },
    );
  },
});

export const aiAccessChecks: SiteCheck[] = [
  ...aiBotChecks,
  chatgptUserReachability,
  aiBotRuleAudit,
];
