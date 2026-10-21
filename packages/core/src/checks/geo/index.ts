export { agentViewChecks, geoAgentViewCoverage } from "./agent-view.ts";
export { citationChecks, geoCitations } from "./citations.ts";
export {
  entityAboutContact,
  entityAuthorIdentification,
  entityChecks,
  entityContactConsistency,
  entityNameConsistency,
  entitySameAs,
} from "./entity.ts";
export { llmsTxtAvailable, llmsTxtChecks, llmsTxtFormat } from "./llms-txt.ts";

import { agentViewChecks } from "./agent-view.ts";
import { citationChecks } from "./citations.ts";
import { entityChecks } from "./entity.ts";
import { llmsTxtChecks } from "./llms-txt.ts";

export const geoChecks = [...entityChecks, ...llmsTxtChecks, ...citationChecks, ...agentViewChecks];
