import { describe, expect, it, vi, beforeEach } from "vitest";
import { PE_MVP } from "@/lib/rules";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  matchResult: { create: vi.fn(), update: vi.fn() },
  matchResultCorrection: { create: vi.fn() },
  team: { update: vi.fn() },
  liveEvent: { aggregate: vi.fn(), createMany: vi.fn() },
  liveMatch: { updateMany: vi.fn() },
  player: { createMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  league: { findUnique: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(),
}));
const randomMock = vi.hoisted(() => ({
  rollD3: vi.fn(),
  rollD6: vi.fn(),
  rollD16: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/random", () => randomMock);
vi.mock("@/lib/players", () => ({ ensurePlayersForTeam: vi.fn(async () => {}) }));

import { POST, PUT } from "./route";

const EMPTY_COACHING = {
  rerolls: 0,
  dedicatedFans: 1,
  assistantCoaches: 0,
  cheerleaders: 0,
  apothecary: false,
};

function buildFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    leagueId: "l1",
    round: 1,
    homeTeamId: "t1",
    awayTeamId: "t2",
    scheduledAt: null,
    winnerId: null,
    homeScore: null,
    awayScore: null,
    result: null,
    league: { id: "l1", status: "started", ownerId: "user-admin" },
    homeTeam: {
      id: "t1",
      userId: "user-1",
      raceId: "human",
      roster: [],
      coaching: EMPTY_COACHING,
      treasury: 0,
      players: [{ rosterPlayerId: "hmvp", valueBonus: 150_000 }],
    },
    awayTeam: {
      id: "t2",
      userId: "user-2",
      raceId: "human",
      roster: [],
      coaching: EMPTY_COACHING,
      treasury: 0,
      players: [],
    },
    ...overrides,
  };
}

function stubTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const data = {
        fixture: { update: prismaMock.fixture.update, findMany: prismaMock.fixture.findMany },
        matchResult: { create: prismaMock.matchResult.create, update: prismaMock.matchResult.update },
        matchResultCorrection: { create: prismaMock.matchResultCorrection.create },
        team: { update: prismaMock.team.update },
        liveEvent: {
          aggregate: prismaMock.liveEvent.aggregate,
          createMany: prismaMock.liveEvent.createMany,
        },
        liveMatch: { updateMany: prismaMock.liveMatch.updateMany },
        player: { findMany: prismaMock.player.findMany, updateMany: prismaMock.player.updateMany },
        league: { findUnique: prismaMock.league.findUnique, update: prismaMock.league.update },
      };
      return cb(data as never);
    },
  );
}

const validBody = {
  weather: "perfect",
  home: {
    score: 2,
    heldBall: true,
    players: [
      { rosterPlayerId: "p1", tds: 1, casualties: 0, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 },
      { rosterPlayerId: "p2", tds: 1, casualties: 0, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 },
    ],
    mvp: { nominations: ["p1", "p2", "p3", "p4", "p5", "p6"] },
    casualties: [] as { team: "home" | "away"; rosterPlayerId: string }[],
  },
  away: {
    score: 1,
    heldBall: true,
    players: [
      { rosterPlayerId: "p3", tds: 1, casualties: 0, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 },
    ],
    mvp: { nominations: ["p3", "p4", "p5", "p6", "p7", "p8"] },
    casualties: [] as { team: "home" | "away"; rosterPlayerId: string }[],
  },
};

function request(body: unknown, method: "POST" | "PUT" = "POST") {
  return new Request(`http://localhost/api/leagues/l1/fixtures/f1/result`, {
    method,
    body: JSON.stringify(body),
  });
}

function callRoute(method: "POST" | "PUT", body: unknown, fixtureId = "f1", leagueId = "l1") {
  const handler = method === "POST" ? POST : PUT;
  return handler(
    request(body, method),
    { params: Promise.resolve({ id: leagueId, fixtureId }) } as never,
  );
}

