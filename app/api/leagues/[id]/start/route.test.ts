import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const hoisted = vi.hoisted(() => {
  const prismaTx = {
    fixture: { createMany: vi.fn() },
    league: { update: vi.fn() },
    team: { findMany: vi.fn() },
  };
  const prismaMock = {
    league: { findFirst: vi.fn() },
    fixture: { createMany: vi.fn() },
    team: { findMany: vi.fn() },
    // Execute the transaction callback with the transactional client so the
    // route's createMany/update run through the (mockable) tx surfaces.
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prismaTx)),
    __tx: prismaTx,
  };
  return { prismaMock };
});

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: hoisted.prismaMock,
}));

const prismaMock = hoisted.prismaMock;
const prismaTx = prismaMock.__tx;

import { POST } from "./route";

function startRequest(leagueId: string, body?: unknown) {
  return POST(
    new Request(`http://localhost:3000/api/leagues/${leagueId}/start`, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: leagueId }) } as never,
  );
}

function makeLeague(overrides: Partial<{ status: string }> = {}) {
  return { id: "l1", ownerId: "user-1", status: "open", ...overrides };
}

function fourTeamIds() {
  return [
    { id: "t1" },
    { id: "t2" },
    { id: "t3" },
    { id: "t4" },
  ];
}

describe("POST /api/leagues/[id]/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaTx.fixture.createMany.mockReset();
    prismaTx.league.update.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await startRequest("l1", { seasonLength: 3 });
    expect(res.status).toBe(401);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 404 for a league owned by another user (owner-only)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.league.findFirst.mockResolvedValue(null); // league not owned by the caller
    const res = await startRequest("foreign", { seasonLength: 2 });
    expect(res.status).toBe(404);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 409 when the league is already STARTED (re-start blocked)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(makeLeague({ status: "started" }));
    const res = await startRequest("l1", { seasonLength: 2 });
    expect(res.status).toBe(409);
    expect(prismaMock.team.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 409 when fewer than two member teams exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(makeLeague());
    prismaMock.team.findMany.mockResolvedValue([{ id: "t1" }]); // only one team
    const res = await startRequest("l1", { seasonLength: 1 });
    expect(res.status).toBe(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 400 when seasonLength is not a valid integer", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(makeLeague());
    prismaMock.team.findMany.mockResolvedValue(fourTeamIds());
    const res = await startRequest("l1", { seasonLength: "two" });
    expect(res.status).toBe(400);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("returns 409 when seasonLength is out of range (above teams - 1)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(makeLeague());
    prismaMock.team.findMany.mockResolvedValue(fourTeamIds()); // n = 4
    const res = await startRequest("l1", { seasonLength: 4 });
    expect(res.status).toBe(409);
    const res2 = await startRequest("l1", { seasonLength: 0 });
    expect(res2.status).toBe(409);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("defaults seasonLength to n-1 when omitted and writes a perfect season", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(makeLeague());
    prismaMock.team.findMany.mockResolvedValue(fourTeamIds());
    const started = {
      id: "l1",
      name: "North League",
      ownerId: "user-1",
      status: "started",
      seasonLength: 3,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    prismaTx.league.update.mockResolvedValue(started);

    const res = await startRequest("l1", {}); // no seasonLength in body

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("started");
    expect(body.seasonLength).toBe(3);
    expect(body.fixtures).toHaveLength(6); // 3 rounds × 2 matchups (n=4)

    // The transaction ran the shuffle + circle + createMany + update once.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const createManyData = prismaTx.fixture.createMany.mock.calls[0][0].data;
    expect(createManyData).toHaveLength(6);
    // Every draft is scoped to the league and carries a valid round.
    for (const draft of createManyData) {
      expect(draft.leagueId).toBe("l1");
      expect(typeof draft.round).toBe("number");
      expect(typeof draft.homeTeamId).toBe("string");
      expect(typeof draft.awayTeamId).toBe("string");
    }
    // No repeated unordered pair across the full season.
    const pairs = createManyData.map((d: { homeTeamId: string; awayTeamId: string }) =>
      [d.homeTeamId, d.awayTeamId].sort().join("|"),
    );
    expect(new Set(pairs).size).toBe(6);
    // League flipped to started atomically with the fixtures.
    expect(prismaTx.league.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: expect.objectContaining({
        status: "started",
        seasonLength: 3,
        startedAt: expect.any(Date),
      }),
    });
  });

  it("honors an explicit valid seasonLength and returns the started league", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(makeLeague());
    prismaMock.team.findMany.mockResolvedValue(fourTeamIds());
    const started = {
      id: "l1",
      name: "North League",
      ownerId: "user-1",
      status: "started",
      seasonLength: 2,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    prismaTx.league.update.mockResolvedValue(started);

    const res = await startRequest("l1", { seasonLength: 2 });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("started");
    expect(body.seasonLength).toBe(2);
    expect(body.fixtures).toHaveLength(4); // 2 rounds × 2 matchups
    const createManyData = prismaTx.fixture.createMany.mock.calls[0][0].data;
    expect(new Set(createManyData.map((d: { homeTeamId: string; awayTeamId: string }) =>
      [d.homeTeamId, d.awayTeamId].sort().join("|"))).size).toBe(4);
  });
});
