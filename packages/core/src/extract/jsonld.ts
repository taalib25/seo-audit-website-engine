/**
 * JSON-LD / Microdata / RDFa extraction.
 *
 * Checks read structured data from the served HTML (`raw()`): most AI crawlers
 * do not execute JavaScript. When JSON-LD exists only in the rendered DOM the
 * caller can compare both documents and report that fact.
 *
 * The parser is forgiving on purpose: a broken block is reported, never thrown,
 * so one bad script cannot hide the rest of the page's entities.
 */
import type { CheerioAPI } from "cheerio";

export type JsonObject = Record<string, unknown>;
export type JsonLdSource = "raw" | "dom";

export interface JsonLdError {
  index: number;
  message: string;
}

export interface JsonLdBlock {
  index: number;
  source: JsonLdSource;
  valid: boolean;
  raw: string;
  nodes: JsonObject[];
  error?: string;
}

export interface JsonLdDocument {
  source: JsonLdSource;
  blocks: JsonLdBlock[];
  nodes: JsonObject[];
  errors: JsonLdError[];
  validCount: number;
  invalidCount: number;
}

export interface StructuredDataMarkup {
  /** Normalized itemtype/typeof names, e.g. ["Organization", "WebPage"]. */
  types: string[];
  microdataTypes: string[];
  rdfaTypes: string[];
  microdataProperties: string[];
  rdfaProperties: string[];
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  quot: '"',
};

/** Decodes the entities that appear in hand-edited JSON-LD (and CDATA wrappers). */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const digits = hex ? body.slice(2) : body.slice(1);
      const code = Number.parseInt(digits, hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function stripWrappers(raw: string): string {
  let text = raw.replace(/^\uFEFF/, "").trim();
  text = text.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
  text = text.replace(/^<!--/, "").replace(/-->$/, "").trim();
  return text;
}

function decodeStringValues(value: unknown): unknown {
  if (typeof value === "string") return decodeHtmlEntities(value);
  if (Array.isArray(value)) return value.map(decodeStringValues);
  if (isJsonObject(value)) {
    const out: JsonObject = {};
    for (const [key, child] of Object.entries(value)) out[key] = decodeStringValues(child);
    return out;
  }
  return value;
}

function parseJsonText(text: string): unknown {
  const cleaned = stripWrappers(text);
  const candidates = cleaned.includes("&") ? [cleaned, decodeHtmlEntities(cleaned)] : [cleaned];
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return cleaned.includes("&") ? decodeStringValues(parsed) : parsed;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Invalid JSON");
}

function collectNodes(value: unknown, out: JsonObject[], depth = 0): void {
  if (depth > 24) return;
  if (Array.isArray(value)) {
    for (const item of value) collectNodes(item, out, depth + 1);
    return;
  }
  if (!isJsonObject(value)) return;
  if (value["@type"] !== undefined) out.push(value);
  if (value["@graph"] !== undefined) collectNodes(value["@graph"], out, depth + 1);
  for (const [key, child] of Object.entries(value)) {
    if (key.startsWith("@")) continue;
    if (Array.isArray(child)) {
      for (const item of child) {
        if (isJsonObject(item)) collectNodes(item, out, depth + 1);
      }
    } else if (isJsonObject(child)) {
      collectNodes(child, out, depth + 1);
    }
  }
}

/** Extracts every `application/ld+json` block from a parsed document. */
export function extractJsonLd($: CheerioAPI, source: JsonLdSource = "raw"): JsonLdDocument {
  const blocks: JsonLdBlock[] = [];
  const nodes: JsonObject[] = [];
  const errors: JsonLdError[] = [];

  const scripts = $("script").filter((_, el) => {
    const type = ($(el).attr("type") ?? "").toLowerCase().split(";")[0]?.trim();
    return type === "application/ld+json";
  });

  scripts.each((index, el) => {
    const raw = $(el).text();
    if (raw.trim() === "") {
      const block: JsonLdBlock = {
        index,
        source,
        valid: false,
        raw,
        nodes: [],
        error: "Empty JSON-LD block",
      };
      blocks.push(block);
      errors.push({ index, message: "Empty JSON-LD block" });
      return;
    }
    try {
      const parsed = parseJsonText(raw);
      const parsedNodes: JsonObject[] = [];
      collectNodes(parsed, parsedNodes);
      blocks.push({ index, source, valid: true, raw, nodes: parsedNodes });
      nodes.push(...parsedNodes);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON";
      blocks.push({ index, source, valid: false, raw, nodes: [], error: message });
      errors.push({ index, message });
    }
  });

  return {
    source,
    blocks,
    nodes,
    errors,
    validCount: blocks.filter((block) => block.valid).length,
    invalidCount: errors.length,
  };
}

/** `schema:Organization`, `https://schema.org/Organization` → `Organization`. */
export function normalizeTypeName(value: string): string {
  const trimmed = value.trim();
  const separator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf(":"));
  return (separator >= 0 ? trimmed.slice(separator + 1) : trimmed).trim();
}

