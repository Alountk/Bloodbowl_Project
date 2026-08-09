import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn() },
  scheduleProposal: { findMany: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "./route";

function buildFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    leagueId: "l1",
    round: 1,
    homeTeamId: "t1",
    awayTeamId: "t2",
    league: { id: "l1", status: "started", ownerId: "user-owner" },
    homeTeam: { id: "t1", userId: "user-1" },
    awayTeam: { id: "t2", userId: "user-2" },
    ...overrides,
  };
}

function getProposals(fixtureId = "f1", leagueId = "l1") {
  return GET(
    new Request(`http://localhost:3000/api/leagues/${leagueId}/fixtures/${fixtureId}/proposals`),
    { params: Promise.resolve({ id: leagueId, fixtureId }) } as never,
  );
}

describe("GET /api/leagues/[id]/fixtures/[fixtureId]/proposals", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await getProposals();
    expect(res.status).toBe(401);
    expect(prismaMock.scheduleProposal.findMany).not.toHaveBeenCalled();
  });

  it("returns the full ordered history to a participant", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.scheduleProposal.findMany.mockResolvedValue([
      { id: "p1", fixtureId: "f1", userId: "user-1", date: "2026-03-01", createdAt: "a", acceptedAt: null, closedAt: null },
      { id: "p2", fixtureId: "f1", userId: "user-2", date: "2026-03-02", createdAt: "b", acceptedAt: "2026-03-03", closedAt: null },
    ]);

    const res = await getProposals();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].userId).toBe("user-1");
    expect(prismaMock.scheduleProposal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fixtureId: "f1" },
        orderBy: { createdAt: "desc" },
      }),
    );
  });

  it("returns the full ordered history to the league owner (admin)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    prismaMock.scheduleProposal.findMany.mockResolvedValue([]);

    const res = await getProposals();
    expect(res.status).toBe(200);
    expect((await res.json())).toEqual([]);
  });

  it("returns 404 for a non-participant, non-admin user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-9" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await getProposals();
    expect(res.status).toBe(404);
    expect(prismaMock.scheduleProposal.findMany).not.toHaveBeenCalled();
  });
});
