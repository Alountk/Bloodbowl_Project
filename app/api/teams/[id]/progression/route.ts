import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { fallbackMvpId } from "@/features/leagues/matchSummary";
import type { PlayerProgressionCore } from "@/features/teams/types";
import type { PlayerAttribute } from "@/lib/rules/improvements";

/** The persisted `MatchResult.scores` snapshot shape for one side. */
interface ScoreboardSide {
  score?: number;
  casualties?: { team: string; rosterPlayerId: string; outcome: { kind: string } }[];
  pe: { rosterPlayerId: string; pe: number }[];
}

/** The persisted `MatchResult.scores` snapshot shape (per the result route). */
interface Scoreboard {
  home: ScoreboardSide;
  away: ScoreboardSide;
  mvp?: { home: string; away: string };
}

type MatchResultRow = {
  scores: unknown;
  fixture: { homeTeamId: string; awayTeamId: string };
};

/** The side of a result snapshot a team played (null when not a participant). */
function sideForTeam(result: MatchResultRow, teamId: string): "home" | "away" | null {
  if (result.fixture.homeTeamId === teamId) return "home";
  if (result.fixture.awayTeamId === teamId) return "away";
  return null;
}

/**
 * Aggregates career stats (casualties suffered, MVP awards) per roster player
 * from the team's `MatchResult` snapshots. CAS counts every reported victim of
 * the team's own side; MVP follows the match-summary convention — the
 * persisted `scores.mvp` id first, else the max-`pe` fallback (pe ≥ PE_MVP).
 */
export function aggregateCareerStats(
  results: readonly MatchResultRow[],
  teamId: string,
): Map<string, { casualties: number; mvp: number }> {
  const stats = new Map<string, { casualties: number; mvp: number }>();
  const bump = (id: string, key: "casualties" | "mvp") => {
    const cur = stats.get(id) ?? { casualties: 0, mvp: 0 };
    cur[key] += 1;
    stats.set(id, cur);
  };
  for (const result of results) {
    const side = sideForTeam(result, teamId);
    if (!side) continue;
    const scores = (result.scores ?? {}) as Scoreboard;
    const sideScores = scores[side];
    for (const casualty of sideScores?.casualties ?? []) {
      if (casualty.rosterPlayerId) bump(casualty.rosterPlayerId, "casualties");
    }
    const mvpId = scores.mvp?.[side] ?? fallbackMvpId(sideScores?.pe ?? []);
    if (mvpId) bump(mvpId, "mvp");
  }
  return stats;
}

/**
 * GET /api/teams/[teamId]/progression
 * Returns the team owner's Player progression rows (pe, skills, injuries,
 * valueBonus, alive, improvements, attributeIncreases, career stats) mapped to
 * `PlayerProgressionCore[]`, keyed for the team detail roster by
 * `rosterPlayerId`. Owned team only: a foreign or archived team id returns 404
 * (no existence leak), unauthenticated 401. When the team has no Player rows
 * yet (no result recorded), the payload is an empty list — the page then
 * renders the roster read-only, matching the read-only rival view.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = await prisma.team.findFirst({
    where: { id: teamId, userId, archivedAt: null },
    select: { id: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [players, results] = await Promise.all([
    prisma.player.findMany({
      where: { teamId },
      select: {
        rosterPlayerId: true,
        pe: true,
        skills: true,
        injuries: true,
        valueBonus: true,
        alive: true,
        missNextMatch: true,
        improvements: true,
        attributeIncreases: true,
      },
    }),
    prisma.matchResult.findMany({
      where: { fixture: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] } },
      select: {
        scores: true,
        fixture: { select: { homeTeamId: true, awayTeamId: true } },
      },
    }),
  ]);

  const careerStats = aggregateCareerStats(results, teamId);

  const payload: PlayerProgressionCore[] = players.map((p) => ({
    rosterPlayerId: p.rosterPlayerId,
    pe: p.pe,
    skills: Array.isArray(p.skills) ? (p.skills as string[]) : [],
    injuries: Array.isArray(p.injuries) ? (p.injuries as string[]) : [],
    attributeIncreases:
      typeof p.attributeIncreases === "object" && p.attributeIncreases !== null
        ? (p.attributeIncreases as Partial<Record<PlayerAttribute, number>>)
        : {},
    valueBonus: p.valueBonus,
    alive: p.alive,
    missNextMatch: p.missNextMatch,
    improvements: Array.isArray(p.improvements) ? p.improvements.length : 0,
    stats: careerStats.get(p.rosterPlayerId) ?? { casualties: 0, mvp: 0 },
  }));

  return NextResponse.json(payload);
}
