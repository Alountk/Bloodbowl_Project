import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { listLeagues } from "@/features/leagues/api";
import { useLeagueNameMap } from "./useLeagueNameMap";

// A SINGLE listLeagues fetch powers the whole map — one league list call, not
// one detail call per team. On failure the map stays empty and `unavailable`
// is set so the page can degrade gracefully (show the league id).
vi.mock("@/features/leagues/api", () => ({
  listLeagues: vi.fn(),
}));

const listLeaguesMock = listLeagues as ReturnType<typeof vi.fn>;

function league(id: string, name: string) {
  return {
    id,
    name,
    description: null,
    ownerId: "u1",
    createdAt: new Date().toISOString(),
    status: "open" as const,
    seasonLength: null,
    startedAt: null,
    championTeamId: null,
    ownerName: "Coach",
    memberCount: 0,
    isMember: false,
    turnClockEnabled: false,
    turnClockSeconds: 120 as const,
    rulesetId: null,
    rulesetName: null,
  };
}

beforeEach(() => {
  listLeaguesMock.mockReset();
});

describe("useLeagueNameMap", () => {
  it("builds a Map of league id -> name from a single listLeagues fetch", async () => {
    listLeaguesMock.mockResolvedValue([league("l-id-1", "Liga de Verano"), league("l-id-2", "Liga de Invierno")]);

    const { result } = renderHook(() => useLeagueNameMap());

    await waitFor(() => expect(result.current.leagueNameMap.size).toBe(2));

    expect(result.current.leagueNameMap.get("l-id-1")).toBe("Liga de Verano");
    expect(result.current.leagueNameMap.get("l-id-2")).toBe("Liga de Invierno");
    expect(result.current.unavailable).toBe(false);
    // Exactly ONE fetch for the whole page (no per-team detail calls).
    expect(listLeaguesMock).toHaveBeenCalledTimes(1);
  });

  it("marks the map unavailable (empty) when listLeagues fails", async () => {
    listLeaguesMock.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useLeagueNameMap());

    await waitFor(() => expect(result.current.unavailable).toBe(true));

    expect(result.current.leagueNameMap.size).toBe(0);
    expect(listLeaguesMock).toHaveBeenCalledTimes(1);
  });
});
