import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  fixture: { findFirst: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET } from "./route";

/** Builds the raw Prisma fixture row the GET route fetches with its include. */
function buildFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    leagueId: "l1",
    round: 1,
    homeTeamId: "t1",
    awayTeamId: "t2",
    createdAt: new Date("2026-02-01").toISOString(),
    scheduledAt: new Date("2026-03-01").toISOString(),
    winnerId: null,
    homeScore: null,
    awayScore: null,
    result: null,
    league: {
      id: "l1",
      status: "started",
      ownerId: "user-admin",
      teams: [{ userId: "user-1" }],
    },
    homeTeam: {
      id: "t1",
      name: "Reavers",
      raceId: "human",
      userId: "user-1",
      user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
      players: [],
    },
    awayTeam: {
      id: "t2",
      name: "Dwarves",
      raceId: "dwarf",
      userId: "user-2",
      user: { id: "user-2", name: "Coach B", email: "b@x", avatar: null },
      players: [],
    },
    ...overrides,
  };
}

function request(leagueId = "l1", fixtureId = "f1") {
  return new Request(`http://localhost/api/leagues/${leagueId}/fixtures/${fixtureId}`);
}

function callGet(leagueId = "l1", fixtureId = "f1") {
  return GET(request(leagueId, fixtureId), {
    params: Promise.resolve({ id: leagueId, fixtureId }),
  } as never);
}

describe("GET /api/leagues/[id]/fixtures/[fixtureId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated, in both AUTH_MODE variants (route never reads env)", async () => {
    // The route is AUTH_MODE-agnostic: it only consults `auth()` and never
    // reads AUTH_MODE itself, so a null session is rejected identically in the
    // local (anonymous) and auth (credential) store modes.
    authMock.mockResolvedValue(null);
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await callGet();
    expect(res.status).toBe(401);
    expect(prismaMock.fixture.findFirst).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 404 for a fixture that does not exist (no existence leak)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    const res = await callGet();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns 404 for a fixture not in the requested league (findFirst scoped by leagueId)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(null);
    const res = await callGet("l-other", "f1");
    expect(res.status).toBe(404);
    // The query must scope by both id and leagueId so a fixture from another
    // league is never surfaced.
    expect(prismaMock.fixture.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "f1", leagueId: "l-other" } }),
    );
  });

  it("returns 404 for a STARTED foreign non-member with the identical no-leak body", async () => {
    // league owner user-admin, member user-1; user-x is neither → 404.
    authMock.mockResolvedValue({ user: { id: "user-x" } });
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await callGet();
    expect(res.status).toBe(404);
    // Body is byte-identical to the fixture-not-found case: no leak.
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("returns 200 for the league owner with the normalized payload shape", async () => {
    authMock.mockResolvedValue({ user: { id: "user-admin" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        homeScore: 2,
        awayScore: 1,
        winnerId: "t1",
        result: {
          id: "mr1",
          fixtureId: "f1",
          weather: "perfect",
          scores: {
            home: { score: 2, postFf: 4, casualties: [], pe: [] },
            away: { score: 1, postFf: 2, casualties: [], pe: [] },
            winnerId: "t1",
          },
          pettyCash: 150_000,
          loadedBy: "user-admin",
        },
        homeTeam: {
          id: "t1",
          name: "Reavers",
          raceId: "human",
          userId: "user-1",
          user: { id: "user-1", name: "Coach A", email: "a@x", avatar: null },
          players: [{ rosterPlayerId: "p1", name: "Blitzer", positionalKey: "blitzer", pe: 7, skills: [], injuries: [], alive: true, valueBonus: 0 }],
        },
      }),
    );

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();

    // Top-level contract: fixture, result, and both normalized teams.
    expect(Object.keys(body).sort()).toEqual(["awayTeam", "fixture", "homeTeam", "result"].sort());
    expect(body.result?.id).toBe("mr1");
    expect(body.result.scores.home.score).toBe(2);

    // The fixture is enriched but its nested teams are stripped (D3).
    expect(body.fixture.status).toBe("played");
    expect(body.fixture.id).toBe("f1");
    expect(body.fixture).not.toHaveProperty("homeTeam");
    expect(body.fixture).not.toHaveProperty("awayTeam");

    // Top-level teams carry the roster + coach but no nested teams.
    expect(body.homeTeam.id).toBe("t1");
    expect(body.homeTeam.raceId).toBe("human");
    expect(body.homeTeam.user.name).toBe("Coach A");
    expect(body.homeTeam.players).toHaveLength(1);
    expect(body.homeTeam).not.toHaveProperty("homeTeam");
    expect(body.awayTeam).not.toHaveProperty("awayTeam");
  });

  it("returns 200 for a member-team owner (not league owner)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } }); // home team owner, league member
    prismaMock.fixture.findFirst.mockResolvedValue(buildFixture());
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fixture.id).toBe("f1");
  });

  it("returns 200 for an OPEN league to any authenticated user (defensive)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-x" } }); // no membership anywhere
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({
        scheduledAt: null,
        league: { id: "l1", status: "open", ownerId: "user-admin", teams: [{ userId: "user-1" }] },
      }),
    );
    const res = await callGet();
    expect(res.status).toBe(200);
    expect((await res.json()).fixture.status).toBe("pending");
  });

  it("keeps 200 for a walkover where scores are set and result is null", async () => {
    // Forfeit writes scores + winnerId but no MatchResult row → result stays null.
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.fixture.findFirst.mockResolvedValue(
      buildFixture({ winnerId: "t1", homeScore: 2, awayScore: 0, scheduledAt: null }),
    );
    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeNull();
    expect(body.fixture.status).toBe("played");
    expect(body.fixture.homeScore).toBe(2);
    expect(body.fixture.awayScore).toBe(0);
  });
});
