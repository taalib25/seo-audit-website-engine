import { definePageCheck, defineSiteCheck, fail, pass, skip, warn } from "../../check.ts";
import { canonicalUrl, isInternalUrl } from "../../extract/links.ts";
import {
  findNodes,
  firstNode,
  getObject,
  getString,
  getStringArray,
  getAbsoluteUrl,
  type JsonObject,
} from "../../extract/jsonld.ts";
import {
  collectOrgFacts,
  contextPageData,
  digitsOf,
  normalizeAddress,
  normalizeBrandName,
  normalizeWhitespace,
  organizationSnippet,
  personSnippet,
  snapshotPageData,
  structuredDataEvidence,
  type PageData,
} from "../schema/shared.ts";

const ORG_FAMILY = "Organization";

function siteName(page: PageData): string | undefined {
  const org = firstNode(page.sd.nodes, ORG_FAMILY);
  const orgName = org === undefined ? undefined : getString(org, "name");
  if (orgName !== undefined) return orgName;
  return (
    page.dom$('meta[property="og:site_name"]').attr("content")?.trim() ||
    page.dom$('meta[name="application-name"]').attr("content")?.trim() ||
    undefined
  );
}

export const entityNameConsistency = defineSiteCheck({
  id: "geo.entity.name-consistency",
  title: "Entity name is consistent site-wide",
  pillar: "geo",
  category: "entity",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html"],
  rationale: "One stable entity name helps machines link mentions to the same real-world organization.",
  docs: "https://developers.google.com/search/docs/appearance/structured-data/organization",
  run: ({ site }) => {
    const pages = site.pages.map(snapshotPageData);
    const variants = new Map<string, { name: string; pages: string[] }>();
    const perPage: { page: string; name: string | null }[] = [];

    for (const data of pages) {
      const name = siteName(data);
      perPage.push({ page: data.page.url, name: name ?? null });
      if (name === undefined) continue;
      const key = normalizeBrandName(name);
      if (key === "") continue;
      const existing = variants.get(key);
      if (existing) existing.pages.push(data.page.url);
      else variants.set(key, { name, pages: [data.page.url] });
    }

    const evidence = { names: [...variants.values()], pages: perPage };
    const home =
      pages.find((data) => canonicalUrl(data.page.url) === canonicalUrl(site.startUrl)) ?? pages[0];
    const snippet = home === undefined ? undefined : organizationSnippet(collectOrgFacts(home));
    const fix = {
      summary: "Use one canonical organization name in Organization markup, og:site_name and the homepage title.",
      ...(snippet !== undefined ? { snippet, snippetLang: "html" as const } : {}),
    };

    if (variants.size === 0) {
      return warn("No organization name found in structured data or site metadata.", { evidence, fix });
    }
    if (variants.size > 1) {
      return fail(
        `Entity name conflicts across pages: ${[...variants.values()].map((entry) => entry.name).join(" / ")}.`,
        { evidence, fix },
      );
    }

    const only = [...variants.values()][0];
    if (only !== undefined && home !== undefined) {
      const title = home.dom$("title").first().text().replace(/\s+/g, " ").trim();
      const normalized = normalizeBrandName(only.name);
      const titleText = normalizeWhitespace(title);
      if (title !== "" && normalized !== "" && !titleText.includes(normalized)) {
        return warn(
          `Homepage title does not contain the organization name "${only.name}".`,
          { evidence, fix },
        );
      }
    }
    return pass(`One organization name is used consistently: ${only?.name ?? ""}.`, { evidence });
  },
});

function addressLine(node: JsonObject | undefined): string {
  if (node === undefined) return "";
  const address = getObject(node, "address");
  if (address === undefined) return getString(node, "address") ?? "";
  return [
    getString(address, "streetAddress"),
    getString(address, "addressLocality"),
    getString(address, "addressRegion"),
    getString(address, "postalCode"),
    getString(address, "addressCountry"),
  ]
    .filter((value): value is string => value !== undefined && value !== "")
    .join(", ");
}

function emailOf(value: string): string {
  return value.replace(/^mailto:/i, "").trim().toLowerCase();
}

