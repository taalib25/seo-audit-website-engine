/** Small RFC 9309 robots parser. It never fetches files or URLs. */
export interface RobotsRule { directive: "allow" | "disallow"; path: string; line: number }
export interface RobotsGroup { agents: string[]; rules: RobotsRule[] }
export interface RobotsDocument { groups: RobotsGroup[]; sitemaps: string[]; errors: string[] }
export interface RobotsMatch { allowed: boolean; rule?: RobotsRule; groupAgents: string[]; specificity: number }

export function parseRobots(text: string): RobotsDocument {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  const errors: string[] = [];
  let group: RobotsGroup | undefined;
  let sawRule = false;
  for (const [i, raw] of text.replace(/^\uFEFF/, "").split(/\r?\n/).entries()) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 1) { errors.push(`Line ${i + 1}: missing colon`); continue; }
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name === "sitemap") { if (value) sitemaps.push(value); continue; }
    if (name === "user-agent") {
      if (!value) { errors.push(`Line ${i + 1}: empty user-agent`); continue; }
      if (!group || sawRule) { group = { agents: [], rules: [] }; groups.push(group); sawRule = false; }
      group.agents.push(value.toLowerCase()); continue;
    }
    if (name === "allow" || name === "disallow") {
      if (!group) { errors.push(`Line ${i + 1}: rule before user-agent`); continue; }
      if (value) group.rules.push({ directive: name, path: value, line: i + 1 });
      sawRule = true;
    }
  }
  return { groups, sitemaps, errors };
}

function matchesPath(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.split("*").map((s) => s.replace(/[\\^$+?.()|[\]{}]/g, "\\$&")).join(".*");
  return new RegExp(`^${escaped}${anchored ? "$" : ""}`).test(path);
}

export function matchRobots(doc: RobotsDocument, userAgent: string, url: string): RobotsMatch {
  const token = userAgent.toLowerCase();
  let bestSpecificity = -1;
  let groups: RobotsGroup[] = [];
  for (const g of doc.groups) {
    const specificity = Math.max(-1, ...g.agents.map((agent) => agent === "*" ? 0 : token.includes(agent) ? agent.length : -1));
    if (specificity > bestSpecificity) { bestSpecificity = specificity; groups = [g]; }
    else if (specificity >= 0 && specificity === bestSpecificity) groups.push(g);
  }
  const path = `${new URL(url).pathname}${new URL(url).search}`;
  const rules = groups.flatMap((g) => g.rules).filter((r) => matchesPath(r.path, path));
  const length = (r: RobotsRule) => r.path.replace(/[\*$]/g, "").length;
  rules.sort((a, b) => length(b) - length(a) || Number(b.directive === "allow") - Number(a.directive === "allow"));
  const rule = rules[0];
  return { allowed: rule?.directive !== "disallow", ...(rule ? { rule } : {}), groupAgents: groups.flatMap((g) => g.agents), specificity: Math.max(0, bestSpecificity) };
}
