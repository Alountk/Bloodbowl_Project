import type { Team } from "@/features/teams/types";

export const LEGACY_TEAMS_KEY = "bb_teams_v1";
export const MIGRATED_FLAG_KEY = "bb_teams_migrated_v1";

export interface MigrationResult {
  /** Number of legacy teams successfully POSTed to the user's account. */
  migrated: number;
  /** True when at least one POST failed and the migration must be retried. */
  failed: boolean;
}

interface RunTeamMigrationParams {
  /** Browser localStorage (injectable for tests). */
  storage: Pick<Storage, "getItem" | "setItem">;
  /** Persists a single legacy team into the signed-in user's account (POST /api/teams). */
  postTeam: (team: Team) => Promise<unknown>;
  /**
   * Names of teams the account ALREADY has. A legacy team whose name is in this
   * set is skipped — this makes the migration idempotent even when two
   * concurrent runs (React StrictMode double-effect) both see the flag unset.
   */
  existingTeamNames?: ReadonlySet<string>;
}

/**
 * One-time per-browser migration of the legacy `bb_teams_v1` localStorage
 * teams into the signed-in user's account.
 *
 * Contract (see team-persistence spec "localStorage Migration"):
 * - Runs only when the flag `bb_teams_migrated_v1` is NOT set. When the flag is
 *   set this is a no-op (idempotent, never creates duplicate teams).
 * - Reads every legacy team, POSTs each into the account, then sets the flag.
 * - NEVER clears `bb_teams_v1` — it is retained as the rollback copy.
 * - On a partial failure the flag is left unset so a later login retries, and
 *   the failure is surfaced (the caller decides how to handle it; it must not
 *   block login).
 */
export async function runTeamMigration({
  storage,
  postTeam,
  existingTeamNames,
}: RunTeamMigrationParams): Promise<MigrationResult> {
  if (storage.getItem(MIGRATED_FLAG_KEY) != null) {
    return { migrated: 0, failed: false };
  }

  const raw = storage.getItem(LEGACY_TEAMS_KEY);
  let teams: Team[] = [];
  if (raw) {
    try {
      teams = JSON.parse(raw) as Team[];
    } catch {
      teams = [];
    }
  }
  if (!Array.isArray(teams) || teams.length === 0) {
    return { migrated: 0, failed: false };
  }

  let migrated = 0;
  try {
    for (const team of teams) {
      if (existingTeamNames?.has(team.name)) continue;
      await postTeam(team);
      migrated += 1;
    }
  } catch {
    // Partial failure: never clear the legacy data, leave the flag unset so a
    // later login retries the remaining/duplicate-tolerant migration.
    return { migrated, failed: true };
  }

  storage.setItem(MIGRATED_FLAG_KEY, "1");
  return { migrated, failed: false };
}