export function nodeTypes(node: JsonObject): string[] {
  const value = node["@type"];
  const rawTypes: string[] = [];
  if (typeof value === "string") {
    rawTypes.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") rawTypes.push(item);
    }
  }
  const out: string[] = [];
  for (const type of rawTypes.map(normalizeTypeName)) {
    if (type !== "" && !out.includes(type)) out.push(type);
  }
  return out;
}

const LOCAL_BUSINESS_TYPES: readonly string[] = [
  "LocalBusiness",
  "AccountingService",
  "AnimalShelter",
  "ArchiveOrganization",
  "ArtGallery",
  "Attorney",
  "AutoBodyShop",
  "AutoDealer",
  "AutoPartsStore",
  "AutoRental",
  "AutoRepair",
  "AutoWash",
  "Bakery",
  "BarOrPub",
  "BeautySalon",
  "BikeStore",
  "BookStore",
  "Brewery",
  "CafeOrCoffeeShop",
  "Campground",
  "Casino",
  "ChildCare",
  "ClothingStore",
  "ComputerStore",
  "ConvenienceStore",
  "Dentist",
  "DepartmentStore",
  "Distillery",
  "DryCleaningOrLaundry",
  "Electrician",
  "ElectronicsStore",
  "EmergencyService",
  "EmploymentAgency",
  "EntertainmentBusiness",
  "ExerciseGym",
  "FastFoodRestaurant",
  "FinancialService",
  "Florist",
  "FoodEstablishment",
  "FurnitureStore",
  "GardenStore",
  "GasStation",
  "GeneralContractor",
  "GiftShop",
  "GolfCourse",
  "GroceryStore",
  "HairSalon",
  "HardwareStore",
  "HealthAndBeautyBusiness",
  "HealthClub",
  "HobbyShop",
  "HomeAndConstructionBusiness",
  "HomeGoodsStore",
  "Hospital",
  "Hostel",
  "Hotel",
  "HousePainter",
  "HVACBusiness",
  "IceCreamShop",
  "InsuranceAgency",
  "InternetCafe",
  "JewelryStore",
  "LiquorStore",
  "Locksmith",
  "LodgingBusiness",
  "MedicalBusiness",
  "MedicalClinic",
  "MobilePhoneStore",
  "Motel",
  "MotorcycleDealer",
  "MotorcycleRepair",
  "MovieRentalStore",
  "MovieTheater",
  "MovingCompany",
  "MusicStore",
  "NailSalon",
  "NightClub",
  "Notary",
  "NursingHome",
  "OfficeEquipmentStore",
  "Optician",
  "OutletStore",
  "PawnShop",
  "PetStore",
  "Pharmacy",
  "Physician",
  "Plumber",
  "ProfessionalService",
  "PublicSwimmingPool",
  "RealEstateAgent",
  "RecyclingCenter",
  "Resort",
  "Restaurant",
  "RoofingContractor",
  "RVResort",
  "ShoeStore",
  "ShoppingCenter",
  "SkiResort",
  "SportingGoodsStore",
  "SportsActivityLocation",
  "Store",
  "Supermarket",
  "TaxiService",
  "TennisComplex",
  "TireShop",
  "TravelAgency",
  "VeterinaryCare",
  "VideoGameStore",
  "WholesaleStore",
  "Winery",
];

