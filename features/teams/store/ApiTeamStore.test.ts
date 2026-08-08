import { describe, expect, it, vi, beforeEach } from "vitest";
import { ApiTeamStore } from "./ApiTeamStore";
import { DEFAULT_COACHING, DEFAULT_LEAGUE_TYPE } from "@/features/teams/types";
import type { Team } from "@/features/teams/types";

const makeApiTeam = (id: string, name: string) => ({
  id,
  userId: "u1",
  name,
  raceId: "human",
  leagueType: "open",
  roster: [],
  coaching: { ...DEFAULT_COACHING },
  createdAt: new Date().toISOString(),
});

describe("ApiTeamStore", () => {
  let store: ApiTeamStore;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    store = new ApiTeamStore();
  });

  it("list returns the user's teams ordered oldest-first from the API", async () => {
    const teams = [makeApiTeam("t1", "A"), makeApiTeam("t2", "B")];
    fetchMock.mockResolvedValue(new Response(JSON.stringify(teams)));

    const result = await store.list();
    expect(fetchMock).toHaveBeenCalledWith("/api/teams");
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("A");
    expect(result[1].name).toBe("B");
  });

  it("save POSTs the team and returns the API-returned team", async () => {
    const team: Team = {
      id: "team-1",
      name: "Reavers",
      raceId: "human",
      leagueType: DEFAULT_LEAGUE_TYPE,
      roster: [],
      coaching: { ...DEFAULT_COACHING },
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(makeApiTeam("team-1", "Reavers"))));

    const saved = await store.save(team);
    expect(fetchMock).toHaveBeenCalledWith("/api/teams", expect.objectContaining({ method: "POST" }));
    expect(saved.name).toBe("Reavers");
    expect(saved.id).toBe("team-1");
  });

  it("remove is a no-op when the API returns 404 for a missing team", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(store.remove("missing")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("/api/teams/missing", expect.objectContaining({ method: "DELETE" }));
  });

  it("remove throws when the API call fails with a server error", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(store.remove("t1")).rejects.toThrow();
  });

  it("save throws on a 401 so callers can surface an auth error", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));
    await expect(
      store.save({
        id: "team-1",
        name: "Reavers",
        raceId: "human",
        leagueType: DEFAULT_LEAGUE_TYPE,
        roster: [],
        coaching: { ...DEFAULT_COACHING },
      }),
    ).rejects.toThrow();
  });

  it("list throws when the network request fails", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(store.list()).rejects.toThrow();
  });
});
