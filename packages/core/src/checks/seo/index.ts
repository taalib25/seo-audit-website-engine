import { onPageChecks } from "./on-page.ts";
import { linkChecks } from "./links.ts";
import { mediaChecks } from "./media.ts";
export const seoChecks = [...onPageChecks, ...linkChecks, ...mediaChecks];
