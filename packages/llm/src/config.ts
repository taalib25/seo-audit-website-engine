import { z } from "zod";

const positiveInt = z.coerce.number().int().positive();
const modelMap = z.record(z.string(), z.string().min(1)).default({});

export const LlmConfigSchema = z.object({
  apiKey: z.string().min(1),
  baseURL: z.url().default("https://openrouter.ai/api/v1"),
  modelJudge: z.string().min(1).default("deepseek/deepseek-v3.2"),
  modelSynth: z.string().min(1).default("google/gemini-3.8-flash"),
  modelProbe: z.string().min(1).default("perplexity/sonar-pro:online"),
  taskModels: modelMap,
  fallbackModels: z.array(z.string().min(1)).default([]),
  timeoutMs: positiveInt.default(30_000),
  maxRetries: z.coerce.number().int().min(0).max(5).default(2),
  /** Max judge calls in flight; spend is re-checked before each call. */
  concurrency: positiveInt.default(4),
  maxSpendPerAuditUsd: z.coerce.number().finite().nonnegative().default(1),
  httpReferer: z.url().optional(),
  appTitle: z.string().min(1).default("AEO Audit"),
});

export type LlmConfig = z.infer<typeof LlmConfigSchema>;

const EnvironmentSchema = z.object({
  OPENROUTER_API_KEY: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.url().optional(),
  LLM_MODEL_JUDGE: z.string().optional(),
  LLM_MODEL_SYNTH: z.string().optional(),
  LLM_MODEL_PROBE: z.string().optional(),
  LLM_TASK_MODELS: z.string().optional(),
  LLM_CONCURRENCY: z.coerce.number().int().positive().optional(),
  LLM_FALLBACK_MODELS: z.string().optional(),
  LLM_TIMEOUT_MS: z.string().optional(),
  LLM_MAX_RETRIES: z.string().optional(),
  LLM_MAX_SPEND_PER_AUDIT_USD: z.string().optional(),
  OPENROUTER_HTTP_REFERER: z.url().optional(),
  OPENROUTER_APP_TITLE: z.string().optional(),
});

export function loadLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const parsed = EnvironmentSchema.parse(env);
  let taskModels: Record<string, string> = {};
  if (parsed.LLM_TASK_MODELS !== undefined) {
    const value: unknown = JSON.parse(parsed.LLM_TASK_MODELS);
    taskModels = z.record(z.string(), z.string().min(1)).parse(value);
  }
  let fallbackModels: string[] = [];
  if (parsed.LLM_FALLBACK_MODELS !== undefined) {
    fallbackModels = parsed.LLM_FALLBACK_MODELS.split(",").map((model) => model.trim()).filter(Boolean);
  }
  return LlmConfigSchema.parse({
    apiKey: parsed.LLM_API_KEY ?? parsed.OPENROUTER_API_KEY,
    ...(parsed.LLM_BASE_URL === undefined ? {} : { baseURL: parsed.LLM_BASE_URL }),
    ...(parsed.LLM_MODEL_JUDGE === undefined ? {} : { modelJudge: parsed.LLM_MODEL_JUDGE }),
    ...(parsed.LLM_MODEL_SYNTH === undefined ? {} : { modelSynth: parsed.LLM_MODEL_SYNTH }),
    ...(parsed.LLM_MODEL_PROBE === undefined ? {} : { modelProbe: parsed.LLM_MODEL_PROBE }),
    taskModels,
    fallbackModels,
    ...(parsed.LLM_TIMEOUT_MS === undefined ? {} : { timeoutMs: parsed.LLM_TIMEOUT_MS }),
    ...(parsed.LLM_MAX_RETRIES === undefined ? {} : { maxRetries: parsed.LLM_MAX_RETRIES }),
    ...(parsed.LLM_CONCURRENCY === undefined ? {} : { concurrency: parsed.LLM_CONCURRENCY }),
    ...(parsed.LLM_MAX_SPEND_PER_AUDIT_USD === undefined ? {} : { maxSpendPerAuditUsd: parsed.LLM_MAX_SPEND_PER_AUDIT_USD }),
    ...(parsed.OPENROUTER_HTTP_REFERER === undefined ? {} : { httpReferer: parsed.OPENROUTER_HTTP_REFERER }),
    ...(parsed.OPENROUTER_APP_TITLE === undefined ? {} : { appTitle: parsed.OPENROUTER_APP_TITLE }),
  });
}
