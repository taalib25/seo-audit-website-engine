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

  return {
    ctaDensity: Math.round(ctaDensity * 1000) / 1000,
    ctaDensityLabel,
    contentDepth,
    headingStructure,
    altTextCoverage,
    internalLinkRatio: Math.round(internalLinkRatio * 100) / 100,
    metaOptimization,
  };
}
