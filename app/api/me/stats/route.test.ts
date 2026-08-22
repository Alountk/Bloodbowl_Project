import { describe, expect, it, vi, beforeEach } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { GET, computeCareerStats, type CareerStatsInput, type FixtureStatsInput } from "./route";

/** A minimal fixture row; all result fields default to "not played". */
function fixture(overrides: Partial<FixtureStatsInput> & { id: string; homeTeamId: string; awayTeamId: string }): FixtureStatsInput {
  return {
    winnerId: null,
    homeScore: null,
    awayScore: null,
    result: null,
    ...overrides,
  };
}

function emptyInput(): CareerStatsInput {
  return { leagues: [], teams: [] };
}

describe("computeCareerStats (pure)", () => {
  it("returns zeros for a user with no teams", () => {
    expect(computeCareerStats(emptyInput())).toEqual({
      championships: 0,
      teams: 0,
      leaguesOwned: 0,
      leaguesMember: 0,
      leagues: 0,
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
    });
  });

  it("sums championships across every team (one per finished league ranked first)", () => {
    const input: CareerStatsInput = {
      leagues: [],
      teams: [
        {
          id: "t1",
          leagueId: "l1",
          championedLeagues: [{ id: "l1" }, { id: "l2" }],
          homeFixtures: [],
          awayFixtures: [],
        },
        {
          id: "t2",
          leagueId: null,
          championedLeagues: [{ id: "l3" }],
          homeFixtures: [],
          awayFixtures: [],
        },
      ],
    };
    expect(computeCareerStats(input).championships).toBe(3);
  });

  it("counts owned leagues, DISTINCT member leagues and their union separately", () => {
    const input: CareerStatsInput = {
      // Owns l1 and l2; has a team in l1 (so l1 overlaps the member set).
      leagues: [{ id: "l1" }, { id: "l2" }],
      teams: [
        { id: "t1", leagueId: "l1", championedLeagues: [], homeFixtures: [], awayFixtures: [] },
        { id: "t2", leagueId: "l3", championedLeagues: [], homeFixtures: [], awayFixtures: [] },
        // Two teams in the SAME foreign league count once.
        { id: "t3", leagueId: "l3", championedLeagues: [], homeFixtures: [], awayFixtures: [] },
        // A team without a league never contributes.
        { id: "t4", leagueId: null, championedLeagues: [], homeFixtures: [], awayFixtures: [] },
      ],
    };
    const stats = computeCareerStats(input);
    expect(stats.leaguesOwned).toBe(2);
    expect(stats.leaguesMember).toBe(2); // l1 + l3 (distinct)
    expect(stats.leagues).toBe(3); // l1 ∪ l2 ∪ l3
  });

  it("derives W/D/L from played fixtures across home and away, skipping unplayed ones", () => {
    const input: CareerStatsInput = {
      leagues: [],
      teams: [
        {
          id: "t1",
          leagueId: null,
          championedLeagues: [],
          homeFixtures: [
            fixture({ id: "f1", homeTeamId: "t1", awayTeamId: "r1", homeScore: 2, awayScore: 1, winnerId: "t1" }), // win
            fixture({ id: "f2", homeTeamId: "t1", awayTeamId: "r1", homeScore: 1, awayScore: 1 }), // draw (winnerId null)
            fixture({ id: "f3", homeTeamId: "t1", awayTeamId: "r1" }), // pending → skipped
          ],
          awayFixtures: [
            fixture({ id: "f4", homeTeamId: "r1", awayTeamId: "t1", homeScore: 0, awayScore: 2, winnerId: "t1" }), // win
            fixture({ id: "f5", homeTeamId: "r1", awayTeamId: "t1", homeScore: 1, awayScore: 2, winnerId: "r1" }), // loss
          ],
        },
      ],
    };
    const stats = computeCareerStats(input);
    expect(stats.matches).toBe(4);
    expect(stats.wins).toBe(2);
    expect(stats.draws).toBe(1);
    expect(stats.losses).toBe(1);
  });

  it("counts a walkover (winnerId + 2-0 scores) as a played win", () => {
    const input: CareerStatsInput = {
      leagues: [],
      teams: [
        {
          id: "t1",
          leagueId: null,
          championedLeagues: [],
          homeFixtures: [
            fixture({ id: "f1", homeTeamId: "t1", awayTeamId: "r1", homeScore: 2, awayScore: 0, winnerId: "t1" }),
          ],
          awayFixtures: [],
        },
      ],
    };
    const stats = computeCareerStats(input);
    expect(stats.matches).toBe(1);
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(0);
    expect(stats.draws).toBe(0);
  });

  it("counts a played fixture marked by a MatchResult row even without raw scores (forward-compat)", () => {
    const input: CareerStatsInput = {
      leagues: [],
      teams: [
        {
          id: "t1",
          leagueId: null,
          championedLeagues: [],
          homeFixtures: [fixture({ id: "f1", homeTeamId: "t1", awayTeamId: "r1", result: { id: "mr1" } })],
          awayFixtures: [],
        },
      ],
    };
    const stats = computeCareerStats(input);
    expect(stats.matches).toBe(1);
    expect(stats.draws).toBe(1);
  });

  it("double-counts a fixture between two of the user's own teams (one row per team)", () => {
    const input: CareerStatsInput = {
      leagues: [],
      teams: [
        {
          id: "a",
          leagueId: null,
          championedLeagues: [],
          homeFixtures: [
            fixture({ id: "f1", homeTeamId: "a", awayTeamId: "b", homeScore: 2, awayScore: 1, winnerId: "a" }),
          ],
          awayFixtures: [],
        },
        {
          id: "b",
          leagueId: null,
          championedLeagues: [],
          homeFixtures: [],
          awayFixtures: [
            fixture({ id: "f1", homeTeamId: "a", awayTeamId: "b", homeScore: 2, awayScore: 1, winnerId: "a" }),
          ],
        },
      ],
    };
    const stats = computeCareerStats(input);
    expect(stats.matches).toBe(2); // two per-team appearances
    expect(stats.wins).toBe(1);
    expect(stats.losses).toBe(1);
    expect(stats.draws).toBe(0);
  });
});