/** Fixed server-owned rolls: pre-FF 1D3s, post-FF 1D6s, MJP 1D6s (per side). */
function stubFixedRolls() {
  // order of rollD3 calls for home preFF then away preFF
  randomMock.rollD3.mockReturnValueOnce(2).mockReturnValueOnce(1); // home preFF 3, away preFF 2
  // post-FF rollD6: home win roll, away loss roll
  randomMock.rollD6.mockReturnValueOnce(4).mockReturnValueOnce(2); // home FF 3->4 (win, 4>=3), away FF 2->2
  // MJP 1D6: home->1 (p1), away->3 (p5? away nomin: [p3,p4,p5,...] index 3 -> p5)
  randomMock.rollD6.mockReturnValueOnce(1).mockReturnValueOnce(3);
}

/**
 * Fixed MJP-only rolls for the PUT correction path, which recomputes no FF or
 * winnings and consumes exactly the two 1D6 MJP rolls (home then away). Resets
 * first so once-queued values left over from earlier `stubFixedRolls()` calls
 * do not leak across tests, then: home roll 1 -> p1, away roll 3 -> p5.
 */
function stubMvpRolls() {
  randomMock.rollD6.mockReset();
  randomMock.rollD6.mockReturnValueOnce(1).mockReturnValueOnce(3);
}

