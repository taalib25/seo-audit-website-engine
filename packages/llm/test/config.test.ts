import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadLlmConfig } from "../src/config.ts";

describe("loadLlmConfig", () => {
  it("accepts the copied web env example after setting only the OpenRouter key", () => {
    const template = readFileSync(new URL("../../../apps/web/.env.example", import.meta.url), "utf8");
    const env = Object.fromEntries(template.split(/\r?\n/).flatMap((line) => {
      const separator = line.indexOf("=");
      return separator > 0 && !line.startsWith("#") ? [[line.slice(0, separator), line.slice(separator + 1)]] : [];
    }));
    const config = loadLlmConfig({ ...env, OPENROUTER_API_KEY: "fixture-openrouter-key" });
    expect(config.apiKey).toBe("fixture-openrouter-key");
    expect(config.httpReferer).toBeUndefined();
    expect(config.fallbackModels).toEqual([]);
    expect(config.maxOutputTokens).toBe(2_048);
  });

  it("uses defaults for whitespace-only options without mutating the supplied environment", () => {
    const env = { OPENROUTER_API_KEY: "fixture-openrouter-key", LLM_API_KEY: "  ", LLM_BASE_URL: "\t", LLM_MODEL_JUDGE: " ", LLM_TASK_MODELS: " ", LLM_CONCURRENCY: " ", OPENROUTER_HTTP_REFERER: " " };
    const config = loadLlmConfig(env);
    expect(config.apiKey).toBe("fixture-openrouter-key");
    expect(config.baseURL).toBe("https://openrouter.ai/api/v1");
    expect(config.modelJudge).toBe("deepseek/deepseek-v3.2");
    expect(config.taskModels).toEqual({});
    expect(config.concurrency).toBe(4);
    expect(env.LLM_API_KEY).toBe("  ");
  });

  it("preserves explicit key precedence and rejects invalid nonblank configuration", () => {
    expect(loadLlmConfig({ LLM_API_KEY: "fixture-provider-key", OPENROUTER_API_KEY: "fixture-openrouter-key" }).apiKey).toBe("fixture-provider-key");
    expect(() => loadLlmConfig({ OPENROUTER_API_KEY: "fixture-openrouter-key", OPENROUTER_HTTP_REFERER: "invalid-url" })).toThrow();
    expect(() => loadLlmConfig({ OPENROUTER_API_KEY: " ", LLM_API_KEY: "" })).toThrow();
  });

  it("loads an output-token bound and rejects nonpositive or fractional bounds", () => {
    expect(loadLlmConfig({ LLM_API_KEY: "fixture-key", LLM_MAX_OUTPUT_TOKENS: "512" }).maxOutputTokens).toBe(512);
    for (const value of ["0", "-1", "1.5", "invalid"]) {
      expect(() => loadLlmConfig({ LLM_API_KEY: "fixture-key", LLM_MAX_OUTPUT_TOKENS: value })).toThrow();
    }
  });
});
