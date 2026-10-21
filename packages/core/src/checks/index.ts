import type { Check } from "../check.ts";
import { CheckRegistry } from "../registry.ts";
import { aeoChecks } from "./aeo/index.ts";
import { geoChecks } from "./geo/index.ts";
import { schemaChecks } from "./schema/index.ts";
import { seoChecks } from "./seo/index.ts";
import { siteChecks } from "./site/index.ts";
import { technicalChecks } from "./technical/index.ts";

/** Every built-in deterministic check. LLM and integration checks live in their own packages. */
export const builtinChecks: readonly Check[] = [
  ...technicalChecks,
  ...seoChecks,
  ...aeoChecks,
  ...siteChecks,
  ...schemaChecks,
  ...geoChecks,
];

export function createDefaultRegistry(extra: readonly Check[] = []): CheckRegistry {
  return new CheckRegistry().register(...builtinChecks, ...extra);
}
