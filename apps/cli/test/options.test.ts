import { test } from "node:test";
import assert from "node:assert/strict";
import { AuditFlags, defaultVerificationPages, estimateProbeSpend, verificationPassed } from "../src/options.ts";

test("verification rejects skipped, missing, failed, and empty results", () => {
  assert.equal(verificationPassed(["a"], [{ id: "a", status: "pass" }]), true);
  assert.equal(verificationPassed(["a"], [{ id: "a", status: "skip" }]), false);
  assert.equal(verificationPassed(["a", "b"], [{ id: "a", status: "pass" }]), false);
  assert.equal(verificationPassed(["a"], [{ id: "a", status: "pass" }, { id: "a", status: "fail" }]), false);
  assert.equal(verificationPassed(["a"], []), false);
  assert.equal(verificationPassed([], []), false);
});

test("site checks use enough pages while page checks stay scoped", () => {
  assert.equal(defaultVerificationPages([{ scope: "page" }]), 1);
  assert.equal(defaultVerificationPages([{ scope: "site" }]), 20);
  assert.equal(defaultVerificationPages([{ scope: "page" }, { scope: "site" }]), 20);
});

test("spend estimate includes per-query sample overrides and rejects invalid config", () => {
  assert.equal(estimateProbeSpend({ PROBE_QUERIES: JSON.stringify([{ query: "one", model: "m", samples: 10 }, { query: "two", model: "m" }]), PROBE_SAMPLES: "2", PROBE_COST_PER_SAMPLE_USD: "0.1" }), 1.2);
  assert.throws(() => estimateProbeSpend({ PROBE_QUERIES: "[]" }));
  assert.throws(() => estimateProbeSpend({ PROBE_QUERIES: "invalid" }));
  assert.throws(() => estimateProbeSpend({ PROBE_SAMPLES: "Infinity" }));
});

test("audit and verify reject invalid page/render flags before starting work", () => {
  assert.deepEqual(AuditFlags.parse({ pages: "20", render: "auto" }), { pages: 20, render: "auto" });
  for (const pages of ["Infinity", "NaN", "0", "1.5"]) assert.equal(AuditFlags.safeParse({ pages, render: "auto" }).success, false);
  assert.equal(AuditFlags.safeParse({ pages: 1, render: "bad" }).success, false);
  assert.equal(AuditFlags.safeParse({ pages: 1, render: "auto", renderer: "bad" }).success, false);
});
