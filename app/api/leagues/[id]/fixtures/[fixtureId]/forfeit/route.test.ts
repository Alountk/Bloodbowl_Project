import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  scheduleProposal: { updateMany: vi.fn() },
  league: { findUnique: vi.fn(), update: vi.fn() },
  // LMR-6: the walkover tx also clears the fixture's orphan LiveMatch.
  liveMatch: { deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// LAC-3: the privileged branch authorizes via `requirePermission("leagues.manage")`.
const requirePermissionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/devGuard", () => ({
  requirePermission: requirePermissionMock,
}));

import { POST } from "./route";

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
    league: { id: "l1", status: "started", ownerId: "user-owner" },
    homeTeam: { id: "t1", userId: "user-1" },
    awayTeam: { id: "t2", userId: "user-2" },
    ...overrides,
  };
}

function stubTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const data = {
        scheduleProposal: { updateMany: prismaMock.scheduleProposal.updateMany },
        fixture: { update: prismaMock.fixture.update, findMany: prismaMock.fixture.findMany },
        league: { findUnique: prismaMock.league.findUnique, update: prismaMock.league.update },
        liveMatch: { deleteMany: prismaMock.liveMatch.deleteMany },
      };
      return cb(data as never);
    },
  );
}

function forfeit(body: unknown, fixtureId = "f1", leagueId = "l1") {
  return POST(
    new Request(`http://localhost:3000/api/leagues/${leagueId}/fixtures/${fixtureId}/forfeit`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: leagueId, fixtureId }) } as never,
  );
}

describe("POST /api/leagues/[id]/fixtures/[fixtureId]/forfeit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubTransaction();
    // Default: a plain `user` is not privileged (the privileged tests override).
    requirePermissionMock.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    // RAU-40 close-check defaults: started league, nothing yet played in this
    // tx → `maybeCloseLeague` is a no-op.
    prismaMock.league.findUnique.mockResolvedValue({ status: "started" });
    prismaMock.fixture.findMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await forfeit({ winnerTeamId: "t1" });
    expect(res.status).toBe(401);
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("returns 403 for a participant (non-admin) and mutates nothing", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } }); // home team owner, not league owner
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await forfeit({ winnerTeamId: "t1" });
    expect(res.status).toBe(403);
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
    expect(prismaMock.scheduleProposal.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.liveMatch.deleteMany).not.toHaveBeenCalled();
  });

  it("returns 400 when winnerTeamId is neither home nor away", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await forfeit({ winnerTeamId: "t3" });
    expect(res.status).toBe(400);
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("sets winnerId and closes open proposals when the league owner forfeits", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.fixture.update.mockResolvedValue({
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "t1",
      awayTeamId: "t2",
      scheduledAt: null,
      winnerId: "t1",
    });

    const res = await forfeit({ winnerTeamId: "t1" });

    expect(res.status).toBe(200);
    expect(prismaMock.fixture.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f1" },
        data: { winnerId: "t1", homeScore: 2, awayScore: 0, scheduledAt: null },
      }),
    );
    // Any open proposal is closed in the same transaction.
    expect(prismaMock.scheduleProposal.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fixtureId: "f1", acceptedAt: null, closedAt: null },
        data: { closedAt: expect.any(Date) },
      }),
    );
  });

  it("records a 0-2 walkover when the away team wins", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.fixture.update.mockResolvedValue({
      id: "f1",
      homeScore: 0,
      awayScore: 2,
      winnerId: "t2",
    });

    const res = await forfeit({ winnerTeamId: "t2" });

    expect(res.status).toBe(200);
    expect(prismaMock.fixture.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { winnerId: "t2", homeScore: 0, awayScore: 2, scheduledAt: null } }),
    );
  });

  it("deletes the fixture's orphan LiveMatch in the same walkover transaction (LMR-6)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.fixture.update.mockResolvedValue({
      id: "f1",
      winnerId: "t1",
      homeScore: 2,
      awayScore: 0,
    });

    const res = await forfeit({ winnerTeamId: "t1" });

    expect(res.status).toBe(200);
    // A played walkover must never leave a live badge behind: the orphan
    // LiveMatch (and its cascading events) is deleted inside the same tx.
    expect(prismaMock.liveMatch.deleteMany).toHaveBeenCalledWith({
      where: { fixtureId: "f1" },
    });
  });

  it("returns 409 for a repeat forfeit on an already-played fixture", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture({ winnerId: "t1" }));
    const res = await forfeit({ winnerTeamId: "t2" });
    expect(res.status).toBe(409);
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("allows a forfeit on a scheduled fixture (overrides to played)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({ scheduledAt: new Date("2026-03-01T10:00:00.000Z") }),
    );
    prismaMock.fixture.update.mockResolvedValue({
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "t1",
      awayTeamId: "t2",
      scheduledAt: null,
      winnerId: "t1",
    });

    const res = await forfeit({ winnerTeamId: "t1" });
    expect(res.status).toBe(200);
    expect(prismaMock.fixture.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { winnerId: "t1", homeScore: 2, awayScore: 0, scheduledAt: null },
      }),
    );
  });

  it("returns 409 when the fixture already has a loaded result (mutual exclusion)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({ homeScore: 2, awayScore: 1, winnerId: "t1" }),
    );
    const res = await forfeit({ winnerTeamId: "t2" });
    expect(res.status).toBe(409);
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("auto-closes the league when the walkover finishes the season (RAU-40)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.fixture.update.mockResolvedValue({ id: "f1", winnerId: "t1", homeScore: 2, awayScore: 0 });
    // The tx's `findMany` sees the JUST-updated fixture (2-0): the season's
    // only fixture is now played → the league closes in the same transaction.
    prismaMock.fixture.findMany.mockResolvedValue([
      { homeTeamId: "t1", awayTeamId: "t2", homeScore: 2, awayScore: 0, winnerId: "t1" },
    ]);

    const res = await forfeit({ winnerTeamId: "t1" });

    expect(res.status).toBe(200);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.league.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { status: "finished", championTeamId: "t1" },
    });
  });

  it("returns 409 on a finished league (definitive — no more walkovers, RAU-40)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({ league: { id: "l1", status: "finished", ownerId: "user-owner" } }),
    );
    const res = await forfeit({ winnerTeamId: "t1" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "League is finished" });
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("lets a leagues.manage holder award a forfeit on a foreign STARTED league (LAC-3)", async () => {
    authMock.mockResolvedValue({ user: { id: "dev-1" } });
    requirePermissionMock.mockResolvedValue({ ok: true, userId: "dev-1" });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture()); // ownerId user-owner (foreign)
    prismaMock.fixture.update.mockResolvedValue({ id: "f1", winnerId: "t1", homeScore: 2, awayScore: 0 });

    const res = await forfeit({ winnerTeamId: "t1" });

    expect(res.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("leagues.manage");
    expect(prismaMock.fixture.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { winnerId: "t1", homeScore: 2, awayScore: 0, scheduledAt: null },
      }),
    );
  });

  it("returns 403 for a plain user who is neither owner nor privileged (regression)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } }); // home team owner, not league owner
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());

    const res = await forfeit({ winnerTeamId: "t1" });

    expect(res.status).toBe(403);
    // The owner-first check failed and the plain user's privilege check denied.
    expect(requirePermissionMock).toHaveBeenCalledWith("leagues.manage");
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a nonexistent fixture id without reading a role (no leak)", async () => {
    authMock.mockResolvedValue({ user: { id: "dev-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(null);

    const res = await forfeit({ winnerTeamId: "t1" }, "missing", "l1");

    expect(res.status).toBe(404);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });
});
