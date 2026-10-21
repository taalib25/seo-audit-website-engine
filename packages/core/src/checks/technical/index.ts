import type { PageCheck, SiteCheck } from "../../check.ts";
import { crawlChecks } from "./crawl.ts";
import { aiAccessChecks } from "./ai-access.ts";
import { securityChecks, mixedContent } from "./security.ts";
import { internationalChecks } from "./intl.ts";
import { performanceChecks } from "./perf.ts";

export const technicalChecks: (PageCheck | SiteCheck)[] = [
  ...crawlChecks,
  ...aiAccessChecks,
  ...securityChecks,
  mixedContent,
  ...internationalChecks,
  ...performanceChecks,
];

export * from "./crawl.ts";
export * from "./ai-access.ts";
export * from "./security.ts";
export * from "./intl.ts";
export * from "./perf.ts";
