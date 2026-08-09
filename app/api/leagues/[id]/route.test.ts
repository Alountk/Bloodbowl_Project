import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  league: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
  },
  fixture: {
    findMany: vi.fn(),
  },
  team: {
    updateMany: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { GET, DELETE } from "./route";

describe("GET /api/leagues/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost:3000/api/leagues/l1"), {
      params: Promise.resolve({ id: "l1" }),
    } as never);
    expect(res.status).toBe(401);
    expect(prismaMock.league.findFirst).not.toHaveBeenCalled();
  });

  it("returns an OPEN league to any authenticated user, with teams, ownerName and empty fixtures", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      name: "Public League",
      description: null,
      ownerId: "user-1",
      owner: { id: "user-1", email: "owner@test.local", name: "Owner Coach" },
      status: "open",
      seasonLength: null,
      startedAt: null,
      createdAt: new Date().toISOString(),
      teams: [
        { id: "t1", name: "Reavers", raceId: "human", userId: "user-1", leagueId: "l1", archivedAt: null },
        { id: "t2", name: "Dwarves", raceId: "dwarf", userId: "user-3", leagueId: "l1", archivedAt: null },
      ],
    });

    const res = await GET(new Request("http://localhost:3000/api/leagues/l1"), {
      params: Promise.resolve({ id: "l1" }),
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("l1");
    expect(body.ownerName).toBe("Owner Coach");
    expect(body.status).toBe("open");
    expect(body.teams).toHaveLength(2);
    expect(body.fixtures).toEqual([]);
    // Open league visible regardless of owner → query is scoped by id only.
    expect(prismaMock.league.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "l1" } }),
    );
  });

  it("returns a STARTED league with fixtures to its owner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      name: "Started League",
      description: null,
      ownerId: "user-1",
      owner: { id: "user-1", email: "owner@test.local", name: null },
      status: "started",
      seasonLength: 2,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      teams: [{ id: "t1", name: "Reavers", raceId: "human", userId: "user-2", leagueId: "l1", archivedAt: null }],
    });
    prismaMock.fixture.findMany.mockResolvedValue([
      { id: "f1", round: 1, homeTeamId: "t1", awayTeamId: "t2", leagueId: "l1" },
      { id: "f2", round: 2, homeTeamId: "t2", awayTeamId: "t1", leagueId: "l1" },
    ]);

    const res = await GET(new Request("http://localhost:3000/api/leagues/l1"), {
      params: Promise.resolve({ id: "l1" }),
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("started");
    expect(body.ownerName).toBe("owner@test.local"); // falls back to email
    expect(body.teams).toHaveLength(1);
    expect(body.fixtures).toHaveLength(2);
    expect(body.fixtures[0].round).toBe(1);
    expect(prismaMock.fixture.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { leagueId: "l1" } }),
    );
  });

  it("returns a STARTED league with fixtures to a current member (not owner)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } }); // member
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      name: "Started League",
      description: null,
      ownerId: "user-1",
      owner: { id: "user-1", email: "owner@test.local", name: null },
      status: "started",
      seasonLength: 2,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      teams: [{ id: "t1", name: "Reavers", raceId: "human", userId: "user-2", leagueId: "l1", archivedAt: null }],
    });
    prismaMock.fixture.findMany.mockResolvedValue([]);

    const res = await GET(new Request("http://localhost:3000/api/leagues/l1"), {
      params: Promise.resolve({ id: "l1" }),
    } as never);
    expect(res.status).toBe(200);
    expect((await res.json()).teams).toHaveLength(1);
  });

  it("returns 404 for a STARTED league to a foreign non-member (no leak, no fixtures)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-9" } }); // not owner, not member
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      name: "Started League",
      description: null,
      ownerId: "user-1",
      owner: { id: "user-1", email: "owner@test.local", name: null },
      status: "started",
      seasonLength: 2,
      startedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      teams: [{ id: "t1", name: "Reavers", raceId: "human", userId: "user-2", leagueId: "l1", archivedAt: null }],
    });

    const res = await GET(new Request("http://localhost:3000/api/leagues/foreign-started"), {
      params: Promise.resolve({ id: "foreign-started" }),
    } as never);
    expect(res.status).toBe(404);
    // No fixture fetch happens for an unauthorized started league.
    expect(prismaMock.fixture.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 for a league that does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost:3000/api/leagues/nope"), {
      params: Promise.resolve({ id: "nope" }),
    } as never);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/leagues/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(new Request("http://localhost:3000/api/leagues/l1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "l1" }),
    } as never);
    expect(res.status).toBe(401);
    expect(prismaMock.team.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.league.delete).not.toHaveBeenCalled();
  });

  it("clears member leagueIds (SetNull) and deletes the league for its owner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({ id: "l1", ownerId: "user-1" });

    const res = await DELETE(new Request("http://localhost:3000/api/leagues/l1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "l1" }),
    } as never);

    expect(res.status).toBe(204);
    // Member teams have their leagueId set to null before the league row is removed.
    expect(prismaMock.team.updateMany).toHaveBeenCalledWith({
      where: { leagueId: "l1" },
      data: { leagueId: null },
    });
    expect(prismaMock.league.delete).toHaveBeenCalledWith({ where: { id: "l1" } });
  });

  it("returns 404 and performs no mutation for a foreign league", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.league.findFirst.mockResolvedValue(null); // league owned by someone else

    const res = await DELETE(new Request("http://localhost:3000/api/leagues/foreign", { method: "DELETE" }), {
      params: Promise.resolve({ id: "foreign" }),
    } as never);
    expect(res.status).toBe(404);
    expect(prismaMock.team.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.league.delete).not.toHaveBeenCalled();
  });

  it("returns 409 and leaves everything intact for a STARTED league", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      ownerId: "user-1",
      status: "started",
      seasonLength: 2,
      startedAt: new Date().toISOString(),
    });

    const res = await DELETE(new Request("http://localhost:3000/api/leagues/l1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "l1" }),
    } as never);
    expect(res.status).toBe(409);
    expect(prismaMock.team.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.league.delete).not.toHaveBeenCalled();
  });
});
