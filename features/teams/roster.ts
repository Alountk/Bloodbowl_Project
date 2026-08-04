import type { Race, Team } from "./types";

export const STARTING_TREASURY = 1_000_000;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 16;

export type Quantities = Record<string, number>;

export function computeRosterCost(race: Race, quantities: Quantities): number {
  return race.positionals.reduce(
    (total, positional) =>
      total + (quantities[positional.key] ?? 0) * positional.cost,
    0,
  );
}

export function countPlayers(quantities: Quantities): number {
  return Object.values(quantities).reduce((total, quantity) => total + quantity, 0);
}

export function summarizeRoster(team: Team, races: Race[]): string {
  const race = races.find((candidate) => candidate.id === team.raceId);
  const total = team.roster.reduce((sum, entry) => sum + entry.quantity, 0);
  const parts = team.roster.map((entry) => {
    const positional = race?.positionals.find(
      (candidate) => candidate.key === entry.positionalKey,
    );
    return `${entry.quantity}x ${positional?.name ?? entry.positionalKey}`;
  });
  return `${total} players${parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}`;
}
