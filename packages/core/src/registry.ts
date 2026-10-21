import type { Check } from "./check.ts";
import type { Pillar } from "./types.ts";

export class CheckRegistry {
  readonly #checks = new Map<string, Check>();

  register(...checks: readonly Check[]): this {
    for (const check of checks) {
      if (this.#checks.has(check.id)) throw new Error(`Duplicate check id: ${check.id}`);
      if (!/^(seo|aeo|geo)\.[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(check.id)) {
        throw new Error(`Invalid check id "${check.id}": expected "<pillar>.<segment>[.<segment>]"`);
      }
      if (!check.id.startsWith(`${check.pillar}.`)) {
        throw new Error(`Check id "${check.id}" does not match pillar "${check.pillar}"`);
      }
      this.#checks.set(check.id, check);
    }
    return this;
  }

  get(id: string): Check | undefined {
    return this.#checks.get(id);
  }

  list(filter: { ids?: readonly string[]; pillars?: readonly Pillar[] } = {}): Check[] {
    const ids = filter.ids ? new Set(filter.ids) : undefined;
    const pillars = filter.pillars ? new Set(filter.pillars) : undefined;
    return [...this.#checks.values()].filter(
      (c) => (!ids || ids.has(c.id)) && (!pillars || pillars.has(c.pillar)),
    );
  }
}
