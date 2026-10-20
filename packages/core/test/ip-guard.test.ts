import { describe, expect, it } from "vitest";
import { assertSafeUrl, isPublicAddress } from "../src/index.ts";

describe("SSRF guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.1.1", "::1", "::ffff:127.0.0.1", "fd00::1", "0.0.0.0"])(
    "blocks %s",
    (ip) => expect(isPublicAddress(ip)).toBe(false),
  );
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isPublicAddress(ip)).toBe(true));
  it.each(["file:///etc/passwd", "http://localhost/", "http://user:pw@example.com/", "http://example.com:6379/", "gopher://x"])(
    "rejects %s",
    (u) => expect(() => assertSafeUrl(u)).toThrow(),
  );
});
