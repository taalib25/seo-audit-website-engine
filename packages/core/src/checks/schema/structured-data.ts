import { definePageCheck, defineSiteCheck, fail, pass, skip, warn } from "../../check.ts";
import { canonicalUrl } from "../../extract/links.ts";
import {
  findNodes,
  firstNode,
  getAbsoluteUrl,
  getNumber,
  getObject,
  getObjects,
  getString,
  getStringArray,
  nodeTypes,
  type JsonObject,
} from "../../extract/jsonld.ts";
import type { PageSnapshot } from "../../snapshot.ts";
import {
  breadcrumbSnippet,
  collectOrgFacts,
  contextPageData,
  digitsOf,
  localBusinessSnippet,
  normalizeBrandName,
  normalizeWhitespace,
  organizationSnippet,
  productSnippet,
  articleSnippet,
  snapshotPageData,
  structuredDataEvidence,
  type PageData,
} from "./shared.ts";
import {
  GOOGLE_LIMITED_TYPES,
  GOOGLE_SUPPORTED_TYPES,
  auditVocabulary,
} from "./vocabulary.ts";

const DOCS_INTRO = "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data";

export const schemaSyntax = definePageCheck({
  id: "seo.schema.syntax",
  title: "Structured data parses",
  pillar: "seo",
  category: "structured-data",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["raw-html"],
  rationale: "Invalid syntax cannot be interpreted reliably by search engines or AI crawlers.",
  docs: DOCS_INTRO,
  run: (ctx) => {
    const data = contextPageData(ctx);
    const sd = data.sd;
    const evidence = {
      ...structuredDataEvidence(sd),
      errors: sd.rawDoc.errors.slice(0, 10),
      renderedErrors: data.page.renderedHtml === undefined ? [] : sd.domDoc.errors.slice(0, 10),
    };
    const fix = {
      summary: "Fix or remove the malformed JSON-LD block; validate it before deploying.",
    };

    if (sd.rawDoc.blocks.length === 0) {
      if (sd.markup.types.length > 0) {
        return pass("No JSON-LD on the page; Microdata/RDFa annotations are present.", { evidence });
      }
      if (sd.domDoc.blocks.length > 0) {
        return warn(
          "JSON-LD appears only after JavaScript runs, so crawlers that do not execute JS see no structured data.",
          { evidence },
        );
      }
      return skip("No structured data found; the syntax check is not applicable.");
    }
    if (sd.rawDoc.invalidCount === 0) {
      return pass(`${sd.rawDoc.blocks.length} JSON-LD block(s) parse.`, { evidence });
    }
    if (sd.rawDoc.validCount > 0) {
      return warn(
        `${sd.rawDoc.invalidCount} of ${sd.rawDoc.blocks.length} JSON-LD block(s) are invalid; readable entities remain.`,
        { evidence, fix },
      );
    }
    if (sd.markup.microdataTypes.length > 0 || sd.markup.rdfaTypes.length > 0) {
      return warn("All JSON-LD blocks are invalid, but Microdata/RDFa is present and readable.", {
        evidence,
        fix,
      });
    }
    return fail("All JSON-LD blocks are invalid, so no structured entities can be read.", { evidence, fix });
  },
});

export const schemaTypeValid = definePageCheck({
  id: "seo.schema.type-valid",
  title: "Schema.org types and properties resolve",
  pillar: "seo",
  category: "structured-data",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html"],
  rationale: "Vocabulary terms make entity semantics interoperable with search and AI systems.",
  docs: "https://schema.org/docs/full.html",
  run: (ctx) => {
    const data = contextPageData(ctx);
    const sd = data.sd;
    const audit = auditVocabulary(
      sd.nodes,
      sd.markup.types,
      [...sd.markup.microdataProperties, ...sd.markup.rdfaProperties],
    );
    const evidence = {
      ...structuredDataEvidence(sd),
      checkedTypes: audit.checkedTypes,
      checkedProperties: audit.checkedProperties,
      malformedTypes: audit.malformedTypes,
      typoTypes: audit.typoTypes,
      unknownTypes: audit.unknownTypes,
      malformedProperties: audit.malformedProperties,
      typoProperties: audit.typoProperties,
      unknownProperties: audit.unknownProperties,
      deprecatedTerms: audit.deprecatedTerms,
    };
    const fix = {
      summary: "Use current schema.org type and property names; check the vocabulary before shipping.",
    };

    if (audit.checkedTypes === 0 && audit.checkedProperties === 0) {
      return skip("No schema.org terms found to validate.");
    }
    const broken = [
      ...audit.malformedTypes,
      ...audit.typoTypes,
      ...audit.malformedProperties,
      ...audit.typoProperties,
    ];
    if (broken.length > 0) {
      return fail(`Unrecognized schema.org term(s): ${broken.slice(0, 6).join(", ")}.`, { evidence, fix });
    }
    const soft = [...audit.unknownTypes, ...audit.unknownProperties, ...audit.deprecatedTerms];
    if (soft.length > 0) {
      return warn(
        `Term(s) outside the built-in vocabulary or deprecated: ${soft.slice(0, 6).join(", ")}. Verify on schema.org.`,
        { evidence, fix },
      );
    }
    return pass("All detected schema.org terms match the built-in vocabulary.", { evidence });
  },
});

