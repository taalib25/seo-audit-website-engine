import * as cheerio from "cheerio";
import { definePageCheck, fail, pass, warn } from "../../check.ts";

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function metaValues(name: string, html: cheerio.CheerioAPI): string[] {
  return html(`meta[name="${name}"]`)
    .map((_, element) => normalizedText(html(element).attr("content") ?? ""))
    .get();
}

export const titlePresent = definePageCheck({
  id: "seo.title.present",
  title: "Title element is present",
  pillar: "seo",
  category: "on-page",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["raw-html"],
  rationale: "A title helps users and crawlers identify the page subject.",
  run: ({ raw }) => {
    const tags = raw()("head > title");
    const title = normalizedText(tags.first().text());
    const evidence = { title, length: title.length, count: tags.length };
    const fix = { summary: "Add one non-empty title element that describes this page." };
    if (tags.length === 0 || title === "") {
      return fail("Page has no non-empty title element in the head.", { evidence, fix });
    }
    if (tags.length > 1) {
      return fail("Page has multiple title elements in the head.", { evidence, fix });
    }
    return pass("One non-empty title element is present.", { evidence });
  },
});

export const titleLength = definePageCheck({
  id: "seo.title.length",
  title: "Title length is suitable for search snippets",
  pillar: "seo",
  category: "on-page",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html"],
  rationale: "Moderate title length helps keep page labels useful in search snippets.",
  run: ({ raw }) => {
    const title = normalizedText(raw()("head > title").first().text());
    const length = title.length;
    const evidence = { title, length, count: raw()("head > title").length };
    const fix = { summary: "Keep the title concise and descriptive, usually 30–60 characters." };
    if (length > 100 || length < 10) {
      return fail(`Title is ${length} characters; use 10–100 characters.`, { evidence, fix });
    }
    if (length === 0 || length < 30 || length > 60) {
      return warn(`Title is ${length} characters; the preferred range is 30–60.`, { evidence, fix });
    }
    return pass(`Title is ${length} characters.`, { evidence });
  },
});

export const descriptionPresent = definePageCheck({
  id: "seo.description.present",
  title: "Meta description is present",
  pillar: "seo",
  category: "on-page",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html"],
  rationale: "An accurate description can help searchers understand the page before visiting.",
  run: ({ raw }) => {
    const values = metaValues("description", raw());
    const description = values[0] ?? "";
    const evidence = { description, length: description.length, count: values.length };
    const fix = { summary: "Add one accurate, non-empty meta description for this page." };
    if (values.length === 0 || description === "") {
      return fail("Meta description is missing or blank.", { evidence, fix });
    }
    if (values.length > 1) {
      return fail("Multiple meta descriptions are present.", { evidence, fix });
    }
    return pass("One non-empty meta description is present.", { evidence });
  },
});

export const descriptionLength = definePageCheck({
  id: "seo.description.length",
  title: "Meta description length is suitable for snippets",
  pillar: "seo",
  category: "on-page",
  kind: "deterministic",
  severity: "low",
  weight: 2,
  requires: ["raw-html"],
  rationale: "A useful description should communicate the page without being excessively long.",
  run: ({ raw }) => {
    const description = metaValues("description", raw())[0] ?? "";
    const length = description.length;
    const evidence = { description, length };
    const fix = { summary: "Write an accurate meta description of about 70–160 characters." };
    if (length === 0) return warn("No description length can be measured because the description is absent.", { evidence, fix });
    if (length >= 70 && length <= 160) return pass(`Description is ${length} characters.`, { evidence });
    return warn(`Description is ${length} characters; the preferred range is 70–160.`, { evidence, fix });
  },
});

export const h1Present = definePageCheck({
  id: "seo.h1.present",
  title: "Main heading exists",
  pillar: "seo",
  category: "on-page",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html"],
  rationale: "Main headings clarify page topic and structure.",
  run: ({ raw, dom }) => {
    const visible = dom()("h1").toArray()
      .map((element) => normalizedText(dom()(element).text()))
      .filter(Boolean);
    const rawHeadings = raw()("h1").map((_, element) => normalizedText(raw()(element).text())).get();
    const evidence = {
      headings: visible.slice(0, 10),
      count: visible.length,
      rawHeadings: rawHeadings.slice(0, 10),
      rawCount: rawHeadings.length,
    };
    const fix = { summary: "Add one visible H1 that names the page subject." };
    if (visible.length === 1) return pass("Exactly one visible H1 is present.", { evidence });
    if (visible.length < 3) return warn(`Found ${visible.length} visible H1 headings.`, { evidence, fix });
    return fail(`Found ${visible.length} visible H1 headings.`, { evidence, fix });
  },
});