export const entityContactConsistency = defineSiteCheck({
  id: "geo.entity.contact-consistency",
  title: "Contact details agree across the site",
  pillar: "geo",
  category: "entity",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["raw-html"],
  rationale: "Conflicting phone, email or address data undermines entity trust and local relevance.",
  docs: "https://developers.google.com/search/docs/appearance/structured-data/organization",
  run: ({ site }) => {
    const pages = site.pages.map(snapshotPageData);
    const phones = new Map<string, string>();
    const emails = new Map<string, string>();
    const addresses = new Map<string, string>();
    const samples: {
      page: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      visible: boolean;
    }[] = [];
    let markupCount = 0;

    for (const data of pages) {
      const text = normalizeWhitespace(data.text);
      const pageDigits = digitsOf(data.text);
      const telDigits = data.dom$("a[href^='tel:']")
        .map((_, el) => data.dom$(el).attr("href") ?? "")
        .get()
        .map((href) => digitsOf(href))
        .join(" ");
      for (const node of findNodes(data.sd.nodes, ORG_FAMILY)) {
        markupCount += 1;
        const phone = getString(node, "telephone");
        const email = getString(node, "email");
        const address = addressLine(node);
        const phoneDigits = phone === undefined ? "" : digitsOf(phone);
        const phoneKey = phoneDigits.slice(-10);
        if (phone !== undefined && phoneKey !== "") phones.set(phoneKey, phone);
        if (email !== undefined && email !== "") emails.set(emailOf(email), email);
        if (address !== "") addresses.set(normalizeAddress(address), address);

        const phoneVisible =
          phone !== undefined &&
          phoneKey !== "" &&
          (pageDigits.includes(phoneKey) || telDigits.includes(phoneKey));
        const emailVisible = email !== undefined && text.includes(emailOf(email));
        const addressVisible = address === "" || normalizeAddress(data.text).includes(normalizeAddress(address));
        const visible = phoneVisible && emailVisible && addressVisible;
        samples.push({
          page: data.page.url,
          phone: phone ?? null,
          email: email ?? null,
          address: address === "" ? null : address,
          visible,
        });
      }
    }

    const home =
      pages.find((data) => canonicalUrl(data.page.url) === canonicalUrl(site.startUrl)) ?? pages[0];
    const snippet = home === undefined ? undefined : organizationSnippet(collectOrgFacts(home));
    const fix = {
      summary: "Publish one phone, email and postal address everywhere, and keep Organization markup in sync.",
      ...(snippet !== undefined ? { snippet, snippetLang: "html" as const } : {}),
    };
    const evidence = {
      phones: [...phones.values()],
      emails: [...emails.values()],
      addresses: [...addresses.values()],
      pagesWithMarkup: markupCount,
      samples,
    };

    if (markupCount === 0) {
      return warn("No Organization or LocalBusiness contact details found in structured data.", { evidence, fix });
    }
    if (phones.size > 1 || emails.size > 1) {
      return fail(
        `Contact details conflict across pages: ${phones.size} phone(s), ${emails.size} email(s).`,
        { evidence, fix },
      );
    }
    if (addresses.size > 1) {
      return fail(`Postal address conflicts across pages: ${[...addresses.values()].join(" / ")}.`, {
        evidence,
        fix,
      });
    }
    if (samples.some((sample) => !sample.visible)) {
      return warn("Some structured contact details do not appear in the visible page text.", { evidence, fix });
    }
    return pass("Phone, email and address are consistent and visible across the site.", { evidence });
  },
});

const ABOUT_RE = /\b(about|about-us|company|our-story|who-we-are|team|mission)\b/i;
const CONTACT_RE = /\b(contact|contact-us|support|help|get-in-touch|reach-us)\b/i;

function depthTo(
  homeUrl: string,
  target: string,
  links: readonly { from: string; to: string }[],
): number | undefined {
  const targetKey = canonicalUrl(target);
  if (canonicalUrl(homeUrl) === targetKey) return 0;
  const graph = new Map<string, Set<string>>();
  for (const edge of links) {
    const from = canonicalUrl(edge.from);
    const to = canonicalUrl(edge.to);
    const bucket = graph.get(from);
    if (bucket) bucket.add(to);
    else graph.set(from, new Set([to]));
  }
  const queue: { url: string; depth: number }[] = [{ url: canonicalUrl(homeUrl), depth: 0 }];
  const seen = new Set<string>([canonicalUrl(homeUrl)]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    if (current.depth >= 5) continue;
    for (const next of graph.get(current.url) ?? []) {
      if (next === targetKey) return current.depth + 1;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push({ url: next, depth: current.depth + 1 });
    }
  }
  return undefined;
}

