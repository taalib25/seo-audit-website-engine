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
  };
}
