/**
 * RAU-13: Journeymen (Novatos).
 *
 * When a team starts a match with FEWER than 11 available players (available =
 * alive && !missNextMatch, per RAU-12), the match provides 0-11 journeymen to
 * complete the lineup. Journeymen are linemen of the team's race (the race's
 * core Lineman positional), rookie (0 PE/SPP), no cost, and TEMPORARY for that
 * match only — they are never persisted as `Player` rows and never awarded PE.
 *
 * The synthetic id scheme `journeyman-{teamId}-{n}` doubles as the discriminator
 * the awards/casualty paths use to exclude them (`isJourneymanId`). Everything
 * here is pure and deterministic so the fixture GET, the live route's actor-side
 * maps and the tests share one source of truth.
 */

import { MIN_PLAYERS } from "@/features/teams/roster";
import { getRaceById } from "@/features/teams/data/races";
import type { PlayerEntry, Positional, Race } from "@/features/teams/types";

/** The synthetic id prefix marking a journeyman (never a real roster id). */
export const JOURNEYMAN_PREFIX = "journeyman-";

/** True for a synthetic journeyman id (`journeyman-{teamId}-{n}`). */
export function isJourneymanId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(JOURNEYMAN_PREFIX);
}

/** Builds the deterministic synthetic id for a team's n-th journeyman. */
export function journeymanId(teamId: string, n: number): string {
  return `${JOURNEYMAN_PREFIX}${teamId}-${n}`;
}

/**
 * The race's core Lineman positional — the one Journeymen are drawn from. Most
 * races have a single `role: "Lineman"` 0-16 positional; several have multiple
 * Lineman-role positionals (e.g. human's halfling-hopeful, chaos-renegade's
 * 0-16 renegade-lineman vs max-1 alternates, shambling-undead's skeleton vs
 * zombie lineman). The core is the one with the HIGHEST max (0-16), tie-broken
 * by lowest cost then catalog order. Defensive fallback when no Lineman-role
 * positional exists: the race's cheapest positional.
 */
export function linemanPositionalOf(race: Race | undefined): Positional | undefined {
  if (!race) return undefined;
  const linemen = race.positionals
    .filter((p) => (p.role ?? "").toLowerCase() === "lineman")
    .sort((a, b) => b.max - a.max || a.cost - b.cost);
  if (linemen[0]) return linemen[0];
  return [...race.positionals].sort((a, b) => a.cost - b.cost)[0];
}

/** One served match player: a roster player overlaid by its `Player` row, or a
 * synthetic journeyman. `journeyman` is true ONLY for the match-only novatos. */
export interface ServedPlayer {
  rosterPlayerId: string;
  name: string;
  positionalKey: string;
  pe: number;
  skills: unknown;
  injuries: unknown;
  alive: boolean;
  /** RAU-12: unavailable for this match — a lasting-band casualty of the previous one. */
  missNextMatch: boolean;
  valueBonus: number;
  journeyman: boolean;
}

/** The raw `Player`-row surface the merge overlays (no `journeyman` flag). Only
 * `rosterPlayerId` is required — a caller may select just the availability
 * fields (alive/missNextMatch); the rest fall back to the roster entry / 0. */
export type PlayerRowLike = {
  rosterPlayerId: string;
  name?: string;
  positionalKey?: string;
  pe?: number;
  skills?: unknown;
  injuries?: unknown;
  alive?: boolean;
  missNextMatch?: boolean;
  valueBonus?: number;
};

/** The team surface the merge needs: identity + race + roster JSON + Player rows. */
export interface TeamRosterInput {
  id: string;
  raceId: string;
  roster: unknown;
  players: readonly PlayerRowLike[];
}

/**
 * Serves the team's match players (D21/RAU-9 roster-order merge + Player-row
 * overlay) and, when `includeJourneymen`, appends `11 - available` journeymen
 * to complete the lineup. Roster entries WITHOUT a Player row count as
 * available (alive by default). Journeymen continue the dorsal sequence after
 * the roster (the served array index + 1). When the roster JSON is missing/
 * unparseable, the id-asc Player rows are served first (pre-existing D21
 * fallback) and journeymen still append from the same availability rule.
 */
export function mergeRosterWithJourneymen(
  team: TeamRosterInput,
  opts: { includeJourneymen?: boolean } = {},
): ServedPlayer[] {
  const entries = Array.isArray(team.roster) ? (team.roster as PlayerEntry[]) : [];
  let merged: ServedPlayer[];
  // A missing/unparseable roster cannot define an order: serve the raw rows.
  if (entries.length === 0 && team.players.length > 0) {
    merged = team.players.map((p) => ({
      rosterPlayerId: p.rosterPlayerId,
      name: p.name ?? "",
      positionalKey: p.positionalKey ?? "lineman",
      pe: p.pe ?? 0,
      skills: p.skills ?? [],
      injuries: p.injuries ?? [],
      alive: p.alive ?? true,
      missNextMatch: p.missNextMatch ?? false,
      valueBonus: p.valueBonus ?? 0,
      journeyman: false,
    }));
  } else {
    const rowByRef = new Map(team.players.map((p) => [p.rosterPlayerId, p]));
    merged = entries.map((e) => {
      const row = rowByRef.get(e.id);
      return {
        rosterPlayerId: e.id,
        name: row?.name ?? e.name,
        positionalKey: row?.positionalKey ?? e.positionalKey,
        pe: row?.pe ?? 0,
        skills: row?.skills ?? [],
        injuries: row?.injuries ?? [],
        alive: row?.alive ?? true,
        missNextMatch: row?.missNextMatch ?? false,
        valueBonus: row?.valueBonus ?? 0,
        journeyman: false,
      };
    });
  }
  if ((opts.includeJourneymen ?? true) === false) return merged;

  const available = merged.filter((p) => p.alive && !p.missNextMatch).length;
  const missing = MIN_PLAYERS - available;
  if (missing <= 0) return merged;

  const race = getRaceById(team.raceId);
  const positionalKey = linemanPositionalOf(race)?.key ?? "lineman";
  for (let n = 1; n <= missing; n++) {
    merged.push({
      rosterPlayerId: journeymanId(team.id, n),
      name: `Novato ${n}`,
      positionalKey,
      pe: 0,
      skills: [],
      injuries: [],
      alive: true,
      missNextMatch: false,
      valueBonus: 0,
      journeyman: true,
    });
  }
  return merged;
}
