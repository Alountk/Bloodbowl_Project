import { describe, expect, it } from "vitest";
import type {
  FixtureDraft,
  League,
  LeagueDetail,
  LeagueMemberTeam,
} from "@/features/leagues/api";
import { selectUpcomingFixtures, type UpcomingFixture } from "./selectUpcomingFixtures";

/**
 * Pure selector matrix (MP-1/MP-2/MP-3). No mocks — fixtures, leagues and
 * details are inline objects and the function must be side-effect free.
 */

const ME = "u-me";
const OTHER = "u-other";

function league(overrides: Partial<League> = {}): League {
  return {
    id: "l1",
    name: "Liga de Verano",
    description: null,
    ownerId: OTHER,
    createdAt: new Date().toISOString(),
    status: "started",
    seasonLength: 3,
    startedAt: new Date().toISOString(),
    championTeamId: null,
    ownerName: "Coach",
    memberCount: 2,
    isMember: true,
    turnClockEnabled: false,
    turnClockSeconds: 120,
    rulesetId: null,
    rulesetName: null,
    ...overrides,
  };
}

function team(id: string, name: string, userId: string): LeagueMemberTeam {
  return {
    id,
    name,
    raceId: "human",
    leagueId: "l1",
    userId,
    roster: {},
    coaching: {},
  };
}

function fixture(overrides: Partial<FixtureDraft> = {}): FixtureDraft {
  return {
    id: "f1",
    leagueId: "l1",
    round: 1,
    homeTeamId: "h",
    awayTeamId: "a",
    createdAt: new Date().toISOString(),
    scheduledAt: null,
    winnerId: null,
    homeScore: null,
    awayScore: null,
    status: "pending",
    homeOwner: { id: ME, name: "Me" },
    awayOwner: { id: OTHER, name: "Other" },
    proposals: [],
    live: null,
    ...overrides,
  };
}

function detail(overrides: Partial<LeagueDetail> = {}): LeagueDetail {
  return {
    ...league(),
    teams: [team("h", "Halfling Hopper", ME), team("a", "Wood Elf Wanderers", OTHER)],
    fixtures: [],
    rounds: [],
    ...overrides,
  };
}

function select(userId: string, leagues: League[], details: ReadonlyMap<string, LeagueDetail>) {
  return selectUpcomingFixtures({ userId, leagues, details });
}

describe("selectUpcomingFixtures", () => {
  it("includes only the user's pending/scheduled fixtures from their started leagues", () => {
    const leagues = [league()];
    const details = new Map<string, LeagueDetail>([
      [
        "l1",
        detail({
          fixtures: [
            fixture({ id: "f-upcoming", status: "scheduled", scheduledAt: "2026-08-23T10:00:00Z" }),
          ],
        }),
      ],
    ]);

    const result = select(ME, leagues, details);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("f-upcoming");
  });

  it("resolves league + team names from the detail map", () => {
    const leagues = [league()];
    const details = new Map<string, LeagueDetail>([
      ["l1", detail({ fixtures: [fixture({ id: "f1", round: 2 })] })],
    ]);

    const result = select(ME, leagues, details);

    expect(result).toHaveLength(1);
    expect(result[0].leagueName).toBe("Liga de Verano");
    expect(result[0].homeTeamName).toBe("Halfling Hopper");
    expect(result[0].awayTeamName).toBe("Wood Elf Wanderers");
  });

  it("leaves team names undefined when the detail team map has no match", () => {
    const leagues = [league()];
    const missing = detail({
      fixtures: [fixture({ id: "f1", status: "pending" })],
    });
    missing.teams = [team("h", "Halfling Hopper", ME)]; // away team "a" absent from map
    const details = new Map<string, LeagueDetail>([["l1", missing]]);

    const result = select(ME, leagues, details);

    expect(result).toHaveLength(1);
    expect(result[0].homeTeamName).toBe("Halfling Hopper");
    expect(result[0].awayTeamName).toBeUndefined();
  });

  it("excludes played fixtures and foreign (non-participating) fixtures", () => {
    const leagues = [league()];
    const details = new Map<string, LeagueDetail>([
      [
        "l1",
        detail({
          fixtures: [
            fixture({ id: "f-played", status: "played", homeScore: 2, awayScore: 1 }),
            // User participates in neither side → foreign.
            fixture({
              id: "f-foreign",
              homeOwner: { id: OTHER, name: "Other A" },
              awayOwner: { id: OTHER, name: "Other B" },
            }),
            fixture({ id: "f-kept", status: "pending" }),
          ],
        }),
      ],
    ]);

    const results = select(ME, leagues, details);

    expect(results.map((f) => f.id)).toEqual(["f-kept"]);
  });

  it("excludes fixtures whose owners are unresolvable (null-safe participation)", () => {
    const leagues = [league()];
    const details = new Map<string, LeagueDetail>([
      [
        "l1",
        detail({
          fixtures: [
            // Reserve fixture still awaiting any team assignment → both null.
            fixture({ id: "f-null-both", homeOwner: null, awayOwner: null }),
            fixture({ id: "f-null-home", homeOwner: null, awayOwner: { id: OTHER, name: "Other" } }),
            fixture({ id: "f-kept", status: "pending" }),
          ],
        }),
      ],
    ]);

    const results = select(ME, leagues, details);

    expect(results.map((f) => f.id)).toEqual(["f-kept"]);
  });

  it("excludes leagues the user neither owns nor is a member of", () => {
    const foreignLeague = league({ id: "l-foreign", isMember: false, ownerId: OTHER });
    const openLeague = league({ id: "l-open", status: "open" });
    const leagues = [foreignLeague, openLeague];
    const details = new Map<string, LeagueDetail>([
      [
        "l-foreign",
        detail({ id: "l-foreign", isMember: false, ownerId: OTHER, fixtures: [fixture({ id: "f-f" })] }),
      ],
      ["l-open", detail({ id: "l-open", status: "open", fixtures: [fixture({ id: "f-o", leagueId: "l-open" })] })],
    ]);

    const results = select(ME, leagues, details);

    // Fixtures from non-started / non-member leagues are dropped entirely.
    expect(results).toHaveLength(0);
  });

  it("sorts dated fixtures ascending, undated last, then round ascending", () => {
    const leagues = [league()];
    const details = new Map<string, LeagueDetail>([
      [
        "l1",
        detail({
          fixtures: [
            fixture({ id: "f-later", status: "scheduled", scheduledAt: "2026-08-24T18:00:00Z", round: 1 }),
            fixture({ id: "f-undated-1", status: "pending", scheduledAt: null, round: 2 }),
            fixture({ id: "f-undated-2", status: "pending", scheduledAt: null, round: 1 }),
            fixture({ id: "f-sooner", status: "scheduled", scheduledAt: "2026-08-23T08:00:00Z", round: 3 }),
            fixture({ id: "f-same-date", status: "scheduled", scheduledAt: "2026-08-23T08:00:00Z", round: 2 }),
          ],
        }),
      ],
    ]);

    const results = select(ME, leagues, details).map((f) => f.id);

    // "f-same-date" (round 2) and "f-sooner" (round 3) share the same date →
    // lower round first; "f-later" next; the two undated come last in
    // ascending round order.
    expect(results).toEqual(["f-same-date", "f-sooner", "f-later", "f-undated-2", "f-undated-1"]);
  });

  it("falls back to an empty list when there is no userId", () => {
    const leagues = [league()];
    const details = new Map<string, LeagueDetail>([
      ["l1", detail({ fixtures: [fixture({ id: "f1" })] })],
    ]);

    const result = select(undefined, leagues, details);

    expect(result).toHaveLength(0);
  });
});
