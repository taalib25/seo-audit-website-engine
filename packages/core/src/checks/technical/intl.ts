import {
  definePageCheck,
  defineSiteCheck,
  fail,
  pass,
  skip,
  warn,
} from "../../check.ts";
import type { PageCheck, SiteCheck } from "../../check.ts";
import type { PageSnapshot, SiteSnapshot } from "../../snapshot.ts";
import { canonical, normalize, pageMeta, siteMeta } from "./shared.ts";

import * as cheerio from "cheerio";
const intlDocs =
  "https://developers.google.com/search/docs/specialty/international/localized-versions";

export const hreflangValid = definePageCheck({
  ...pageMeta(
    "intl.hreflang.valid",
    "hreflang values and URLs valid",
    "international",
    "medium",
    3,
    ["raw-html", "headers"],
    "Correct alternates help search engines serve language versions.",
    intlDocs,
  ),
  run: ({ raw, page: p, site: s }) => {
    const links = raw()('link[rel~="alternate" i][hreflang]')
      .toArray()
      .map((x) => ({
        lang: raw()(x).attr("hreflang") ?? "",
        href: raw()(x).attr("href") ?? "",
      }));
    if (!links.length) return skip("No hreflang alternates are present.");
    const invalid = links.filter(
      (x) =>
        !/^(?:[a-z]{2,3}|x-default)(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|-\d{3})?$/i.test(
          x.lang,
        ) ||
        !/^https?:\/\//i.test(x.href) ||
        s.pages.some(
          (q) =>
            normalize(q.finalUrl) === normalize(x.href) && q.status !== 200,
        ),
    );
    const unknown = links.filter(
      (x) =>
        /^https?:\/\//i.test(x.href) &&
        !s.pages.some((q) => normalize(q.finalUrl) === normalize(x.href)),
    );
    const ev = {
      alternates: links,
      invalid,
      unverifiedTargets: unknown.map((x) => x.href),
    };
    if (invalid.length > 1)
      return fail(
        "More than one hreflang value or sampled target is invalid.",
        { evidence: ev },
      );
    if (invalid.length === 1)
      return warn("One hreflang value or sampled target is invalid.", {
        evidence: ev,
      });
    if (unknown.length)
      return warn(
        "Hreflang syntax is valid, but some targets were not crawled and their status is unverified.",
        { evidence: ev },
      );
    return pass("All hreflang values and sampled targets are valid.", {
      evidence: ev,
    });
  },
});

export const hreflangSelf = definePageCheck({
  ...pageMeta(
    "intl.hreflang.self",
    "Each language variant self-references",
    "international",
    "medium",
    2,
    ["raw-html"],
    "Self-reference makes the alternate set complete.",
    intlDocs,
  ),
  run: ({ raw, page: p }) => {
    const c = canonical(p) ?? p.finalUrl;
    const links = raw()('link[rel~="alternate" i][hreflang]')
      .toArray()
      .map((x) => ({
        lang: raw()(x).attr("hreflang") ?? "",
        href: raw()(x).attr("href") ?? "",
      }));
    if (!links.length) return skip("No hreflang alternates are present.");
    const self = links.find((x) => normalize(x.href) === normalize(c));
    if (self)
      return pass("Hreflang set includes a self reference.", {
        evidence: { self },
      });
    return warn("Hreflang set has no self reference.", {
      evidence: { canonical: c, alternates: links },
    });
  },
});

export const canonicalLanguage = definePageCheck({
  ...pageMeta(
    "intl.canonical-language",
    "Canonical remains in same language",
    "international",
    "high",
    3,
    ["raw-html"],
    "Cross-language canonical can suppress the local variant.",
    "https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls",
  ),
  run: ({ raw, page: p }) => {
    const lang = raw()("html").attr("lang")?.split("-")[0]?.toLowerCase();
    const c = canonical(p);
    if (!lang)
      return skip(
        "Document language is not declared; language relationship cannot be inferred.",
      );
    if (!c) return warn("Localized page has no canonical.");
    const path = new URL(c).pathname.toLowerCase();
    const foreign = /\/(en|fr|de|es|it|pt|ja|zh|ru|ar)(?:\/|$)/.exec(path)?.[1];
    if (foreign && foreign !== lang)
      return fail(
        `Canonical appears to target the ${foreign} language variant.`,
        { evidence: { lang, canonical: c } },
      );
    return pass(
      "Canonical does not appear to target another language variant.",
      { evidence: { lang, canonical: c } },
    );
  },
});

export const hreflangReturnLinks = defineSiteCheck({
  ...siteMeta(
    "intl.hreflang.return-links",
    "hreflang references are reciprocal",
    "international",
    "high",
    3,
    ["raw-html", "crawl-graph"],
    "Reciprocal annotations validate alternate page relationships.",
    intlDocs,
  ),
  run: ({ site: s }) => {
    if (!s.pages.length)
      return skip("No crawled pages are available to compare hreflang links.");
    const urls = new Set(s.pages.map((p) => normalize(p.finalUrl)));
    const missing: { from: string; to: string }[] = [];
    for (const p of s.pages) {
      const $ = awaitlessCheerio(p.rawHtml);
      for (const el of $("link[rel~='alternate'][hreflang]").toArray()) {
        const to = $(el).attr("href");
        if (!to || !urls.has(normalize(to))) continue;
        const target = s.pages.find(
          (q) => normalize(q.finalUrl) === normalize(to),
        );
        if (!target) continue;
        const other = awaitlessCheerio(target.rawHtml);
        if (
          !other("link[rel~='alternate'][hreflang]")
            .toArray()
            .some((x) => {
              const v = other(x).attr("href");
              return v && normalize(v) === normalize(p.finalUrl);
            })
        )
          missing.push({ from: p.finalUrl, to });
      }
    }
    return missing.length === 0
      ? pass("All crawled hreflang targets link back.", {
          evidence: { checkedPages: s.pages.length },
        })
      : missing.length > 1
        ? fail(`${missing.length} hreflang return links are missing.`, {
            evidence: { missing },
          })
        : warn("One hreflang return link is missing.", {
            evidence: { missing },
          });
  },
});

const awaitlessCheerio = (html: string) => cheerio.load(html);

export const internationalChecks = [
  hreflangValid,
  hreflangReturnLinks,
  hreflangSelf,
  canonicalLanguage,
];
