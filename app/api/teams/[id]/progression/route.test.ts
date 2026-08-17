import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  team: { findFirst: vi.fn() },
  player: { findMany: vi.fn() },
  matchResult: { findMany: vi.fn() },
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
    attributeIncreases: { st: 1 },
    ...overrides,
  };
}

/** A MatchResult row (scores JSON + participant fixture) for team `t1`. */
function callRoute(teamId: string) {
  return GET(new Request(`http://localhost/api/teams/${teamId}/progression`), {
    params: Promise.resolve({ id: teamId }),
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/teams/[teamId]/progression", () => {
  it("returns the owner's Player progression rows with injuries, attributeIncreases and stats", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue(buildTeam());
    prismaMock.player.findMany.mockResolvedValue([buildPlayer()]);
    prismaMock.matchResult.findMany.mockResolvedValue([]);

    const res = await callRoute("t1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>[];
    expect(body).toHaveLength(1);
    expect(body[0]).toEqual({
      rosterPlayerId: "pl1",
      pe: 6,
      skills: ["block"],
      injuries: ["cabeza rota"],
      attributeIncreases: { st: 1 },
      valueBonus: 10000,
      alive: true,
      improvements: 1,
      stats: { casualties: 0, mvp: 0 },
    });
  });

  it("aggregates career casualties and MVP across multiple matches (persisted scores.mvp wins)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue(buildTeam());
    prismaMock.player.findMany.mockResolvedValue([buildPlayer()]);
    prismaMock.matchResult.findMany.mockResolvedValue([
      // home side: pl1 suffers 1 casualty + falls back (no persisted mvp id) to
      // the max-`pe` entry — pl2 has pe 6 ≥ 4 and beats pl1's pe 3 → mvp pl2.
      {
        scores: {
          home: {
            score: 2,
            casualties: [{ team: "home", rosterPlayerId: "pl1", outcome: { kind: "grave" } }],
            pe: [
              { rosterPlayerId: "pl1", pe: 3 },
              { rosterPlayerId: "pl2", pe: 6 },
            ],
          },
          away: { score: 0, casualties: [], pe: [] },
        },
        fixture: { homeTeamId: "t1", awayTeamId: "tA" },
      },
      // away side: pl1 suffers a second casualty; persisted mvp.home = pl1.
      {
        scores: {
          home: { score: 0, casualties: [], pe: [] },
          away: {
            score: 1,
            casualties: [{ team: "away", rosterPlayerId: "pl1", outcome: { kind: "bruise" } }],
            pe: [{ rosterPlayerId: "pl1", pe: 4 }],
          },
          mvp: { home: "pl1", away: "pl1" },
        },
        fixture: { homeTeamId: "tA", awayTeamId: "t1" },
      },
      // a match where t1 did NOT play must be ignored.
      {
        scores: { home: { score: 1, casualties: [], pe: [] }, away: { score: 0, casualties: [], pe: [] } },
        fixture: { homeTeamId: "tX", awayTeamId: "tY" },
      },
    ]);

    const res = await callRoute("t1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>[];
    expect(body[0].stats).toEqual({ casualties: 2, mvp: 1 });
  });

  it("falls back to the max-pe MVP convention when scores.mvp is absent", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.team.findFirst.mockResolvedValue(buildTeam());
    prismaMock.player.findMany.mockResolvedValue([buildPlayer()]);
    prismaMock.matchResult.findMany.mockResolvedValue([
      {
        scores: {
          home: {
            score: 1,
            casualties: [],
            pe: [
              { rosterPlayerId: "pl1", pe: 4 },
              { rosterPlayerId: "pl2", pe: 7 },
            ],
          },
          away: { score: 0, casualties: [], pe: [] },
        },
        fixture: { homeTeamId: "t1", awayTeamId: "tA" },
      },
    ]);

    const res = await callRoute("t1");
    const body = (await res.json()) as Record<string, unknown>[];
    // pl1 is not the max-pe entry (pl2 has 7) → pl1 earns no MVP that match.
    expect(body[0].stats).toEqual({ casualties: 0, mvp: 0 });
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
    prismaMock.matchResult.findMany.mockResolvedValue([]);
    const res = await callRoute("t1");
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });
});
