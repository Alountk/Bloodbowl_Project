import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { CareerStats } from "@/features/profile/api";

/** A fixture's fields the career stats derive a team's result from. */
export interface FixtureStatsInput {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  winnerId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  /** Present when a MatchResult row exists (forward-compat played marker). */
  result: unknown;
}

/** The raw user row the stats route selects and `computeCareerStats` consumes. */
export interface CareerStatsInput {
  /** Leagues the user owns (any status). */
  leagues: { id: string }[];
  teams: {
    id: string;
    leagueId: string | null;
    championedLeagues: { id: string }[];
    homeFixtures: FixtureStatsInput[];
    awayFixtures: FixtureStatsInput[];
  }[];
}

/**
 * A fixture counts as PLAYED when a result was recorded — mirroring the league
 * route's derivation (`played ⇔ scores present ∥ MatchResult present`). A
 * walkover writes 2-0-style scores AND a winnerId, so it always counts and its
 * winnerId decides win/loss below.
 */
function isPlayed(fixture: FixtureStatsInput): boolean {
  return fixture.homeScore != null || fixture.awayScore != null || fixture.result != null;
}

/**
 * Pure career-stats derivation over the user's teams.
 *
 * Every stat sums across ALL the user's teams, archived included — career
 * stats are lifetime. `championships` sums each team's `championedLeagues`
 * (one per finished league that ranked that team first). `leaguesOwned` counts
 * the user's owned leagues; `leaguesMember` counts the DISTINCT leagues the
 * user's teams belong to; `leagues` is the distinct union of both (a league the
 * user owns AND plays in counts once).
 *
 * W/D/L are counted PER TEAM (product decision): a fixture where the user owns
 * BOTH teams contributes once to each team's tallies — a decisive self-match is
 * one win + one loss, a drawn one is two draws — and `matches` counts those
 * per-team appearances. This double-count is deliberate: the stats are "sum
 * over the user's teams' played fixtures", not distinct fixtures.
 */
export function computeCareerStats(input: CareerStatsInput): CareerStats {
  let matches = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;

  for (const team of input.teams) {
    for (const fixture of [...team.homeFixtures, ...team.awayFixtures]) {
      if (!isPlayed(fixture)) continue;
      matches += 1;
      if (fixture.winnerId === team.id) {
        wins += 1;
      } else if (
        fixture.winnerId === fixture.homeTeamId ||
        fixture.winnerId === fixture.awayTeamId
      ) {
        // A winnerId set to the OTHER participant → the opponent won.
        losses += 1;
      } else {
        // No winnerId (a drawn score) → draw.
        draws += 1;
      }
    }
  }

  const memberLeagueIds = new Set<string>();
  const ownedLeagueIds = new Set<string>();
  for (const team of input.teams) {
    if (team.leagueId) memberLeagueIds.add(team.leagueId);
  }
  for (const league of input.leagues) {
    ownedLeagueIds.add(league.id);
  }

  const leagues = new Set([...ownedLeagueIds, ...memberLeagueIds]).size;

  return {
    championships: input.teams.reduce((sum, team) => sum + team.championedLeagues.length, 0),
    teams: input.teams.length,
    leaguesOwned: ownedLeagueIds.size,
    leaguesMember: memberLeagueIds.size,
    leagues,
    matches,
    wins,
    draws,
    losses,
  };
}

/**
 * GET /api/me/stats
 * Returns the session user's career stats derived from their teams' leagues,
 * championships and played fixtures. 401 unauthenticated.
 */
export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      leagues: { select: { id: true } },
      teams: {
        select: {
          id: true,
          leagueId: true,
          championedLeagues: { select: { id: true } },
          homeFixtures: { select: fixtureStatsSelect },
          awayFixtures: { select: fixtureStatsSelect },
        },
      },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(computeCareerStats(user));
}

const fixtureStatsSelect = {
  id: true,
  homeTeamId: true,
  awayTeamId: true,
  winnerId: true,
  homeScore: true,
  awayScore: true,
  result: { select: { id: true } },
} as const;
