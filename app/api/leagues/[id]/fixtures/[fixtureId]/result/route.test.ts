import { describe, expect, it, vi, beforeEach } from "vitest";
import { PE_MVP } from "@/lib/rules";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn(), update: vi.fn() },
  matchResult: { create: vi.fn(), update: vi.fn() },
  matchResultCorrection: { create: vi.fn() },
  team: { update: vi.fn() },
  player: { createMany: vi.fn(), updateMany: vi.fn() },
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
        fixture: { update: prismaMock.fixture.update },
        matchResult: { create: prismaMock.matchResult.create, update: prismaMock.matchResult.update },
        matchResultCorrection: { create: prismaMock.matchResultCorrection.create },
        team: { update: prismaMock.team.update },
        player: { updateMany: prismaMock.player.updateMany },
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
  },
  away: {
    score: 1,
    heldBall: true,
    players: [
      { rosterPlayerId: "p3", tds: 1, casualties: 0, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 },
    ],
    mvp: { nominations: ["p3", "p4", "p5", "p6", "p7", "p8"] },
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

describe("POST /api/.../[fixtureId]/result", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubTransaction();
    prismaMock.fixture.update.mockResolvedValue({ id: "f1" });
    prismaMock.matchResult.create.mockResolvedValue({ id: "r1" });
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
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    // Fixture persisted with the reported scores and derived winner.
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
        },
        pettyCash: 150_000,
        loadedBy: "user-1",
      },
    };
  }

  it("returns 403 for a captain attempting a correction", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(playedFixture());
    const res = await callRoute("PUT", validBody);
    expect(res.status).toBe(403);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
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
    for (const call of prismaMock.player.updateMany.mock.calls) {
      expect(call[0].data.pe.increment).toBeGreaterThanOrEqual(0);
    }
    // No player is given a negative PE delta to "recover" spent PE.
    const increments = prismaMock.player.updateMany.mock.calls.map((c) => c[0].data.pe.increment);
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

  it("returns 409 when there is no result to correct", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture()); // no result
    const res = await callRoute("PUT", validBody);
    expect(res.status).toBe(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
