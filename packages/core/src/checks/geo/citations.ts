import { definePageCheck, fail, pass, skip, warn } from "../../check.ts";
import { isInternalUrl } from "../../extract/links.ts";
import { sentences, wordCount } from "../../extract/text.ts";
import { contextPageData } from "../schema/shared.ts";

const INLINE_URL = /https?:\/\/[^\s)]+/i;
const ATTRIBUTION =
  /\b(according to|source:|sources:|cited in|reported by|study by|research by|et al\.?|doi:|retrieved from|as reported|data from|per the)\b/i;
const MIN_WORDS = 80;
const MIN_SENTENCES = 5;
const EXPECTED_CITATION_SHARE = 0.15;

function externalHosts(html: string, origin: string): string[] {
  const hosts = new Set<string>();
  const href = /href\s*=\s*["']([^"']+)["']/gi;
  let match = href.exec(html);
  while (match !== null) {
    const value = match[1];
    if (value !== undefined) {
      try {
        const url = new URL(value, origin);
        if ((url.protocol === "http:" || url.protocol === "https:") && !isInternalUrl(url.href, origin)) {
          hosts.add(url.hostname.replace(/^www\./, ""));
        }
      } catch {
        // Ignore malformed hrefs; link checks report them separately.
      }
    }
    match = href.exec(html);
  }
  return [...hosts];
}

export const geoCitations = definePageCheck({
  id: "geo.citations",
  title: "Claims are backed by cited sources",
  pillar: "geo",
  category: "content",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html"],
  rationale: "Generative engines favor content whose factual claims trace to identifiable sources.",
  run: (ctx) => {
    const data = contextPageData(ctx);
    const words = wordCount(data.main);
    const all = sentences(data.main);
    if (words < MIN_WORDS || all.length < MIN_SENTENCES) {
      return skip("Page has too little main-content prose to assess citation density.");
    }

    const bodyHtml = data.dom$("main, article").length > 0
      ? data.dom$("main, article").html() ?? ""
      : data.dom$("body").html() ?? "";
    const hosts = externalHosts(bodyHtml, data.page.finalUrl);
    const hostTokens = hosts.map((host) => host.split(".")[0] ?? host).filter((token) => token.length >= 3);

    const claims = all.filter((sentence) => wordCount(sentence) >= 8);
    const cited = claims.filter(
      (sentence) =>
        INLINE_URL.test(sentence) ||
        ATTRIBUTION.test(sentence) ||
        hostTokens.some((token) => sentence.toLowerCase().includes(token)),
    );
    const total = claims.length === 0 ? all.length : claims.length;
    const ratio = total === 0 ? 0 : cited.length / total;
    const expected = Math.max(1, Math.round(total * EXPECTED_CITATION_SHARE));
    const score = Math.round(Math.min(1, cited.length / expected) * 100) / 100;
    const evidence = {
      mainWords: words,
      sentences: all.length,
      claimSentences: total,
      citedSentences: cited.length,
      citationRatio: Math.round(ratio * 100) / 100,
      score,
      externalHosts: hosts,
      citedExamples: cited.slice(0, 3),
      uncitedExamples: claims.filter((sentence) => !cited.includes(sentence)).slice(0, 3),
    };
    const fix = {
      summary: "Attribute specific claims to primary sources with a visible link or named reference.",
      snippet:
        "According to [REPLACE_WITH_SOURCE_NAME](REPLACE_WITH_SOURCE_URL), REPLACE_WITH_SUPPORTED_CLAIM.",
      snippetLang: "markdown",
    };

    if (score >= 0.8) {
      return pass(
        `${cited.length} of ${total} claim sentence(s) carry a source reference (score ${score}).`,
        { evidence, score },
      );
    }
    if (score >= 0.4) {
      return warn(
        `Only ${cited.length} of ${total} claim sentence(s) carry a source reference (score ${score}).`,
        { evidence, score, fix },
      );
    }
    return fail(
      `Claims are largely unattributed: ${cited.length} of ${total} claim sentence(s) cite a source (score ${score}).`,
      { evidence, score, fix },
    );
  },
});

export const citationChecks = [geoCitations];
