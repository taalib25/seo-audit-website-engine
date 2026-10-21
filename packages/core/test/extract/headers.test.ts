import { describe, expect, it } from "vitest";
import { directiveTokens, header } from "../../src/extract/headers.ts";

describe("header helpers", () => {
  it("looks up names without case sensitivity", () => {
    expect(header({ "Strict-Transport-Security": "max-age=1" }, "strict-transport-security")).toBe("max-age=1");
    expect(header({}, "content-security-policy")).toBeUndefined();
  });
  it("splits comma and semicolon separated directive lists", () => {
    expect(directiveTokens("noindex, nofollow; max-snippet:10")).toEqual(["noindex", "nofollow", "max-snippet:10"]);
  });
});
