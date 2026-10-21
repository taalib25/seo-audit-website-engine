import { faqChecks } from "./faq.ts";
import { freshnessChecks } from "./freshness.ts";
import { structureChecks } from "./structure.ts";

export const aeoChecks = [...structureChecks, ...faqChecks, ...freshnessChecks];

export { faqChecks, faqGoogleEligibility, faqVisible } from "./faq.ts";
export { freshnessChecks, freshnessSignal } from "./freshness.ts";
export {
  answerFirstLength,
  paragraphReadability,
  questionHeadings,
  structuredContent,
  structureChecks,
  summaryNearTop,
  visibleContentParity,
} from "./structure.ts";
