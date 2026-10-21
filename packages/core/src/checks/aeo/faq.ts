import type { CheerioAPI } from "cheerio";
import { definePageCheck, pass, warn, fail } from "../../check.ts";
import { mainText } from "../../extract/text.ts";

function faqText($: CheerioAPI): string[] {
  const values: string[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    try {
      const parsed: unknown = JSON.parse($(element).text());
      collectFaqValues(parsed, values);
    } catch {
      // Invalid JSON-LD cannot be verified by this check.
    }
  });
  return [...new Set(values.map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function collectFaqValues(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectFaqValues(item, output));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = value as Record<string, unknown>;
  if (record["@type"] === "FAQPage" || (Array.isArray(record["@type"]) && record["@type"].includes("FAQPage"))) {
    collectQuestions(record["mainEntity"], output);
  }
  collectFaqValues(record["@graph"], output);
}

function collectQuestions(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectQuestions(item, output));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = value as Record<string, unknown>;
  for (const key of ["name", "text"]) {
    const candidate = record[key];
    if (typeof candidate === "string") output.push(candidate);
  }
  collectQuestions(record["acceptedAnswer"], output);
}

export const faqVisible = definePageCheck({
  id: "aeo.faq.visible",
  title: "FAQ markup matches visible Q&A",
  pillar: "aeo",
  category: "content",
  kind: "deterministic",
  severity: "high",
  weight: 3,
  requires: ["raw-html"],
  rationale: "Marked answers should be visible and accurate.",
  run: ({ raw, dom }) => {
    const marked = faqText(raw());
    const visible = mainText(dom()).toLowerCase();
    const missing = marked.filter((text) => !visible.includes(text.toLowerCase()));
    const evidence = { markedQuestionsAndAnswers: marked.slice(0, 20), missing: missing.slice(0, 10), markedCount: marked.length };
    const fix = { summary: "Make every FAQ answer visible on the page or remove its FAQ markup." };
    if (missing.length) return fail(`${missing.length} FAQ markup value(s) are not visible.`, { evidence, fix });
    return pass(marked.length ? "FAQ markup text appears in visible content." : "No FAQPage markup detected.", { evidence });
  },
});

export const faqGoogleEligibility = definePageCheck({
  id: "aeo.faq.google-eligibility",
  title: "Do not promise FAQ rich results",
  pillar: "aeo",
  category: "content",
  kind: "deterministic",
  severity: "low",
  weight: 1,
  requires: ["raw-html"],
  rationale: "Google limits FAQ rich results to authoritative government and health sites.",
  run: ({ raw }) => {
    const blocks = raw()("script[type='application/ld+json']")
      .map((_, element) => raw()(element).text())
      .get()
      .filter((text) => /FAQPage/.test(text));
    const evidence = { faqPageBlocks: blocks.length, examples: blocks.slice(0, 3).map((text) => text.slice(0, 300)) };
    const fix = { summary: "Describe FAQ markup as semantic content and avoid promising a Google rich result." };
    return blocks.length
      ? warn("FAQPage markup is present; rich result display is not assured.", { evidence, fix })
      : pass("No FAQPage rich result claim is encoded in markup.", { evidence });
  },
});

export const faqChecks = [faqVisible, faqGoogleEligibility];
