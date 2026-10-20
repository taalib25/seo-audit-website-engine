import { describe, expect, it } from "vitest";
import { aeoChecks } from "../../../src/checks/aeo/index.ts";
import { fixture, page, runPage } from "../../helpers.ts";

describe("deterministic AEO checks", () => {
  it("runs all checks with an initial-HTML content fixture", async () => {
    const p = page(fixture("content/structured.html"), { renderedHtml: fixture("content/structured.html") });
    const results = await Promise.all(aeoChecks.map((c) => runPage(c, p)));
    expect(results).toHaveLength(aeoChecks.length);
    expect(results.every((r) => r && typeof r.message === "string")).toBe(true);
  });
  it("handles empty content as an edge case", async () => {
    const results = await Promise.all(aeoChecks.map((c) => runPage(c, page("<html><head></head><body></body></html>"))));
    expect(results).toHaveLength(aeoChecks.length);
  });
});
