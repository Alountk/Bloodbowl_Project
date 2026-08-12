import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptFixtureProposal,
  assignTeam,
  correctResult,
  createLeague,
  forfeitFixture,
  getFixtureProposals,
  getMatchDetail,
  getScoutedTeam,
  listUnassignedTeams,
  proposeFixtureDate,
  selfLeave,
  sendLiveCommand,
  startLeague,
  submitResult,
  type League,
  type LeagueDetail,
  type LiveCommand,
  type LiveMatchViewState,
  type MatchDetail,
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
  it("League shape includes status, seasonLength, startedAt, ownerName, memberCount and isMember", () => {
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
      isMember: false,
      turnClockEnabled: true,
      turnClockSeconds: 240,
    };
    expect(league.status).toBe("started");
    expect(league.seasonLength).toBe(2);
    expect(league.startedAt).toBe("2026-02-01");
    expect(league.ownerName).toBe("Coach");
    expect(league.memberCount).toBe(4);
    // The server-computed membership flag lets the list surface started leagues
    // a user JOINED (not just owned) under Mis Ligas.
    expect(league.isMember).toBe(false);
    // The league carries the immutable turn-clock option (AC-10) so live
    // matches read their per-turn duration from the League row. Also prove an
    // option-off league surfaces disabled duration fields.
    expect(league.turnClockEnabled).toBe(true);
    expect(league.turnClockSeconds).toBe(240);
    const disabled: League = { ...league, turnClockEnabled: false, turnClockSeconds: 120 };
    expect(disabled.turnClockEnabled).toBe(false);
    expect(disabled.turnClockSeconds).toBe(120);
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
      isMember: false,
      turnClockEnabled: true,
      turnClockSeconds: 240,
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
      isMember: false,
      turnClockEnabled: true,
      turnClockSeconds: 240,
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

describe("createLeague", () => {
  it("POSTs the turn-clock option through to the leagues route when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({
        id: "l1",
        name: "Clock League",
        description: null,
        ownerId: "u1",
        createdAt: "2026-01-01",
        status: "open",
        seasonLength: null,
        startedAt: null,
        ownerName: "Coach",
        memberCount: 0,
        turnClockEnabled: true,
        turnClockSeconds: 240,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createLeague("Clock League", null, { turnClockEnabled: true, turnClockSeconds: 240 });

    expect(fetchMock).toHaveBeenCalledWith("/api/leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Clock League",
        description: null,
        turnClockEnabled: true,
        turnClockSeconds: 240,
      }),
    });
  });

  it("omits the option from the payload when not supplied (server defaults apply)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({
        id: "l1",
        name: "No Option",
        description: null,
        ownerId: "u1",
        createdAt: "2026-01-01",
        status: "open",
        seasonLength: null,
        startedAt: null,
        ownerName: "Coach",
        memberCount: 0,
        turnClockEnabled: true,
        turnClockSeconds: 240,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createLeague("No Option", "just a name");

    expect(fetchMock).toHaveBeenCalledWith("/api/leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "No Option", description: "just a name" }),
    });
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

