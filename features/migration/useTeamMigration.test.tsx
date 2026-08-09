import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTeamMigration, __resetMigrationGuardForTests } from "./useTeamMigration";
import type { Team } from "@/features/teams/types";

const LEGACY_TEAMS_KEY = "bb_teams_v1";

const legacyTeam = (id: string, name: string): Team => ({
  id,
  name,
  raceId: "human",
  roster: [],
  coaching: { rerolls: 0, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false },
  leagueId: null,
});

// The hook must POST through /api/teams; assert the real fetch call.
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetMigrationGuardForTests();
  window.localStorage.clear();
  // GET /api/teams (dedupe names) returns [], POST /api/teams returns 201.
  // Each call gets a FRESH Response so `res.json()` is never called twice on an
  // already-consumed body (that would look like a spurious 2nd-POST failure).
  fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const isPost = init?.method === "POST";
    return Promise.resolve(
      new Response(isPost ? JSON.stringify({ id: "saved" }) : JSON.stringify([]), {
        status: isPost ? 201 : 200,
      }),
    );
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("useTeamMigration", () => {
  it("runs the migration when the session becomes authenticated", async () => {
    window.localStorage.setItem(LEGACY_TEAMS_KEY, JSON.stringify([legacyTeam("t1", "Reavers")]));

    const { rerender } = renderHook(({ auth }) => useTeamMigration(auth), {
      initialProps: { auth: false },
    });

    // Not authenticated → no migration attempt.
    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ auth: true });

    // One legacy team POSTed to /api/teams, then the flag is set.
    // GET /api/teams (dedupe) + 1 POST of the legacy team.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const postCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "POST");
    expect(postCall?.[0]).toBe("/api/teams");
    expect(window.localStorage.getItem("bb_teams_migrated_v1")).toBe("1");
  });

  it("posts each legacy team and retains bb_teams_v1 after migration", async () => {
    window.localStorage.setItem(
      LEGACY_TEAMS_KEY,
      JSON.stringify([legacyTeam("t1", "Reavers"), legacyTeam("t2", "Orc Kings")]),
    );

    const { rerender } = renderHook(({ auth }) => useTeamMigration(auth), {
      initialProps: { auth: false },
    });
    rerender({ auth: true });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(window.localStorage.getItem(LEGACY_TEAMS_KEY)).not.toBeNull();
  });

  it("does not migrate twice when kept mounted (idempotent, avoids StrictMode double-run)", async () => {
    window.localStorage.setItem(LEGACY_TEAMS_KEY, JSON.stringify([legacyTeam("t1", "Reavers")]));
    // Pre-set the flag as-if a previous migration already ran.
    window.localStorage.setItem("bb_teams_migrated_v1", "1");

    renderHook(() => useTeamMigration(true));

    // Flag already set → a second migration would POST duplicates; it must not.
    // The hook still performs the harmless dedupe GET, but NO POST happens.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === "POST")).toBe(false);
  });

  it("is non-blocking when the migration POST fails (login is not blocked)", async () => {
    window.localStorage.setItem(LEGACY_TEAMS_KEY, JSON.stringify([legacyTeam("t1", "Reavers")]));
    fetchMock.mockRejectedValue(new Error("Failed to save team (500)"));
    // Spy so the test proves the surface-error path is reached without throwing to the caller.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderHook(() => useTeamMigration(true));
    // GET (dedupe, fails) + POST (fails) — both rejected, still non-blocking.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    // The flag stays unset so a later login retries.
    expect(window.localStorage.getItem("bb_teams_migrated_v1")).toBeNull();
    // A non-blocking warning was emitted (no unhandled rejection reaching the caller).
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("calls onMigrated after a successful migration so the UI can re-hydrate", async () => {
    window.localStorage.setItem(LEGACY_TEAMS_KEY, JSON.stringify([legacyTeam("t1", "Reavers")]));
    const onMigrated = vi.fn();

    renderHook(() => useTeamMigration(true, { onMigrated }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(window.localStorage.getItem("bb_teams_migrated_v1")).toBe("1"));
    expect(onMigrated).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onMigrated when there is nothing to migrate", async () => {
    const onMigrated = vi.fn();
    // No legacy teams → a no-op migration, nothing to re-hydrate. The dedupe
    // GET still runs but no POST occurs.
    renderHook(() => useTeamMigration(true, { onMigrated }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === "POST")).toBe(false);
    expect(onMigrated).not.toHaveBeenCalled();
  });
});
