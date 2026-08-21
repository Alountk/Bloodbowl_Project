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
 * the awards/casualty paths use to exclude them (`isJourneymanId`). Names come
 * from the race's name bank, seeded from the team id + index so they are
 * deterministic for the match (reloads never rename a journeyman). Everything
 * here is pure and deterministic so the fixture GET, the live route's actor-side
 * maps and the tests share one source of truth.
 */

import { MIN_PLAYERS } from "@/features/teams/roster";
import { getRaceById } from "@/features/teams/data/races";
import { randomPlayerName } from "@/features/teams/data/playerNames";
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

/** FNV-1a string hash → 32-bit PRNG seed (stable across processes/runtimes). */
function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: a tiny deterministic PRNG yielding floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The deterministic name for a team's n-th journeyman (RAU-13): picked from the
 * race's name bank via `randomPlayerName` — the composed "First Surname" style
 * shared with the create-team wizard — seeded from `${teamId}:${n}` so the SAME
 * name is served on EVERY request of the match (a reload or a second fixture
 * GET never renames a journeyman mid-match). The `usedNames` set (the roster's
 * names + earlier journeymen of the same serve) keeps the pick distinct.
 */
export function journeymanName(
  teamId: string,
  raceId: string,
  n: number,
  usedNames: ReadonlySet<string>,
): string {
  return randomPlayerName(
    raceId,
    new Set(usedNames),
    undefined,
    mulberry32(hashSeed(`${teamId}:${n}`)),
  );
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

/** One persisted journeyman entry on the LiveMatch row (RAU-14): the synthetic
 * id (`journeyman-{teamId}-{n}`, same scheme as the served players) + the
 * deterministic race-bank name persisted at begin. */
export interface PersistedJourneyman {
  id: string;
  name: string;
}

/** The persisted per-side journeymen shape (`LiveMatch.journeymen`). */
export interface PersistedJourneymen {
  home: PersistedJourneyman[];
  away: PersistedJourneyman[];
}

/** The default (empty) persisted shape — no journeymen on either side. */
export function emptyPersistedJourneymen(): PersistedJourneymen {
  return { home: [], away: [] };
}

/**
 * Defensively parses a persisted `LiveMatch.journeymen` JSON value (RAU-14):
 * malformed/foreign shapes collapse to `null` (never crash) so the caller can
 * treat "no persisted journeymen" as absent; a well-formed value always yields
 * both sides' arrays (empty when a side fielded none).
 */
export function parsePersistedJourneymen(value: unknown): PersistedJourneymen | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const side = (candidate: unknown): PersistedJourneyman[] | null => {
    if (!Array.isArray(candidate)) return null;
    const entries: PersistedJourneyman[] = [];
    for (const item of candidate) {
      if (typeof item !== "object" || item === null) return null;
      const entry = item as Record<string, unknown>;
      if (typeof entry.id !== "string" || typeof entry.name !== "string") return null;
      entries.push({ id: entry.id, name: entry.name });
    }
    return entries;
  };
  const home = side(raw.home);
  const away = side(raw.away);
  if (home === null || away === null) return null;
  return { home, away };
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
  // The roster's existing names (plus each journeyman's as it is generated) so
  // a journeyman never shares a name with a roster player or a fellow novato.
  const usedNames = new Set<string>(merged.map((p) => p.name).filter(Boolean));
  for (let n = 1; n <= missing; n++) {
    const name = journeymanName(team.id, team.raceId, n, usedNames);
    usedNames.add(name);
    merged.push({
      rosterPlayerId: journeymanId(team.id, n),
      name,
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
