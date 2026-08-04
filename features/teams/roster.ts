import type { PlayerEntry, Race, Team } from "./types";

export const STARTING_TREASURY = 1_000_000;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 16;

/** @deprecated Use computeRosterCostFromPlayers with PlayerEntry[] instead */
export type Quantities = Record<string, number>;

/** @deprecated Use computeRosterCostFromPlayers instead */
export function computeRosterCost(race: Race, quantities: Quantities): number {
  return race.positionals.reduce(
    (total, positional) =>
      total + (quantities[positional.key] ?? 0) * positional.cost,
    0,
  );
}

/** @deprecated Use countPlayersFromEntries instead */
export function countPlayers(quantities: Quantities): number {
  return Object.values(quantities).reduce((total, quantity) => total + quantity, 0);
}

/** @deprecated Use summarizeRosterFromEntries instead */
export function summarizeRoster(team: Team, races: Race[]): string {
  return summarizeRosterFromEntries(team, races);
}

// --- New PlayerEntry-based helpers ---

export function computeRosterCostFromPlayers(race: Race, players: PlayerEntry[]): number {
  return players.reduce((total, player) => {
    const positional = race.positionals.find((p) => p.key === player.positionalKey);
    return total + (positional?.cost ?? 0);
  }, 0);
}

export function countPlayersFromEntries(players: PlayerEntry[]): number {
  return players.length;
}

export function summarizeRosterFromEntries(team: Team, races: Race[]): string {
  const race = races.find((candidate) => candidate.id === team.raceId);
  const total = team.roster.length;

  if (total === 0) return "0 players";

  // Count by positional key, preserving insertion order
  const counts = new Map<string, number>();
  for (const entry of team.roster) {
    counts.set(entry.positionalKey, (counts.get(entry.positionalKey) ?? 0) + 1);
  }

  const parts: string[] = [];
  for (const [key, count] of counts) {
    const positional = race?.positionals.find((p) => p.key === key);
    parts.push(`${count}x ${positional?.name ?? key}`);
  }

  return `${total} player${total === 1 ? "" : "s"}${parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}`;
}
