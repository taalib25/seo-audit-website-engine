import type { CheerioAPI } from "cheerio";
import { definePageCheck, fail, pass, warn } from "../../check.ts";

function pageDates($: CheerioAPI): { visible: string[]; modified: string[] } {
  const visible = $("time[datetime]").map((_, element) => $(element).attr("datetime") ?? "").get();
  const modified: string[] = [];
  $("script[type='application/ld+json']").each((_, element) => {
    try {
      const parsed: unknown = JSON.parse($(element).text());
      collectModifiedDates(parsed, modified);
    } catch {
      // Invalid JSON-LD cannot be verified by this check.
    }
  });
  return { visible: visible.slice(0, 10), modified: modified.slice(0, 10) };
}

function collectModifiedDates(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item) => collectModifiedDates(item, output));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = value as Record<string, unknown>;
  if (typeof record["dateModified"] === "string") output.push(record["dateModified"]);
  for (const child of Object.values(record)) collectModifiedDates(child, output);
}

function validDates(values: string[]): string[] {
  return values.filter((value) => Number.isFinite(Date.parse(value)));
}

export const freshnessSignal = definePageCheck({
  id: "aeo.content.freshness-signal",
  title: "Dates are valid and internally consistent",
  pillar: "aeo",
  category: "content",
  kind: "deterministic",
  severity: "medium",
  weight: 2,
  requires: ["raw-html"],
  rationale: "Freshness cues should be accurate and internally consistent.",
  run: ({ raw, dom }) => {
    const rawDates = pageDates(raw());
    const renderedDates = pageDates(dom());
    const visible = validDates(renderedDates.visible);
    const modified = validDates(renderedDates.modified);
    const evidence = { raw: rawDates, dom: renderedDates, validVisible: visible, validModified: modified };
    const fix = { summary: "Use valid visible dates and keep dateModified aligned with the displayed update date." };
    if (renderedDates.visible.some((value) => !Number.isFinite(Date.parse(value))) || renderedDates.modified.some((value) => !Number.isFinite(Date.parse(value)))) {
      return fail("A visible or structured date is invalid.", { evidence, fix });
    }
    if (visible.length && modified.length && Math.abs(Date.parse(visible[0] ?? "") - Date.parse(modified[0] ?? "")) > 86_400_000) {
      return fail("Visible and structured modification dates differ by more than one day.", { evidence, fix });
    }
    if (!visible.length || !modified.length) return warn("Visible date or dateModified is absent.", { evidence, fix });
    return pass("Visible and structured dates are present and consistent.", { evidence });
  },
});

export const freshnessChecks = [freshnessSignal];