interface OrgEntry {
  page: PageSnapshot;
  node: JsonObject;
  name?: string;
  url?: string;
  logo?: string;
  sameAs: string[];
}

function organizationEntries(pages: readonly PageData[]): OrgEntry[] {
  const entries: OrgEntry[] = [];
  for (const data of pages) {
    for (const node of findNodes(data.sd.nodes, "Organization")) {
      const entry: OrgEntry = { page: data.page, node, sameAs: getStringArray(node, "sameAs") };
      const name = getString(node, "name");
      if (name !== undefined) entry.name = name;
      const url = getString(node, "url");
      if (url !== undefined) entry.url = url;
      const logo = getString(node, "logo") ?? getStringArray(node, "logo")[0];
      if (logo !== undefined) entry.logo = logo;
      entries.push(entry);
    }
  }
  return entries;
}

export const schemaOrganization = defineSiteCheck({
  id: "seo.schema.organization",
  title: "Organization entity has core identifiers",
  pillar: "seo",
  category: "structured-data",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html"],
  rationale: "One accurate Organization entity helps search and AI systems disambiguate the publisher.",
  docs: "https://developers.google.com/search/docs/appearance/structured-data/organization",
  run: ({ site }) => {
    const pages = site.pages.map(snapshotPageData);
    const entries = organizationEntries(pages);
    const home = pages.find((data) => canonicalUrl(data.page.url) === canonicalUrl(site.startUrl)) ?? pages[0];
    const snippet = home === undefined ? undefined : organizationSnippet(collectOrgFacts(home));
    const fix = snippet === undefined
      ? { summary: "Add one Organization entity with name, url, logo and sameAs to the site-wide template." }
      : {
          summary: "Add one Organization entity to the global template, filled with the real business facts.",
          snippet,
          snippetLang: "html",
        };
    const baseEvidence: Record<string, unknown> = {
      organizations: entries.map((entry) => ({
        page: entry.page.url,
        name: entry.name ?? null,
        url: entry.url ?? null,
        logo: entry.logo ?? null,
        sameAs: entry.sameAs,
      })),
      jsonLdOnlyInDom: pages.some((data) => data.sd.jsonLdOnlyInDom),
    };

    if (entries.length === 0) {
      return fail("No Organization (or LocalBusiness) entity found in the served HTML.", {
        evidence: baseEvidence,
        fix,
      });
    }

    const unnamed = entries.filter((entry) => entry.name === undefined);
    const invalidUrls = entries.filter((entry) => entry.url !== undefined && getAbsoluteUrl(entry.url, entry.page.finalUrl) === undefined);
    const names = new Map<string, string[]>();
    for (const entry of entries) {
      if (entry.name === undefined) continue;
      const key = normalizeBrandName(entry.name);
      const bucket = names.get(key);
      if (bucket) bucket.push(entry.name);
      else names.set(key, [entry.name]);
    }
    const urls = new Map<string, string[]>();
    for (const entry of entries) {
      if (entry.url === undefined) continue;
      const absolute = getAbsoluteUrl(entry.url, entry.page.finalUrl);
      if (absolute === undefined) continue;
      const key = canonicalUrl(absolute);
      const bucket = urls.get(key);
      if (bucket) bucket.push(absolute);
      else urls.set(key, [absolute]);
    }
    const evidence = {
      ...baseEvidence,
      names: [...names.keys()],
      urls: [...urls.keys()],
      missingName: unnamed.map((entry) => entry.page.url),
      invalidUrls: invalidUrls.map((entry) => entry.url ?? ""),
    };

    if (unnamed.length > 0) {
      return fail("Organization markup is missing the required name.", { evidence, fix });
    }
    if (invalidUrls.length > 0) {
      return fail("Organization url is not a valid absolute URL.", { evidence, fix });
    }
    if (names.size > 1) {
      return fail(`Organization name conflicts across pages: ${[...names.values()].flat().join(" / ")}.`, {
        evidence,
        fix,
      });
    }
    if (urls.size > 1) {
      const origins = new Set([...urls.keys()].map((value) => new URL(value).origin));
      if (origins.size > 1) {
        return fail(`Organization url points at different origins: ${[...origins].join(", ")}.`, {
          evidence,
          fix,
        });
      }
      return warn(`Organization url differs across pages: ${[...urls.keys()].join(", ")}.`, {
        evidence,
        fix,
      });
    }

    const missingUrl = entries.filter((entry) => entry.url === undefined);
    const missingLogo = entries.filter((entry) => entry.logo === undefined);
    const missingSameAs = entries.filter((entry) => entry.sameAs.length === 0);
    if (missingUrl.length > 0) {
      return warn("Organization markup has no url; add the canonical homepage.", { evidence, fix });
    }
    if (missingLogo.length > 0 || missingSameAs.length > 0) {
      const missing: string[] = [];
      if (missingLogo.length > 0) missing.push("logo");
      if (missingSameAs.length > 0) missing.push("sameAs");
      return warn(`Organization is missing recommended field(s): ${missing.join(", ")}.`, { evidence, fix });
    }
    return pass("Organization has a consistent name, url, logo and sameAs.", { evidence });
  },
});

