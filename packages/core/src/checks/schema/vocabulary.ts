import {
  APP_TYPES,
  ARTICLE_TYPES,
  LOCAL_BUSINESS_TYPES,
  PRODUCT_TYPES,
  REVIEW_TYPES,
  WEB_PAGE_TYPES,
  normalizeTypeName,
  nodeTypes,
  type JsonObject,
} from "../../extract/jsonld.ts";

export type TermVerdict = "known" | "deprecated" | "unknown" | "malformed" | "typo";

const EXTRA_TYPES: readonly string[] = [
  "Thing",
  "CreativeWork",
  "Book",
  "Chapter",
  "Course",
  "CourseInstance",
  "Dataset",
  "DiscussionForumPosting",
  "Event",
  "BusinessEvent",
  "EducationEvent",
  "Festival",
  "MusicEvent",
  "ScreeningEvent",
  "SocialEvent",
  "SportsEvent",
  "TheaterEvent",
  "VisualArtsEvent",
  "JobPosting",
  "MathSolver",
  "MenuItem",
  "Menu",
  "MerchantReturnPolicy",
  "MemberProgram",
  "Movie",
  "TVSeries",
  "TVEpisode",
  "PodcastEpisode",
  "PodcastSeries",
  "Offer",
  "AggregateOffer",
  "Demand",
  "BreadcrumbList",
  "ListItem",
  "HowTo",
  "HowToStep",
  "HowToSection",
  "Question",
  "Answer",
  "WebSite",
  "ItemList",
  "EntryPoint",
  "SearchAction",
  "SiteNavigationElement",
  "Place",
  "PostalAddress",
  "ContactPoint",
  "GeoCoordinates",
  "GeoShape",
  "OpeningHoursSpecification",
  "Brand",
  "Country",
  "Language",
  "DefinedTerm",
  "PropertyValue",
  "QuantitativeValue",
  "MonetaryAmount",
  "Duration",
  "Rating",
  "ImageObject",
  "VideoObject",
  "AudioObject",
  "MediaObject",
  "Recipe",
  "SpeakableSpecification",
  "EducationalOccupationalCredential",
  "Occupation",
  "Role",
  "OrganizationRole",
  "AdministrativeArea",
  "City",
  "State",
  "Number",
  "Text",
  "Boolean",
  "URL",
  "Integer",
  "Float",
  "Date",
  "DateTime",
  "Time",
];

const KNOWN_TYPES: ReadonlySet<string> = new Set<string>([
  ...EXTRA_TYPES,
  ...LOCAL_BUSINESS_TYPES,
  ...ARTICLE_TYPES,
  ...WEB_PAGE_TYPES,
  ...PRODUCT_TYPES,
  ...REVIEW_TYPES,
  ...APP_TYPES,
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
  "Person",
  "Patient",
  "AggregateRating",
]);

