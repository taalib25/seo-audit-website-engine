import * as cheerio from "cheerio";
import type { CheerioAPI } from "cheerio";
import type { PageContext } from "../../check.ts";
import {
  detectStructuredDataMarkup,
  extractJsonLd,
  firstNode,
  getAbsoluteUrl,
  getString,
  getStringArray,
  type JsonLdDocument,
  type JsonObject,
  type StructuredDataMarkup,
} from "../../extract/jsonld.ts";
import { mainText } from "../../extract/text.ts";
import type { PageSnapshot } from "../../snapshot.ts";

export interface StructuredDataView {
  rawDoc: JsonLdDocument;
  domDoc: JsonLdDocument;
  /** Raw nodes when present, otherwise rendered nodes. */
  nodes: JsonObject[];
  jsonLdInRaw: boolean;
  jsonLdInDom: boolean;
  jsonLdOnlyInDom: boolean;
  markup: StructuredDataMarkup;
}

export interface PageData {
  page: PageSnapshot;
  /** Served HTML. */
  $: CheerioAPI;
  /** Rendered DOM, falling back to the served HTML. */
  dom$: CheerioAPI;
  sd: StructuredDataView;
  /** Body text with scripts/styles removed (includes header/footer). */
  text: string;
  /** Main content text. */
  main: string;
}

function mergeMarkup(a: StructuredDataMarkup, b: StructuredDataMarkup): StructuredDataMarkup {
  const union = (left: readonly string[], right: readonly string[]): string[] => {
    const out = [...left];
    for (const value of right) if (!out.includes(value)) out.push(value);
    return out;
  };
  return {
    types: union(a.types, b.types),
    microdataTypes: union(a.microdataTypes, b.microdataTypes),
    rdfaTypes: union(a.rdfaTypes, b.rdfaTypes),
    microdataProperties: union(a.microdataProperties, b.microdataProperties),
    rdfaProperties: union(a.rdfaProperties, b.rdfaProperties),
  };
}

function buildView(raw$: CheerioAPI, dom$: CheerioAPI, hasRendered: boolean): StructuredDataView {
  const rawDoc = extractJsonLd(raw$, "raw");
  const domDoc = hasRendered ? extractJsonLd(dom$, "dom") : rawDoc;
  const rawMarkup = detectStructuredDataMarkup(raw$);
  const markup = hasRendered ? mergeMarkup(rawMarkup, detectStructuredDataMarkup(dom$)) : rawMarkup;
  const jsonLdInRaw = rawDoc.nodes.length > 0;
  const jsonLdInDom = domDoc.nodes.length > 0;
  return {
    rawDoc,
    domDoc,
    nodes: jsonLdInRaw ? rawDoc.nodes : domDoc.nodes,
    jsonLdInRaw,
    jsonLdInDom,
    jsonLdOnlyInDom: hasRendered && !jsonLdInRaw && jsonLdInDom,
    markup,
  };
}

export function visibleText($: CheerioAPI): string {
  const body = $("body").first();
  const clone = body.length > 0 ? body.clone() : $("html").clone();
  clone.find("script, style, noscript, template, svg").remove();
  return clone.text().replace(/\s+/g, " ").trim();
}

export function contextPageData(ctx: PageContext): PageData {
  const raw$ = ctx.raw();
  const dom$ = ctx.dom();
  return {
    page: ctx.page,
    $: raw$,
    dom$,
    sd: buildView(raw$, dom$, ctx.page.renderedHtml !== undefined),
    text: visibleText(dom$),
    main: mainText(dom$),
  };
}

export function snapshotPageData(page: PageSnapshot): PageData {
  const raw$ = cheerio.load(page.rawHtml);
  const hasRendered = page.renderedHtml !== undefined;
  const dom$ = hasRendered ? cheerio.load(page.renderedHtml ?? "") : raw$;
  return {
    page,
    $: raw$,
    dom$,
    sd: buildView(raw$, dom$, hasRendered),
    text: visibleText(dom$),
    main: mainText(dom$),
  };
}

/** Facts shared by every schema check: where the markup came from. */
export function structuredDataEvidence(sd: StructuredDataView): Record<string, unknown> {
  const evidence: Record<string, unknown> = {
    jsonLdInRaw: sd.jsonLdInRaw,
    jsonLdInDom: sd.jsonLdInDom,
    jsonLdBlocks: sd.rawDoc.blocks.length,
    invalidBlocks: sd.rawDoc.invalidCount,
    microdataTypes: sd.markup.microdataTypes,
    rdfaTypes: sd.markup.rdfaTypes,
  };
  if (sd.jsonLdOnlyInDom) {
    evidence.note =
      "JSON-LD appears only in the rendered DOM; crawlers that do not execute JavaScript see no JSON-LD.";
  }
  return evidence;
}