describe("POST /api/.../[fixtureId]/result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubTransaction();
    prismaMock.fixture.update.mockResolvedValue({ id: "f1" });
    prismaMock.matchResult.create.mockResolvedValue({ id: "r1" });
    // RAU-40 close-check defaults: a started league whose season is NOT yet all
    // played (no fixtures found in this tx) → `maybeCloseLeague` is a no-op.
    prismaMock.league.findUnique.mockResolvedValue({ status: "started" });
    prismaMock.fixture.findMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated with no write", async () => {
    authMock.mockResolvedValue(null);
    const res = await callRoute("POST", validBody);
    expect(res.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 404 for an authenticated foreign user (no leak)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-x" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await callRoute("POST", validBody);
    expect(res.status).toBe(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("lets a captain (home owner) load a result in one transaction", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    const res = await callRoute("POST", validBody);

    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);    // Fixture persisted with the reported scores and derived winner.
    expect(prismaMock.fixture.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f1" },
        data: expect.objectContaining({ homeScore: 2, awayScore: 1, winnerId: "t1" }),
      }),
    );
    // Treasury receives each team's winnings.
    const treasuryUpdates = prismaMock.team.update.mock.calls.map((c) => c[0]);
    expect(treasuryUpdates.some((c) => c.where.id === "t1" && c.data.treasury.increment > 0)).toBe(true);
    expect(treasuryUpdates.some((c) => c.where.id === "t2" && c.data.treasury.increment > 0)).toBe(true);
    // The persisted report carries the TV-difference petty cash (150k).
    expect(prismaMock.matchResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pettyCash: 150_000, loadedBy: "user-1" }),
      }),
    );
  });

  it("accepts the client-contract `ballHeld` field (ResultPayload), not just `heldBall`", async () => {
    // The ResultModal/ResultPayload sends `ballHeld`; the route MUST read it or a
    // real UI result load is rejected with "Invalid result payload" (400).
    const clientBody = {
      weather: "perfect",
      home: {
        score: 2,
        ballHeld: true,
        players: [
          { rosterPlayerId: "p1", tds: 1, casualties: 0, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 },
          { rosterPlayerId: "p2", tds: 1, casualties: 0, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 },
        ],
        mvp: { nominations: ["p1", "p2", "p3", "p4", "p5", "p6"] },
        casualties: [] as { team: "home" | "away"; rosterPlayerId: string }[],
      },
      away: {
        score: 0,
        ballHeld: true,
        players: [
          { rosterPlayerId: "p3", tds: 0, casualties: 0, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 },
        ],
        mvp: { nominations: ["p3", "p4", "p5", "p6", "p7", "p8"] },
        casualties: [] as { team: "home" | "away"; rosterPlayerId: string }[],
      },
    };
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    const res = await callRoute("POST", clientBody);
    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("awards per-player PE in the same transaction", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();

    await callRoute("POST", validBody);

    const peUpdate = prismaMock.player.updateMany.mock.calls.map((c) => c[0]);
    // home p2 (1 TD, not MVP) gains 3 PE; the MVP grantee p1 gains TD 3 + MJP 4 = 7.
    expect(peUpdate.some((c) => c.where.rosterPlayerId === "p2" && c.data.pe.increment === 3)).toBe(true);
    // away team's reported 1-TD player gains 3 PE.
    expect(peUpdate.some((c) => c.where.teamId === "t2" && c.where.rosterPlayerId === "p3" && c.data.pe.increment === 3)).toBe(true);
    // the home MJP grantee (p1, roll 1) gains the 4-PE MJP bonus on top.
    expect(peUpdate.some((c) => c.where.rosterPlayerId === "p1" && c.data.pe.increment === 3 + PE_MVP)).toBe(true);
  });

  it("persists per-victim injury outcomes on the Player rows in the same transaction", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();
    // home inflicts a casualty on away victim av1; away clears roll 1D16s [16=dead, 2=bruise].
    const body = structuredClone(validBody);
    body.home.casualties = [{ team: "away", rosterPlayerId: "av1" }];
    body.away.casualties = [{ team: "home", rosterPlayerId: "hv1" }];
    randomMock.rollD16.mockReturnValueOnce(16).mockReturnValueOnce(2); // av1 dead, hv1 bruise
    prismaMock.player.findMany.mockResolvedValue([
      { teamId: "t2", rosterPlayerId: "av1", injuries: [], alive: true },
      { teamId: "t1", rosterPlayerId: "hv1", injuries: [], alive: true },
    ]);
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    const res = await callRoute("POST", body);

    expect(res.status).toBe(200);
    expect(prismaMock.player.findMany).toHaveBeenCalledTimes(1);
    // Death: away victim av1 appended {kind:dead} and marked dead.
    expect(
      prismaMock.player.updateMany.mock.calls.some(
        (c) =>
          c[0].where.teamId === "t2" &&
          c[0].where.rosterPlayerId === "av1" &&
          c[0].data.alive === false &&
          c[0].data.injuries[0].kind === "dead",
      ),
    ).toBe(true);
    // Non-fatal: home victim hv1 appended {kind:bruise}, stays alive.
    expect(
      prismaMock.player.updateMany.mock.calls.some(
        (c) =>
          c[0].where.teamId === "t1" &&
          c[0].where.rosterPlayerId === "hv1" &&
          c[0].data.alive === true &&
          c[0].data.injuries[0].kind === "bruise",
      ),
    ).toBe(true);
    // The report snapshot records each team's victims with their resolved band.
    expect(prismaMock.matchResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scores: expect.objectContaining({
            home: expect.objectContaining({
              casualties: expect.arrayContaining([
                expect.objectContaining({ team: "home", rosterPlayerId: "hv1", outcome: { kind: "bruise" } }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it("RAU-12: clears both teams' served suspensions then flags a lasting-band victim for the next match", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();
    const body = structuredClone(validBody);
    body.home.casualties = [{ team: "away", rosterPlayerId: "av1" }];
    randomMock.rollD16.mockReturnValueOnce(9); // 9-10 → apaleado (lasting)
    prismaMock.player.findMany.mockResolvedValue([
      { teamId: "t2", rosterPlayerId: "av1", injuries: [], alive: true },
    ]);
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    const res = await callRoute("POST", body);
    expect(res.status).toBe(200);

    const calls = prismaMock.player.updateMany.mock.calls.map((c) => c[0]);
    // Clear: EVERY player of both teams has their served suspension released.
    const clear = calls.find(
      (c) => c.data.missNextMatch === false && c.data.injuries === undefined,
    );
    expect(clear).toEqual({
      where: { teamId: { in: ["t1", "t2"] } },
      data: { missNextMatch: false },
    });
    // Set: the lasting victim is flagged unavailable for the NEXT match.
    const set = calls.find(
      (c) => c.where.rosterPlayerId === "av1" && c.data.injuries !== undefined,
    );
    expect(set!.data).toEqual(
      expect.objectContaining({ missNextMatch: true, alive: true }),
    );
    // Order matters: the clear runs BEFORE the newly-injured are flagged, so a
    // player injured in THIS match starts their suspension after it.
    const clearIndex = calls.indexOf(clear!);
    const setIndex = calls.indexOf(set!);
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(clearIndex).toBeLessThan(setIndex);
  });

  it("RAU-12: a bruise victim stays available and a dead victim stays dead with missNextMatch false", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();
    const body = structuredClone(validBody);
    body.home.casualties = [{ team: "away", rosterPlayerId: "av1" }];
    body.away.casualties = [{ team: "home", rosterPlayerId: "hv1" }];
    randomMock.rollD16.mockReturnValueOnce(16).mockReturnValueOnce(2); // av1 dead, hv1 bruise
    prismaMock.player.findMany.mockResolvedValue([
      { teamId: "t2", rosterPlayerId: "av1", injuries: [], alive: true },
      { teamId: "t1", rosterPlayerId: "hv1", injuries: [], alive: true },
    ]);
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    const res = await callRoute("POST", body);
    expect(res.status).toBe(200);

    const calls = prismaMock.player.updateMany.mock.calls.map((c) => c[0]);
    // Dead: alive=false and the suspension flag is irrelevant → false.
    expect(
      calls.find((c) => c.where.rosterPlayerId === "av1")?.data,
    ).toEqual(expect.objectContaining({ alive: false, missNextMatch: false }));
    // Bruise: never blocks the next match → flag stays false, player alive.
    expect(
      calls.find((c) => c.where.rosterPlayerId === "hv1")?.data,
    ).toEqual(expect.objectContaining({ alive: true, missNextMatch: false }));
  });

  it("RAU-12: a second match's load clears the previous flag even with no new casualties", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    // No casualties in this payload — the suspension from the prior match is
    // still served (cleared) for every player of both teams.
    const res = await callRoute("POST", validBody);
    expect(res.status).toBe(200);

    expect(
      prismaMock.player.updateMany.mock.calls.some(
        (c) =>
          c[0].data.missNextMatch === false &&
          c[0].data.injuries === undefined &&
          c[0].where.teamId !== undefined,
      ),
    ).toBe(true);
  });

  it("skips unknown victim ids that are not in the roster (no write)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();
    const body = structuredClone(validBody);
    body.home.casualties = [{ team: "away", rosterPlayerId: "ghost" }];
    randomMock.rollD16.mockReturnValueOnce(7);
    // Roster backfill created only known ids; the mocked read returns no Player row.
    prismaMock.player.findMany.mockResolvedValue([]);
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    await callRoute("POST", body);

    // No updateMany persisted for the unknown victim (findMany returned nothing for it).
    const injuryWrites = prismaMock.player.updateMany.mock.calls.filter(
      (c) => c[0].data.injuries !== undefined,
    );
    expect(injuryWrites.some((c) => c[0].where.rosterPlayerId === "ghost")).toBe(false);
  });

  it("skips an already-dead victim (no revive, no re-append)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();
    const body = structuredClone(validBody);
    body.home.casualties = [{ team: "away", rosterPlayerId: "av1" }];
    randomMock.rollD16.mockReturnValueOnce(5);
    prismaMock.player.findMany.mockResolvedValue([
      { teamId: "t2", rosterPlayerId: "av1", injuries: [{ kind: "dead" }], alive: false },
    ]);
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    await callRoute("POST", body);

    // alive:false row prevents any injury write for that victim.
    const injuryWrites = prismaMock.player.updateMany.mock.calls.filter(
      (c) => c[0].data.injuries !== undefined,
    );
    expect(injuryWrites.some((c) => c[0].where.rosterPlayerId === "av1")).toBe(false);
  });

  it("persists a duplicate victim id only once", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();
    const body = structuredClone(validBody);
    // home lists the same away victim twice.
    body.home.casualties = [
      { team: "away", rosterPlayerId: "av1" },
      { team: "away", rosterPlayerId: "av1" },
    ];
    randomMock.rollD16.mockReturnValueOnce(10).mockReturnValueOnce(10);
    prismaMock.player.findMany.mockResolvedValue([
      { teamId: "t2", rosterPlayerId: "av1", injuries: [], alive: true },
    ]);
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    await callRoute("POST", body);

    const av1Writes = prismaMock.player.updateMany.mock.calls.filter(
      (c) => c[0].where.rosterPlayerId === "av1" && c[0].data.injuries !== undefined,
    );
    expect(av1Writes).toHaveLength(1);
  });

  it("returns 400 when TDs do not sum to the reported score", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const bad = structuredClone(validBody);
    bad.home.score = 3; // players sum to 2
    const res = await callRoute("POST", bad);
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("persists a draw with a null winner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const draw = structuredClone(validBody);
    draw.away.score = 2;
    draw.away.players.push({ rosterPlayerId: "p4", tds: 1, casualties: 0, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 });
    stubFixedRolls();

    const res = await callRoute("POST", draw);

    expect(res.status).toBe(200);
    expect(prismaMock.fixture.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ homeScore: 2, awayScore: 2, winnerId: null }) }),
    );
  });

  it("returns 409 for a repeat load on an already-played fixture (no re-award)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({ homeScore: 2, awayScore: 1, winnerId: "t1" }),
    );
    const res = await callRoute("POST", validBody);
    expect(res.status).toBe(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 409 on a forfeited fixture", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture({ winnerId: "t1" }));
    const res = await callRoute("POST", validBody);
    expect(res.status).toBe(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("achieves atomicity through a single $transaction", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();
    await callRoute("POST", validBody);
    // fixture, report, both treasuries, and PE all happen inside one tx boundary.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.matchResult.create).toHaveBeenCalledTimes(1);
  });

  it("persists winnings and the MVP grantees inside the scores snapshot (D4)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();

    await callRoute("POST", validBody);

    // The snapshot JSON is the MV-2 source of truth: it must carry both teams'
    // winnings (per-side, per the MatchScoreboard contract) and the server-rolled
    // MVP grantee roster ids (forward-only, no schema change). Fixed rolls →
    // home preFF 3, away preFF 2, home TD 2, away TD 1, both held ball → home
    // 45k, away 35k; MJP rolls home 1 → p1, away 3 → p5.
    expect(prismaMock.matchResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scores: expect.objectContaining({
            home: expect.objectContaining({ winnings: 45_000 }),
            away: expect.objectContaining({ winnings: 35_000 }),
            mvp: { home: "p1", away: "p5" },
          }),
        }),
      }),
    );
  });

  it("auto-closes the league when this result finishes the season (RAU-40)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });
    // The tx's `findMany` sees the JUST-updated fixture (2-1 home win): the
    // season has exactly one fixture and it is now played → the league closes.
    prismaMock.fixture.findMany.mockResolvedValue([
      { homeTeamId: "t1", awayTeamId: "t2", homeScore: 2, awayScore: 1, winnerId: "t1" },
    ]);

    const res = await callRoute("POST", validBody);

    expect(res.status).toBe(200);
    // The close runs INSIDE the result transaction (same $transaction call).
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.league.findUnique).toHaveBeenCalledWith({
      where: { id: "l1" },
      select: { status: true },
    });
    expect(prismaMock.league.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { status: "finished", championTeamId: "t1" },
    });
  });

  it("does NOT close the league while any fixture remains unplayed (RAU-40)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    stubFixedRolls();
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.fixture.findMany.mockResolvedValue([
      { homeTeamId: "t1", awayTeamId: "t2", homeScore: 2, awayScore: 1, winnerId: "t1" },
      { homeTeamId: "t3", awayTeamId: "t4", homeScore: null, awayScore: null, winnerId: null },
    ]);

    const res = await callRoute("POST", validBody);

    expect(res.status).toBe(200);
    expect(prismaMock.league.update).not.toHaveBeenCalled();
  });

  it("returns 409 on a finished league (definitive — no more results, RAU-40)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({ league: { id: "l1", status: "finished", ownerId: "user-admin" } }),
    );
    const res = await callRoute("POST", validBody);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "League is finished" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/.../[fixtureId]/result — MVP live-event write (LM-mvp, D20)", () => {
  const finishedAtIso = "2026-01-15T12:00:00.000Z";
  const finishedAtMs = new Date(finishedAtIso).getTime();

  function fixtureWithLiveMatch(overrides: Record<string, unknown> = {}) {
    return buildFixture({
      liveMatch: { id: "lm-1", half: 2, turnNumber: 8, finishedAt: new Date(finishedAtIso), ...overrides },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    stubTransaction();
    prismaMock.fixture.update.mockResolvedValue({ id: "f1" });
    prismaMock.matchResult.create.mockResolvedValue({ id: "r1" });
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });
  });

  it("appends home+away mvp events with monotonic seq inside the result transaction (D20)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(fixtureWithLiveMatch());
    stubFixedRolls();
    // Existing events cap at seq 7 → home mvp seq 8, away 9.
    prismaMock.liveEvent.aggregate.mockResolvedValue({ _max: { seq: 7 } });

    const res = await callRoute("POST", validBody);
    expect(res.status).toBe(200);

    // The two mvp events are written via createMany inside the tx.
    const createCalls = prismaMock.liveEvent.createMany.mock.calls;
    expect(createCalls).toHaveLength(1);
    const created = createCalls[0][0].data;
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({
      liveMatchId: "lm-1",
      seq: 8,
      kind: "mvp",
      side: "home",
      playerRosterId: "p1", // fixed MJP roll 1 → home grantee
    });
    expect(created[1]).toMatchObject({
      liveMatchId: "lm-1",
      seq: 9,
      kind: "mvp",
      side: "away",
      playerRosterId: "p5", // fixed MJP roll 3 → away grantee
    });
    // The row seq is bumped past BOTH mvp seqs so the next event never collides.
    expect(prismaMock.liveMatch.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lm-1" },
        data: expect.objectContaining({ seq: 9 }),
      }),
    );
  });

  it("writes mvp events with at = lm.finishedAt when present (validator refinement)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(fixtureWithLiveMatch());
    stubFixedRolls();
    prismaMock.liveEvent.aggregate.mockResolvedValue({ _max: { seq: 0 } });

    await callRoute("POST", validBody);

    const created = prismaMock.liveEvent.createMany.mock.calls[0][0].data;
    expect(created[0].createdAt).toEqual(new Date(finishedAtMs));
  });

  it("appends no mvp events for a fixture WITHOUT a LiveMatch (legacy/walkover)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture()); // no liveMatch
    stubFixedRolls();
    prismaMock.liveEvent.aggregate.mockResolvedValue({ _max: { seq: 0 } });

    const res = await callRoute("POST", validBody);
    expect(res.status).toBe(200);
    expect(prismaMock.liveEvent.createMany).not.toHaveBeenCalled();
    expect(prismaMock.liveMatch.updateMany).not.toHaveBeenCalled();
  });

  it("returns 409 when the concurrent double-write hits @@unique([liveMatchId, seq]) (P2002, D20)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(fixtureWithLiveMatch());
    stubFixedRolls();
    prismaMock.liveEvent.aggregate.mockResolvedValue({ _max: { seq: 7 } });
    // A raced submit already consumed seq 8/9 → createMany raises Prisma P2002.
    prismaMock.liveEvent.createMany.mockRejectedValue(
      Object.assign(new Error("Unique constraint on liveMatchId, seq"), { code: "P2002" }),
    );

    const res = await callRoute("POST", validBody);
    expect(res.status).toBe(409);
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });
});

