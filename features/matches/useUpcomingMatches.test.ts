import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { getLeagueDetail, listLeagues } from "@/features/leagues/api";
import { useUpcomingMatches } from "./useUpcomingMatches";

const ME = "u-me";
const OTHER = "u-other";

vi.mock("@/features/leagues/api", () => ({
  listLeagues: vi.fn(),
  getLeagueDetail: vi.fn(),
}));

const listLeaguesMock = listLeagues as ReturnType<typeof vi.fn>;
const getLeagueDetailMock = getLeagueDetail as ReturnType<typeof vi.fn>;

function league(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Liga ${id}`,
    description: null,
    ownerId: OTHER,
    createdAt: new Date().toISOString(),
    status: "started",
    seasonLength: 3,
    startedAt: new Date().toISOString(),
    championTeamId: null,
    ownerName: "Coach",
    memberCount: 2,
    isMember: true,
    turnClockEnabled: false,
    turnClockSeconds: 120,
    rulesetId: null,
    rulesetName: null,
    ...overrides,
  };
}

function memberTeam(id: string, name: string, userId: string) {
  return { id, name, raceId: "human", leagueId: id, userId, roster: {}, coaching: {} };
}

function fixture(id: string, homeTeamId: string, awayTeamId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    leagueId: "l-started",
    round: 1,
    homeTeamId,
    awayTeamId,
    createdAt: new Date().toISOString(),
    scheduledAt: null,
    winnerId: null,
    homeScore: null,
    awayScore: null,
    status: "pending",
    homeOwner: { id: ME, name: "Me" },
    awayOwner: { id: OTHER, name: "Other" },
    proposals: [],
    live: null,
    ...overrides,
  };
}

function detail(leagueId: string, fixtures: unknown[]) {
  return {
    ...league(leagueId),
    teams: [memberTeam("h", "Halfling Hopper", ME), memberTeam("a", "Wood Elf", OTHER)],
    fixtures,
    rounds: [],
  };
}

beforeEach(() => {
  listLeaguesMock.mockReset();
  getLeagueDetailMock.mockReset();
});

describe("useUpcomingMatches", () => {
  it("aggregates the user's upcoming fixtures from their started member leagues", async () => {
    const started = league("l-started");
    const foreign = league("l-foreign", { isMember: false, ownerId: OTHER });
    listLeaguesMock.mockResolvedValue([started, foreign]);

    getLeagueDetailMock.mockImplementation((id: string) =>
      Promise.resolve(
        id === "l-started"
          ? detail("l-started", [
              fixture("f-upcoming", "h", "a", { status: "scheduled", scheduledAt: "2026-08-23T10:00:00Z" }),
              fixture("f-played", "h", "a", { status: "played", homeScore: 2, awayScore: 1 }),
            ])
          : Promise.reject(new Error("should not be fetched") as never),
      ),
    );

    const { result } = renderHook(() => useUpcomingMatches(ME));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.unavailable).toBe(false);
    expect(result.current.fixtures.map((f) => f.id)).toEqual(["f-upcoming"]);
    // Only the scoped (started + member/owner) league detail is fetched.
    expect(getLeagueDetailMock).toHaveBeenCalledTimes(1);
    expect(getLeagueDetailMock).toHaveBeenCalledWith("l-started");
  });

  it("marks the page unavailable when listLeagues 401s (local/unauth mode)", async () => {
    const err = new Error("Unauthorized") as Error & { status?: number };
    err.status = 401;
    listLeaguesMock.mockRejectedValue(err);

    const { result } = renderHook(() => useUpcomingMatches(ME));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.unavailable).toBe(true);
    expect(result.current.fixtures).toHaveLength(0);
    expect(getLeagueDetailMock).not.toHaveBeenCalled();
  });

  it("stays unavailable with no fixtures when there is no authenticated userId", async () => {
    const { result } = renderHook(() => useUpcomingMatches(null));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.unavailable).toBe(true);
    expect(result.current.fixtures).toHaveLength(0);
    expect(listLeaguesMock).not.toHaveBeenCalled();
  });
});
