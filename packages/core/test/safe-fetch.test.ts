import http from "node:http";
import { describe, expect, it, vi } from "vitest";
import { safeFetch } from "../src/net/safe-fetch.ts";

async function withServer(handler: http.RequestListener, run: (origin: string) => Promise<void>) {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing local test server port");
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

describe("safeFetch absolute deadline", () => {
  it("shares the decoded byte budget across redirect bodies", async () => {
    await withServer((request, response) => {
      if (request.url === "/start") { response.writeHead(302, { location: "/end" }); response.end("1234"); }
      else response.end("abcdefgh");
    }, async (origin) => {
      const response = await safeFetch(`${origin}/start`, { allowPrivate: true, maxBytes: 10, includeBodyBytes: true });
      expect(response.bytesRead).toBe(10);
      expect(response.body).toBe("abcdef");
      expect(response.bodyBytes).toEqual(Buffer.from("abcdef"));
      expect(response.truncated).toBe(true);
    });
  });

  it("does not follow redirects after their bodies exhaust the byte budget", async () => {
    const paths: string[] = [];
    await withServer((request, response) => {
      paths.push(request.url ?? "");
      response.writeHead(302, { location: "/next" });
      response.end("1234");
    }, async (origin) => {
      await expect(safeFetch(origin, { allowPrivate: true, maxBytes: 4 })).rejects.toThrow("Response byte limit reached");
      expect(paths).toEqual(["/"]);
    });
  });

  it("stops a body that keeps sending data before each inactivity timeout", async () => {
    let chunks = 0;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await withServer((_request, response) => {
        response.writeHead(200);
        response.write("first");
        const interval = setInterval(() => {
          chunks++;
          response.write("more");
          if (chunks === 3) vi.advanceTimersByTime(5000);
        }, 20);
        response.on("close", () => clearInterval(interval));
      }, async (origin) => {
        await expect(safeFetch(origin, { allowPrivate: true, timeoutMs: 5000 })).rejects.toThrow("Timed out after 5000ms");
        expect(chunks).toBeGreaterThanOrEqual(3);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps one deadline across redirect responses", async () => {
    let requests = 0;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await withServer((_request, response) => {
        requests++;
        if (requests === 1) {
          vi.advanceTimersByTime(3000);
          response.writeHead(302, { location: "/destination" });
          response.end();
        } else {
          vi.advanceTimersByTime(2000);
          response.end("complete");
        }
      }, async (origin) => {
        await expect(safeFetch(origin, { allowPrivate: true, timeoutMs: 5000 })).rejects.toThrow("Timed out after 5000ms");
        expect(requests).toBe(2);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves caller cancellation and its reason during a body read", async () => {
    const controller = new AbortController();
    const reason = new Error("cancelled by caller");
    await withServer((_request, response) => {
      response.write("first");
      controller.abort(reason);
    }, async (origin) => {
      await expect(safeFetch(origin, { allowPrivate: true, timeoutMs: 5000, signal: controller.signal })).rejects.toBe(reason);
    });
  });

  it("returns successful responses before the deadline", async () => {
    await withServer((_request, response) => response.end("complete"), async (origin) => {
      expect((await safeFetch(origin, { allowPrivate: true, timeoutMs: 5000 })).body).toBe("complete");
    });
  });
});
