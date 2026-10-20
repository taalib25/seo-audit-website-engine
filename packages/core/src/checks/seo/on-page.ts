import { definePageCheck, fail, pass, warn } from "../../check.ts";

/** Reference implementation: the pattern every deterministic check follows. */
export const titleLength = definePageCheck({
  id: "seo.title.length",
  title: "Title tag present and 30–60 characters",
  pillar: "seo",
  category: "on-page",
  kind: "deterministic",
  severity: "high",
  weight: 3,
  requires: ["raw-html"],
  rationale: "The title is the primary relevance signal and the default SERP/AI-citation label.",
  docs: "https://developers.google.com/search/docs/appearance/title-link",
  run: ({ raw }) => {
    const $ = raw();
    const titles = $("head > title");
    const title = titles.first().text().replace(/\s+/g, " ").trim();
    const length = title.length;
    const evidence = { title, length, count: titles.length };
    const fix = { summary: "Write a unique, descriptive <title> of 30–60 characters leading with the primary topic." };
    if (length === 0) return fail("Page has no <title>.", { evidence, fix });
    if (titles.length > 1) return warn(`Page has ${titles.length} <title> tags.`, { evidence, fix });
    if (length < 30 || length > 60) {
      return warn(`Title is ${length} characters (aim for 30–60).`, { evidence, fix, score: 0.6 });
    }
    return pass(`Title is ${length} characters.`, { evidence });
  },
});

export const onPageChecks = [titleLength];
