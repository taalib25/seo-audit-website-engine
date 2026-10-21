import { describe, expect, it } from "vitest";
import { assertSafeUrl, isPublicAddress, safeFetch, UnsafeUrlError } from "../src/index.ts";

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
  it.each([
    "http://127.0.0.1:8080/", "http://10.1.2.3/", "http://169.254.169.254/",
    "http://192.168.1.1/", "http://0.0.0.0/", "http://2130706433/",
    "http://0x7f000001/", "http://127.1/", "http://[::1]/",
    "http://[::ffff:127.0.0.1]/", "http://[::ffff:7f00:1]/", "http://[fd00::1]/",
  ])("rejects non-public IP URLs before connecting: %s", async (url) => {
    expect(() => assertSafeUrl(url)).toThrow(UnsafeUrlError);
    await expect(safeFetch(url)).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it.each(["https://8.8.8.8/", "https://[2606:4700:4700::1111]/"])(
    "allows public IP URL %s",
    (url) => expect(assertSafeUrl(url).href).toBe(url),
  );
});