const ARTICLE_TYPES: readonly string[] = [
  "Article",
  "AdvertiserContentArticle",
  "AnalysisNewsArticle",
  "AskPublicNewsArticle",
  "BackgroundNewsArticle",
  "BlogPosting",
  "LiveBlogPosting",
  "MedicalScholarlyArticle",
  "NewsArticle",
  "OpinionNewsArticle",
  "Report",
  "ReportageNewsArticle",
  "ReviewNewsArticle",
  "SatiricalArticle",
  "ScholarlyArticle",
  "SocialMediaPosting",
  "TechArticle",
];

const WEB_PAGE_TYPES: readonly string[] = [
  "WebPage",
  "AboutPage",
  "CheckoutPage",
  "CollectionPage",
  "ContactPage",
  "FAQPage",
  "ImageGallery",
  "ItemPage",
  "MedicalWebPage",
  "ProfilePage",
  "QAPage",
  "RealEstateListing",
  "SearchResultsPage",
  "VideoGallery",
];

const PRODUCT_TYPES: readonly string[] = ["Product", "IndividualProduct", "ProductGroup", "ProductModel", "SomeProducts"];
const PERSON_TYPES: readonly string[] = ["Person", "Patient"];
const REVIEW_TYPES: readonly string[] = ["Review", "CriticReview", "EmployerReview", "UserReview"];
const APP_TYPES: readonly string[] = ["SoftwareApplication", "MobileApplication", "WebApplication", "VideoGame", "Game"];

const TYPE_FAMILIES: Readonly<Record<string, readonly string[]>> = {
  Organization: [
    "Organization",
    "Corporation",
    "EducationalOrganization",
    "GovernmentOrganization",
    "MedicalOrganization",
    "NewsMediaOrganization",
    "NGO",
    "OnlineBusiness",
    "OnlineStore",
    "PerformingGroup",
    "SportsOrganization",
    ...LOCAL_BUSINESS_TYPES,
  ],
  LocalBusiness: [...LOCAL_BUSINESS_TYPES],
  Article: [...ARTICLE_TYPES],
  WebPage: [...WEB_PAGE_TYPES],
  Product: [...PRODUCT_TYPES],
  Person: [...PERSON_TYPES],
  Review: [...REVIEW_TYPES],
  AggregateRating: ["AggregateRating"],
  SoftwareApplication: [...APP_TYPES],
  WebSite: ["WebSite"],
  BreadcrumbList: ["BreadcrumbList"],
  FAQPage: ["FAQPage"],
  HowTo: ["HowTo"],
};

/** True when the node declares `family` or a known schema.org subtype of it. */
export function matchesType(node: JsonObject, family: string): boolean {
  const allowed = TYPE_FAMILIES[family];
  const types = nodeTypes(node);
  if (!allowed) return types.includes(family);
  return types.some((type) => allowed.includes(type));
}

export function findNodes(nodes: readonly JsonObject[], family: string): JsonObject[] {
  return nodes.filter((node) => matchesType(node, family));
}

export function firstNode(nodes: readonly JsonObject[], family: string): JsonObject | undefined {
  return nodes.find((node) => matchesType(node, family));
}

/** Schema.org type of the first node matching a family, for evidence/snippets. */
export function primaryType(node: JsonObject): string | undefined {
  return nodeTypes(node)[0];
}

function propertyValue(node: JsonObject, key: string): unknown {
  return node[key];
}