interface AddressParts {
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
}

function addressParts(node: JsonObject): AddressParts {
  const address = getObject(node, "address");
  if (address === undefined) {
    const text = getString(node, "address");
    return text === undefined ? {} : { streetAddress: text };
  }
  const parts: AddressParts = {};
  const street = getString(address, "streetAddress");
  if (street !== undefined) parts.streetAddress = street;
  const locality = getString(address, "addressLocality");
  if (locality !== undefined) parts.addressLocality = locality;
  const region = getString(address, "addressRegion");
  if (region !== undefined) parts.addressRegion = region;
  const postal = getString(address, "postalCode");
  if (postal !== undefined) parts.postalCode = postal;
  const country = getString(address, "addressCountry");
  if (country !== undefined) parts.addressCountry = country;
  return parts;
}

function addressLine(parts: AddressParts): string {
  return [parts.streetAddress, parts.addressLocality, parts.addressRegion, parts.postalCode, parts.addressCountry]
    .filter((value): value is string => value !== undefined && value !== "")
    .join(", ");
}

export const schemaLocalBusiness = defineSiteCheck({
  id: "seo.schema.local-business",
  title: "LocalBusiness fields agree with visible business facts",
  pillar: "seo",
  category: "structured-data",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["raw-html"],
  rationale: "Structured local facts must be accurate and grounded in the visible page.",
  docs: "https://developers.google.com/search/docs/appearance/structured-data/local-business",
  run: ({ site }) => {
    const pages = site.pages.map(snapshotPageData);
    const samples: {
      page: string;
      name: string | undefined;
      phone: string | undefined;
      address: string;
      missing: string[];
      nameVisible: boolean;
      phoneVisible: boolean;
      addressVisible: boolean;
    }[] = [];

    for (const data of pages) {
      for (const node of findNodes(data.sd.nodes, "LocalBusiness")) {
        const name = getString(node, "name");
        const phone = getString(node, "telephone");
        const parts = addressParts(node);
        const address = addressLine(parts);
        const hasAreaServed = getString(node, "areaServed") !== undefined;
        const missing: string[] = [];
        if (name === undefined) missing.push("name");
        if (address === "" && !hasAreaServed) missing.push("address");
        if (phone === undefined) missing.push("telephone");

        const visible = normalizeWhitespace(data.text);
        const visibleDigits = digitsOf(`${data.text} ${data.dom$("a[href^='tel:']").map((_, el) => data.dom$(el).attr("href") ?? "").get().join(" ")}`);
        const nameVisible = name !== undefined && visible.includes(normalizeWhitespace(name));
        const phoneDigits = phone === undefined ? "" : digitsOf(phone);
        const phoneVisible = phoneDigits.length >= 7 && visibleDigits.includes(phoneDigits.slice(-10));
        const addressVisible =
          address !== "" &&
          [parts.streetAddress, parts.addressLocality, parts.postalCode]
            .filter((value): value is string => value !== undefined)
            .every((value) => visible.includes(normalizeWhitespace(value)));

        samples.push({ page: data.page.url, name, phone, address, missing, nameVisible, phoneVisible, addressVisible });
      }
    }

    if (samples.length === 0) return skip("No LocalBusiness markup on the crawled pages.");
    const first = samples[0];
    const fix = first === undefined
      ? { summary: "Keep LocalBusiness markup synchronized with the visible name, address and phone." }
      : {
          summary: "Keep LocalBusiness markup synchronized with the visible name, address and phone.",
          snippet: localBusinessSnippet({
            ...(first.name !== undefined ? { name: first.name } : {}),
            url: site.origin,
            ...(first.phone !== undefined ? { telephone: first.phone } : {}),
          }),
          snippetLang: "html",
        };
    const evidence = { businesses: samples };

    const conflicts = samples.filter(
      (sample) =>
        (sample.name !== undefined && !sample.nameVisible) ||
        (sample.phone !== undefined && !sample.phoneVisible) ||
        (sample.address !== "" && !sample.addressVisible),
    );
    if (conflicts.length > 0) {
      return fail("LocalBusiness markup contains facts that do not appear in the visible page text.", {
        evidence,
        fix,
      });
    }
    const incomplete = samples.filter((sample) => sample.missing.length > 0);
    if (incomplete.length > 0) {
      return warn("LocalBusiness markup is missing applicable fields.", { evidence, fix });
    }
    return pass("LocalBusiness name, address and telephone match the visible page.", { evidence });
  },
});