export const entityAboutContact = defineSiteCheck({
  id: "geo.entity.about-contact",
  title: "About and contact pages are reachable from home",
  pillar: "geo",
  category: "entity",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html"],
  rationale: "Entity verification depends on finding who the organization is and how to reach it.",
  run: ({ site }) => {
    const home =
      site.pages.find((page) => canonicalUrl(page.url) === canonicalUrl(site.startUrl)) ??
      site.pages[0];
    if (home === undefined) return skip("No crawled homepage to measure navigation from.");

    const about = site.pages.find((page) => ABOUT_RE.test(new URL(page.url).pathname));
    const contact = site.pages.find((page) => CONTACT_RE.test(new URL(page.url).pathname));
    const aboutDepth = about === undefined ? undefined : depthTo(home.url, about.url, site.links);
    const contactDepth = contact === undefined ? undefined : depthTo(home.url, contact.url, site.links);
    const evidence = {
      home: home.url,
      about: about === undefined ? null : { url: about.url, clicks: aboutDepth ?? null },
      contact: contact === undefined ? null : { url: contact.url, clicks: contactDepth ?? null },
    };
    const fix = {
      summary: "Link About and Contact from the homepage (or main navigation) so both are within two clicks.",
    };

    const problems: string[] = [];
    const warnings: string[] = [];
    for (const [label, page, depth] of [
      ["About", about, aboutDepth],
      ["Contact", contact, contactDepth],
    ] as const) {
      if (page === undefined) problems.push(`No ${label.toLowerCase()} page found.`);
      else if (depth === undefined) problems.push(`${label} page is not reachable by following internal links.`);
      else if (depth > 4) problems.push(`${label} page is ${depth} clicks from home.`);
      else if (depth > 2) warnings.push(`${label} page is ${depth} clicks from home.`);
    }

    if (problems.length > 0) return fail(problems[0] ?? "Missing about/contact reachability.", { evidence, fix });
    if (warnings.length > 0) return warn(warnings[0] ?? "About/contact pages are buried.", { evidence, fix });
    return pass("About and contact pages are reachable within two clicks of home.", { evidence });
  },
});

function authorShape(node: JsonObject | undefined): {
  name?: string;
  url?: string;
} {
  if (node === undefined) return {};
  const authorNode = getObject(node, "author");
  const name = getString(node, "author") ?? (authorNode === undefined ? undefined : getString(authorNode, "name"));
  const url = authorNode === undefined ? undefined : getString(authorNode, "url");
  const out: { name?: string; url?: string } = {};
  if (name !== undefined) out.name = name;
  if (url !== undefined) out.url = url;
  return out;
}

export const entityAuthorIdentification = definePageCheck({
  id: "geo.entity.author-identification",
  title: "Article authors are identified with a profile",
  pillar: "geo",
  category: "entity",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html"],
  rationale: "A named author with a profile is a core E-E-A-T signal for content trust.",
  docs: "https://developers.google.com/search/docs/appearance/structured-data/article",
  run: (ctx) => {
    const data = contextPageData(ctx);
    const articles = findNodes(data.sd.nodes, "Article");
    const visibleAuthor =
      data.dom$("[rel='author']").first().text().replace(/\s+/g, " ").trim() ||
      data.dom$("[class*='author']").first().text().replace(/\s+/g, " ").trim() ||
      data.dom$("[name='author']").attr("content")?.trim();

    if (articles.length === 0) {
      if (visibleAuthor === undefined || visibleAuthor === "") {
        return skip("No Article markup or byline on this page.");
      }
      const snippet = personSnippet({ name: visibleAuthor });
      return warn("A visible byline exists but has no Person/author structured data.", {
        evidence: { visibleAuthor },
        fix: {
          summary: "Mark up the byline as an Article author with a stable profile URL.",
          snippet,
          snippetLang: "html",
        },
      });
    }

    const article = articles[0];
    const author = authorShape(article);
    const evidence = {
      articles: articles.length,
      author: author.name ?? null,
      authorUrl: author.url ?? null,
      visibleAuthor: visibleAuthor ?? null,
      ...structuredDataEvidence(data.sd),
    };
    const snippet = personSnippet({
      ...(author.name !== undefined ? { name: author.name } : {}),
      ...(author.url !== undefined ? { url: author.url } : {}),
    });
    const fix = {
      summary: "Give the Article a Person author with name and a stable profile URL.",
      snippet,
      snippetLang: "html",
    };

    if (author.name === undefined) {
      return fail("Article markup has no identifiable author.", { evidence, fix });
    }
    if (visibleAuthor !== undefined && visibleAuthor !== "" && !normalizeWhitespace(visibleAuthor).includes(normalizeWhitespace(author.name))) {
      return fail(`Structured author "${author.name}" does not match the visible byline "${visibleAuthor}".`, {
        evidence,
        fix,
      });
    }
    if (author.url === undefined) {
      return warn(`Author "${author.name}" has no profile URL.`, { evidence, fix });
    }
    if (getAbsoluteUrl(author.url, data.page.finalUrl) === undefined) {
      return warn(`Author URL "${author.url}" is not a valid URL.`, { evidence, fix });
    }
    return pass(`Article author is identified with a profile: ${author.name}.`, { evidence });
  },
});

