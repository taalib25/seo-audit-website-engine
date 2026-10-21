import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLlmClient } from "../src/client.ts";

const config = {
  apiKey: "test-secret",
  modelJudge: "test/model",
  fallbackModels: [],
  timeoutMs: 1_000,
  maxRetries: 0,
  maxSpendPerAuditUsd: 1,
};

describe("createLlmClient", () => {
  it("parses validated output and records traces and OpenRouter usage without network access", async () => {
    const fakeFetch: typeof fetch = async (_input, init) => {
      const body = z.object({ temperature: z.number(), max_tokens: z.number(), response_format: z.object({ type: z.string() }) }).parse(JSON.parse(String(init?.body)));
      expect(body.temperature).toBe(0);
      expect(body.max_tokens).toBe(2_048);
      expect(body.response_format.type).toBe("json_schema");
      return new Response(JSON.stringify({
        model: "test/model",
        choices: [{ message: { content: '{"score":4}' }, finish_reason: "stop" }],
        usage: { prompt_tokens: 12, completion_tokens: 4, cost: 0.002 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const client = createLlmClient(config, { fetch: fakeFetch });
    const result = await client.judge({ task: "unit.test", system: "system", user: "user", schema: z.object({ score: z.number() }) });
    expect(result).toEqual({ score: 4 });
    expect(client.getUsage()).toEqual({ inputTokens: 12, outputTokens: 4, costUsd: 0.002 });
    expect(client.getPromptTraces()).toHaveLength(1);
    expect(JSON.stringify(client.getPromptTraces())).not.toContain("test-secret");
  });

  it("repairs invalid output once and enforces the per-audit cap", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls += 1;
      return new Response(JSON.stringify({
        model: "test/model",
        choices: [{ message: { content: calls === 1 ? "not json" : '{"ok":true}' }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.6 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const client = createLlmClient({ ...config, maxRetries: 1, maxSpendPerAuditUsd: 1 }, { fetch: fakeFetch });
    await expect(client.judge({ task: "repair", system: "s", user: "u", schema: z.object({ ok: z.boolean() }) })).resolves.toEqual({ ok: true });
    await expect(client.judge({ task: "over-budget", system: "s", user: "u", schema: z.object({ ok: z.boolean() }) })).rejects.toThrow("spend cap");
    expect(calls).toBe(2);
    client.resetAuditMeter();
    expect(client.getUsage().costUsd).toBe(0);
  });

  it("falls back to json_object when the provider rejects json_schema", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async (_input, init) => {
      calls += 1;
      const request = z.object({ max_tokens: z.number(), response_format: z.object({ type: z.string() }) }).parse(JSON.parse(String(init?.body)));
      expect(request.max_tokens).toBe(512);
      if (request.response_format.type === "json_schema") {
        return new Response(JSON.stringify({ error: { message: "json_schema response_format is unsupported" } }), { status: 400 });
      }
      return new Response(JSON.stringify({ model: "test/model", choices: [{ message: { content: '{"ok":true}' } }], usage: { cost: 0 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const client = createLlmClient({ ...config, maxOutputTokens: 512 }, { fetch: fakeFetch });
    await expect(client.judge({ task: "fallback", system: "s", user: "u", schema: z.object({ ok: z.boolean() }) })).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(client.getPromptTraces()).toHaveLength(2);
    expect(client.getPromptTraces()[0]?.error).toContain("unsupported");
  });
});
