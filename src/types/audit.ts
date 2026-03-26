import { z } from "zod";

// ============ LAYER 1: RAW METRICS ============

export const MetaSchema = z.object({
  title: z.string().default(""),
  titleLength: z.number(),
  description: z.string().default(""),
  descriptionLength: z.number(),
  keywords: z.string().default(""),
  ogTags: z.record(z.string(), z.string()).default({}),
});

export const HeadingsSchema = z.object({
  h1: z.number(),
  h2: z.number(),
  h3: z.number(),
  h4: z.number(),
  h5: z.number(),
  h6: z.number(),
});

export const LinksSchema = z.object({
  internal: z.number(),
  external: z.number(),
  total: z.number(),
});

export const ImagesSchema = z.object({
  total: z.number(),
  withAlt: z.number(),
  missingAlt: z.number(),
  missingAltPercent: z.number(),
});

export const MetricsSchema = z.object({
  url: z.string().url(),
  meta: MetaSchema,
  headings: HeadingsSchema,
  wordCount: z.number(),
  bodyText: z.string(),
  ctaCount: z.number(),
  ctaKeywords: z.array(z.string()),
  links: LinksSchema,
  images: ImagesSchema,
  dynamicContentSuspected: z.boolean().optional(),
});

export type MetricsObject = z.infer<typeof MetricsSchema>;

// ============ LAYER 1.5: DERIVED SIGNALS ============

export const DerivedSignalsSchema = z.object({
  ctaDensity: z.number(),
  ctaDensityLabel: z.enum(["low", "moderate", "high"]),
  contentDepth: z.enum(["thin", "moderate", "deep"]),
  headingStructure: z.enum(["valid", "invalid"]),
  altTextCoverage: z.enum(["poor", "good"]),
  internalLinkRatio: z.number(),
  metaOptimization: z.enum(["poor", "average", "good"]),
});

export type DerivedSignals = z.infer<typeof DerivedSignalsSchema>;

// ============ LAYER 2: AI INSIGHTS ============

export const AIInsightSchema = z.object({
  summary: z.string(),
  finding: z.string(),
  impact: z.string(),
  metricReferenced: z.string(),
  severity: z.enum(["high", "medium", "low"]),
});

export type AIInsight = z.infer<typeof AIInsightSchema>;

export const RecommendationSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: z.number().min(1).max(5),
  category: z.enum(["seo", "messaging", "cta", "content", "ux"]),
  effort: z.enum(["low", "medium", "high"]),
  metricReferenced: z.string().optional(),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;

export const AIAnalysisSchema = z.object({
  insights: z.array(AIInsightSchema),
  recommendations: z.array(RecommendationSchema),
});

export type AIAnalysis = z.infer<typeof AIAnalysisSchema>;

// ============ PROMPT LOGGING ============

export const PromptLogSchema = z.object({
  systemPrompt: z.string(),
  userPrompt: z.string(),
  structuredInput: z.object({
    metrics: MetricsSchema,
    signals: DerivedSignalsSchema,
  }),
  rawModelOutput: z.string(),
  executionMeta: z.object({
    model: z.string(),
    timestamp: z.string(),
    url: z.string().url(),
  }),
});

export type PromptLog = z.infer<typeof PromptLogSchema>;

// ============ FULL AUDIT RESPONSE ============

export const AuditResponseSchema = z.object({
  url: z.string().url(),
  metrics: MetricsSchema,
  signals: DerivedSignalsSchema,
  insights: z.array(AIInsightSchema),
  recommendations: z.array(RecommendationSchema),
  promptLog: PromptLogSchema,
});

export type AuditResponse = z.infer<typeof AuditResponseSchema>;
