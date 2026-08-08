import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTeamMigration } from "./useTeamMigration";
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
  window.localStorage.clear();
  // Each call gets a FRESH Response so `res.json()` is never called twice on an
  // already-consumed body (that would look like a spurious 2nd-POST failure).
  fetchMock = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: "saved" }), { status: 201 })));
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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/teams");
    expect((init as RequestInit).method).toBe("POST");
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

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(window.localStorage.getItem(LEGACY_TEAMS_KEY)).not.toBeNull();
  });

  it("does not migrate twice when kept mounted (idempotent, avoids StrictMode double-run)", async () => {
    window.localStorage.setItem(LEGACY_TEAMS_KEY, JSON.stringify([legacyTeam("t1", "Reavers")]));
    // Pre-set the flag as-if a previous migration already ran.
    window.localStorage.setItem("bb_teams_migrated_v1", "1");

    renderHook(() => useTeamMigration(true));

    // Flag already set → a second migration would POST duplicates; it must not.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is non-blocking when the migration POST fails (login is not blocked)", async () => {
    window.localStorage.setItem(LEGACY_TEAMS_KEY, JSON.stringify([legacyTeam("t1", "Reavers")]));
    fetchMock.mockRejectedValue(new Error("Failed to save team (500)"));
    // Spy so the test proves the surface-error path is reached without throwing to the caller.
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    renderHook(() => useTeamMigration(true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

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
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(window.localStorage.getItem("bb_teams_migrated_v1")).toBe("1"));
    expect(onMigrated).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onMigrated when there is nothing to migrate", async () => {
    const onMigrated = vi.fn();
    // No legacy teams → a no-op migration, nothing to re-hydrate.
    renderHook(() => useTeamMigration(true, { onMigrated }));
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
    expect(onMigrated).not.toHaveBeenCalled();
  });
});
