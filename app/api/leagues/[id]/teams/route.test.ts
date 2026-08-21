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

function makeLeague(overrides: Partial<{ status: string }> = {}) {
  return { id: "l1", ownerId: "user-1", status: "open", ...overrides };
}

/**
 * Routes `team.findFirst` by shape: the team lookup queries by `id` (the team
 * being joined), the RAU-54 guard queries by `leagueId` (an existing member
 * team owned by the session user). `team` is the join target; `existingMember`
 * is whatever the guard should find (null when the user has no team in the
 * league yet).
 */
function mockTeamFindFirst(
  team: unknown,
  existingMember: unknown,
) {
  prismaMock.team.findFirst.mockImplementation((args: { where?: { id?: string; leagueId?: string } }) => {
    if (args?.where?.id) return Promise.resolve(team);
    return Promise.resolve(existingMember);
  });
}

describe("POST /api/leagues/[id]/teams", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await assignRequest("l1", "t1");
    expect(res.status).toBe(401);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("joins an OPEN league owned by ANOTHER user (public join)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.league.findFirst.mockResolvedValue(makeLeague({ status: "open" }));
    mockTeamFindFirst(
      { id: "t1", userId: "user-2", leagueId: null, archivedAt: null },
      null,
    );
    prismaMock.team.update.mockResolvedValue({ id: "t1", leagueId: "l1" });

    const res = await assignRequest("l1", "t1");
    expect(res.status).toBe(200);
    // League lookup is not scoped to the session user — any user joins an open league.
    expect(prismaMock.league.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "l1" } }),
    );
    // The guard ran (no team of THIS user in the league) and the join updated.
    expect(prismaMock.team.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leagueId: "l1", userId: "user-2" }),
      }),
    );
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { leagueId: "l1" },
    });
  });

  it("returns 409 when the SAME user already owns a team in the league (one user = one team)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(makeLeague());
    mockTeamFindFirst(
      { id: "t2", userId: "user-1", leagueId: null, archivedAt: null },
      // user-1 already has team t1 in this league → the second join is blocked.
      { id: "t1" },
    );

    const res = await assignRequest("l1", "t2");
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Ya tienes un equipo en esta liga");
    // No mutation: the rejected join never touches the team row.
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("allows ANOTHER user to join with their own team (guard is per user, not per league)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.league.findFirst.mockResolvedValue(makeLeague());
    mockTeamFindFirst(
      { id: "t2", userId: "user-2", leagueId: null, archivedAt: null },
      // user-1's team t1 is already a member, but user-2 has no team here.
      null,
    );
    prismaMock.team.update.mockResolvedValue({ id: "t2", leagueId: "l1" });

    const res = await assignRequest("l1", "t2");
    expect(res.status).toBe(200);
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t2" },
      data: { leagueId: "l1" },
    });
  });

  it("returns 404 when the target league does not exist", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(null);

    const res = await assignRequest("missing-league", "t1");
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the league is STARTED (immutable)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(makeLeague({ status: "started" }));

    const res = await assignRequest("l1", "t1");
    expect(res.status).toBe(409);
    expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the league is FINISHED (RAU-40 — no new teams after the season)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(makeLeague({ status: "finished" }));

    const res = await assignRequest("l1", "t1");
    expect(res.status).toBe(409);
    expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the team is owned by another user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(makeLeague());
    prismaMock.team.findFirst.mockResolvedValue(null); // team owned by someone else

    const res = await assignRequest("l1", "foreign-team");
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 409 when the team is already in a league (one-team-per-league)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.league.findFirst.mockResolvedValue(makeLeague());
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
    prismaMock.league.findFirst.mockResolvedValue(makeLeague());
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
