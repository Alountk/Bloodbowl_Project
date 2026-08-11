import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  team: { findFirst: vi.fn() },
  player: { findMany: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "./route";

/** A Team row scoped to the ownership probe used by the progression route. */
function buildTeam(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    userId: "user-1",
    archivedAt: null,
    ...overrides,
  };
}

/** A Player progression row (Prisma shape) owned by team `t1`. */
function buildPlayer(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-row-1",
    teamId: "t1",
    rosterPlayerId: "pl1",
    name: "Marty",
    positionalKey: "blitzer",
    pe: 6,
    skills: ["block"],
    injuries: ["cabeza rota"],
    alive: true,
    valueBonus: 10000,
    improvements: [{ kind: "primary", skill: "block", cost: 6 }],
    attributeIncreases: {},
    ...overrides,
  };
}

function callRoute(teamId: string) {
  return GET(new Request(`http://localhost/api/teams/${teamId}/progression`), {
    params: Promise.resolve({ id: teamId }),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/teams/[teamId]/progression", () => {
  it("returns the owner's Player progression rows when the team is owned by the session user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue(buildTeam());
    prismaMock.player.findMany.mockResolvedValue([buildPlayer(), buildPlayer({ rosterPlayerId: "pl2" })]);

    const res = await callRoute("t1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>[];
    expect(body).toHaveLength(2);
    // PlayerProgressionCore shape: progression read fields + injuries carried
    // through; `improvements` is the count of purchase records, not the array.
    expect(body[0]).toEqual({
      rosterPlayerId: "pl1",
      pe: 6,
      skills: ["block"],
      injuries: ["cabeza rota"],
      valueBonus: 10000,
      alive: true,
      improvements: 1,
    });
  });

  it("returns 401 when the session has no user id", async () => {
    authMock.mockResolvedValue(null);
    const res = await callRoute("t1");
    expect(res.status).toBe(401);
    expect(prismaMock.player.findMany).not.toHaveBeenCalled();
  });

  it("returns 404 (no existence leak) when the team is not owned by the session user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-other" } });
    prismaMock.team.findFirst.mockResolvedValue(null);
    const res = await callRoute("t1");
    expect(res.status).toBe(404);
    expect(prismaMock.player.findMany).not.toHaveBeenCalled();
  });

  it("discards archived teams like foreign ones (404)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue(null); // archivedAt set matches no non-archived row
    const res = await callRoute("t1");
    expect(res.status).toBe(404);
  });

  it("returns an empty list when the owner team has no Player rows yet", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue(buildTeam());
    prismaMock.player.findMany.mockResolvedValue([]);
    const res = await callRoute("t1");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });
});
