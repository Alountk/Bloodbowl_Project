import { RACES } from "@/features/teams/data/races";

/**
 * RAU-52 shared ruleset domain logic: pure validation over the 31-race catalog
 * and the DTO serializer. Used by the `/api/dev/rulesets` routes, the client
 * API wrapper and their unit tests. The developer-only guard lives in
 * `lib/devGuard.ts` (DB + auth dependent) so this module stays pure and
 * trivially unit-testable.
 */

/** The accepted hire/fire windows ("entre jornadas" / "libre" in the UI). */
export const RULESET_HIRE_FIRE = ["between-jornadas", "libre"] as const;
export type RulesetHireFire = (typeof RULESET_HIRE_FIRE)[number];

/** The full 31-race catalog ids — a ruleset's `races` must be a subset. */
export const RULESET_RACE_IDS: readonly string[] = RACES.map((race) => race.id);

/** A ruleset's full validated shape (POST body / DB row input). */
export interface RulesetInput {
  name: string;
  description: string | null;
  races: string[];
  startingTreasury: number;
  tvCap: number | null;
  minPlayers: number;
  maxPlayers: number;
  hireFire: RulesetHireFire;
  seasonReform: boolean;
  mercenaries: boolean;
  active: boolean;
}

/** The ruleset as served to the client (races Json normalized to string[]). */
export interface RulesetDto {
  id: string;
  name: string;
  description: string | null;
  races: string[];
  startingTreasury: number;
  tvCap: number | null;
  minPlayers: number;
  maxPlayers: number;
  hireFire: string;
  seasonReform: boolean;
  mercenaries: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A raw Prisma Ruleset row (races is a Json column). */
export interface RulesetRow {
  id: string;
  name: string;
  description: string | null;
  races: unknown;
  startingTreasury: number;
  tvCap: number | null;
  minPlayers: number;
  maxPlayers: number;
  hireFire: string;
  seasonReform: boolean;
  mercenaries: boolean;
  active: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

const MAX_GOLD = 10_000_000;

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isPositiveGold(value: unknown): value is number {
  return isInteger(value) && value > 0 && value <= MAX_GOLD;
}

function isRaceIds(value: unknown, raceIds: readonly string[]): value is string[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") return false;
    if (seen.has(entry)) return false;
    seen.add(entry);
    if (!raceIds.includes(entry)) return false;
  }
  return true;
}

function isPlayers(value: unknown): value is number {
  return isInteger(value) && value >= 1 && value <= 16;
}

const KNOWN_KEYS = [
  "name",
  "description",
  "races",
  "startingTreasury",
  "tvCap",
  "minPlayers",
  "maxPlayers",
  "hireFire",
  "seasonReform",
  "mercenaries",
  "active",
] as const;

/** Rejects a payload carrying keys the API does not own (defense in depth). */
function unknownKeysOf(body: Record<string, unknown>): string[] {
  return Object.keys(body).filter((key) => !(KNOWN_KEYS as readonly string[]).includes(key));
}

/**
 * Validates a FULL ruleset body (POST and the wizard's save). Returns the
 * normalized validated value or a `{ ok: false, error }` result. Rules: name
 * non-empty trimmed; races a non-empty unique subset of the catalog; treasury
 * integer 1..10M; tvCap null or integer 1..10M; players integers 1..16 with
 * min ≤ max; hireFire one of the accepted windows; the three toggles booleans.
 */
export function validateRulesetBody(
  body: unknown,
  raceIds: readonly string[] = RULESET_RACE_IDS,
): { ok: true; value: RulesetInput } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Invalid body" };
  }
  const record = body as Record<string, unknown>;
  const unknownKeys = unknownKeysOf(record);
  if (unknownKeys.length > 0) {
    return { ok: false, error: `Unknown field: ${unknownKeys[0]}` };
  }

  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) return { ok: false, error: "name is required" };

  const description =
    typeof record.description === "string" ? record.description.trim() || null : null;

  if (!isRaceIds(record.races, raceIds)) {
    return { ok: false, error: "races must be a non-empty list of valid race ids" };
  }

  if (!isPositiveGold(record.startingTreasury)) {
    return { ok: false, error: "startingTreasury must be a positive amount" };
  }

  let tvCap: number | null = null;
  if (record.tvCap !== undefined && record.tvCap !== null) {
    if (!isPositiveGold(record.tvCap)) {
      return { ok: false, error: "tvCap must be null or a positive amount" };
    }
    tvCap = record.tvCap;
  }

  if (!isPlayers(record.minPlayers) || !isPlayers(record.maxPlayers)) {
    return { ok: false, error: "players must be integers between 1 and 16" };
  }
  const minPlayers = record.minPlayers;
  const maxPlayers = record.maxPlayers;
  if (minPlayers > maxPlayers) {
    return { ok: false, error: "minPlayers cannot exceed maxPlayers" };
  }

  if (
    typeof record.hireFire !== "string" ||
    !(RULESET_HIRE_FIRE as readonly string[]).includes(record.hireFire)
  ) {
    return { ok: false, error: "hireFire must be between-jornadas or libre" };
  }
  const hireFire = record.hireFire as RulesetHireFire;

  for (const key of ["seasonReform", "mercenaries", "active"] as const) {
    if (typeof record[key] !== "boolean") {
      return { ok: false, error: `${key} must be a boolean` };
    }
  }
  // Each toggle was type-checked in the loop above; the casts are safe.
  const seasonReform = record.seasonReform as boolean;
  const mercenaries = record.mercenaries as boolean;
  const active = record.active as boolean;

  return {
    ok: true,
    value: {
      name,
      description,
      races: record.races,
      startingTreasury: record.startingTreasury,
      tvCap,
      minPlayers,
      maxPlayers,
      hireFire,
      seasonReform,
      mercenaries,
      active,
    },
  };
}

