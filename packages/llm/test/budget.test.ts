import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLlmClient, LlmBudgetExceededError, LlmCostUnknownError } from "../src/client.ts";

const config = { apiKey: "fixture-secret", modelJudge: "test/model", maxSpendPerAuditUsd: 1, maxRetries: 5, concurrency: 4 };
const request = { task: "budget", system: "s", user: "u", schema: z.object({ ok: z.boolean() }) };
const completion = (cost: number, content = '{"ok":true}') => new Response(JSON.stringify({
  model: "test/model", choices: [{ message: { content } }],
  usage: { prompt_tokens: 3, completion_tokens: 2, cost },
}), { headers: { "content-type": "application/json" } });

describe("audit cost accounting", () => {
  it.each([
    ["missing", ""], ["null", ',"cost":null'], ["negative", ',"cost":-1'],
    ["nonfinite", ',"cost":1e999'], ["nonnumeric", ',"cost":"0.2"'],
  ])("rejects %s cost, retains known usage, and blocks repairs and later calls", async (_name, costField) => {
    let calls = 0;
    const client = createLlmClient(config, { fetch: async () => {
      calls += 1;
      if (calls === 1) return completion(0.25);
      return new Response(`{"model":"test/model","choices":[{"message":{"content":"not json"}}],"usage":{"prompt_tokens":7,"completion_tokens":4${costField}}}`, {
        headers: { "content-type": "application/json" },
      });
    } });
    await expect(client.judge(request)).resolves.toEqual({ ok: true });
    await expect(client.judge(request)).rejects.toBeInstanceOf(LlmCostUnknownError);
    await expect(client.judge(request)).rejects.toBeInstanceOf(LlmCostUnknownError);
    expect(calls).toBe(2);
    expect(client.getUsage()).toEqual({ inputTokens: 10, outputTokens: 6, costUsd: 0.25, costKnown: false });
    expect(client.getPromptTraces()).toHaveLength(2);
    expect(client.getPromptTraces()[1]).toMatchObject({ rawOutput: "not json", inputTokens: 7, outputTokens: 4, error: expect.stringContaining("cost is unknown") });
    expect(client.getPromptTraces()[1]?.costUsd).toBeUndefined();
  });

  it.each(["unknown", "exhausted"])("blocks queued calls after %s cost and rejects racing resets", async (mode) => {
    let calls = 0;
    let finish = (_value: Response) => {};
    let started = () => {};
    const firstStarted = new Promise<void>((resolve) => { started = resolve; });
    const client = createLlmClient(config, { fetch: async () => {
      calls += 1;
      started();
      return new Promise<Response>((resolve) => { finish = resolve; });
    } });
    const results = Promise.allSettled([client.judge(request), client.judge(request), client.judge(request)]);
    await firstStarted;
    expect(calls).toBe(1);
    expect(() => client.resetAuditMeter()).toThrow("active or queued");
    finish(mode === "exhausted" ? completion(1) : new Response('{"choices":[{"message":{"content":"{\\"ok\\":true}"}}],"usage":{"prompt_tokens":3}}', { headers: { "content-type": "application/json" } }));
    const settled = await results;
    expect(calls).toBe(1);
    expect(settled[0]?.status).toBe(mode === "exhausted" ? "fulfilled" : "rejected");
    for (const item of settled.slice(1)) {
      expect(item.status).toBe("rejected");
      if (item.status === "rejected") expect(item.reason).toBeInstanceOf(mode === "exhausted" ? LlmBudgetExceededError : LlmCostUnknownError);
    }
    client.resetAuditMeter();
    expect(client.getUsage()).toEqual({ inputTokens: 0, outputTokens: 0, costUsd: 0 });
  });

  it("accepts explicit zero costs and permits a fresh audit after an idle reset", async () => {
    let calls = 0;
    const client = createLlmClient(config, { fetch: async () => {
      calls += 1;
      return calls === 1
        ? new Response('{"choices":[{"message":{"content":"{}"}}]}', { headers: { "content-type": "application/json" } })
        : completion(0);
    } });
    await expect(client.judge(request)).rejects.toBeInstanceOf(LlmCostUnknownError);
    client.resetAuditMeter();
    await expect(client.judge(request)).resolves.toEqual({ ok: true });
    await expect(client.judge(request)).resolves.toEqual({ ok: true });
    expect(calls).toBe(3);
    expect(client.getUsage().costUsd).toBe(0);
  });

  it("does not retry an ambiguous provider failure and redacts its trace", async () => {
    let calls = 0;
    const client = createLlmClient(config, { fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: "failed fixture-secret Bearer private-token" } }), { status: 500, headers: { "content-type": "application/json" } });
    } });
    await expect(client.judge(request)).rejects.toBeInstanceOf(LlmCostUnknownError);
    await expect(client.judge(request)).rejects.toBeInstanceOf(LlmCostUnknownError);
    expect(calls).toBe(1);
    expect(client.getUsage()).toMatchObject({ costUsd: 0, costKnown: false });
    expect(JSON.stringify(client.getPromptTraces())).not.toContain("fixture-secret");
    expect(JSON.stringify(client.getPromptTraces())).not.toContain("private-token");
  });

  it("does not dispatch a JSON repair after its metered first response exhausts the budget", async () => {
    let calls = 0;
    const client = createLlmClient(config, { fetch: async () => { calls += 1; return completion(1, "invalid JSON"); } });
    await expect(client.judge(request)).rejects.toBeInstanceOf(LlmBudgetExceededError);
    expect(calls).toBe(1);
    expect(client.getUsage().costUsd).toBe(1);
  });

  it.each([0, 2])("limits metered schema repair to maxRetries=%i", async (maxRetries) => {
    let calls = 0;
    const client = createLlmClient({ ...config, maxRetries }, { fetch: async () => { calls += 1; return completion(0.1, "invalid JSON"); } });
    await expect(client.judge(request)).rejects.toThrow();
    expect(calls).toBe(maxRetries + 1);
    expect(client.getUsage().costKnown).toBeUndefined();
  });
});
