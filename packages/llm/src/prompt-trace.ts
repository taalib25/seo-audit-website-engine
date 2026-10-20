export interface PromptTrace {
  task: string;
  model: string;
  system: string;
  user: string;
  rawOutput: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs: number;
  recordedAt: string;
  error?: string;
}

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}