describe("getMatchDetail", () => {
  it("GETs the per-fixture route and returns the normalized match payload", async () => {
    const match: MatchDetail = {
      fixture: {
        id: "f1",
        leagueId: "l1",
        round: 1,
        homeTeamId: "t1",
        awayTeamId: "t2",
        createdAt: "2026-02-01",
        scheduledAt: "2026-03-01",
        winnerId: "t1",
        homeScore: 2,
        awayScore: 1,
        status: "played",
        homeOwner: { id: "u1", name: "Coach A" },
        awayOwner: { id: "u2", name: "Coach B" },
        proposals: [],
      },
      result: {
        id: "mr1",
        fixtureId: "f1",
        weather: "perfect",
        scores: {
          home: {
            score: 2,
            postFf: 4,
            winnings: 45_000,
            casualties: [],
            pe: [{ rosterPlayerId: "p1", pe: 7 }],
          },
          away: {
            score: 1,
            postFf: 2,
            winnings: 35_000,
            casualties: [],
            pe: [{ rosterPlayerId: "p3", pe: 3 }],
          },
          winnerId: "t1",
          mvp: { home: "p1", away: "p5" },
        },
        pettyCash: 150_000,
        loadedBy: "u1",
      },
      homeTeam: {
        id: "t1",
        name: "Reavers",
        raceId: "human",
        user: { id: "u1", name: "Coach A", email: "a@x", avatar: null },
        players: [
          { rosterPlayerId: "p1", name: "Blitzer", positionalKey: "blitzer", pe: 7, skills: [], injuries: [], alive: true, valueBonus: 0 },
        ],
      },
      awayTeam: {
        id: "t2",
        name: "Dwarves",
        raceId: "dwarf",
        user: { id: "u2", name: "Coach B", email: "b@x", avatar: null },
        players: [],
      },
      live: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(okJson(match));
    vi.stubGlobal("fetch", fetchMock);

    const detail = await getMatchDetail("l1", "f1");

    expect(fetchMock).toHaveBeenCalledWith("/api/leagues/l1/fixtures/f1");
    expect(detail.fixture.status).toBe("played");
    expect(detail.result?.scores.mvp).toEqual({ home: "p1", away: "p5" });
    expect(detail.homeTeam.players[0].rosterPlayerId).toBe("p1");
  });

  it("surfaces a walkover with result null (scores set, no snapshot)", async () => {
    const walkover = {
      fixture: {
        id: "f1",
        leagueId: "l1",
        round: 1,
        homeTeamId: "t1",
        awayTeamId: "t2",
        createdAt: "2026-02-01",
        scheduledAt: null,
        winnerId: "t1",
        homeScore: 2,
        awayScore: 0,
        status: "played",
        homeOwner: null,
        awayOwner: null,
        proposals: [],
      },
      result: null,
      homeTeam: { id: "t1", name: "Reavers", raceId: "human", user: null, players: [] },
      awayTeam: { id: "t2", name: "Dwarves", raceId: "dwarf", user: null, players: [] },
      live: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(okJson(walkover));
    vi.stubGlobal("fetch", fetchMock);

    const detail = await getMatchDetail("l1", "f1");

    expect(detail.result).toBeNull();
    expect(detail.fixture.homeScore).toBe(2);
    expect(detail.fixture.status).toBe("played");
  });
});

describe("LiveMatchViewState DTO (LM-5/LM-8)", () => {
  it("exposes turnClockEnabled and nullable clocks when the league option is off", () => {
    const enabled: LiveMatchViewState = {
      seq: 12,
      status: "live",
      half: 1,
      turnNumber: 3,
      activeSide: "home",
      turnClockEnabled: true,
      homeClock: 200,
      awayClock: 240,
      homeScore: 1,
      awayScore: 0,
      paused: false,
      finishedAt: null,
    };
    expect(enabled.turnClockEnabled).toBe(true);
    expect(enabled.homeClock).toBe(200);

    // Clocks-disabled league: the DTO carries null clocks + paused, and no
    // clockSeconds field exists (the client can never derive a clock, LM-5).
    const clockless: LiveMatchViewState = {
      seq: 1,
      status: "live",
      half: 1,
      turnNumber: 2,
      activeSide: "away",
      turnClockEnabled: false,
      homeClock: null,
      awayClock: null,
      homeScore: 0,
      awayScore: 0,
      paused: null,
      finishedAt: null,
    };
    expect(clockless.turnClockEnabled).toBe(false);
    expect(clockless.homeClock).toBeNull();
    expect(clockless.awayClock).toBeNull();
    expect(clockless.paused).toBeNull();
    // clockSeconds is intentionally absent (LM-5): TS errors on access, proving
    // the DTO exposes no derivable clock field.
    expect("clockSeconds" in clockless).toBe(false);
  });
});

describe("sendLiveCommand", () => {
  it("POSTs a control command to the live route and returns the new view", async () => {
    const view: LiveMatchViewState = {
      seq: 13,
      status: "live",
      half: 1,
      turnNumber: 4,
      activeSide: "away",
      turnClockEnabled: true,
      homeClock: 240,
      awayClock: 240,
      homeScore: 1,
      awayScore: 0,
      paused: false,
      finishedAt: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ view }) }),
    );

    const cmd: LiveCommand = { type: "endTurn", side: "home" };
    const result = await sendLiveCommand("lg-1", "f-1", cmd);

    expect(fetch).toHaveBeenCalledWith("/api/leagues/lg-1/fixtures/f-1/live", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cmd),
    });
    expect(result).toEqual(view);
  });

  it("throws with the route's status on a 409 control rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: () => Promise.resolve({ error: "Sequence conflict" }) }),
    );

    await expect(sendLiveCommand("lg-1", "f-1", { type: "endTurn", side: "away" })).rejects.toMatchObject({ status: 409 });
  });
});
