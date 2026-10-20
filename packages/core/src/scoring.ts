import type { PillarScore } from "./report.ts";
import type { CheckResult, Pillar, Severity } from "./types.ts";

const SEVERITY_MULTIPLIER: Record<Severity, number> = {
  critical: 5,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

/**
 * Weighted mean of check scores per pillar. Skipped and errored checks are
 * excluded so missing capabilities don't punish the site.
 */
export function scorePillars(
  results: readonly CheckResult[],
  weights: ReadonlyMap<string, number>,
): { overall: number; pillars: PillarScore[] } {
  const pillars: Pillar[] = ["seo", "aeo", "geo"];
  const out = pillars.map((pillar): PillarScore => {
    const rs = results.filter((r) => r.pillar === pillar);
    let num = 0;
    let den = 0;
    for (const r of rs) {
      if (r.status === "skip" || r.status === "error") continue;
      const w = (weights.get(r.id) ?? 1) * SEVERITY_MULTIPLIER[r.severity];
      num += r.score * w;
      den += w;
    }
    return {
      pillar,
      score: den === 0 ? 0 : Math.round((num / den) * 100),
      passed: rs.filter((r) => r.status === "pass").length,
      warned: rs.filter((r) => r.status === "warn").length,
      failed: rs.filter((r) => r.status === "fail").length,
      skipped: rs.filter((r) => r.status === "skip" || r.status === "error").length,
    };
  });
  const scored = out.filter((p) => p.passed + p.warned + p.failed > 0);
  const overall =
    scored.length === 0 ? 0 : Math.round(scored.reduce((s, p) => s + p.score, 0) / scored.length);
  return { overall, pillars: out };
}