export function metaContent($: CheerioAPI, selector: string): string | undefined {
  const value = $(selector).first().attr("content");
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function textOf($: CheerioAPI, selector: string): string | undefined {
  const value = $(selector).first().text().replace(/\s+/g, " ").trim();
  return value === "" ? undefined : value;
}

export function normalizeWhitespace(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function digitsOf(value: string): string {
  return value.replace(/\D+/g, "");
}

/** Lowercases, strips legal suffixes/punctuation and diacritics for name comparison. */
export function normalizeBrandName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(inc|incorporated|llc|ltd|limited|corp|corporation|gmbh|plc|pty|co|company|sa|srl|ag|nv|bv)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Address comparison form: lowercase words, punctuation removed, whitespace collapsed. */
export function normalizeAddress(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface OrgFacts {
  name?: string;
  url?: string;
  logo?: string;
  description?: string;
  sameAs?: string[];
  telephone?: string;
  email?: string;
}

function firstNonEmpty(...values: readonly (string | undefined)[]): string | undefined {
  for (const value of values) if (value !== undefined && value.trim() !== "") return value.trim();
  return undefined;
}

function absolute(value: string | undefined, base: string): string | undefined {
  return value === undefined ? undefined : getAbsoluteUrl(value, base);
}

/** Collects Organization facts from markup and page metadata. Never invents values. */
export function collectOrgFacts(data: PageData): OrgFacts {
  const org = firstNode(data.sd.nodes, "Organization");
  const base = data.page.finalUrl;
  const siteUrl = new URL("/", base).href;
  const name = firstNonEmpty(
    org ? getString(org, "name") : undefined,
    metaContent(data.$, 'meta[property="og:site_name"]'),
    metaContent(data.$, 'meta[name="application-name"]'),
    textOf(data.$, "header [class*='logo'], header [class*='Logo']"),
  );
  const url = firstNonEmpty(
    org ? getString(org, "url") : undefined,
    metaContent(data.$, 'meta[property="og:url"]'),
    siteUrl,
  );
  const logoValue = firstNonEmpty(
    org ? getString(org, "logo") : undefined,
    metaContent(data.$, 'meta[property="og:image"]'),
    data.$('link[rel="apple-touch-icon"]').first().attr("href"),
    data.$('link[rel~="icon"]').first().attr("href"),
    data.$("header img[src]").first().attr("src"),
  );
  const description = firstNonEmpty(
    org ? getString(org, "description") : undefined,
    metaContent(data.$, 'meta[name="description"]'),
    metaContent(data.$, 'meta[property="og:description"]'),
  );
  const sameAs = org ? getStringArray(org, "sameAs") : [];

  const facts: OrgFacts = {};
  if (name !== undefined) facts.name = name;
  if (url !== undefined) facts.url = getAbsoluteUrl(url, base) ?? siteUrl;
  if (logoValue !== undefined) {
    const resolved = absolute(logoValue, base);
    if (resolved !== undefined) facts.logo = resolved;
  }
  if (description !== undefined) facts.description = description;
  if (sameAs.length > 0) facts.sameAs = sameAs;
  const telephone = org ? getString(org, "telephone") : undefined;
  if (telephone !== undefined) facts.telephone = telephone;
  const email = org ? getString(org, "email") : undefined;
  if (email !== undefined) facts.email = email;
  return facts;
}

function scriptSnippet(node: Record<string, unknown>): string {
  return `<script type="application/ld+json">\n${JSON.stringify(node, null, 2)}\n</script>`;
}

const PLACEHOLDER_NAME = "REPLACE_WITH_ORGANIZATION_NAME";
const PLACEHOLDER_URL = "REPLACE_WITH_SITE_URL";
const PLACEHOLDER_LOGO = "REPLACE_WITH_LOGO_URL";
const PLACEHOLDER_PROFILE = "REPLACE_WITH_PROFILE_URL";

export function organizationSnippet(facts: OrgFacts): string {
  const url = facts.url ?? PLACEHOLDER_URL;
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${url.replace(/\/$/, "")}/#organization`,
    name: facts.name ?? PLACEHOLDER_NAME,
    url,
    logo: {
      "@type": "ImageObject",
      url: facts.logo ?? PLACEHOLDER_LOGO,
    },
    sameAs: facts.sameAs && facts.sameAs.length > 0 ? facts.sameAs : [PLACEHOLDER_PROFILE],
  };
  if (facts.description !== undefined) node.description = facts.description;
  if (facts.telephone !== undefined) node.telephone = facts.telephone;
  if (facts.email !== undefined) node.email = facts.email;
  return scriptSnippet(node);
}

export interface BreadcrumbSnippetItem {
  name: string;
  url?: string;
}

export function breadcrumbSnippet(items: readonly BreadcrumbSnippetItem[]): string {
  const nodes = items.map((item, index) => {
    const node: Record<string, unknown> = {
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
    };
    if (item.url !== undefined) node.item = item.url;
    return node;
  });
  const effective = nodes.length > 0
    ? nodes
    : [{ "@type": "ListItem", position: 1, name: "REPLACE_WITH_PAGE_TITLE" }];
  return scriptSnippet({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: effective,
  });
}

export interface ArticleSnippetFacts {
  headline?: string;
  authorName?: string;
  authorUrl?: string;
  image?: string;
  datePublished?: string;
  dateModified?: string;
  publisherName?: string;
  pageUrl: string;
}

export function articleSnippet(facts: ArticleSnippetFacts): string {
  const author: Record<string, unknown> = {
    "@type": "Person",
    name: facts.authorName ?? "REPLACE_WITH_AUTHOR_NAME",
  };
  if (facts.authorUrl !== undefined) author.url = facts.authorUrl;
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: facts.headline ?? "REPLACE_WITH_ARTICLE_HEADLINE",
    mainEntityOfPage: { "@type": "WebPage", "@id": facts.pageUrl },
    author,
  };
  const image = facts.image ?? "REPLACE_WITH_ARTICLE_IMAGE_URL";
  node.image = image;
  if (facts.datePublished !== undefined) node.datePublished = facts.datePublished;
  if (facts.dateModified !== undefined) node.dateModified = facts.dateModified;
  if (facts.publisherName !== undefined) {
    node.publisher = { "@type": "Organization", name: facts.publisherName };
  }
  return scriptSnippet(node);
}

export interface ProductSnippetFacts {
  name?: string;
  description?: string;
  image?: string;
  price?: string;
  priceCurrency?: string;
  availability?: string;
  sku?: string;
  pageUrl: string;
}

export function productSnippet(facts: ProductSnippetFacts): string {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: facts.name ?? "REPLACE_WITH_PRODUCT_NAME",
    image: facts.image ?? "REPLACE_WITH_PRODUCT_IMAGE_URL",
    description: facts.description ?? "REPLACE_WITH_PRODUCT_DESCRIPTION",
    offers: {
      "@type": "Offer",
      url: facts.pageUrl,
      price: facts.price ?? "REPLACE_WITH_PRICE",
      priceCurrency: facts.priceCurrency ?? "REPLACE_WITH_ISO_CURRENCY",
      availability: facts.availability ?? "https://schema.org/InStock",
    },
  };
  if (facts.sku !== undefined) node.sku = facts.sku;
  return scriptSnippet(node);
}