export const schemaProductOffer = definePageCheck({
  id: "seo.schema.product-offer",
  title: "Product and Offer facts are internally complete",
  pillar: "seo",
  category: "structured-data",
  kind: "deterministic",
  severity: "high",
  weight: 4,
  requires: ["raw-html"],
  rationale: "Complete, current product facts support product appearances and avoid conflicting data.",
  docs: "https://developers.google.com/search/docs/appearance/structured-data/product-snippet",
  run: (ctx) => {
    const data = contextPageData(ctx);
    const products = findNodes(data.sd.nodes, "Product");
    if (products.length === 0) return skip("No Product markup on this page.");
    const visible = normalizeWhitespace(data.text);
    const issues: string[] = [];
    const warnings: string[] = [];
    const offers: Record<string, unknown>[] = [];
    let name: string | undefined;
    let price: string | undefined;
    let currency: string | undefined;
    let availability: string | undefined;
    let image: string | undefined;
    let description: string | undefined;
    let sku: string | undefined;

    for (const product of products) {
      const productName = getString(product, "name");
      if (productName === undefined) {
        issues.push("Product is missing the required name.");
      } else {
        name ??= productName;
        if (!visible.includes(normalizeWhitespace(productName))) {
          issues.push(`Product name "${productName}" does not appear in the visible page.`);
        }
      }
      image ??= getStringArray(product, "image")[0];
      description ??= getString(product, "description");
      sku ??= getString(product, "sku");
      const productOffers = getObjects(product, "offers");
      if (productOffers.length === 0) {
        const hasRating = getObject(product, "aggregateRating") !== undefined || getObject(product, "review") !== undefined;
        if (hasRating) warnings.push("Product has review data but no Offer.");
        else warnings.push("Product has no Offer, review or aggregateRating.");
      }
      for (const offer of productOffers) {
        const priceValue = getNumber(offer, "price") ?? getNumber(offer, "lowPrice");
        const currencyValue = getString(offer, "priceCurrency");
        const availabilityValue = getString(offer, "availability");
        const entry: Record<string, unknown> = {
          price: priceValue ?? null,
          priceCurrency: currencyValue ?? null,
          availability: availabilityValue ?? null,
        };
        offers.push(entry);
        if (priceValue === undefined) {
          issues.push("Offer is missing a parseable price.");
        } else {
          price ??= String(priceValue);
          if (!visible.includes(String(priceValue)) && !visible.includes(priceValue.toFixed(2))) {
            warnings.push(`Price ${priceValue} is not visible on the page.`);
          }
        }
        if (currencyValue === undefined) warnings.push("Offer is missing priceCurrency.");
        else currency ??= currencyValue;
        if (availabilityValue !== undefined) {
          availability ??= availabilityValue;
          if (getAbsoluteUrl(availabilityValue, data.page.finalUrl) === undefined) {
            warnings.push(`Offer availability "${availabilityValue}" is not a schema.org URL.`);
          }
        }
      }
    }

    if (name === undefined) warnings.push("Product has no image, description or sku details.");
    else if (image === undefined || description === undefined || sku === undefined) {
      warnings.push("Product is missing one or more helpful fields (image, description, sku).");
    }

    const snippet = productSnippet({
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(image !== undefined ? { image } : {}),
      ...(price !== undefined ? { price } : {}),
      ...(currency !== undefined ? { priceCurrency: currency } : {}),
      ...(availability !== undefined ? { availability } : {}),
      ...(sku !== undefined ? { sku } : {}),
      pageUrl: data.page.finalUrl,
    });
    const fix = {
      summary: "Emit the current visible price, ISO currency and availability in the Offer.",
      snippet,
      snippetLang: "html",
    };
    const evidence = { products: products.length, offers, issues, warnings };
    if (issues.length > 0) return fail(issues[0] ?? "Product markup is incomplete.", { evidence, fix });
    if (warnings.length > 0) return warn(warnings[0] ?? "Product markup has recommendations outstanding.", { evidence, fix });
    return pass("Product and Offer facts are present, parseable and visible.", { evidence });
  },
});

