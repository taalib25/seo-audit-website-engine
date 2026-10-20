import { CheckRegistry } from "../registry.ts";
import { onPageChecks } from "./seo/on-page.ts";

/** Every built-in check. Add new check arrays here. */
export const builtinChecks = [...onPageChecks];

export function createDefaultRegistry(): CheckRegistry {
  return new CheckRegistry().register(...builtinChecks);
}
