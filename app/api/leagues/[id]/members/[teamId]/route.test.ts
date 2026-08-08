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

import { DELETE } from "./route";

function expelRequest(leagueId: string, teamId: string) {
  return DELETE(
    new Request(`http://localhost:3000/api/leagues/${leagueId}/members/${teamId}`, { method: "DELETE" }),
    { params: Promise.resolve({ id: leagueId, teamId }) } as never,
  );
}

describe("DELETE /api/leagues/[id]/members/[teamId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await expelRequest("l1", "t1");
    expect(res.status).toBe(401);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("clears the leagueId of a member team owned by the session user (expel)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({ id: "l1", ownerId: "user-1" });
    prismaMock.team.findFirst.mockResolvedValue({ id: "t1", userId: "user-1", leagueId: "l1" });
    prismaMock.team.update.mockResolvedValue({ id: "t1", leagueId: null });

    const res = await expelRequest("l1", "t1");
    expect(res.status).toBe(200);
    // Expel scopes to the league: only a team currently in THIS league is cleared.
    expect(prismaMock.team.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", userId: "user-1", leagueId: "l1" } }),
    );
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { leagueId: null },
    });
  });

  it("returns 404 when the target league is foreign to the session user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(null); // league owned by someone else

    const res = await expelRequest("foreign-league", "t1");
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the team is not a member of the league", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue({ id: "l1", ownerId: "user-1" });
    // The team is not in this league (membership lookup finds nothing).
    prismaMock.team.findFirst.mockResolvedValue(null);

    const res = await expelRequest("l1", "not-member");
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });
});