export interface LocalBusinessSnippetFacts {
  name?: string;
  url?: string;
  telephone?: string;
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
}

export function localBusinessSnippet(facts: LocalBusinessSnippetFacts): string {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: facts.name ?? PLACEHOLDER_NAME,
    url: facts.url ?? PLACEHOLDER_URL,
    telephone: facts.telephone ?? "REPLACE_WITH_PHONE",
    address: {
      "@type": "PostalAddress",
      streetAddress: facts.streetAddress ?? "REPLACE_WITH_STREET_ADDRESS",
      addressLocality: facts.addressLocality ?? "REPLACE_WITH_CITY",
      addressRegion: facts.addressRegion ?? "REPLACE_WITH_REGION",
      postalCode: facts.postalCode ?? "REPLACE_WITH_POSTAL_CODE",
      addressCountry: facts.addressCountry ?? "REPLACE_WITH_COUNTRY_CODE",
    },
  };
  return scriptSnippet(node);
}

export interface PersonSnippetFacts {
  name?: string;
  url?: string;
  jobTitle?: string;
  sameAs?: readonly string[];
}

export function personSnippet(facts: PersonSnippetFacts): string {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: facts.name ?? "REPLACE_WITH_AUTHOR_NAME",
    url: facts.url ?? "REPLACE_WITH_AUTHOR_PROFILE_URL",
  };
  if (facts.jobTitle !== undefined) node.jobTitle = facts.jobTitle;
  node.sameAs = facts.sameAs && facts.sameAs.length > 0 ? [...facts.sameAs] : [PLACEHOLDER_PROFILE];
  return scriptSnippet(node);
}
