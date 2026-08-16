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

  it("allows the league owner (admin) to expel any member while OPEN", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      ownerId: "user-admin",
      status: "open",
    });
    // The member team belongs to another user, but the admin may expel it.
    prismaMock.team.findFirst.mockResolvedValue({
      id: "t1",
      userId: "user-other",
      leagueId: "l1",
    });
    prismaMock.team.update.mockResolvedValue({ id: "t1", leagueId: null });

    const res = await expelRequest("l1", "t1");
    expect(res.status).toBe(200);
    // Membership lookup is scoped to the league, not to the session user.
    expect(prismaMock.team.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", leagueId: "l1" } }),
    );
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { leagueId: null },
    });
  });

  it("allows a member to remove their OWN team (self-leave) while OPEN", async () => {
    authMock.mockResolvedValue({ user: { id: "user-other" } });
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      ownerId: "user-admin",
      status: "open",
    });
    prismaMock.team.findFirst.mockResolvedValue({
      id: "t1",
      userId: "user-other", // team owner == session user
      leagueId: "l1",
    });
    prismaMock.team.update.mockResolvedValue({ id: "t1", leagueId: null });

    const res = await expelRequest("l1", "t1");
    expect(res.status).toBe(200);
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { leagueId: null },
    });
  });

  it("returns 409 when the league is STARTED (membership is locked)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      ownerId: "user-admin",
      status: "started",
    });

    const res = await expelRequest("l1", "t1");
    expect(res.status).toBe(409);
    expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the league is FINISHED (RAU-40 — membership stays locked)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      ownerId: "user-admin",
      status: "finished",
    });

    const res = await expelRequest("l1", "t1");
    expect(res.status).toBe(409);
    expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the target league does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(null); // league unknown to the caller

    const res = await expelRequest("foreign-league", "t1");
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the team is not a member of the league", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.league.findFirst.mockResolvedValue({ id: "l1", ownerId: "user-admin", status: "open" });
    prismaMock.team.findFirst.mockResolvedValue(null); // team not in this league

    const res = await expelRequest("l1", "not-member");
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 404 for a foreign member team (neither admin nor team owner)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-stranger" } });
    prismaMock.league.findFirst.mockResolvedValue({
      id: "l1",
      ownerId: "user-admin",
      status: "open",
    });
    prismaMock.team.findFirst.mockResolvedValue({
      id: "t1",
      userId: "user-other", // team owned by someone else, and caller is not admin
      leagueId: "l1",
    });

    const res = await expelRequest("l1", "t1");
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });
});
