import { describe, expect, it, vi } from "vitest";
import { runTeamMigration } from "./migrateLocalTeams";
import type { Team } from "@/features/teams/types";
import { DEFAULT_COACHING, DEFAULT_LEAGUE_TYPE } from "@/features/teams/types";

const STORAGE_KEY = "bb_teams_v1";
const FLAG_KEY = "bb_teams_migrated_v1";

const makeLegacyTeam = (id: string, name: string): Team => ({
  id,
  name,
  raceId: "human",
  roster: [],
  coaching: { ...DEFAULT_COACHING },
  leagueType: DEFAULT_LEAGUE_TYPE,
});

/** In-memory Storage that records the exact sequence of writes (for flag assertions). */
function makeStorage(): { storage: Storage; keys: string[]; writes: string[] } {
  const map = new Map<string, string>();
  const writes: string[] = [];
  const storage = {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
      writes.push(key);
    },
    removeItem: (key: string) => {
      map.delete(key);
      writes.push(`-${key}`);
    },
  } as unknown as Storage;
  return { storage, keys: [...map.keys()], writes };
}

describe("runTeamMigration", () => {
  it("is a no-op when the migration flag is already set", async () => {
    const { storage } = makeStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify([makeLegacyTeam("t1", "Reavers")]));
    storage.setItem(FLAG_KEY, "1");
    const postTeam = vi.fn();

    const result = await runTeamMigration({ storage, postTeam });

    expect(result).toEqual({ migrated: 0, failed: false });
    // No team is POSTed a second time (runs once).
    expect(postTeam).not.toHaveBeenCalled();
  });

  it("is a no-op when there are no legacy teams to migrate", async () => {
    const { storage } = makeStorage();
    storage.setItem(STORAGE_KEY, "[]");
    const postTeam = vi.fn();

    const result = await runTeamMigration({ storage, postTeam });

    expect(result).toEqual({ migrated: 0, failed: false });
    expect(postTeam).not.toHaveBeenCalled();
    // Empty data does not mark the flag (nothing was migrated, retries trivially).
    expect(storage.getItem(FLAG_KEY)).toBeNull();
  });

  it("POSTs each legacy team and sets the flag on success", async () => {
    const { storage } = makeStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeLegacyTeam("t1", "Reavers"), makeLegacyTeam("t2", "Orc Kings")]),
    );
    const postTeam = vi.fn(async () => ({ id: "t1", name: "Reavers" }));

    const result = await runTeamMigration({ storage, postTeam });

    expect(result).toEqual({ migrated: 2, failed: false });
    // One POST per legacy team.
    expect(postTeam).toHaveBeenCalledTimes(2);
    expect(postTeam).toHaveBeenCalledWith(makeLegacyTeam("t1", "Reavers"));
    expect(postTeam).toHaveBeenCalledWith(makeLegacyTeam("t2", "Orc Kings"));
    // Flag set so later logins do not re-run.
    expect(storage.getItem(FLAG_KEY)).toBe("1");
  });

  it("keeps bb_teams_v1 intact after a successful migration", async () => {
    const { storage } = makeStorage();
    const legacy = [makeLegacyTeam("t1", "Reavers")];
    storage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    const postTeam = vi.fn().mockResolvedValue({ id: "t1" });

    await runTeamMigration({ storage, postTeam });

    // NEVER clear the legacy key — it is retained as the rollback copy.
    expect(storage.getItem(STORAGE_KEY)).toBe(JSON.stringify(legacy));
  });

  it("surfaces a partial failure, leaves the flag unset, and allows a retry", async () => {
    const { storage } = makeStorage();
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeLegacyTeam("t1", "Reavers"), makeLegacyTeam("t2", "Orc Kings")]),
    );
    // The second POST fails (e.g. network / 5xx on the API).
    const postTeam = vi
      .fn(async () => ({ id: "t1" }))
      .mockResolvedValueOnce({ id: "t1" })
      .mockRejectedValueOnce(new Error("Failed to save team (500)"));

    const result = await runTeamMigration({ storage, postTeam });

    expect(result.migrated).toBe(1);
    expect(result.failed).toBe(true);
    // Flag NOT set → a later login retries the migration.
    expect(storage.getItem(FLAG_KEY)).toBeNull();
    // Legacy data still present for rollback and retry.
    expect(storage.getItem(STORAGE_KEY)).not.toBeNull();
  });
});
