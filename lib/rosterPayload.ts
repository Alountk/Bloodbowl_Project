import type { PlayerEntry } from "@/features/teams/types";

/**
 * Server-side roster payload validation for team create (security-hardening
 * slice E). The client already drafts well-formed entries, but a direct POST
 * can ship arbitrary JSON — this bounds every field and the whole blob before
 * anything is persisted.
 *
 * Shared caps:
 * - entry `id`: non-empty string ≤ 64 (createId / cuid-scale).
 * - entry `name`: non-empty after trim, ≤ 50 (player-rename cap).
 * - `positionalKey`: non-empty string ≤ 64 (catalog keys are short).
 * - optional `hired`: boolean when present; optional `pe`: finite number ≥ 0.
 * - whole roster JSON: ≤ 50 KB after stringify (11–16 entries never approach it).
 */

export const MAX_ROSTER_ID_LENGTH = 64;
export const MAX_ROSTER_ENTRY_NAME_LENGTH = 50;
export const MAX_ROSTER_JSON_BYTES = 50_000;

export type RosterPayloadResult =
  | { ok: true; roster: PlayerEntry[] }
  | { ok: false; error: string };

function fail(error: string): RosterPayloadResult {
  return { ok: false, error };
}

export function validateRosterPayload(roster: unknown): RosterPayloadResult {
  if (!Array.isArray(roster)) {
    return fail("roster must be an array");
  }
  // Cheap size gate before per-entry checks: a multi-MB array never gets
  // stringified twice or walked field-by-field.
  if (JSON.stringify(roster).length > MAX_ROSTER_JSON_BYTES) {
    return fail(`roster payload exceeds ${MAX_ROSTER_JSON_BYTES} bytes`);
  }

  for (const candidate of roster) {
    if (typeof candidate !== "object" || candidate === null) {
      return fail("each roster entry must be an object");
    }
    const entry = candidate as Record<string, unknown>;

    if (typeof entry.id !== "string" || entry.id.length === 0) {
      return fail("each roster entry needs a non-empty string id");
    }
    if (entry.id.length > MAX_ROSTER_ID_LENGTH) {
      return fail(`roster entry id exceeds ${MAX_ROSTER_ID_LENGTH} characters`);
    }

    if (typeof entry.name !== "string" || entry.name.trim().length === 0) {
      return fail("each roster entry needs a non-empty name");
    }
    if (entry.name.length > MAX_ROSTER_ENTRY_NAME_LENGTH) {
      return fail(`roster entry name exceeds ${MAX_ROSTER_ENTRY_NAME_LENGTH} characters`);
    }

    if (typeof entry.positionalKey !== "string" || entry.positionalKey.length === 0) {
      return fail("each roster entry needs a non-empty positionalKey");
    }
    if (entry.positionalKey.length > MAX_ROSTER_ID_LENGTH) {
      return fail(`positionalKey exceeds ${MAX_ROSTER_ID_LENGTH} characters`);
    }

    if (entry.hired !== undefined && typeof entry.hired !== "boolean") {
      return fail("roster entry hired must be a boolean when present");
    }
    if (entry.pe !== undefined) {
      if (typeof entry.pe !== "number" || !Number.isFinite(entry.pe) || entry.pe < 0) {
        return fail("roster entry pe must be a non-negative finite number when present");
      }
    }
  }

  return { ok: true, roster: roster as PlayerEntry[] };
}
