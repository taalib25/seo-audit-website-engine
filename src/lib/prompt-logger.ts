import type {
  MetricsObject,
  DerivedSignals,
  PromptLog,
} from "@/types/audit";

export function createPromptLog(
  url: string,
  metrics: MetricsObject,
  signals: DerivedSignals,
  systemPrompt: string,
  userPrompt: string,
  rawModelOutput: string,
  model: string
): PromptLog {
  return {
    systemPrompt,
    userPrompt,
    structuredInput: {
      metrics,
      signals,
    },
    rawModelOutput,
    executionMeta: {
      model,
      timestamp: new Date().toISOString(),
      url,
    },
  };
}