const KNOWN_PROPERTIES: ReadonlySet<string> = new Set([
  "about",
  "acceptedAnswer",
  "additionalType",
  "address",
  "addressCountry",
  "addressLocality",
  "addressRegion",
  "aggregateRating",
  "alternateName",
  "applicationCategory",
  "areaServed",
  "articleBody",
  "articleSection",
  "author",
  "availability",
  "bestRating",
  "brand",
  "breadcrumb",
  "citation",
  "color",
  "contactPoint",
  "contentUrl",
  "copyrightHolder",
  "dateCreated",
  "dateModified",
  "datePublished",
  "depth",
  "description",
  "downloadUrl",
  "duration",
  "email",
  "embedUrl",
  "endDate",
  "estimatedCost",
  "eventStatus",
  "featureList",
  "fileSize",
  "foundingDate",
  "founders",
  "geo",
  "gtin",
  "gtin8",
  "gtin12",
  "gtin13",
  "gtin14",
  "headline",
  "height",
  "image",
  "inLanguage",
  "installUrl",
  "isAccessibleForFree",
  "isBasedOn",
  "isFamilyFriendly",
  "isPartOf",
  "item",
  "itemCondition",
  "itemListElement",
  "itemReviewed",
  "jobTitle",
  "keywords",
  "knowsAbout",
  "latitude",
  "legalName",
  "license",
  "location",
  "logo",
  "longitude",
  "mainEntity",
  "mainEntityOfPage",
  "manufacturer",
  "material",
  "model",
  "mpn",
  "name",
  "numberOfEmployees",
  "nutrition",
  "offers",
  "openingHours",
  "openingHoursSpecification",
  "operatingSystem",
  "organizer",
  "performer",
  "position",
  "potentialAction",
  "prepTime",
  "cookTime",
  "price",
  "priceCurrency",
  "priceRange",
  "priceSpecification",
  "publisher",
  "query-input",
  "ratingCount",
  "ratingValue",
  "recipeIngredient",
  "recipeInstructions",
  "review",
  "reviewBody",
  "reviewCount",
  "reviewRating",
  "sameAs",
  "screenshot",
  "serviceArea",
  "sku",
  "slogan",
  "softwareVersion",
  "startDate",
  "step",
  "streetAddress",
  "subjectOf",
  "suggestedAnswer",
  "supply",
  "target",
  "taxID",
  "telephone",
  "text",
  "thumbnailUrl",
  "tool",
  "totalTime",
  "uploadDate",
  "url",
  "vatID",
  "videoQuality",
  "weight",
  "width",
  "worstRating",
  "worksFor",
]);

const DEPRECATED_TERMS: ReadonlySet<string> = new Set([
  "lastReviewed",
  "relatedLink",
  "reviews",
  "significantLink",
]);

export const GOOGLE_SUPPORTED_TYPES: ReadonlySet<string> = new Set<string>([
  ...ARTICLE_TYPES,
  ...LOCAL_BUSINESS_TYPES,
  ...PRODUCT_TYPES,
  ...REVIEW_TYPES,
  ...APP_TYPES,
  ...WEB_PAGE_TYPES,
  "Organization",
  "Corporation",
  "EducationalOrganization",
  "GovernmentOrganization",
  "MedicalOrganization",
  "NewsMediaOrganization",
  "NGO",
  "OnlineBusiness",
  "OnlineStore",
  "Person",
  "WebSite",
  "BreadcrumbList",
  "FAQPage",
  "HowTo",
  "Book",
  "Course",
  "CourseInstance",
  "Dataset",
  "DiscussionForumPosting",
  "Event",
  "JobPosting",
  "MathSolver",
  "MerchantReturnPolicy",
  "MemberProgram",
  "Offer",
  "AggregateOffer",
  "AggregateRating",
  "Movie",
  "TVSeries",
  "TVEpisode",
  "PodcastEpisode",
  "PodcastSeries",
  "Recipe",
  "VideoObject",
  "ImageObject",
  "Vehicle",
  "VehicleListing",
  "VacationRental",
  "EmployerAggregateRating",
  "EstimatedSalary",
  "LoyaltyProgram",
  "SpeakableSpecification",
]);

/** Types that are still valid schema.org but no longer get a broad Google rich result. */
export const GOOGLE_LIMITED_TYPES: ReadonlySet<string> = new Set(["HowTo", "FAQPage", "Course"]);

const AUTHORITATIVE_HOSTS: readonly string[] = [
  ".gov",
  ".edu",
  ".mil",
  ".int",
  "who.int",
  "nih.gov",
  "cdc.gov",
  "arxiv.org",
  "doi.org",
  "nature.com",
  "science.org",
  "ieee.org",
  "acm.org",
  "wikipedia.org",
  "worldbank.org",
  "oecd.org",
  "un.org",
  "europa.eu",
  "pewresearch.org",
  "statista.com",
];

