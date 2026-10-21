import { describe, expect, it } from "vitest";
import { boundedJson, RequestBodyTooLargeError } from "./security";
import { ClientIdentity, GLOBAL_CLIENT_KEY } from "./client-ip";

describe("client identity", () => {
  it("ignores caller-supplied forwarding headers without a trusted proxy", () => {
    const identity = new ClientIdentity(() => "203.0.113.7");
    for (const ip of ["8.8.8.8", "1.1.1.1"]) expect(identity.ip(new Request("https://audit.test/", { headers: { "x-forwarded-for": ip } }), false)).toBe("203.0.113.7");
  });
  it("accepts only an IP address when forwarding is explicitly trusted", () => {
    const identity = new ClientIdentity(() => "203.0.113.7");
    expect(identity.ip(new Request("https://audit.test/", { headers: { "x-forwarded-for": "8.8.8.8, 1.1.1.1" } }), true)).toBe("8.8.8.8");
    expect(identity.ip(new Request("https://audit.test/", { headers: { "x-forwarded-for": "invented-client" } }), true)).toBe("203.0.113.7");
  });
  it("shares one bucket and warns once when no peer address is available", () => {
    const warnings: string[] = [];
    const identity = new ClientIdentity(() => undefined, (message) => warnings.push(message));
    expect(identity.ip(new Request("https://audit.test/"), false)).toBe(GLOBAL_CLIENT_KEY);
    expect(identity.ip(new Request("https://audit.test/"), false)).toBe(GLOBAL_CLIENT_KEY);
    expect(warnings).toHaveLength(1);
  });
});

describe("bounded audit request bodies", () => {
  it("accepts a small JSON request", async () => {
    expect(await boundedJson(new Request("https://audit.test/", { method: "POST", body: JSON.stringify({ url: "https://example.test" }) }))).toEqual({ url: "https://example.test" });
  });
  it("rejects actual bytes when a request omits its content length", async () => {
    await expect(boundedJson(new Request("https://audit.test/", { method: "POST", body: JSON.stringify({ value: "x".repeat(8192) }) }))).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
  it("rejects an oversized declared content length before parsing", async () => {
    await expect(boundedJson(new Request("https://audit.test/", { method: "POST", headers: { "content-length": "99999" }, body: "{}" }))).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});