/**
 * Validates a PARTIAL ruleset body (PATCH). Only the provided keys are
 * validated (each against the same rules as POST); unknown keys reject. The
 * result carries exactly the provided, validated keys so the caller merges
 * them onto the stored row. `races`, when provided, must be a complete valid
 * list (the wizard always sends the full set).
 */
export function validateRulesetPatch(
  body: unknown,
  raceIds: readonly string[] = RULESET_RACE_IDS,
): { ok: true; value: Partial<RulesetInput> } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Invalid body" };
  }
  const record = body as Record<string, unknown>;
  const unknownKeys = unknownKeysOf(record);
  if (unknownKeys.length > 0) {
    return { ok: false, error: `Unknown field: ${unknownKeys[0]}` };
  }
  if (Object.keys(record).length === 0) {
    return { ok: false, error: "At least one field is required" };
  }

  const patch: Partial<RulesetInput> = {};

  if (record.name !== undefined) {
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) return { ok: false, error: "name is required" };
    patch.name = name;
  }

  if (record.description !== undefined) {
    patch.description = typeof record.description === "string" ? record.description.trim() || null : null;
  }

  if (record.races !== undefined) {
    if (!isRaceIds(record.races, raceIds)) {
      return { ok: false, error: "races must be a non-empty list of valid race ids" };
    }
    patch.races = record.races;
  }

  if (record.startingTreasury !== undefined) {
    if (!isPositiveGold(record.startingTreasury)) {
      return { ok: false, error: "startingTreasury must be a positive amount" };
    }
    patch.startingTreasury = record.startingTreasury;
  }

  if (record.tvCap !== undefined) {
    if (record.tvCap === null) {
      patch.tvCap = null;
    } else if (isPositiveGold(record.tvCap)) {
      patch.tvCap = record.tvCap;
    } else {
      return { ok: false, error: "tvCap must be null or a positive amount" };
    }
  }

  if (record.minPlayers !== undefined) {
    if (!isPlayers(record.minPlayers)) {
      return { ok: false, error: "players must be integers between 1 and 16" };
    }
    patch.minPlayers = record.minPlayers;
  }

  if (record.maxPlayers !== undefined) {
    if (!isPlayers(record.maxPlayers)) {
      return { ok: false, error: "players must be integers between 1 and 16" };
    }
    patch.maxPlayers = record.maxPlayers;
  }

  if (patch.minPlayers !== undefined && patch.maxPlayers !== undefined && patch.minPlayers > patch.maxPlayers) {
    return { ok: false, error: "minPlayers cannot exceed maxPlayers" };
  }

  if (record.hireFire !== undefined) {
    if (
      typeof record.hireFire !== "string" ||
      !(RULESET_HIRE_FIRE as readonly string[]).includes(record.hireFire)
    ) {
      return { ok: false, error: "hireFire must be between-jornadas or libre" };
    }
    patch.hireFire = record.hireFire as RulesetHireFire;
  }

  for (const key of ["seasonReform", "mercenaries", "active"] as const) {
    if (record[key] !== undefined) {
      if (typeof record[key] !== "boolean") {
        return { ok: false, error: `${key} must be a boolean` };
      }
      patch[key] = record[key];
    }
  }

  return { ok: true, value: patch };
}

/**
 * Serializes a raw Prisma Ruleset row into the client DTO: the Json `races`
 * column is normalized to a `string[]`, dates to ISO strings. `hireFire` is
 * passed through verbatim (the column is a plain string; validation guarantees
 * it is one of the accepted windows on write).
 */
export function rulesetToDto(ruleset: RulesetRow): RulesetDto {
  return {
    id: ruleset.id,
    name: ruleset.name,
    description: ruleset.description,
    races: Array.isArray(ruleset.races) ? ruleset.races.map((entry) => String(entry)) : [],
    startingTreasury: ruleset.startingTreasury,
    tvCap: ruleset.tvCap,
    minPlayers: ruleset.minPlayers,
    maxPlayers: ruleset.maxPlayers,
    hireFire: ruleset.hireFire,
    seasonReform: ruleset.seasonReform,
    mercenaries: ruleset.mercenaries,
     active: ruleset.active,
    createdAt: new Date(ruleset.createdAt).toISOString(),
    updatedAt: new Date(ruleset.updatedAt).toISOString(),
  };
}

