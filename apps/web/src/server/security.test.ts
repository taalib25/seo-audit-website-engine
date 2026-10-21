import { describe, expect, it } from "vitest";
import { boundedJson, clientIp, RequestBodyTooLargeError } from "./security";

describe("client identity", () => {
  it("ignores caller-supplied forwarding headers without a trusted proxy", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1"]) expect(clientIp(new Request("https://audit.test/", { headers: { "x-forwarded-for": ip } }), false)).toBe("unknown");
  });
  it("accepts only an IP address when forwarding is explicitly trusted", () => {
    expect(clientIp(new Request("https://audit.test/", { headers: { "x-forwarded-for": "8.8.8.8, 1.1.1.1" } }), true)).toBe("8.8.8.8");
    expect(clientIp(new Request("https://audit.test/", { headers: { "x-forwarded-for": "invented-client" } }), true)).toBe("unknown");
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