interface Crumb {
  name: string;
  url?: string;
}

function visibleCrumbs(data: PageData): Crumb[] {
  const selectors = [
    "nav[aria-label*='readcrumb'] a",
    "nav[aria-label*='Breadcrumb'] a",
    "[class*='breadcrumb'] a",
    "[class*='Breadcrumb'] a",
    "[itemtype*='BreadcrumbList'] [itemprop='name']",
  ];
  for (const selector of selectors) {
    const crumbs: Crumb[] = [];
    data.dom$(selector).each((_, el) => {
      const name = data.dom$(el).text().replace(/\s+/g, " ").trim();
      if (name === "") return;
      const href = data.dom$(el).attr("href");
      const url = href === undefined ? undefined : getAbsoluteUrl(href, data.page.finalUrl);
      if (url === undefined) crumbs.push({ name });
      else crumbs.push({ name, url });
    });
    if (crumbs.length > 0) return crumbs;
  }
  return [];
}

export const schemaBreadcrumb = definePageCheck({
  id: "seo.schema.breadcrumb",
  title: "BreadcrumbList matches actual navigation",
  pillar: "seo",
  category: "structured-data",
  kind: "deterministic",
  severity: "low",
  weight: 2,
  requires: ["raw-html"],
  rationale: "Breadcrumb markup should describe the same hierarchy users see.",
  docs: "https://developers.google.com/search/docs/appearance/structured-data/breadcrumb",
  run: (ctx) => {
    const data = contextPageData(ctx);
    const visible = visibleCrumbs(data);
    const lists = findNodes(data.sd.nodes, "BreadcrumbList");
    const fallback = breadcrumbSnippet(
      visible.length > 0
        ? visible.map((crumb): { name: string; url?: string } =>
            crumb.url === undefined ? { name: crumb.name } : { name: crumb.name, url: crumb.url },
          )
        : [{ name: "REPLACE_WITH_PAGE_TITLE" }],
    );
    const fix = {
      summary: "Align BreadcrumbList positions, names and URLs with the visible breadcrumb trail.",
      snippet: fallback,
      snippetLang: "html",
    };

    if (lists.length === 0) {
      return warn("No BreadcrumbList markup; breadcrumb rich results are unavailable.", {
        evidence: { visibleCrumbs: visible, ...structuredDataEvidence(data.sd) },
        fix,
      });
    }

    const items = lists.flatMap((list) => getObjects(list, "itemListElement"));
    const evidence = {
      ...structuredDataEvidence(data.sd),
      itemCount: items.length,
      visibleCrumbs: visible,
      items: items.map((item) => ({
        position: getNumber(item, "position") ?? null,
        name: getString(item, "name") ?? null,
        item: getString(item, "item") ?? null,
      })),
    };
    if (items.length === 0) {
      return fail("BreadcrumbList has no itemListElement entries.", { evidence, fix });
    }

    const problems: string[] = [];
    const warnings: string[] = [];
    const names: string[] = [];
    items.forEach((item, index) => {
      const position = getNumber(item, "position");
      const name = getString(item, "name");
      const url = getString(item, "item");
      if (position === undefined) problems.push(`Item ${index + 1} has no position.`);
      else if (position !== index + 1) problems.push(`Position ${position} is out of sequence at index ${index + 1}.`);
      if (name === undefined) problems.push(`Item ${index + 1} has no name.`);
      else names.push(name);
      if (url === undefined) {
        if (index < items.length - 1) problems.push(`Item ${index + 1} has no URL.`);
      } else if (getAbsoluteUrl(url, data.page.finalUrl) === undefined) {
        warnings.push(`Item ${index + 1} URL is not absolute: ${url}.`);
      }
    });

    if (visible.length > 0) {
      const visibleNames = visible.map((crumb) => normalizeWhitespace(crumb.name));
      const markedNames = names.map((name) => normalizeWhitespace(name));
      const exact = visibleNames.length === markedNames.length && visibleNames.every((name, index) => name === markedNames[index]);
      if (!exact) {
        const reversed =
          visibleNames.length === markedNames.length &&
          visibleNames.every((name, index) => name === markedNames[markedNames.length - 1 - index]);
        if (reversed) problems.push("Breadcrumb order is reversed relative to the visible trail.");
        else warnings.push("Breadcrumb names/order do not match the visible trail.");
      }
    }

    const snippet = breadcrumbSnippet(
      names.length > 0
        ? names.map((name): { name: string } => ({ name }))
        : [{ name: "REPLACE_WITH_PAGE_TITLE" }],
    );
    const fixWithNames = {
      summary: "Align BreadcrumbList positions, names and URLs with the visible breadcrumb trail.",
      snippet,
      snippetLang: "html",
    };
    if (problems.length > 0) return fail(problems[0] ?? "BreadcrumbList is malformed.", { evidence, fix: fixWithNames });
    if (warnings.length > 0) return warn(warnings[0] ?? "BreadcrumbList has minor issues.", { evidence, fix: fixWithNames });
    return pass("BreadcrumbList positions and labels match the visible trail.", { evidence });
  },
});

