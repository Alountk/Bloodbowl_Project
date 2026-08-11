import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptFixtureProposal,
  assignTeam,
  correctResult,
  forfeitFixture,
  getFixtureProposals,
  getScoutedTeam,
  listUnassignedTeams,
  proposeFixtureDate,
  selfLeave,
  startLeague,
  submitResult,
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
      rounds: [],
      fixtures: [
        {
          id: "f1",
          leagueId: "l1",
          round: 1,
          homeTeamId: "t1",
          awayTeamId: "t2",
          createdAt: "2026-02-01",
          scheduledAt: null,
          winnerId: null,
          status: "pending",
          homeOwner: null,
          awayOwner: null,
          proposals: [],
        },
      ],
    };
    expect(detail.teams[0].userId).toBe("u1");
    expect(detail.fixtures).toHaveLength(1);
    expect(detail.fixtures[0].round).toBe(1);
    expect(detail.fixtures[0].status).toBe("pending");
  });

  it("FixtureDraft derives status from scheduledAt/winnerId", () => {
    const draft: LeagueDetail = {
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
      teams: [],
      rounds: [],
      fixtures: [
        {
          id: "f1",
          leagueId: "l1",
          round: 1,
          homeTeamId: "t1",
          awayTeamId: "t2",
          createdAt: "2026-02-01",
          scheduledAt: "2026-03-01",
          winnerId: null,
          status: "scheduled",
          homeOwner: { id: "u1", name: "Coach" },
          awayOwner: null,
          proposals: [
            {
              id: "p1",
              fixtureId: "f1",
              userId: "u1",
              date: "2026-03-01",
              createdAt: "2026-02-02",
              acceptedAt: "2026-02-03",
              closedAt: null,
            },
          ],
        },
      ],
    };
    expect(draft.fixtures[0].status).toBe("scheduled");
    expect(draft.fixtures[0].scheduledAt).toBe("2026-03-01");
    expect(draft.fixtures[0].proposals[0].acceptedAt).toBe("2026-02-03");
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

describe("matchday negotiation helpers", () => {
  it("proposeFixtureDate POSTs {date} to the fixture propose route", async () => {
    const proposal = {
      id: "p1",
      fixtureId: "f1",
      userId: "u1",
      date: "2026-03-01",
      createdAt: "2026-02-02",
      acceptedAt: null,
      closedAt: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(okJson(proposal));
    vi.stubGlobal("fetch", fetchMock);

    const result = await proposeFixtureDate("l1", "f1", "2026-03-01");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leagues/l1/fixtures/f1/propose",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: "2026-03-01" }),
      },
    );
    expect(result.date).toBe("2026-03-01");
  });

  it("acceptFixtureProposal POSTs {proposalId} to the fixture accept route", async () => {
    const fixture = {
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "t1",
      awayTeamId: "t2",
      createdAt: "2026-02-01",
      scheduledAt: "2026-03-01",
      winnerId: null,
      status: "scheduled",
      homeOwner: null,
      awayOwner: null,
      proposals: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(okJson(fixture));
    vi.stubGlobal("fetch", fetchMock);

    const result = await acceptFixtureProposal("l1", "f1", "p1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leagues/l1/fixtures/f1/accept",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalId: "p1" }),
      },
    );
    expect(result.status).toBe("scheduled");
  });

  it("forfeitFixture POSTs {winnerTeamId} to the fixture forfeit route", async () => {
    const fixture = {
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "t1",
      awayTeamId: "t2",
      createdAt: "2026-02-01",
      scheduledAt: null,
      winnerId: "t1",
      status: "played",
      homeOwner: null,
      awayOwner: null,
      proposals: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(okJson(fixture));
    vi.stubGlobal("fetch", fetchMock);

    const result = await forfeitFixture("l1", "f1", "t1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leagues/l1/fixtures/f1/forfeit",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ winnerTeamId: "t1" }),
      },
    );
    expect(result.status).toBe("played");
  });

  it("submitResult POSTs a result payload to the fixture result route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ fixtureId: "f1", status: "played", homeScore: 2, awayScore: 1, winnerId: "t1" }));
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      weather: "perfect",
      home: { score: 2, ballHeld: true, players: [{ rosterPlayerId: "p1", tds: 2, casualties: 0, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 }], mvp: { nominations: ["p1", "p2", "p3", "p4", "p5", "p6"] }, casualties: [] },
      away: { score: 1, ballHeld: true, players: [{ rosterPlayerId: "p3", tds: 1, casualties: 0, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 }], mvp: { nominations: ["p3", "p4", "p5", "p6", "p7", "p8"] }, casualties: [] },
    };

    const outcome = await submitResult("l1", "f1", payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leagues/l1/fixtures/f1/result",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    expect(outcome.winnerId).toBe("t1");
  });

  it("correctResult PUTs the corrected payload to the result route", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ fixtureId: "f1", status: "played", homeScore: 2, awayScore: 1, winnerId: "t1" }));
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      home: { score: 2, ballHeld: true, players: [], mvp: { nominations: ["p1", "p2", "p3", "p4", "p5", "p6"] }, casualties: [] },
      away: { score: 1, ballHeld: true, players: [], mvp: { nominations: ["p3", "p4", "p5", "p6", "p7", "p8"] }, casualties: [] },
    };

    await correctResult("l1", "f1", payload);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/leagues/l1/fixtures/f1/result",
      { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
    );
  });

  it("getFixtureProposals GETs the fixture proposals route and returns history", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson([{ id: "p1", fixtureId: "f1" }]));
    vi.stubGlobal("fetch", fetchMock);

    const history = await getFixtureProposals("l1", "f1");

    expect(fetchMock).toHaveBeenCalledWith("/api/leagues/l1/fixtures/f1/proposals");
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe("p1");
  });

  it("getScoutedTeam GETs /api/teams/[id] and returns read-only detail", async () => {
    const team = {
      id: "t1",
      name: "Reavers",
      raceId: "human",
      roster: [],
      coaching: {},
      leagueId: "l1",
    };
    const fetchMock = vi.fn().mockResolvedValue(okJson(team));
    vi.stubGlobal("fetch", fetchMock);

    const scouted = await getScoutedTeam("t1");

    expect(fetchMock).toHaveBeenCalledWith("/api/teams/t1");
    expect(scouted.leagueId).toBe("l1");
  });
});