describe("PUT /api/.../[fixtureId]/result (correction)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubTransaction();
  });

  function playedFixture() {
    const base = buildFixture();
    return {
      ...base,
      homeScore: 2,
      awayScore: 1,
      winnerId: "t1",
      result: {
        id: "r1",
        fixtureId: "f1",
        weather: "perfect",
        scores: {
          home: { score: 2, postFf: 4, casualties: 0, pe: [{ rosterPlayerId: "p1", pe: 3 + PE_MVP }] },
          away: { score: 1, postFf: 2, casualties: 0, pe: [{ rosterPlayerId: "p3", pe: 3 }] },
        } as {
          home: { score: number; postFf: number; casualties: number; winnings?: number; pe: { rosterPlayerId: string; pe: number }[] };
          away: { score: number; postFf: number; casualties: number; winnings?: number; pe: { rosterPlayerId: string; pe: number }[] };
          mvp?: { home: string; away: string };
        },
        pettyCash: 150_000,
        loadedBy: "user-1",
      },
    };
  }

  it("accepts a correction from a participant captain (admin OR captain, 200)", async () => {
    // user-1 owns the home team → a participant captain correcting a played result.
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(playedFixture());
    stubFixedRolls();
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    const res = await callRoute("PUT", validBody);
    expect(res.status).toBe(200);
    // The correction commits with the captain as the audited actor.
    expect(prismaMock.matchResultCorrection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ correctedBy: "user-1" }),
      }),
    );
  });

  it("returns 404 for a foreign admin request without leak", async () => {
    authMock.mockResolvedValue({ user: { id: "user-x" } });
    prismaMock.fixture.findFirst.mockResolvedValue(playedFixture());
    const res = await callRoute("PUT", validBody);
    expect(res.status).toBe(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("records an audit correction with before/after snapshot for an admin", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(playedFixture());
    stubFixedRolls();
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    const res = await callRoute("PUT", validBody);

    expect(res.status).toBe(200);
    expect(prismaMock.matchResultCorrection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultId: "r1",
          correctedBy: "user-admin",
          before: expect.objectContaining({ home: expect.objectContaining({ score: 2 }) }),
          after: expect.objectContaining({ home: expect.objectContaining({ score: 2 }) }),
        }),
      }),
    );
  });

  it("never revokes spent PE on a correction that awards fewer PE", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    // p1 previously earned MORE (9) than the correcting report gives (3): spent PE must not be revoked.
    const played = playedFixture();
    played.result.scores.home.pe = [{ rosterPlayerId: "p1", pe: 9 }];
    prismaMock.fixture.findFirst.mockResolvedValue(played);
    stubFixedRolls();
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    await callRoute("PUT", validBody);

    // delta = max(0, 3 - 9) = 0 → never a decrement, never a negative increment.
    // (The RAU-12 clear writes `missNextMatch`, not `pe` — skip it.)
    for (const call of prismaMock.player.updateMany.mock.calls) {
      if (call[0].data.pe === undefined) continue;
      expect(call[0].data.pe.increment).toBeGreaterThanOrEqual(0);
    }
    // No player is given a negative PE delta to "recover" spent PE.
    const increments = prismaMock.player.updateMany.mock.calls
      .map((c) => c[0].data.pe?.increment)
      .filter((n): n is number => typeof n === "number");
    expect(increments.some((n) => n < 0)).toBe(false);
  });

  it("applies the positive PE delta when a correction awards more PE", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    // previously p3 earned 1 PE; correcting report gives 3 → +2 applied.
    const played = playedFixture();
    played.result.scores.away.pe = [{ rosterPlayerId: "p3", pe: 1 }];
    prismaMock.fixture.findFirst.mockResolvedValue(played);
    stubFixedRolls();

    await callRoute("PUT", validBody);

    expect(
      prismaMock.player.updateMany.mock.calls.some(
        (c) => c[0].where.teamId === "t2" && c[0].where.rosterPlayerId === "p3" && c[0].data.pe.increment === 2,
      ),
    ).toBe(true);
  });

  it("persists corrected per-victim injuries on re-run, skipping already-dead", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    // Previous report had no casualties; the corrected report now kills an away victim.
    const played = playedFixture();
    prismaMock.fixture.findFirst.mockResolvedValue(played);
    stubFixedRolls();
    const body = structuredClone(validBody);
    body.home.casualties = [{ team: "away", rosterPlayerId: "av1" }];
    randomMock.rollD16.mockReturnValueOnce(15); // dead (15-16)
    // av1 already dead from a prior load → the re-run must not revive or re-append.
    prismaMock.player.findMany.mockResolvedValue([
      { teamId: "t2", rosterPlayerId: "av1", injuries: [{ kind: "dead" }], alive: false },
    ]);
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    const res = await callRoute("PUT", body);

    expect(res.status).toBe(200);
    // The already-dead victim is skipped: no injury write for av1.
    const injuryWrites = prismaMock.player.updateMany.mock.calls.filter(
      (c) => c[0].data.injuries !== undefined,
    );
    expect(injuryWrites.some((c) => c[0].where.rosterPlayerId === "av1")).toBe(false);
    // The audit snapshot records the corrected casualty (before empty, after dead).
    expect(prismaMock.matchResultCorrection.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          after: expect.objectContaining({
            away: expect.objectContaining({
              casualties: expect.arrayContaining([
                expect.objectContaining({ team: "away", rosterPlayerId: "av1", outcome: { kind: "dead" } }),
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it("RAU-12: the correction re-applies clear-then-set for the corrected casualties", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(playedFixture());
    stubFixedRolls();
    const body = structuredClone(validBody);
    body.home.casualties = [{ team: "away", rosterPlayerId: "av1" }];
    randomMock.rollD16.mockReturnValueOnce(11); // 11-12 → grave (lasting)
    prismaMock.player.findMany.mockResolvedValue([
      { teamId: "t2", rosterPlayerId: "av1", injuries: [], alive: true },
    ]);
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    const res = await callRoute("PUT", body);
    expect(res.status).toBe(200);

    const calls = prismaMock.player.updateMany.mock.calls.map((c) => c[0]);
    // The correction is an applied match: served suspensions clear first…
    expect(calls.some((c) => c.data.missNextMatch === false && c.data.injuries === undefined)).toBe(true);
    // …then the corrected lasting victim is re-flagged.
    expect(
      calls.find((c) => c.where.rosterPlayerId === "av1")?.data,
    ).toEqual(expect.objectContaining({ missNextMatch: true, alive: true }));
  });

  it("returns 409 when there is no result to correct", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture()); // no result
    const res = await callRoute("PUT", validBody);
    expect(res.status).toBe(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("PUT recomputes MVP and preserves prior winnings in the snapshot (D4)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    // Prior snapshot already carries winnings (per-side, per the MatchScoreboard
    // contract); the correction must keep them and re-roll the MJP grantee.
    const played = playedFixture();
    played.result.scores.home.winnings = 45_000;
    played.result.scores.away.winnings = 35_000;
    prismaMock.fixture.findFirst.mockResolvedValue(played);
    // PUT consumes only the two MJP 1D6s (no FF/winnings re-compute): home
    // roll 1 → p1, away roll 3 → p5.
    stubMvpRolls();
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    const res = await callRoute("PUT", validBody);
    expect(res.status).toBe(200);

    // MVP is recomputed from the re-rolled grantee; prior winnings are
    // preserved verbatim (forward-only, and a correction must never clear the
    // winnings the original report earned).
    expect(prismaMock.matchResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scores: expect.objectContaining({
            home: expect.objectContaining({ winnings: 45_000 }),
            away: expect.objectContaining({ winnings: 35_000 }),
            mvp: { home: "p1", away: "p5" },
          }),
        }),
      }),
    );
  });

  it("PUT leaves legacy rows without winnings/mvp unaffected (omic-if-absent)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    // A pre-D4 snapshot has no winnings/mvp keys; the correction must still
    // persist mvp (recomputed) and must not introduce a winnings field.
    prismaMock.fixture.findFirst.mockResolvedValue(playedFixture());
    stubMvpRolls();
    prismaMock.player.updateMany.mockResolvedValue({ count: 1 });

    const res = await callRoute("PUT", validBody);
    expect(res.status).toBe(200);

    expect(prismaMock.matchResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scores: expect.objectContaining({
            mvp: { home: "p1", away: "p5" },
          }),
        }),
      }),
    );
    const updateArg = prismaMock.matchResult.update.mock.calls[0][0];
    expect(updateArg.data.scores.home).not.toHaveProperty("winnings");
    expect(updateArg.data.scores.away).not.toHaveProperty("winnings");
  });

  it("returns 409 when the league is finished — the champion is definitive (RAU-40)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    const played = playedFixture();
    played.league = { id: "l1", status: "finished", ownerId: "user-admin" };
    prismaMock.fixture.findFirst.mockResolvedValue(played);
    const res = await callRoute("PUT", validBody);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "League is finished" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
