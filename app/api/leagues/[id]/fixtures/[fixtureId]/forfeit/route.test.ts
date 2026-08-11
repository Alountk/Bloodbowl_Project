import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn(), update: vi.fn() },
  scheduleProposal: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

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
        fixture: { update: prismaMock.fixture.update },
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
});