/** String value, tolerating `{ "@value": ... }`, arrays and `{ "@id": ... }`. */
export function getString(node: JsonObject, key: string): string | undefined {
  const value = propertyValue(node, key);
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim() !== "") return item.trim();
      if (isJsonObject(item)) {
        const nested = getString(item, "@value") ?? getString(item, "name") ?? getString(item, "@id");
        if (nested !== undefined) return nested;
      }
    }
    return undefined;
  }
  if (isJsonObject(value)) {
    return getString(value, "@value") ?? getString(value, "name") ?? getString(value, "@id");
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

export function getStringArray(node: JsonObject, key: string): string[] {
  const value = propertyValue(node, key);
  const out: string[] = [];
  const push = (candidate: unknown): void => {
    if (typeof candidate === "string" && candidate.trim() !== "") {
      out.push(candidate.trim());
      return;
    }
    if (isJsonObject(candidate)) {
      const nested = getString(candidate, "@id") ?? getString(candidate, "url") ?? getString(candidate, "name");
      if (nested !== undefined) out.push(nested);
    }
  };
  if (Array.isArray(value)) {
    for (const item of value) push(item);
  } else {
    push(value);
  }
  return out;
}

export function getNumber(node: JsonObject, key: string): number | undefined {
  const value = propertyValue(node, key);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  if (isJsonObject(value)) return getNumber(value, "@value");
  return undefined;
}

export function getObject(node: JsonObject, key: string): JsonObject | undefined {
  return getObjects(node, key)[0];
}

export function getObjects(node: JsonObject, key: string): JsonObject[] {
  const value = propertyValue(node, key);
  if (Array.isArray(value)) return value.filter(isJsonObject);
  return isJsonObject(value) ? [value] : [];
}

export function usableValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

export function hasProperty(node: JsonObject, key: string): boolean {
  return usableValue(propertyValue(node, key));
}

export interface RichResultRequirements {
  required: readonly string[];
  recommended: readonly string[];
}

const ORGANIZATION_REQ: RichResultRequirements = {
  required: ["name"],
  recommended: ["url", "logo", "sameAs"],
};
const LOCAL_BUSINESS_REQ: RichResultRequirements = {
  required: ["name", "address"],
  recommended: ["telephone", "url", "openingHoursSpecification", "geo", "priceRange"],
};
const ARTICLE_REQ: RichResultRequirements = {
  required: ["headline", "author"],
  recommended: ["image", "datePublished", "dateModified", "publisher", "mainEntityOfPage"],
};
const PRODUCT_REQ: RichResultRequirements = {
  required: ["name"],
  recommended: ["image", "description", "brand", "sku", "offers", "review", "aggregateRating"],
};
const BREADCRUMB_REQ: RichResultRequirements = {
  required: ["itemListElement"],
  recommended: [],
};
const FAQ_REQ: RichResultRequirements = {
  required: ["mainEntity"],
  recommended: [],
};
const HOWTO_REQ: RichResultRequirements = {
  required: ["name", "step"],
  recommended: ["image", "totalTime", "estimatedCost"],
};
const PERSON_REQ: RichResultRequirements = {
  required: ["name"],
  recommended: ["url", "sameAs", "jobTitle", "worksFor"],
};
const SOFTWARE_REQ: RichResultRequirements = {
  required: ["name"],
  recommended: ["applicationCategory", "operatingSystem", "offers", "aggregateRating"],
};
const REVIEW_REQ: RichResultRequirements = {
  required: ["itemReviewed", "reviewRating"],
  recommended: ["author", "reviewBody", "datePublished"],
};
const AGGREGATE_RATING_REQ: RichResultRequirements = {
  required: ["ratingValue", "reviewCount"],
  recommended: ["bestRating", "worstRating", "itemReviewed"],
};
const WEBSITE_REQ: RichResultRequirements = {
  required: ["name", "url"],
  recommended: ["potentialAction"],
};
const WEBPAGE_REQ: RichResultRequirements = {
  required: ["name"],
  recommended: ["url", "description", "breadcrumb"],
};

/**
 * Google rich-results required/recommended properties, grouped by the family
 * the catalog audits. These follow the feature gallery, not schema.org validity.
 */
export function googleRequirements(type: string): RichResultRequirements | undefined {
  if (LOCAL_BUSINESS_TYPES.includes(type)) return LOCAL_BUSINESS_REQ;
  if (ORGANIZATION_TYPES.includes(type)) return ORGANIZATION_REQ;
  if (ARTICLE_TYPES.includes(type)) return ARTICLE_REQ;
  if (PRODUCT_TYPES.includes(type)) return PRODUCT_REQ;
  if (PERSON_TYPES.includes(type)) return PERSON_REQ;
  if (REVIEW_TYPES.includes(type)) return REVIEW_REQ;
  if (APP_TYPES.includes(type)) return SOFTWARE_REQ;
  switch (type) {
    case "BreadcrumbList":
      return BREADCRUMB_REQ;
    case "FAQPage":
      return FAQ_REQ;
    case "HowTo":
      return HOWTO_REQ;
    case "AggregateRating":
      return AGGREGATE_RATING_REQ;
    case "WebSite":
      return WEBSITE_REQ;
    default:
      return WEB_PAGE_TYPES.includes(type) ? WEBPAGE_REQ : undefined;
  }
}

const ORGANIZATION_TYPES: readonly string[] = [
  "Organization",
  "Corporation",
  "EducationalOrganization",
  "GovernmentOrganization",
  "MedicalOrganization",
  "NewsMediaOrganization",
  "NGO",
  "OnlineBusiness",
  "OnlineStore",
  "PerformingGroup",
  "SportsOrganization",
];

export interface NodeValidation {
  types: string[];
  requirements?: RichResultRequirements;
  missingRequired: string[];
  missingRecommended: string[];
}

export function validateRichResult(node: JsonObject): NodeValidation {
  const types = nodeTypes(node);
  const requirements = types.map(googleRequirements).find((req) => req !== undefined);
  const missingRequired: string[] = [];
  const missingRecommended: string[] = [];
  if (requirements) {
    for (const key of requirements.required) if (!hasProperty(node, key)) missingRequired.push(key);
    for (const key of requirements.recommended) if (!hasProperty(node, key)) missingRecommended.push(key);
  }
  return requirements
    ? { types, requirements, missingRequired, missingRecommended }
    : { types, missingRequired, missingRecommended };
}

/** Absolute http(s) URL, or undefined when the value is absent/invalid. */
export function getAbsoluteUrl(value: string | undefined, base: string): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value, base);
    return /^https?:$/.test(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const SCHEMA_NAMESPACE = "https://schema.org/";

function markupName(value: string): string {
  const token = value.trim().split(/\s+/)[0] ?? "";
  const normalized = normalizeTypeName(token);
  return normalized.startsWith("schema.") ? normalized.slice("schema.".length) : normalized;
}

/** Rejects Open Graph / Twitter / foreign-vocabulary terms collected by the generic property selector. */
function isSchemaTerm(value: string): boolean {
  const token = value.trim().split(/\s+/)[0] ?? "";
  if (token === "") return false;
  if (/^https?:\/\//i.test(token)) return /schema\.org/i.test(token);
  const colon = token.indexOf(":");
  if (colon < 0) return true;
  return token.slice(0, colon).toLowerCase() === "schema";
}

/** Detects Microdata (`itemtype`) and RDFa (`typeof`) annotations. */
export function detectStructuredDataMarkup($: CheerioAPI): StructuredDataMarkup {
  const microdataTypes: string[] = [];
  const rdfaTypes: string[] = [];
  const microdataProperties: string[] = [];
  const rdfaProperties: string[] = [];

  const collect = (
    selector: string,
    attribute: string,
    target: string[],
    schemaOnly = false,
  ): void => {
    $(selector).each((_, el) => {
      const value = $(el).attr(attribute);
      if (value === undefined) return;
      if (schemaOnly && !isSchemaTerm(value)) return;
      for (const token of value.trim().split(/\s+/)) {
        const name = markupName(token);
        if (name !== "" && !target.includes(name)) target.push(name);
      }
    });
  };

  collect("[itemtype]", "itemtype", microdataTypes, true);
  collect("[typeof]", "typeof", rdfaTypes, true);
  collect("[itemprop]", "itemprop", microdataProperties, true);
  collect("[property]", "property", rdfaProperties, true);

  const types: string[] = [];
  for (const type of [...microdataTypes, ...rdfaTypes]) if (!types.includes(type)) types.push(type);

  return { types, microdataTypes, rdfaTypes, microdataProperties, rdfaProperties };
}

export { LOCAL_BUSINESS_TYPES, ARTICLE_TYPES, WEB_PAGE_TYPES, PRODUCT_TYPES, REVIEW_TYPES, APP_TYPES, SCHEMA_NAMESPACE };