describe("GET /api/me/stats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when unauthenticated", async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns the computed career stats for an authenticated user", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({
      leagues: [{ id: "l1" }],
      teams: [
        {
          id: "t1",
          leagueId: "l1",
          championedLeagues: [{ id: "l1" }],
          homeFixtures: [
            {
              id: "f1",
              homeTeamId: "t1",
              awayTeamId: "r1",
              winnerId: "t1",
              homeScore: 2,
              awayScore: 0,
              result: { id: "mr1" },
            },
          ],
          awayFixtures: [],
        },
      ],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      championships: 1,
      teams: 1,
      leaguesOwned: 1,
      leaguesMember: 1,
      leagues: 1,
      matches: 1,
      wins: 1,
      draws: 0,
      losses: 0,
    });
  });

  it("selects only the ids/fields the derivation needs (no heavy payload)", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    prismaMock.user.findUnique.mockResolvedValue({ leagues: [], teams: [] });

    await GET();
    const select = (prismaMock.user.findUnique.mock.calls[0] as [{ select: unknown }])[0].select;
    expect(select).toEqual({
      leagues: { select: { id: true } },
      teams: {
        select: {
          id: true,
          leagueId: true,
          championedLeagues: { select: { id: true } },
          homeFixtures: { select: fixtureStatsSelectShape },
          awayFixtures: { select: fixtureStatsSelectShape },
        },
      },
    });
  });
});

const fixtureStatsSelectShape = {
  id: true,
  homeTeamId: true,
  awayTeamId: true,
  winnerId: true,
  homeScore: true,
  awayScore: true,
  result: { select: { id: true } },
};
