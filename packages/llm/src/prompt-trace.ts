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
  /** False means costUsd contains known charges only; at least one dispatched request has unknown cost. */
  costKnown?: false;
}
