import { describe, expect, it } from "vitest";
import { createDefaultRegistry, runAudit } from "../src/index.ts";
import { page, site } from "./helpers.ts";

describe("runAudit", () => {
  it("produces a scored report and skips checks with missing capabilities", async () => {
    const report = await runAudit(site([page("<html><head><title>Acme widgets store</title></head></html>")]), createDefaultRegistry());
    expect(report.results.find((r) => r.id === "seo.title.length")?.status).toBe("warn");
    expect(report.scores.pillars.find((p) => p.pillar === "seo")?.score).toBeGreaterThan(0);
  });
});
