import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "./route";

/** Builds the raw Prisma fixture row the GET route fetches with its include. */
function buildFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    leagueId: "l1",
    round: 1,
    homeTeamId: "t1",
    awayTeamId: "t2",
    createdAt: new Date("2026-02-01").toISOString(),
    scheduledAt: new Date("2026-03-01").toISOString(),
    winnerId: null,
    homeScore: null,
    awayScore: null,
    result: null,
    league: {
      id: "l1",
      status: "started",
      ownerId: "user-admin",
      teams: [{ userId: "user-1" }],
    },
    homeTeam: {
      id: "t1",
      name: "Reavers",
      raceId: "human",
      userId: "user-1",
      user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
      roster: [],
      players: [],
    },
    awayTeam: {
      id: "t2",
      name: "Dwarves",
      raceId: "dwarf",
      userId: "user-2",
      user: { id: "user-2", name: "Coach B", email: "b@x", avatar: null },
      roster: [],
      players: [],
    },
    ...overrides,
  };
}

function request(leagueId = "l1", fixtureId = "f1") {
  return new Request(`http://localhost/api/leagues/${leagueId}/fixtures/${fixtureId}`);
}

function callGet(leagueId = "l1", fixtureId = "f1") {
  return GET(request(leagueId, fixtureId), {
    params: Promise.resolve({ id: leagueId, fixtureId }),
  } as never);
}

