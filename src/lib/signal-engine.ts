import type { MetricsObject, DerivedSignals } from "@/types/audit";

export function deriveSignals(metrics: MetricsObject): DerivedSignals {
  // CTA Density: CTAs per 100 words
  const ctaDensity =
    metrics.wordCount > 0 ? (metrics.ctaCount / metrics.wordCount) * 100 : 0;

  const ctaDensityLabel: DerivedSignals["ctaDensityLabel"] =
    metrics.ctaCount < 3 ? "low" : metrics.ctaCount < 6 ? "moderate" : "high";

  // Content Depth
  const contentDepth: DerivedSignals["contentDepth"] =
    metrics.wordCount < 800
      ? "thin"
      : metrics.wordCount < 2000
        ? "moderate"
        : "deep";

  // Heading Structure: valid if exactly one H1
  const headingStructure: DerivedSignals["headingStructure"] =
    metrics.headings.h1 === 1 ? "valid" : "invalid";

  // Heading Hierarchy: proper nesting check
  const headingHierarchy: DerivedSignals["headingHierarchy"] =
    metrics.headings.h1 >= 1 &&
    (metrics.headings.h3 === 0 || metrics.headings.h2 >= 1)
      ? "proper"
      : "broken";

  // Alt Text Coverage
  const altTextCoverage: DerivedSignals["altTextCoverage"] =
    metrics.images.missingAltPercent > 30 ? "poor" : "good";

  // Internal Link Ratio
  const totalLinks = metrics.links.internal + metrics.links.external;
  const internalLinkRatio =
    totalLinks > 0 ? metrics.links.internal / totalLinks : 0;

  // Meta Optimization
  const titleLength = metrics.meta.titleLength;
  const descriptionLength = metrics.meta.descriptionLength;

  const metaOptimization: DerivedSignals["metaOptimization"] =
    titleLength > 30 && titleLength < 60 && descriptionLength > 70
      ? "good"
      : descriptionLength > 0
        ? "average"
        : "poor";

  // Deterministic SEO checks — no AI needed for these
  const titleStatus: DerivedSignals["titleStatus"] =
    metrics.meta.titleLength === 0 ? "missing"
    : metrics.meta.titleLength < 30 ? "too-short"
    : metrics.meta.titleLength > 60 ? "too-long"
    : "ok";

  const descriptionStatus: DerivedSignals["descriptionStatus"] =
    metrics.meta.descriptionLength === 0 ? "missing"
    : metrics.meta.descriptionLength < 120 ? "too-short"
    : metrics.meta.descriptionLength > 160 ? "too-long"
    : "ok";

  const h1Status: DerivedSignals["h1Status"] =
    metrics.headings.h1 === 0 ? "missing"
    : metrics.headings.h1 > 1 ? "multiple"
    : "ok";

  const hasNoindex = !!(
    metrics.seo.robotsMeta &&
    metrics.seo.robotsMeta.toLowerCase().includes("noindex")
  );

  // Title-H1 word overlap — similar = missed keyword diversification
  const titleWords = new Set(
    metrics.meta.title.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2)
  );
  const h1Words = metrics.headingTexts.h1[0]
    ? new Set(metrics.headingTexts.h1[0].toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2))
    : new Set<string>();
  const overlapCount = [...titleWords].filter(w => h1Words.has(w)).length;
  const titleH1Overlap = titleWords.size > 0 && h1Words.size > 0
    ? overlapCount / Math.min(titleWords.size, h1Words.size) > 0.6
    : false;

  // Content scannability — lists + heading density
  const headingDensity = metrics.wordCount > 0
    ? (metrics.headings.h2 + metrics.headings.h3) / (metrics.wordCount / 100)
    : 0;
  const contentScannability: DerivedSignals["contentScannability"] =
    (metrics.listCount >= 2 || headingDensity >= 1.5)
      ? "good"
      : (metrics.listCount >= 1 || headingDensity >= 0.5)
        ? "ok"
        : "poor";

  // OG image present — required for good social share previews
  const ogImagePresent = !!metrics.meta.ogTags["image"];

  // H1 word count — too short = vague, too long = unfocused
  const h1WordCount = metrics.headingTexts.h1[0]
    ? metrics.headingTexts.h1[0].split(/\s+/).filter(w => w.length > 0).length
    : 0;

  // Schema.org Presence
  const schemaOrgPresence: DerivedSignals["schemaOrgPresence"] =
    metrics.seo.schemaOrgTypes.length > 0 ? "present" : "absent";

  // Social Meta Completeness (OG + Twitter)
  const hasOgTitle = !!metrics.meta.ogTags["title"];
  const hasOgDesc = !!metrics.meta.ogTags["description"];
  const hasOgImage = !!metrics.meta.ogTags["image"];
  const hasTwitterCard = Object.keys(metrics.seo.twitterCard).length > 0;

  const socialMetaCompleteness: DerivedSignals["socialMetaCompleteness"] =
    hasOgTitle && hasOgDesc && hasOgImage && hasTwitterCard
      ? "complete"
      : hasOgTitle || hasOgDesc || hasTwitterCard
        ? "partial"
        : "missing";

  // Technical SEO Basics (canonical + robots + viewport + lang)
  let techScore = 0;
  if (metrics.seo.canonical) techScore++;
  if (metrics.seo.viewport) techScore++;
  if (metrics.seo.lang) techScore++;
  if (!metrics.seo.robotsMeta || !metrics.seo.robotsMeta.includes("noindex")) techScore++;

  const technicalSeoBasics: DerivedSignals["technicalSeoBasics"] =
    techScore >= 4 ? "good" : techScore >= 2 ? "needs-work" : "poor";

  // Performance Indicator (by resource counts)
  const totalResources = metrics.seo.scriptCount + metrics.seo.stylesheetCount;
  const performanceIndicator: DerivedSignals["performanceIndicator"] =
    totalResources < 10 ? "light" : totalResources < 25 ? "moderate" : "heavy";

  return {
    ctaDensity: Math.round(ctaDensity * 1000) / 1000,
    ctaDensityLabel,
    contentDepth,
    headingStructure,
    headingHierarchy,
    altTextCoverage,
    internalLinkRatio: Math.round(internalLinkRatio * 100) / 100,
    metaOptimization,
    schemaOrgPresence,
    socialMetaCompleteness,
    technicalSeoBasics,
    performanceIndicator,
    titleStatus,
    descriptionStatus,
    h1Status,
    hasNoindex,
    titleH1Overlap,
    contentScannability,
    ogImagePresent,
    h1WordCount,
  };
}