export function isAuthoritativeHost(host: string): boolean {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return AUTHORITATIVE_HOSTS.some((entry) =>
    entry.startsWith(".") ? normalized.endsWith(entry) : normalized === entry || normalized.endsWith(`.${entry}`),
  );
}

function levenshtein(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  const previous = new Array<number>(right.length + 1);
  const current = new Array<number>(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) previous[j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const deletion = (previous[j] ?? 0) + 1;
      const insertion = (current[j - 1] ?? 0) + 1;
      const substitution = (previous[j - 1] ?? 0) + cost;
      current[j] = Math.min(deletion, insertion, substitution);
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j] ?? 0;
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function nearestDistance(term: string, known: ReadonlySet<string>): number {
  let best = Number.POSITIVE_INFINITY;
  for (const candidate of known) {
    const distance = levenshtein(term, candidate);
    if (distance < best) best = distance;
    if (best === 1) break;
  }
  return best;
}

export function classifyTerm(term: string, kind: "type" | "property"): TermVerdict {
  const name = normalizeTypeName(term);
  const wellFormed = kind === "type" ? /^[A-Z][A-Za-z0-9]*$/.test(name) : /^[a-z][A-Za-z0-9]*$/i.test(name);
  if (!wellFormed) return "malformed";
  if (DEPRECATED_TERMS.has(name)) return "deprecated";
  const known = kind === "type" ? KNOWN_TYPES : KNOWN_PROPERTIES;
  if (known.has(name)) return "known";
  const distance = nearestDistance(name, known);
  const threshold = name.length >= 9 ? 2 : name.length >= 5 ? 1 : 0;
  return distance > 0 && distance <= threshold ? "typo" : "unknown";
}

export interface VocabularyAudit {
  checkedTypes: number;
  checkedProperties: number;
  malformedTypes: string[];
  typoTypes: string[];
  unknownTypes: string[];
  deprecatedTerms: string[];
  malformedProperties: string[];
  typoProperties: string[];
  unknownProperties: string[];
}

function pushUnique(list: string[], value: string): void {
  if (!list.includes(value)) list.push(value);
}

export function auditVocabulary(
  nodes: readonly JsonObject[],
  markupTypes: readonly string[],
  markupProperties: readonly string[],
): VocabularyAudit {
  const audit: VocabularyAudit = {
    checkedTypes: 0,
    checkedProperties: 0,
    malformedTypes: [],
    typoTypes: [],
    unknownTypes: [],
    deprecatedTerms: [],
    malformedProperties: [],
    typoProperties: [],
    unknownProperties: [],
  };

  const types = new Set<string>(markupTypes.map(normalizeTypeName));
  const properties = new Set<string>(markupProperties.map(normalizeTypeName));
  for (const node of nodes) {
    for (const type of nodeTypes(node)) types.add(type);
    for (const key of Object.keys(node)) {
      if (key.startsWith("@")) continue;
      properties.add(normalizeTypeName(key));
    }
  }

  for (const type of types) {
    if (type === "") continue;
    audit.checkedTypes += 1;
    switch (classifyTerm(type, "type")) {
      case "malformed":
        pushUnique(audit.malformedTypes, type);
        break;
      case "typo":
        pushUnique(audit.typoTypes, type);
        break;
      case "unknown":
        pushUnique(audit.unknownTypes, type);
        break;
      case "deprecated":
        pushUnique(audit.deprecatedTerms, type);
        break;
      case "known":
        break;
    }
  }

  for (const property of properties) {
    if (property === "") continue;
    audit.checkedProperties += 1;
    switch (classifyTerm(property, "property")) {
      case "malformed":
        pushUnique(audit.malformedProperties, property);
        break;
      case "typo":
        pushUnique(audit.typoProperties, property);
        break;
      case "unknown":
        pushUnique(audit.unknownProperties, property);
        break;
      case "deprecated":
        pushUnique(audit.deprecatedTerms, property);
        break;
      case "known":
        break;
    }
  }

  return audit;
}
