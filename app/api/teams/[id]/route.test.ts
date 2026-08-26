import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  team: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  player: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

import { DELETE, GET, canViewScoutedTeam } from "./route";

function deleteRequest(id: string) {
  return DELETE(new Request(`http://localhost:3000/api/teams/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  } as never);
}

function getRequest(id: string) {
  return GET(new Request(`http://localhost:3000/api/teams/${id}`), {
    params: Promise.resolve({ id }),
  } as never);
}

/** A team row as returned by the GET scouting query (league nested member teams). */
function scoutedTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    userId: "user-owner",
    name: "Reavers",
    raceId: "human",
    leagueId: "l1",
    roster: [],
    coaching: {},
    league: {
      id: "l1",
      ownerId: "user-league-owner",
      teams: [], // no member team owned by the caller unless set
    },
    ...overrides,
  };
}

describe("canViewScoutedTeam (pure gate)", () => {
  it("grants the team owner", () => {
    expect(
      canViewScoutedTeam({ userId: "user-owner", teamUserId: "user-owner", teamLeagueId: "l1", leagueOwnerId: "user-league-owner", leagueHasMemberUserId: false }),
    ).toBe(true);
  });

  it("denies an outsider with no league membership", () => {
    expect(
      canViewScoutedTeam({ userId: "user-9", teamUserId: "user-owner", teamLeagueId: "l1", leagueOwnerId: "user-league-owner", leagueHasMemberUserId: false }),
    ).toBe(false);
  });

  it("grants the league owner", () => {
    expect(
      canViewScoutedTeam({ userId: "user-league-owner", teamUserId: "user-owner", teamLeagueId: "l1", leagueOwnerId: "user-league-owner", leagueHasMemberUserId: false }),
    ).toBe(true);
  });

  it("grants a current member of the league", () => {
    expect(
      canViewScoutedTeam({ userId: "user-member", teamUserId: "user-owner", teamLeagueId: "l1", leagueOwnerId: "user-league-owner", leagueHasMemberUserId: true }),
    ).toBe(true);
  });

  it("denies everyone except the owner when the team has no league", () => {
    expect(
      canViewScoutedTeam({ userId: "user-league-owner", teamUserId: "user-owner", teamLeagueId: null, leagueOwnerId: null, leagueHasMemberUserId: false }),
    ).toBe(false);
    expect(
      canViewScoutedTeam({ userId: "user-owner", teamUserId: "user-owner", teamLeagueId: null, leagueOwnerId: null, leagueHasMemberUserId: false }),
    ).toBe(true);
  });
});

describe("GET /api/teams/[id] scouting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.player.findMany.mockResolvedValue([]);
  });

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await getRequest("t1");
    expect(res.status).toBe(401);
    expect(prismaMock.team.findFirst).not.toHaveBeenCalled();
  });

  it("returns 200 with read-only data to the team owner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.team.findFirst.mockResolvedValue(
      scoutedTeam({
        roster: [{ id: "p1", name: "Player 1", positionalKey: "lineman" }],
        league: { id: "l1", ownerId: "user-league-owner", teams: [] },
      }),
    );
    prismaMock.player.findMany.mockResolvedValue([
      { teamId: "t1", rosterPlayerId: "p1", pe: 6 },
    ]);

    const res = await getRequest("t1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("t1");
    expect(body.name).toBe("Reavers");
    expect(body.raceId).toBe("human");
    // RAU-14: scouting carries the player experience on the roster entries.
    expect(body.roster).toEqual([
      expect.objectContaining({ id: "p1", pe: 6 }),
    ]);
    // The relations never leak.
    expect(body.league).toBeUndefined();
    expect(body.user).toBeUndefined();
  });

  it("returns 200 to the league owner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-league-owner" } });
    prismaMock.team.findFirst.mockResolvedValue(scoutedTeam());
    const res = await getRequest("t1");
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Reavers");
  });

  it("returns 200 to a current league member", async () => {
    authMock.mockResolvedValue({ user: { id: "user-member" } });
    prismaMock.team.findFirst.mockResolvedValue(
      scoutedTeam({ league: { id: "l1", ownerId: "user-league-owner", teams: [{ id: "t-other" }] } }),
    );
    const res = await getRequest("t1");
    expect(res.status).toBe(200);
  });

  it("returns 404 for an outsider (no existence leak)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-9" } });
    prismaMock.team.findFirst.mockResolvedValue(scoutedTeam()); // exists but not viewable
    const res = await getRequest("t1");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("Reavers");
  });

  it("returns 404 for an archived team", async () => {
    authMock.mockResolvedValue({ user: { id: "user-owner" } });
    prismaMock.team.findFirst.mockResolvedValue(null); // archivedAt filter excludes it
    const res = await getRequest("t1");
    expect(res.status).toBe(404);
  });

  it("returns 404 for an unassigned team when requested by a non-owner", async () => {
    authMock.mockResolvedValue({ user: { id: "user-9" } });
    prismaMock.team.findFirst.mockResolvedValue(scoutedTeam({ leagueId: null, league: null }));
    const res = await getRequest("t1");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/teams/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null);
    const res = await deleteRequest("t1");
    expect(res.status).toBe(401);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("archives (soft-deletes) a team the user owns and returns 204", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue({ id: "t1", userId: "user-1" });

    const res = await deleteRequest("t1");
    expect(res.status).toBe(204);
    // Archive is scoped to the id and records an archivedAt timestamp.
    expect(prismaMock.team.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { archivedAt: expect.any(Date) },
    });
  });

  it("does not hard-delete the row when archiving", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue({ id: "t1", userId: "user-1" });
    const res = await deleteRequest("t1");
    expect(res.status).toBe(204);
    // The row must be retained (soft delete) — only an update is issued.
    expect(prismaMock.team.update).toHaveBeenCalled();
  });

  it("returns 404 when the team belongs to another user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-2" } });
    prismaMock.team.findFirst.mockResolvedValue(null); // team owned by someone else

    const res = await deleteRequest("foreign-team");
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("returns 409 and does not archive a team that still belongs to a league", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue({ id: "t1", userId: "user-1", leagueId: "league-1", archivedAt: null });

    const res = await deleteRequest("t1");
    expect(res.status).toBe(409);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });

  it("archives a team whose leagueId is null", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue({ id: "t1", userId: "user-1", leagueId: null, archivedAt: null });

    const res = await deleteRequest("t1");
    expect(res.status).toBe(204);
    expect(prismaMock.team.update).toHaveBeenCalled();
  });

  it("returns 404 when re-deleting an already archived team", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    // An archived team is not found by the archivedAt: null predicate.
    prismaMock.team.findFirst.mockResolvedValue(null);

    const res = await deleteRequest("t1");
    expect(res.status).toBe(404);
    expect(prismaMock.team.update).not.toHaveBeenCalled();
  });
});
