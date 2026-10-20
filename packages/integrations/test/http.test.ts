import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { jsonRequest } from "../src/http.ts";

describe("integration request deadlines", () => {
  it("aborts a stalled provider request when the deadline fires", async () => {
    const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    let requestSignal: AbortSignal | null | undefined;
    const request = jsonRequest(async (_url, init) => {
      requestSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    }, "https://example.com/", {}, z.object({}));
    try {
      expect(timeout).toHaveBeenCalledWith(15_000);
      expect(requestSignal).toBe(deadline.signal);
      deadline.abort(new Error("deadline exceeded"));
      await expect(request).rejects.toThrow("deadline exceeded");
    } finally {
      timeout.mockRestore();
    }
  });

  it("preserves caller cancellation while adding a deadline", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(jsonRequest(async (_url, init) => {
      init?.signal?.throwIfAborted();
      return Response.json({});
    }, "https://example.com/", { signal: controller.signal }, z.object({}))).rejects.toThrow();
  });
});
