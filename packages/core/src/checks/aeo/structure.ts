import type { CheerioAPI } from "cheerio";
import { definePageCheck, fail, pass, warn } from "../../check.ts";
import { mainText, wordCount } from "../../extract/text.ts";

function findQuestionHeadings($: CheerioAPI): string[] {
  return $("h2,h3")
    .map((_, element) => $(element).text().replace(/\s+/g, " ").trim())
    .get()
    .filter((heading) => /\?$/.test(heading) || /^(how|what|when|where|why|who|which|does|is|can|should)\b/i.test(heading));
}

export const visibleContentParity = definePageCheck({
  id: "aeo.visible-content-parity",
  title: "Core answer is visible without interaction",
  pillar: "aeo",
  category: "content",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["raw-html"],
  rationale: "Primary answer content should be available without interaction.",
  run: ({ raw, dom }) => {
    const rawText = mainText(raw());
    const renderedText = mainText(dom());
    const rawWords = new Set(rawText.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
    const renderedWords = renderedText.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    const matched = renderedWords.filter((word) => rawWords.has(word)).length;
    const ratio = renderedWords.length ? matched / renderedWords.length : 1;
    const evidence = {
      rawWords: rawWords.size,
      renderedWords: renderedWords.length,
      matchedWords: matched,
      ratio: Number(ratio.toFixed(3)),
      rawExcerpt: rawText.slice(0, 300),
      renderedExcerpt: renderedText.slice(0, 300),
    };
    const fix = { summary: "Keep the primary answer in the initial HTML or make it visible without interaction." };
    if (ratio < 0.5) return fail(`Only ${Math.round(ratio * 100)}% of rendered words are represented in raw HTML.`, { evidence, fix });
    if (ratio < 0.9) return warn(`${Math.round(ratio * 100)}% of rendered words are represented in raw HTML.`, { evidence, fix });
    return pass("Main content is substantially present in initial HTML.", { evidence });
  },
});

export const questionHeadings = definePageCheck({
  id: "aeo.question-headings",
  title: "Use question headings where they help readers",
  pillar: "aeo",
  category: "content",
  kind: "deterministic",
  severity: "low",
  weight: 2,
  requires: ["raw-html"],
  rationale: "Question headings can make answer sections easy to locate and extract.",
  run: ({ dom }) => {
    const headings = dom()("h2,h3").map((_, element) => dom()(element).text().replace(/\s+/g, " ").trim()).get();
    const questions = findQuestionHeadings(dom());
    const evidence = { headingCount: headings.length, questionCount: questions.length, questionHeadings: questions.slice(0, 20) };
    if (questions.length) return pass(`${questions.length} question-shaped H2/H3 heading(s) found.`, { evidence });
    if (headings.length === 0) return warn("No H2/H3 headings are available to assess.", { evidence });
    return warn("No question-shaped H2/H3 headings found; this can be appropriate for a homepage.", { evidence });
  },
});

export const answerFirstLength = definePageCheck({
  id: "aeo.answer-first-length",
  title: "Question sections start with concise answers",
  pillar: "aeo",
  category: "content",
  kind: "deterministic",
  severity: "low",
  weight: 2,
  requires: ["raw-html"],
  rationale: "A concise answer immediately after a question heading is easier to scan.",
  run: ({ dom }) => {
    const $ = dom();
    const answers: { question: string; words: number; excerpt: string }[] = [];
    $("h2,h3").each((_, element) => {
      const question = $(element).text().trim();
      if (!/\?$/.test(question) && !/^(how|what|when|where|why|who|which)\b/i.test(question)) return;
      let next = $(element).next();
      while (next.length && !/^p$/i.test(next[0]?.tagName ?? "")) next = next.next();
      if (!next.length) return;
      const text = next.text().replace(/\s+/g, " ").trim();
      answers.push({ question, words: wordCount(text), excerpt: text.slice(0, 240) });
    });
    const outOfRange = answers.filter((answer) => answer.words < 40 || answer.words > 60);
    const evidence = { questionCount: answers.length, answers: answers.slice(0, 20), outOfRange: outOfRange.length };
    const fix = { summary: "Start question sections with a direct answer, then add supporting detail." };
    if (outOfRange.length) return warn(`${outOfRange.length} of ${answers.length} question answers are outside the 40–60 word target.`, { evidence, fix });
    return pass(answers.length ? "Question answers are within the 40–60 word target." : "No question-headed answer sections detected.", { evidence });
  },
});

export const structuredContent = definePageCheck({
  id: "aeo.content-structure",
  title: "Use lists and tables for procedural content",
  pillar: "aeo",
  category: "content",
  kind: "deterministic",
  severity: "low",
  weight: 2,
  requires: ["raw-html"],
  rationale: "Lists and tables can make steps and comparisons easier to scan.",
  run: ({ dom }) => {
    const $ = dom();
    const procedural = /\b(steps?|how to|process|compare|versus|vs\.?|checklist|requirements)\b/i.test(mainText($));
    const structures = $("main ol,article ol,main ul,article ul,main table,article table").length;
    const evidence = { proceduralCueDetected: procedural, listOrTableCount: structures, lists: $("ol,ul").length, tables: $("table").length };
    const fix = { summary: "Represent genuine procedural steps as an ordered list and comparisons as a table when useful." };
    if (procedural && !structures) return warn("Procedural content has no list or table structure.", { evidence, fix });
    return pass(procedural ? "Procedural content includes list or table structure." : "No procedural content structure gap detected.", { evidence });
  },
});

export const summaryNearTop = definePageCheck({
  id: "aeo.summary-near-top",
  title: "Provide a short summary near the top",
  pillar: "aeo",
  category: "content",
  kind: "deterministic",
  severity: "low",
  weight: 2,
  requires: ["raw-html"],
  rationale: "A concise summary near the start helps readers understand the page quickly.",
  run: ({ dom }) => {
    const $ = dom();
    const candidates = $("main,article,body").first().children().slice(0, 5).toArray();
    const text = candidates.map((element) => $(element).text().replace(/\s+/g, " ").trim()).join(" ");
    const found = /\b(summary|tldr|tl;dr|in brief|key takeaways|at a glance)\b/i.test(text);
    const evidence = { summaryLabelFoundNearTop: found, topExcerpt: text.slice(0, 300) };
    const fix = { summary: "Add a concise, accurate summary near the beginning when it helps users scan the page." };
    return found ? pass("Summary cue appears near the top.", { evidence }) : warn("No summary or TL;DR cue appears near the top.", { evidence, fix });
  },
});

export const paragraphReadability = definePageCheck({
  id: "aeo.paragraph-length",
  title: "Keep paragraphs readable",
  pillar: "aeo",
  category: "content",
  kind: "deterministic",
  severity: "low",
  weight: 1,
  requires: ["raw-html"],
  rationale: "Shorter paragraphs can improve scanning on screens.",
  run: ({ dom }) => {
    const paragraphs = dom()("main p,article p").toArray()
      .map((element) => wordCount(dom()(element).text())).filter((count) => count > 0);
    const long = paragraphs.filter((count) => count > 120);
    const evidence = { paragraphCount: paragraphs.length, paragraphsOver120Words: long.length, wordCounts: paragraphs.slice(0, 40) };
    const fix = { summary: "Split unusually long paragraphs at natural topic breaks to improve scanning." };
    return long.length
      ? warn(`${long.length} paragraph(s) exceed 120 words.`, { evidence, fix })
      : pass("No paragraph exceeds 120 words.", { evidence });
  },
});

export const structureChecks = [visibleContentParity, questionHeadings, answerFirstLength, structuredContent, summaryNearTop, paragraphReadability];
