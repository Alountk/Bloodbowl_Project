import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn(), update: vi.fn() },
  scheduleProposal: { findFirst: vi.fn(), update: vi.fn() },
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
    league: { id: "l1", status: "started" },
    homeTeam: { id: "t1", userId: "user-1" },
    awayTeam: { id: "t2", userId: "user-2" },
    ...overrides,
  };
}

function buildProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    fixtureId: "f1",
    userId: "user-1",
    date: new Date("2026-03-01T10:00:00.000Z"),
    createdAt: new Date("2026-02-02T10:00:00.000Z"),
    acceptedAt: null,
    closedAt: null,
    ...overrides,
  };
}

function stubTransaction() {
  prismaMock.$transaction.mockImplementation(
    async (cb: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const data = {
        fixture: {
          findFirst: prismaMock.fixture.findFirst,
          update: prismaMock.fixture.update,
        },
        scheduleProposal: {
          findFirst: prismaMock.scheduleProposal.findFirst,
          update: prismaMock.scheduleProposal.update,
        },
      };
      return cb(data as never);
    },
  );
}

function accept(body: unknown, fixtureId = "f1", leagueId = "l1") {
  return POST(
    new Request(`http://localhost:3000/api/leagues/${leagueId}/fixtures/${fixtureId}/accept`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: leagueId, fixtureId }) } as never,
  );
}

describe("POST /api/leagues/[id]/fixtures/[fixtureId]/accept", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stubTransaction();
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await accept({ proposalId: "p1" });
    expect(res.status).toBe(401);
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a non-participant accepting", async () => {
    authMock.mockResolvedValue({ user: { id: "user-3" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await accept({ proposalId: "p1" });
    expect(res.status).toBe(404);
    expect(prismaMock.scheduleProposal.update).not.toHaveBeenCalled();
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("sets scheduledAt and acceptedAt when the OTHER participant accepts", async () => {
    // user-2 (away owner) accepts a proposal created by user-1 (home owner).
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.scheduleProposal.findFirst.mockResolvedValue(buildProposal({ userId: "user-1" }));

    const updatedFixture = {
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "t1",
      awayTeamId: "t2",
      scheduledAt: new Date("2026-03-01T10:00:00.000Z"),
      winnerId: null,
    };
    prismaMock.scheduleProposal.update.mockResolvedValue(buildProposal({ acceptedAt: new Date() }));
    prismaMock.fixture.update.mockResolvedValue(updatedFixture);

    const res = await accept({ proposalId: "p1" });

    expect(res.status).toBe(200);
    // The proposal is marked accepted and the fixture scheduled in the SAME tx.
    expect(prismaMock.scheduleProposal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: { acceptedAt: expect.any(Date) },
      }),
    );
    expect(prismaMock.fixture.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f1" },
        data: { scheduledAt: new Date("2026-03-01T10:00:00.000Z") },
      }),
    );
  });

  it("returns 409 when the creator tries to self-accept", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } }); // creator of p1
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.scheduleProposal.findFirst.mockResolvedValue(buildProposal({ userId: "user-1" }));

    const res = await accept({ proposalId: "p1" });
    expect(res.status).toBe(409);
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("returns 200 and updates scheduledAt when the OTHER participant accepts a re-negotiation on a SCHEDULED fixture (rejornar)", async () => {
    // Fixture is already scheduled to 03-01; the away coach accepts a re-date to 03-08.
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({ scheduledAt: new Date("2026-03-01T10:00:00.000Z") }),
    );
    prismaMock.scheduleProposal.findFirst.mockResolvedValue(
      buildProposal({ userId: "user-1", date: new Date("2026-03-08T10:00:00.000Z") }),
    );
    prismaMock.scheduleProposal.update.mockResolvedValue(buildProposal({ acceptedAt: new Date() }));
    prismaMock.fixture.update.mockResolvedValue({
      ...buildFixture(),
      scheduledAt: new Date("2026-03-08T10:00:00.000Z"),
    });

    const res = await accept({ proposalId: "p1" });
    expect(res.status).toBe(200);
    // Accept updates scheduledAt to the NEW proposed date (not the old one).
    expect(prismaMock.fixture.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "f1" },
        data: { scheduledAt: new Date("2026-03-08T10:00:00.000Z") },
      }),
    );
  });

  it("returns 409 when the fixture is PLAYED (winner set)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture({ winnerId: "t1", homeScore: 2, awayScore: 0 }));
    prismaMock.scheduleProposal.findFirst.mockResolvedValue(buildProposal({ userId: "user-1" }));
    const res = await accept({ proposalId: "p1" });
    expect(res.status).toBe(409);
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the proposal is already accepted or closed", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.scheduleProposal.findFirst.mockResolvedValue(
      buildProposal({ userId: "user-1", acceptedAt: new Date() }),
    );
    const res = await accept({ proposalId: "p1" });
    expect(res.status).toBe(409);
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });

  it("returns 409 on a finished league — the season is definitive (RAU-40)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({ league: { id: "l1", status: "finished" } }),
    );
    const res = await accept({ proposalId: "p1" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "League is finished" });
    expect(prismaMock.fixture.update).not.toHaveBeenCalled();
  });
});