function similarText(a: string, b: string): boolean {
  const left = normalizeWhitespace(a);
  const right = normalizeWhitespace(b);
  if (left === "" || right === "") return true;
  return left.includes(right) || right.includes(left);
}

export const schemaArticle = definePageCheck({
  id: "seo.schema.article",
  title: "Article metadata is coherent",
  pillar: "seo",
  category: "structured-data",
  kind: "deterministic",
  severity: "medium",
  weight: 2,
  requires: ["raw-html"],
  rationale: "Article entities should match the visible headline, byline and dates.",
  docs: "https://developers.google.com/search/docs/appearance/structured-data/article",
  run: (ctx) => {
    const data = contextPageData(ctx);
    const articles = findNodes(data.sd.nodes, "Article");
    if (articles.length === 0) return skip("No Article markup on this page.");
    const article = articles[0];
    if (article === undefined) return skip("No Article markup on this page.");

    const headline = getString(article, "headline") ?? getString(article, "name");
    const author = getString(article, "author");
    const image = getStringArray(article, "image")[0];
    const datePublished = getString(article, "datePublished");
    const dateModified = getString(article, "dateModified");
    const publisher = getObject(article, "publisher");
    const publisherName = publisher === undefined ? undefined : getString(publisher, "name");
    const visibleHeadline =
      data.dom$("h1").first().text().replace(/\s+/g, " ").trim() ||
      data.dom$("meta[property='og:title']").attr("content")?.trim() ||
      data.dom$("title").first().text().trim();

    const issues: string[] = [];
    const warnings: string[] = [];
    if (headline === undefined) issues.push("Article is missing the required headline.");
    else if (visibleHeadline !== undefined && !similarText(headline, visibleHeadline)) {
      issues.push(`Headline "${headline}" does not match the visible heading "${visibleHeadline}".`);
    }
    if (author === undefined) issues.push("Article is missing the required author.");
    if (image === undefined) warnings.push("Article is missing a recommended image.");
    if (publisherName === undefined) warnings.push("Article is missing a recommended publisher.");

    const publishedTime = datePublished === undefined ? undefined : Date.parse(datePublished);
    const modifiedTime = dateModified === undefined ? undefined : Date.parse(dateModified);
    if (datePublished === undefined) warnings.push("Article is missing datePublished.");
    else if (publishedTime === undefined || !Number.isFinite(publishedTime)) {
      issues.push(`datePublished "${datePublished}" is not a valid date.`);
    }
    if (dateModified === undefined) warnings.push("Article is missing dateModified.");
    else if (modifiedTime === undefined || !Number.isFinite(modifiedTime)) {
      issues.push(`dateModified "${dateModified}" is not a valid date.`);
    }
    if (publishedTime !== undefined && modifiedTime !== undefined && Number.isFinite(publishedTime) && Number.isFinite(modifiedTime) && modifiedTime < publishedTime) {
      issues.push("dateModified is earlier than datePublished.");
    }

    const authorObject = getObject(article, "author");
    const authorUrl = authorObject === undefined ? undefined : getString(authorObject, "url");
    const snippet = articleSnippet({
      ...(headline !== undefined ? { headline } : {}),
      ...(author !== undefined ? { authorName: author } : {}),
      ...(authorUrl !== undefined ? { authorUrl } : {}),
      ...(image !== undefined ? { image } : {}),
      ...(datePublished !== undefined ? { datePublished } : {}),
      ...(dateModified !== undefined ? { dateModified } : {}),
      ...(publisherName !== undefined ? { publisherName } : {}),
      pageUrl: data.page.finalUrl,
    });
    const fix = {
      summary: "Align structured headline, author, image and dates with the visible article.",
      snippet,
      snippetLang: "html",
    };
    const evidence = {
      ...structuredDataEvidence(data.sd),
      headline: headline ?? null,
      visibleHeadline: visibleHeadline ?? null,
      author: author ?? null,
      image: image ?? null,
      datePublished: datePublished ?? null,
      dateModified: dateModified ?? null,
      publisher: publisherName ?? null,
      issues,
      warnings,
    };
    if (issues.length > 0) return fail(issues[0] ?? "Article markup is incoherent.", { evidence, fix });
    if (warnings.length > 0) return warn(warnings[0] ?? "Article markup is missing recommended fields.", { evidence, fix });
    return pass("Article headline, author, image and dates are coherent.", { evidence });
  },
});

