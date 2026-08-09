import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assignTeam,
  listUnassignedTeams,
  selfLeave,
  startLeague,
  type League,
  type LeagueDetail,
} from "./api";

/**
 * api.ts contract tests. Verifies the server-shaped League types expose the new
 * lifecycle fields (status/seasonLength/startedAt/ownerName/memberCount) and the
 * start/self-leave request helpers wire the right routes and payloads.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

describe("League lifecycle types", () => {
  it("League shape includes status, seasonLength, startedAt, ownerName and memberCount", () => {
    const league: League = {
      id: "l1",
      name: "Liga",
      description: null,
      ownerId: "u1",
      createdAt: "2026-01-01",
      status: "started",
      seasonLength: 2,
      startedAt: "2026-02-01",
      ownerName: "Coach",
      memberCount: 4,
    };
    expect(league.status).toBe("started");
    expect(league.seasonLength).toBe(2);
    expect(league.startedAt).toBe("2026-02-01");
    expect(league.ownerName).toBe("Coach");
    expect(league.memberCount).toBe(4);
  });

  it("LeagueDetail carries member teams plus fixtures", () => {
    const detail: LeagueDetail = {
      id: "l1",
      name: "Liga",
      description: null,
      ownerId: "u1",
      createdAt: "2026-01-01",
      status: "started",
      seasonLength: 2,
      startedAt: "2026-02-01",
      ownerName: "Coach",
      memberCount: 2,
      teams: [
        { id: "t1", name: "Reavers", raceId: "human", leagueId: "l1", userId: "u1", roster: [], coaching: {} },
      ],
      fixtures: [
        {
          id: "f1",
          leagueId: "l1",
          round: 1,
          homeTeamId: "t1",
          awayTeamId: "t2",
          createdAt: "2026-02-01",
        },
      ],
    };
    expect(detail.teams[0].userId).toBe("u1");
    expect(detail.fixtures).toHaveLength(1);
    expect(detail.fixtures[0].round).toBe(1);
  });
});

describe("startLeague", () => {
  it("POSTs seasonLength to the league start route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({ id: "l1", status: "started", seasonLength: 2, fixtures: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await startLeague("l1", 2);

    expect(fetchMock).toHaveBeenCalledWith("/api/leagues/l1/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seasonLength: 2 }),
    });
  });
});

describe("selfLeave", () => {
  it("DELETEs the member route for the user's team", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ id: "t1" }));
    vi.stubGlobal("fetch", fetchMock);

    await selfLeave("l1", "t1");

    expect(fetchMock).toHaveBeenCalledWith("/api/leagues/l1/members/t1", {
      method: "DELETE",
    });
  });
});

describe("assign/expel/listUnassignedTeams keep working", () => {
  it("assignTeam POSTs teamId to the league teams route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ id: "t1" }));
    vi.stubGlobal("fetch", fetchMock);

    await assignTeam("l1", "t1");
    expect(fetchMock).toHaveBeenCalledWith("/api/leagues/l1/teams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ teamId: "t1" }),
    });
  });

  it("listUnassignedTeams filters to leagueId === null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okJson([
          { id: "t1", name: "Free", raceId: "human", leagueId: null },
          { id: "t2", name: "Taken", raceId: "orc", leagueId: "other" },
        ]),
      ),
    );

    const teams = await listUnassignedTeams();
    expect(teams.map((t) => t.id)).toEqual(["t1"]);
  });
});
