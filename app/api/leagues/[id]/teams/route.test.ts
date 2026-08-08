import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  league: {
    findFirst: vi.fn(),
  },
  team: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { POST } from "./route";

function assignRequest(leagueId: string, teamId: string) {
  return POST(
    new Request(`http://localhost:3000/api/leagues/${leagueId}/teams`, {
      method: "POST",
      body: JSON.stringify({ teamId }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: leagueId }) } as never,
  );
}

describe("POST /api/leagues/[id]/teams", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await assignRequest("l1", "t1");
    expect(res.status).toBe(401);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("assigns an owned, unassigned, non-archived team to the league", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({ id: "l1", ownerId: "user-1" });
    prismaMock.team.findFirst.mockResolvedValue({
      id: "t1",
      userId: "user-1",
      leagueId: null,
      archivedAt: null,
    });
    prismaMock.team.update.mockResolvedValue({ id: "t1", leagueId: "l1" });

    const res = await assignRequest("l1", "t1");
    expect(res.status).toBe(200);
    // The team's leagueId is set to the target league.
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { leagueId: "l1" },
    });
  });

  it("returns 404 when the target league is foreign to the session user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(null); // league owned by someone else

    const res = await assignRequest("foreign-league", "t1");
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the team is owned by another user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({ id: "l1", ownerId: "user-1" });
    prismaMock.team.findFirst.mockResolvedValue(null); // team owned by someone else

    const res = await assignRequest("l1", "foreign-team");
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the team is already in a league (one-team-per-league)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({ id: "l1", ownerId: "user-1" });
    prismaMock.team.findFirst.mockResolvedValue({
      id: "t1",
      userId: "user-1",
      leagueId: "other-league",
      archivedAt: null,
    });

    const res = await assignRequest("l1", "t1");
    expect(res.status).toBe(409);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the team is archived", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({ id: "l1", ownerId: "user-1" });
    prismaMock.team.findFirst.mockResolvedValue({
      id: "t1",
      userId: "user-1",
      leagueId: null,
      archivedAt: new Date(),
    });

    const res = await assignRequest("l1", "t1");
    expect(res.status).toBe(409);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });
});