export const headingOrder = definePageCheck({
  id: "seo.heading.order",
  title: "Heading hierarchy does not skip levels",
  pillar: "seo",
  category: "on-page",
  kind: "deterministic",
  severity: "low",
  weight: 2,
  requires: ["raw-html"],
  rationale: "Semantic hierarchy improves navigation and parsing.",
  run: ({ dom }) => {
    const levels = dom()("h1,h2,h3,h4,h5,h6").toArray().map((element) => Number(element.tagName.slice(1)));
    const skips = levels.flatMap((level, index) => {
      if (index === 0) return [];
      const previous = levels[index - 1] ?? level;
      return level - previous > 1 ? [{ from: previous, to: level }] : [];
    });
    const evidence = { levels: levels.slice(0, 80), skips: skips.slice(0, 20), skipCount: skips.length };
    const fix = { summary: "Nest headings in order and use CSS for visual styling." };
    if (!skips.length) return pass("Heading levels do not skip.", { evidence });
    return skips.length === 1
      ? warn("One heading level is skipped.", { evidence, fix })
      : fail(`${skips.length} heading level skips found.`, { evidence, fix });
  },
});

export const viewport = definePageCheck({
  id: "seo.meta.viewport",
  title: "Mobile viewport is configured",
  pillar: "seo",
  category: "on-page",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html"],
  rationale: "Mobile usability affects users and mobile-first crawling.",
  run: ({ raw }) => {
    const values = raw()("meta[name='viewport']").map((_, element) => raw()(element).attr("content") ?? "").get();
    const value = values[0] ?? "";
    const evidence = { values };
    const fix = { summary: "Add a responsive viewport meta tag with width=device-width, initial-scale=1." };
    if (!value) return fail("Viewport metadata is missing.", { evidence, fix });
    if (!/width\s*=\s*device-width/i.test(value)) return warn("Viewport does not set width=device-width.", { evidence, fix });
    return pass("Responsive viewport is configured.", { evidence });
  },
});

export const htmlLanguage = definePageCheck({
  id: "seo.lang.html",
  title: "Document language declared",
  pillar: "seo",
  category: "on-page",
  kind: "deterministic",
  severity: "low",
  weight: 2,
  requires: ["raw-html"],
  rationale: "Language metadata aids assistive technology and content processing.",
  run: ({ raw }) => {
    const value = raw()("html").attr("lang")?.trim() ?? "";
    const evidence = { lang: value };
    const fix = { summary: "Set a valid primary language on the html lang attribute." };
    if (!value) return fail("html lang is missing.", { evidence, fix });
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value)) return warn(`Invalid language tag: ${value}.`, { evidence, fix });
    return pass(`Document language is ${value}.`, { evidence });
  },
});

export const urlReadable = definePageCheck({
  id: "seo.url.readable",
  title: "URL is stable and human-readable",
  pillar: "seo",
  category: "on-page",
  kind: "deterministic",
  severity: "medium",
  weight: 2,
  requires: ["crawl-graph"],
  rationale: "Stable descriptive URLs are easier to understand and crawl.",
  run: ({ page }) => {
    const url = new URL(page.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const params = [...url.searchParams.keys()];
    const session = /(?:session|sid|phpsessid|token|jsessionid)/i.test(page.url);
    const opaque = segments.filter((segment) => /^[a-f0-9]{16,}$/i.test(segment) || /^\d{8,}$/.test(segment));
    const evidence = { url: page.url, path: url.pathname, params: params.slice(0, 20), opaqueSegments: opaque.slice(0, 10) };
    const fix = { summary: "Use lowercase descriptive path segments, hyphenated words, and remove session identifiers." };
    if (session || params.length > 2) return fail("URL includes session identifiers or many variant parameters.", { evidence, fix });
    if (url.pathname !== url.pathname.toLowerCase() || opaque.length || params.length) return warn("URL contains casing, opaque segments, or parameters.", { evidence, fix });
    return pass("URL path is stable and readable.", { evidence });
  },
});

export const onPageChecks = [titlePresent, titleLength, descriptionPresent, descriptionLength, h1Present, headingOrder, viewport, htmlLanguage, urlReadable];