export const entitySameAs = defineSiteCheck({
  id: "geo.entity.sameas",
  title: "Entity sameAs links to independent profiles",
  pillar: "geo",
  category: "entity",
  kind: "deterministic",
  severity: "low",
  weight: 2,
  requires: ["raw-html"],
  rationale: "sameAs links corroborate an entity across independent sources, which aids knowledge-graph linking.",
  docs: "https://schema.org/sameAs",
  run: ({ site }) => {
    const pages = site.pages.map(snapshotPageData);
    const profiles = new Map<string, { value: string; pages: string[] }>();
    let entities = 0;
    const selfReferential: string[] = [];
    const relative: string[] = [];

    for (const data of pages) {
      for (const node of findNodes(data.sd.nodes, ORG_FAMILY)) {
        entities += 1;
        for (const value of getStringArray(node, "sameAs")) {
          if (!/^https?:\/\//i.test(value)) relative.push(value);
          const absolute = getAbsoluteUrl(value, data.page.finalUrl);
          if (absolute === undefined) continue;
          if (isInternalUrl(absolute, site.origin)) {
            selfReferential.push(absolute);
            continue;
          }
          const key = canonicalUrl(absolute);
          const existing = profiles.get(key);
          if (existing) existing.pages.push(data.page.url);
          else profiles.set(key, { value: absolute, pages: [data.page.url] });
        }
      }
      for (const node of findNodes(data.sd.nodes, "Person")) {
        entities += 1;
        for (const value of getStringArray(node, "sameAs")) {
          if (!/^https?:\/\//i.test(value)) relative.push(value);
          const absolute = getAbsoluteUrl(value, data.page.finalUrl);
          if (absolute === undefined) continue;
          if (isInternalUrl(absolute, site.origin)) {
            selfReferential.push(absolute);
            continue;
          }
          const key = canonicalUrl(absolute);
          const existing = profiles.get(key);
          if (existing) existing.pages.push(data.page.url);
          else profiles.set(key, { value: absolute, pages: [data.page.url] });
        }
      }
    }

    const evidence = {
      entities,
      profiles: [...profiles.values()],
      selfReferential: [...new Set(selfReferential)],
      relative: [...new Set(relative)],
    };
    const fix = {
      summary: "Add sameAs links to independent profiles (Wikipedia, LinkedIn, Crunchbase, official social accounts).",
    };

    if (selfReferential.length > 0) {
      return fail("sameAs points back at the site itself instead of independent profiles.", { evidence, fix });
    }
    if (entities === 0) {
      return warn("No Organization or Person entity found to carry sameAs links.", { evidence, fix });
    }
    if (profiles.size === 0) {
      return warn("No sameAs links found; entity corroboration is limited to this site.", { evidence, fix });
    }
    if (relative.length > 0) {
      return warn(`sameAs uses relative URL(s): ${relative.slice(0, 3).join(", ")}.`, { evidence, fix });
    }
    if (profiles.size === 1) {
      return warn("Only one sameAs profile; add more independent profiles where they exist.", { evidence, fix });
    }
    return pass(`Entity is corroborated by ${profiles.size} independent sameAs profiles.`, { evidence });
  },
});

export const entityChecks = [
  entityNameConsistency,
  entityContactConsistency,
  entityAboutContact,
  entityAuthorIdentification,
  entitySameAs,
];
