import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  league: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
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

  it("returns the league detail with its non-archived member teams", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      name: "North League",
      description: null,
      ownerId: "user-1",
      createdAt: new Date().toISOString(),
      teams: [
        { id: "t1", name: "Reavers", raceId: "human", leagueId: "l1", archivedAt: null },
        { id: "t2", name: "Dwarves", raceId: "dwarf", leagueId: "l1", archivedAt: null },
      ],
    });

    const res = await GET(new Request("http://localhost:3000/api/leagues/l1"), {
      params: Promise.resolve({ id: "l1" }),
    } as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("l1");
    expect(body.teams).toHaveLength(2);
    expect(body.teams[0].raceId).toBe("human");
    // Query scopes to the owner only.
    expect(prismaMock.league.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "l1", ownerId: "user-1" } }),
    );
  });

  it("returns 404 for a league owned by another user (no leak)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.league.findFirst.mockResolvedValue(null); // league owned by someone else

    const res = await GET(new Request("http://localhost:3000/api/leagues/foreign"), {
      params: Promise.resolve({ id: "foreign" }),
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
});