export const schemaGoogleSupportedType = definePageCheck({
  id: "seo.schema.google-supported-type",
  title: "Type targets a current supported Google feature",
  pillar: "seo",
  category: "structured-data",
  kind: "deterministic",
  severity: "low",
  weight: 1,
  requires: ["raw-html"],
  rationale: "Google supports a subset of schema.org for visual features; do not promise unsupported results.",
  docs: "https://developers.google.com/search/docs/appearance/structured-data/search-gallery",
  run: (ctx) => {
    const data = contextPageData(ctx);
    const types = new Set<string>(data.sd.markup.types);
    for (const node of data.sd.nodes) for (const type of nodeTypes(node)) types.add(type);
    if (types.size === 0) return skip("No structured data types found on this page.");

    const all = [...types];
    const supported = all.filter((type) => GOOGLE_SUPPORTED_TYPES.has(type));
    const limited = all.filter((type) => GOOGLE_LIMITED_TYPES.has(type));
    const unsupported = all.filter((type) => !GOOGLE_SUPPORTED_TYPES.has(type));
    const evidence = {
      ...structuredDataEvidence(data.sd),
      supported,
      limited,
      unsupported,
    };
    const fix = {
      summary: "Keep schema.org markup, but describe its expected Google result accurately; do not promise rich results for unsupported types.",
    };
    if (limited.length > 0) {
      return warn(
        `${limited.join(", ")} no longer receive broad Google rich results (FAQ is limited to authoritative government/health sites).`,
        { evidence, fix },
      );
    }
    if (unsupported.length > 0) {
      return warn(
        `Schema.org-valid type(s) without a current Google rich-result feature: ${unsupported.slice(0, 6).join(", ")}.`,
        { evidence, fix },
      );
    }
    return pass(`All ${supported.length} detected type(s) target current Google features.`, { evidence });
  },
});

export const schemaChecks = [
  schemaSyntax,
  schemaTypeValid,
  schemaOrganization,
  schemaLocalBusiness,
  schemaProductOffer,
  schemaBreadcrumb,
  schemaArticle,
  schemaGoogleSupportedType,
];
