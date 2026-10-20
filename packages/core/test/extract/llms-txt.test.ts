import { describe, expect, it } from "vitest";
import { draftLlmsTxt, parseLlmsTxt } from "../../src/extract/llms-txt.ts";
import { fixture } from "../helpers.ts";

describe("parseLlmsTxt", () => {
  it("parses a conventional file", () => {
    const parsed = parseLlmsTxt(fixture("geo/llms-valid.txt"));
    expect(parsed.valid).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(parsed.title).toBe("Acme Robotics");
    expect(parsed.summary).toBe("Warehouse robot grippers, documented.");
    expect(parsed.sections.map((section) => section.title)).toEqual(["Documentation", "Optional"]);
    expect(parsed.links).toHaveLength(3);
    expect(parsed.links[0]?.note).toBe("Install guide.");
  });

  it("requires an H1 title", () => {
    const parsed = parseLlmsTxt(fixture("geo/llms-invalid.txt"));
    expect(parsed.hasH1).toBe(false);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors[0]).toMatch(/H1/i);
  });

  it("warns about relative links without failing", () => {
    const parsed = parseLlmsTxt(fixture("geo/llms-warn.txt"));
    expect(parsed.valid).toBe(true);
    expect(parsed.links[0]?.absolute).toBe(false);
    expect(parsed.warnings.join(" ")).toMatch(/absolute/i);
  });

  it("treats H2 before the H1 as an error", () => {
    const parsed = parseLlmsTxt("## Docs\n\n- [A](https://example.com/a)\n\n# Title\n");
    expect(parsed.hasH1).toBe(true);
    expect(parsed.valid).toBe(false);
  });
});

describe("draftLlmsTxt", () => {
  it("uses real page data and marks unknown fields", () => {
    const draft = draftLlmsTxt({
      origin: "https://example.com",
      pages: [
        { url: "https://example.com/docs/start", title: "Getting started", description: "Install the gripper." },
        { url: "https://example.com/blog/post", title: "Blog post" },
      ],
    });
    expect(draft.startsWith("# REPLACE_WITH_SITE_NAME")).toBe(true);
    expect(draft).toContain("## Documentation");
    expect(draft).toContain("- [Getting started](https://example.com/docs/start): Install the gripper.");
    expect(draft).toContain("## Optional");
    expect(parseLlmsTxt(draft).valid).toBe(true);
  });
});
