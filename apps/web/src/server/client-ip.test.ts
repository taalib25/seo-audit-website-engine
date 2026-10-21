import { describe, expect, it } from "vitest";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { ClientIdentity, GLOBAL_CLIENT_KEY, clientIp } from "./client-ip";

describe("client identity", () => {
  it("keys the bucket by the direct peer address when forwarding is not trusted", () => {
    const identity = new ClientIdentity(() => "203.0.113.7");
    const request = new Request("https://audit.test/", { headers: { "x-forwarded-for": "8.8.8.8" } });
    expect(identity.ip(request, false)).toBe("203.0.113.7");
  });

  it("uses the forwarded address only when the proxy is trusted", () => {
    const identity = new ClientIdentity(() => "203.0.113.7");
    const request = new Request("https://audit.test/", { headers: { "x-forwarded-for": "8.8.8.8, 1.1.1.1" } });
    expect(identity.ip(request, true)).toBe("8.8.8.8");
    expect(identity.ip(request, false)).toBe("203.0.113.7");
  });

  it("ignores a forwarded address that is not an IP", () => {
    const identity = new ClientIdentity(() => "203.0.113.7");
    const request = new Request("https://audit.test/", { headers: { "x-forwarded-for": "invented-client" } });
    expect(identity.ip(request, true)).toBe("203.0.113.7");
  });

  it("falls back to a shared bucket and warns once when the peer address is unavailable", () => {
    const warnings: string[] = [];
    const identity = new ClientIdentity(() => undefined, (message) => warnings.push(message));
    expect(identity.ip(new Request("https://audit.test/"), false)).toBe(GLOBAL_CLIENT_KEY);
    expect(identity.ip(new Request("https://audit.test/"), false)).toBe(GLOBAL_CLIENT_KEY);
    expect(warnings).toHaveLength(1);
  });

  it("gives every visitor a distinct bucket when the peer address is known", () => {
    let address: string | undefined = "203.0.113.7";
    const identity = new ClientIdentity(() => address);
    expect(identity.ip(new Request("https://audit.test/"), false)).toBe("203.0.113.7");
    address = "198.51.100.4";
    expect(identity.ip(new Request("https://audit.test/"), false)).toBe("198.51.100.4");
  });

  it("captures the socket peer address of a real request instead of sharing one bucket", async () => {
    const server = createServer((incoming, response) => {
      const request = new Request(`http://${incoming.headers.host ?? "localhost"}/`, { headers: { "x-forwarded-for": "1.2.3.4" } });
      response.end(JSON.stringify({ ip: clientIp(request, false) }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const port = (server.address() as AddressInfo).port;
      const response = await fetch(`http://127.0.0.1:${port}/`);
      const body = await response.json() as { ip: string };
      expect(body.ip).not.toBe(GLOBAL_CLIENT_KEY);
      expect(body.ip).toMatch(/127\.0\.0\.1/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