describe("GET /api/leagues/[id]/fixtures/[fixtureId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated, in both AUTH_MODE variants (route never reads env)", async () => {
    // The route is AUTH_MODE-agnostic: it only consults `auth()` and never
    // reads AUTH_MODE itself, so a null session is rejected identically in the
    // local (anonymous) and auth (credential) store modes.
    authMock.mockResolvedValue(null);
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await callGet();
    expect(res.status).toBe(401);
    expect(prismaMock.fixture.findFirst).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 for a fixture that does not exist (no existence leak)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    const res = await callGet();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns 404 for a fixture not in the requested league (findFirst scoped by leagueId)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    const res = await callGet("l-other", "f1");
    expect(res.status).toBe(404);
    // The query must scope by both id and leagueId so a fixture from another
    // league is never surfaced.
    expect(prismaMock.fixture.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "f1", leagueId: "l-other" } }),
    );
  });

  it("returns 404 for a STARTED foreign non-member with the identical no-leak body", async () => {
    // league owner user-admin, member user-1; user-x is neither → 404.
    authMock.mockResolvedValue({ user: { id: "user-x" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await callGet();
    expect(res.status).toBe(404);
    // Body is byte-identical to the fixture-not-found case: no leak.
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns 200 for the league owner with the normalized payload shape", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeScore: 2,
        awayScore: 1,
        winnerId: "t1",
        result: {
          id: "mr1",
          fixtureId: "f1",
          weather: "perfect",
          scores: {
            home: { score: 2, postFf: 4, casualties: [], pe: [] },
            away: { score: 1, postFf: 2, casualties: [], pe: [] },
            winnerId: "t1",
          },
          pettyCash: 150_000,
          loadedBy: "user-admin",
        },
        homeTeam: {
          id: "t1",
          name: "Reavers",
          raceId: "human",
          userId: "user-1",
          user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
          roster: [{ id: "p1", name: "Blitzer", positionalKey: "blitzer" }],
          players: [{ rosterPlayerId: "p1", name: "Blitzer", positionalKey: "blitzer", pe: 7, skills: [], injuries: [], alive: true, valueBonus: 0 }],
        },
      }),
    );

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();

    // Top-level contract: fixture, result, both normalized teams, the live DTO,
    // and the RAU-44 live winnings field.
    expect(Object.keys(body).sort()).toEqual(["awayTeam", "fixture", "homeTeam", "live", "liveWinnings", "result"].sort());
    expect(body.result?.id).toBe("mr1");
    expect(body.result.scores.home.score).toBe(2);
    // No live match on this fixture → live: null (MV-5 static inert).
    expect(body.live).toBeNull();

    // The fixture is enriched but its nested teams are stripped (D3).
    expect(body.fixture.status).toBe("played");
    expect(body.fixture.id).toBe("f1");
    expect(body.fixture).not.toHaveProperty("homeTeam");
    expect(body.fixture).not.toHaveProperty("awayTeam");

    // Top-level teams carry the roster + coach but no nested teams.
    expect(body.homeTeam.id).toBe("t1");
    expect(body.homeTeam.raceId).toBe("human");
    expect(body.homeTeam.user.name).toBe("Coach A");
    expect(body.homeTeam.players).toHaveLength(1);
    expect(body.homeTeam).not.toHaveProperty("homeTeam");
    expect(body.awayTeam).not.toHaveProperty("awayTeam");
  });

  it("RAU-12: serves missNextMatch overlaid from the Player row, defaulting to false", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeTeam: {
          id: "t1",
          name: "Reavers",
          raceId: "human",
          userId: "user-1",
          user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
          roster: [
            { id: "p1", name: "Blitzer", positionalKey: "blitzer" },
            { id: "p2", name: "Lineman", positionalKey: "lineman" },
          ],
          players: [
            { rosterPlayerId: "p1", name: "Blitzer", positionalKey: "blitzer", pe: 7, skills: [], injuries: [], alive: true, missNextMatch: true, valueBonus: 0 },
            { rosterPlayerId: "p2", name: "Lineman", positionalKey: "lineman", pe: 3, skills: [], injuries: [], alive: true, missNextMatch: false, valueBonus: 0 },
          ],
        },
      }),
    );

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    // A flagged Player row serves the suspension; a roster entry without a
    // Player row (or an unflagged one) serves false.
    expect(body.homeTeam.players[0]).toMatchObject({
      rosterPlayerId: "p1",
      missNextMatch: true,
    });
    expect(body.homeTeam.players[1]).toMatchObject({ missNextMatch: false });
  });

  it("fetches both teams' players with orderBy id asc as the raw overlay/fallback source (D21)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    await callGet();
    const queryArg = prismaMock.fixture.findFirst.mock.calls[0][0];
    // The raw `players` rows are fetched id-asc: a deterministic source for the
    // merge overlay map AND the fallback when the roster JSON is missing. The
    // SERVED order itself is the roster JSON order (RAU-9) — asserted below.
    expect(queryArg.include.homeTeam.select.players.orderBy).toEqual({ id: "asc" });
    expect(queryArg.include.awayTeam.select.players.orderBy).toEqual({ id: "asc" });
  });

  it("RAU-9: serves each team's players in the Team.roster JSON order (dorsal = roster index+1)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeTeam: {
          id: "t1",
          name: "Reavers",
          raceId: "human",
          userId: "user-1",
          user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
          // Roster order differs from the raw id-asc Player row order.
          roster: [
            { id: "p2", name: "Lineman", positionalKey: "lineman" },
            { id: "p1", name: "Blitzer", positionalKey: "blitzer" },
          ],
          players: [
            { rosterPlayerId: "p1", name: "Blitzer", positionalKey: "blitzer", pe: 7, skills: [], injuries: [], alive: true, missNextMatch: false, valueBonus: 0 },
            { rosterPlayerId: "p2", name: "Lineman", positionalKey: "lineman", pe: 3, skills: [], injuries: [], alive: true, missNextMatch: false, valueBonus: 0 },
          ],
        },
      }),
    );

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    // The served order follows the ROSTER JSON (p2 first), NOT the Player row
    // id-asc order (p1 first) — reordering the roster renumbers the dorsal.
    // RAU-13: this unplayed fixture has only 2 available players, so 9
    // Journeymen append AFTER the roster (the real players keep the lead).
    const realIds = body.homeTeam.players
      .filter((p: { journeyman?: boolean }) => !p.journeyman)
      .map((p: { rosterPlayerId: string }) => p.rosterPlayerId);
    expect(realIds).toEqual(["p2", "p1"]);
    expect(body.homeTeam.players.filter((p: { journeyman?: boolean }) => p.journeyman)).toHaveLength(9);
    expect(body.homeTeam.players[0]).toMatchObject({ rosterPlayerId: "p2", name: "Lineman", pe: 3 });
    expect(body.homeTeam.players[1]).toMatchObject({ rosterPlayerId: "p1", name: "Blitzer", pe: 7 });
  });

  it("RAU-9: falls back to the id-asc Player rows when the roster JSON is missing/unparseable", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeTeam: {
          id: "t1",
          name: "Reavers",
          raceId: "human",
          userId: "user-1",
          user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
          roster: null,
          players: [
            { rosterPlayerId: "p1", name: "Blitzer", positionalKey: "blitzer", pe: 7, skills: [], injuries: [], alive: true, missNextMatch: false, valueBonus: 0 },
            { rosterPlayerId: "p2", name: "Lineman", positionalKey: "lineman", pe: 3, skills: [], injuries: [], alive: true, missNextMatch: false, valueBonus: 0 },
          ],
        },
      }),
    );

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    // Defensive: without a roster the dorsal still resolves from the raw rows.
    // RAU-13: only 2 players are available here, so 9 Journeymen follow.
    const realIds = body.homeTeam.players
      .filter((p: { journeyman?: boolean }) => !p.journeyman)
      .map((p: { rosterPlayerId: string }) => p.rosterPlayerId);
    expect(realIds).toEqual(["p1", "p2"]);
    expect(body.homeTeam.players.filter((p: { journeyman?: boolean }) => p.journeyman)).toHaveLength(9);
  });

  it("serializes an active LiveMatch into the unified-clock live DTO + viewer's side (D19)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } }); // home team owner → viewerSide "home"
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeScore: null,
        awayScore: null,
        scheduledAt: new Date("2026-03-01").toISOString(),
        league: {
          id: "l1",
          status: "started",
          ownerId: "user-admin",
          turnClockEnabled: true,
          turnClockSeconds: 240,
          teams: [{ userId: "user-1" }],
        },
        liveMatch: {
          id: "lm-1",
          fixtureId: "f1",
          status: "live",
          half: 1,
          turnNumber: 3,
          activeSide: "home",
          homeConsented: true,
          awayConsented: true,
          startedAt: new Date("2026-03-01T20:00:00"),
          homeTurnMs: 5000,
          awayTurnMs: 3000,
          homeScore: 1,
          awayScore: 0,
          seq: 6,
          paused: false,
          clockStartedAt: new Date("2026-03-01T20:00:10"),
          finishedAt: null,
          events: [
            { id: "e0", liveMatchId: "lm-1", seq: 3, kind: "turnStart", side: "away", playerRosterId: null, half: 1, turnNumber: 2, payload: {}, createdAt: new Date("2026-03-01T20:00:01") },
            { id: "e1", liveMatchId: "lm-1", seq: 5, kind: "turn", side: null, playerRosterId: null, half: 1, turnNumber: 2, payload: {}, createdAt: new Date("2026-03-01T20:00:05") },
            { id: "e2", liveMatchId: "lm-1", seq: 6, kind: "td", side: "home", playerRosterId: "p1", half: 1, turnNumber: 3, payload: {}, createdAt: new Date("2026-03-01T20:00:10") },
            { id: "e3", liveMatchId: "lm-1", seq: 7, kind: "mvp", side: "away", playerRosterId: "p2", half: 1, turnNumber: 3, payload: {}, createdAt: new Date("2026-03-01T20:00:15") },
          ],
        },
      }),
    );

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.live).not.toBeNull();
    expect(body.live.status).toBe("live");
    expect(body.live.half).toBe(1);
    expect(body.live.turnNumber).toBe(3);
    expect(body.live.activeSide).toBe("home");
    // Unified-clock DTO: accumulators + consents + startedAt + per-viewer side.
    expect(body.live.homeConsented).toBe(true);
    expect(body.live.awayConsented).toBe(true);
    expect(body.live.startedAt).toBe(new Date("2026-03-01T20:00:00").getTime());
    expect(body.live.homeTurnMs).toBeGreaterThanOrEqual(5000);
    expect(body.live.awayTurnMs).toBe(3000);
    // D19: the home team owner gets viewerSide "home".
    expect(body.live.viewerSide).toBe("home");
    // The deprecated per-turn clock fields are gone from the DTO (D15).
    expect("turnClockEnabled" in body.live).toBe(false);
    expect("homeClock" in body.live).toBe(false);
    expect("awayClock" in body.live).toBe(false);
    // LM-16 filter (validator explicit fixture-GET check): `serializeLive` (and
    // `toEventDtos`) keep ONLY display kinds — `td` and `mvp` survive while the
    // `turnStart`/`turn` rows are dropped from the feed DTO. The DB still holds
    // them (the query includes all events); only the serialized feed is filtered.
    expect(body.live.events).toHaveLength(2);
    expect(body.live.events[0].seq).toBe(6);
    expect(body.live.events[0].kind).toBe("td");
    expect(body.live.events[0].side).toBe("home");
    expect(body.live.events[1].seq).toBe(7);
    expect(body.live.events[1].kind).toBe("mvp");
    expect(body.live.events.some((e: { kind: string }) => e.kind === "turn")).toBe(false);
    expect(body.live.events.some((e: { kind: string }) => e.kind === "turnStart")).toBe(false);
  });

  it("has field-set parity between serializeLive and toLiveViewState for the same state", async () => {
    const { serializeLive } = await import("./route");
    const { toLiveViewState } = await import("@/lib/liveMatch");
    const row = {
      id: "lm-1",
      fixtureId: "f1",
      status: "live" as const,
      half: 1,
      turnNumber: 3,
      activeSide: "home" as const,
      homeConsented: true,
      awayConsented: true,
      startedAt: new Date("2026-03-01T20:00:00"),
      homeTurnMs: 5000,
      awayTurnMs: 3000,
      homeScore: 1,
      awayScore: 0,
      seq: 6,
      paused: false,
      clockStartedAt: new Date("2026-03-01T20:00:10"),
      finishedAt: null,
      mvpNominations: null,
      events: [],
    };
    const now = new Date("2026-03-01T20:00:15").getTime();
    const liveDto = serializeLive(row as never, "home", now);
    const stateView = toLiveViewState(
      {
        seq: 6,
        status: "live" as const,
        half: 1,
        turnNumber: 3,
        activeSide: "home" as const,
        homeConsented: true,
        awayConsented: true,
        startedAt: new Date("2026-03-01T20:00:00").getTime(),
        homeTurnMs: 5000,
        awayTurnMs: 3000,
        homeScore: 1,
        awayScore: 0,
        paused: false,
        clockStartedAt: new Date("2026-03-01T20:00:10").getTime(),
      finishedAt: null,
      concedeProposedBy: null,
      pendingCasualty: null,
      mvpNominations: { home: null, away: null },
      resolutionState: {
        home: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false },
        away: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false },
      },
      events: [],
    },
    now,
    { viewerSide: "home" },
  );
  // Both serializers derive the same unified-clock field set (no drift).
  expect(liveDto.homeTurnMs).toBe(stateView.homeTurnMs);
  expect(liveDto.awayTurnMs).toBe(stateView.awayTurnMs);
  expect(liveDto.elapsed).toBe(stateView.elapsed);
  expect(liveDto.homeConsented).toBe(stateView.homeConsented);
  expect(liveDto.awayConsented).toBe(stateView.awayConsented);
  expect(liveDto.startedAt).toBe(stateView.startedAt);
  expect(liveDto.viewerSide).toBe(stateView.viewerSide);
  expect(liveDto.paused).toBe(stateView.paused);
  // RAU-51: the per-side nominations surface on BOTH serializers identically.
  expect(liveDto.mvpNominations).toEqual(stateView.mvpNominations);
  // The per-side resolution wizard cursor surfaces identically on BOTH
  // serializers (resume-at-step parity).
  expect(liveDto.resolutionState).toEqual(stateView.resolutionState);
});

  it("returns 200 for a member-team owner (not league owner)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } }); // home team owner, league member
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fixture.id).toBe("f1");
  });

  it("returns 200 for an OPEN league to any authenticated user (defensive)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-x" } }); // no membership anywhere
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        scheduledAt: null,
        league: { id: "l1", status: "open", ownerId: "user-admin", teams: [{ userId: "user-1" }] },
      }),
    );
    const res = await callGet();
    expect(res.status).toBe(200);
    expect((await res.json()).fixture.status).toBe("pending");
  });

  it("keeps 200 for a walkover where scores are set and result is null", async () => {
    // Forfeit writes scores + winnerId but no MatchResult row → result stays null.
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({ winnerId: "t1", homeScore: 2, awayScore: 0, scheduledAt: null }),
    );
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeNull();
    expect(body.fixture.status).toBe("played");
    expect(body.fixture.homeScore).toBe(2);
    expect(body.fixture.awayScore).toBe(0);
  });

  it("returns liveWinnings from a FINISHED LiveMatch row and null result (RAU-44)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        liveMatch: {
          id: "lm-1",
          fixtureId: "f1",
          status: "finished",
          half: 2,
          turnNumber: 8,
          activeSide: "away",
          homeConsented: true,
          awayConsented: true,
          startedAt: new Date("2026-03-01T20:00:00"),
          homeTurnMs: 1500,
          awayTurnMs: 1600,
          homeScore: 2,
          awayScore: 1,
          seq: 12,
          paused: false,
          clockStartedAt: null,
          finishedAt: new Date("2026-03-01T21:00:00"),
          concedeProposedBy: null,
          pendingCasualty: null,
          winnings: { home: 55000, away: 45000 },
          events: [
            { id: "e1", liveMatchId: "lm-1", seq: 10, kind: "endMatch", side: null, playerRosterId: null, half: 2, turnNumber: 8, payload: {}, createdAt: new Date("2026-03-01T21:00:00") },
          ],
        },
      }),
    );
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    // The live finish is not yet result-loaded → result null, liveWinnings served.
    expect(body.result).toBeNull();
    expect(body.liveWinnings).toEqual({ home: 55000, away: 45000 });
    expect(body.live.status).toBe("finished");
  });

  it("returns liveWinnings null for a pending/live LiveMatch row even with a winnings value (defensive)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        liveMatch: {
          id: "lm-1",
          fixtureId: "f1",
          status: "live",
          half: 1,
          turnNumber: 3,
          activeSide: "home",
          homeConsented: true,
          awayConsented: true,
          startedAt: new Date("2026-03-01T20:00:00"),
          homeTurnMs: 5000,
          awayTurnMs: 3000,
          homeScore: 1,
          awayScore: 0,
          seq: 6,
          paused: false,
          clockStartedAt: new Date("2026-03-01T20:00:10"),
          finishedAt: null,
          concedeProposedBy: null,
          pendingCasualty: null,
          winnings: { home: 55000, away: 45000 },
          events: [],
        },
      }),
    );
    const res = await callGet();
    const body = await res.json();
    expect(body.live.status).toBe("live");
    expect(body.liveWinnings).toBeNull();
  });

  it("returns liveWinnings null when no LiveMatch row exists", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await callGet();
    const body = await res.json();
    expect(body.live).toBeNull();
    expect(body.liveWinnings).toBeNull();
  });

  it("returns liveWinnings null for a FINISHED row with malformed winnings JSON (defensive)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        liveMatch: {
          id: "lm-1",
          fixtureId: "f1",
          status: "finished",
          half: 2,
          turnNumber: 8,
          activeSide: "away",
          homeConsented: true,
          awayConsented: true,
          startedAt: new Date("2026-03-01T20:00:00"),
          homeTurnMs: 0,
          awayTurnMs: 0,
          homeScore: 0,
          awayScore: 0,
          seq: 9,
          paused: false,
          clockStartedAt: null,
          finishedAt: new Date("2026-03-01T21:00:00"),
          concedeProposedBy: null,
          pendingCasualty: null,
          winnings: "garbage",
          events: [],
        },
      }),
    );
    const res = await callGet();
    const body = await res.json();
    expect(body.live.status).toBe("finished");
    expect(body.liveWinnings).toBeNull();
  });

  it("RAU-13: appends 11 - available Journeymen for an unplayed fixture (synthetic ids + flag + race lineman)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    // 10 alive roster players, no Player rows → 1 journeyman completes the lineup.
    const roster = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Lineman ${i + 1}`,
      positionalKey: "lineman",
    }));
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeTeam: {
          id: "t1",
          name: "Reavers",
          raceId: "human",
          userId: "user-1",
          user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
          roster,
          players: [],
        },
      }),
    );

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    const players = body.homeTeam.players as {
      rosterPlayerId: string;
      name: string;
      positionalKey: string;
      journeyman: boolean;
    }[];
    expect(players).toHaveLength(11);
    // The 10 roster players are served first, flagged NOT journeyman.
    expect(players.filter((p) => !p.journeyman)).toHaveLength(10);
    expect(players.slice(0, 10).every((p) => p.journeyman === false)).toBe(true);
    // The single journeyman: synthetic id, race-bank name, the race's lineman key.
    expect(players[10]).toMatchObject({
      rosterPlayerId: "journeyman-t1-1",
      positionalKey: "lineman",
      pe: 0,
      alive: true,
      missNextMatch: false,
      valueBonus: 0,
      journeyman: true,
    });
    // Named from the human bank ("First Surname"), never "Novato N".
    expect(players[10].name).not.toBe("Novato 1");
    expect(players[10].name).toMatch(/\b(Martillo|Cuervo|Valiente|Ferrer|Escudo Viejo)$/);
  });

  it("RAU-13: uses the race's Lineman positional key (amazon → linewoman)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    const roster = Array.from({ length: 10 }, (_, i) => ({
      id: `a${i + 1}`,
      name: `Linewoman ${i + 1}`,
      positionalKey: "linewoman",
    }));
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeTeam: {
          id: "t1",
          name: "Eagle Warriors",
          raceId: "amazon",
          userId: "user-1",
          user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
          roster,
          players: [],
        },
      }),
    );
    const res = await callGet();
    const body = await res.json();
    const jrny = body.homeTeam.players.find((p: { journeyman: boolean }) => p.journeyman);
    expect(jrny).toMatchObject({ rosterPlayerId: "journeyman-t1-1", positionalKey: "linewoman" });
    // The amazon bank name, not "Novato N".
    expect(jrny.name).not.toBe("Novato 1");
    expect(typeof jrny.name).toBe("string");
    expect(jrny.name.length).toBeGreaterThan(0);
  });

  it("RAU-13: does NOT append journeymen when 11+ players are available", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    const roster = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Lineman ${i + 1}`,
      positionalKey: "lineman",
    }));
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeTeam: {
          id: "t1",
          name: "Reavers",
          raceId: "human",
          userId: "user-1",
          user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
          roster,
          players: [],
        },
      }),
    );
    const res = await callGet();
    const body = await res.json();
    expect(body.homeTeam.players).toHaveLength(12);
    expect(body.homeTeam.players.some((p: { journeyman: boolean }) => p.journeyman)).toBe(false);
  });

  it("RAU-13: a missNextMatch (RAU-12) player counts as unavailable for the journeymen count", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    const roster = Array.from({ length: 11 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Lineman ${i + 1}`,
      positionalKey: "lineman",
    }));
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeTeam: {
          id: "t1",
          name: "Reavers",
          raceId: "human",
          userId: "user-1",
          user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
          roster,
          players: [
            { rosterPlayerId: "p1", name: "Lineman 1", positionalKey: "lineman", pe: 0, skills: [], injuries: [], alive: true, missNextMatch: true, valueBonus: 0 },
          ],
        },
      }),
    );
    const res = await callGet();
    const body = await res.json();
    // 10 available (p1 suspended) → exactly 1 journeyman.
    expect(body.homeTeam.players.filter((p: { journeyman: boolean }) => p.journeyman)).toHaveLength(1);
  });

  it("RAU-13: does NOT append journeymen for a played fixture with no live match (manual result / walkover)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    const roster = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Lineman ${i + 1}`,
      positionalKey: "lineman",
    }));
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeScore: 2,
        awayScore: 1,
        winnerId: "t1",
        result: { id: "mr1", fixtureId: "f1", weather: null, scores: {}, pettyCash: 0, loadedBy: "user-admin" },
        homeTeam: {
          id: "t1",
          name: "Reavers",
          raceId: "human",
          userId: "user-1",
          user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
          roster,
          players: [],
        },
      }),
    );
    const res = await callGet();
    const body = await res.json();
    // Played WITHOUT a live match → no journeymen existed for that flow.
    expect(body.homeTeam.players).toHaveLength(10);
    expect(body.homeTeam.players.some((p: { journeyman: boolean }) => p.journeyman)).toBe(false);
  });

  it("RAU-13: appends journeymen for a FINISHED live match (they played the match)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const roster = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Lineman ${i + 1}`,
      positionalKey: "lineman",
    }));
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeTeam: {
          id: "t1",
          name: "Reavers",
          raceId: "human",
          userId: "user-1",
          user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
          roster,
          players: [],
        },
        liveMatch: {
          id: "lm-1",
          fixtureId: "f1",
          status: "finished",
          half: 2,
          turnNumber: 8,
          activeSide: "away",
          homeConsented: true,
          awayConsented: true,
          startedAt: new Date("2026-03-01T20:00:00"),
          homeTurnMs: 0,
          awayTurnMs: 0,
          homeScore: 1,
          awayScore: 0,
          seq: 9,
          paused: false,
          clockStartedAt: null,
          finishedAt: new Date("2026-03-01T21:00:00"),
          concedeProposedBy: null,
          pendingCasualty: null,
          winnings: { home: 55000, away: 45000 },
          events: [],
        },
      }),
    );
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.homeTeam.players.filter((p: { journeyman: boolean }) => p.journeyman)).toHaveLength(1);
    expect(body.homeTeam.players.find((p: { journeyman: boolean }) => p.journeyman)?.rosterPlayerId).toBe(
      "journeyman-t1-1",
    );
  });

  it("RAU-14: exposes the PERSISTED journeymen on `live` for a RESOLVED match (post-resolve hire flow)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    const roster = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i + 1}`,
      name: `Lineman ${i + 1}`,
      positionalKey: "lineman",
    }));
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeTeam: {
          id: "t1",
          name: "Reavers",
          raceId: "human",
          userId: "user-1",
          user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
          roster,
          players: [],
        },
        result: { id: "mr-1", fixtureId: "f1", weather: null, scores: {}, pettyCash: 0, loadedBy: "user-1" },
        homeScore: 2,
        awayScore: 1,
        winnerId: "t1",
        liveMatch: {
          id: "lm-1",
          fixtureId: "f1",
          status: "finished",
          half: 2,
          turnNumber: 8,
          activeSide: "away",
          homeConsented: true,
          awayConsented: true,
          startedAt: new Date("2026-03-01T20:00:00"),
          homeTurnMs: 0,
          awayTurnMs: 0,
          homeScore: 2,
          awayScore: 1,
          seq: 11,
          paused: false,
          clockStartedAt: null,
          finishedAt: new Date("2026-03-01T21:00:00"),
          concedeProposedBy: null,
          pendingCasualty: null,
          winnings: { home: 55000, away: 45000 },
          // RAU-14: the journeymen persisted at begin survive the resolve.
          journeymen: { home: [{ id: "journeyman-t1-1", name: "Aldric Martillo" }], away: [] },
          events: [],
        },
      }),
    );
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    // The fixture is PLAYED + has a result, yet `live.journeymen` still serves
    // the persisted novato — the post-resolve hire flow reads it from here.
    expect(body.result).not.toBeNull();
    expect(body.live.journeymen).toEqual({
      home: [{ id: "journeyman-t1-1", name: "Aldric Martillo" }],
      away: [],
    });
  });

  it("RAU-14: `live.journeymen` is null when the LiveMatch row never persisted journeymen", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeTeam: {
          id: "t1",
          name: "Reavers",
          raceId: "human",
          userId: "user-1",
          user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
          roster: [],
          players: [],
        },
        liveMatch: {
          id: "lm-1",
          fixtureId: "f1",
          status: "finished",
          half: 2,
          turnNumber: 8,
          activeSide: "away",
          homeConsented: true,
          awayConsented: true,
          startedAt: new Date("2026-03-01T20:00:00"),
          homeTurnMs: 0,
          awayTurnMs: 0,
          homeScore: 0,
          awayScore: 0,
          seq: 9,
          paused: false,
          clockStartedAt: null,
          finishedAt: new Date("2026-03-01T21:00:00"),
          concedeProposedBy: null,
          pendingCasualty: null,
          winnings: { home: 0, away: 0 },
          journeymen: null,
          events: [],
        },
      }),
    );
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.live.journeymen).toBeNull();
  });
});
