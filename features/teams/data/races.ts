import type { Race } from "../types";
import catalog from "./races.catalog.json";

export const RACES: Race[] = catalog as Race[];

export function getRaceById(id: string): Race | undefined {
  return RACES.find((race) => race.id === id);
}

/** BB2025 ruleset version marker. */
export const RULES_METADATA = { version: "BB2025" } as const;

export { validateRaceCatalog } from "./validateRaceCatalog";
