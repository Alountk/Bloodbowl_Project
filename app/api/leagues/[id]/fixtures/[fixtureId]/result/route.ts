import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  preMatchFanFactor,
  postMatchFanFactor,
  computeWinnings,
  type MatchOutcome,
} from "@/lib/rules";
import {
  scoresMatchReportedTotals,
  deriveWinnerId,
  computeMvpGrantee,
  computeTeamPeAwards,
  computePettyCash,
  computeTeamTv,
  resolveTeamInjuries,
  type ResultPlayerAction,
} from "@/lib/result";
import { rollD3, rollD6, rollD16 } from "@/lib/random";
import { ensurePlayersForTeam } from "@/lib/players";
import { getRaceById } from "@/features/teams/data/races";
import {
  computeRosterCostFromPlayers,
  computeCoachingCost,
} from "@/features/teams/roster";
import {
  isCoachingStaff,
  DEFAULT_COACHING,
  type CoachingStaff,
  type PlayerEntry,
} from "@/features/teams/types";

interface TeamResultBody {
  score: number;
  heldBall: boolean;
  players: ResultPlayerAction[];
  nominations: string[];
}

function asPlayerActions(raw: unknown): ResultPlayerAction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is Record<string, unknown> =>
        typeof p === "object" && p !== null && typeof p.rosterPlayerId === "string",
    )
    .map((p) => ({
      rosterPlayerId: p.rosterPlayerId as string,
      tds: typeof p.tds === "number" ? p.tds : 0,
      casualties: typeof p.casualties === "number" ? p.casualties : 0,
      completions: typeof p.completions === "number" ? p.completions : 0,
      interceptions: typeof p.interceptions === "number" ? p.interceptions : 0,
      fouls: typeof p.fouls === "number" ? p.fouls : 0,
      throwTeamMates: typeof p.throwTeamMates === "number" ? p.throwTeamMates : 0,
      landedSafe: typeof p.landedSafe === "number" ? p.landedSafe : 0,
    }));
}

function parseTeamResult(raw: unknown): TeamResultBody | null {
  if (typeof raw !== "object" || raw === null) return null;
  const team = raw as Record<string, unknown>;
  const score = team.score;
  const heldBall = team.heldBall;
  if (typeof score !== "number" || typeof heldBall !== "boolean") return null;
  const players = asPlayerActions(team.players);
  const mvp = team.mvp as Record<string, unknown> | undefined;
  const nominations = Array.isArray(mvp?.nominations)
    ? (mvp.nominations as unknown[]).filter((n): n is string => typeof n === "string")
    : [];
  if (nominations.length !== 6) return null;
  return { score, heldBall, players, nominations };
}

function coachingOf(team: { coaching?: unknown }): CoachingStaff {
  const coaching = team.coaching as unknown;
  return isCoachingStaff(coaching) ? coaching : DEFAULT_COACHING;
}

function dedicatedFansOf(team: { coaching?: unknown }): number {
  return coachingOf(team).dedicatedFans;
}

function raceTvParts(team: {
  raceId: string;
  roster: unknown;
  coaching: unknown;
  players: readonly { valueBonus: number }[];
}): { rosterCost: number; coachingCost: number; valueBonus: number } {
  const race = getRaceById(team.raceId);
  const roster = Array.isArray(team.roster) ? (team.roster as PlayerEntry[]) : [];
  const valueBonus = (team.players ?? []).reduce((total, p) => total + (p.valueBonus ?? 0), 0);
  if (!race) return { rosterCost: 0, coachingCost: 0, valueBonus };
  return {
    rosterCost: computeRosterCostFromPlayers(race, roster),
    coachingCost: computeCoachingCost(race, coachingOf(team)),
    valueBonus,
  };
}

/**
 * POST /api/leagues/[id]/fixtures/[fixtureId]/result
 * Loads a match result. Authorized callers are the league owner (admin) or
 * either fixture captain (owner of the home/away team); an authenticated
 * non-participant receives 404 (no-leak). The route validates that each team's
 * per-player TD credits sum to its reported score (400 otherwise) and, in ONE
 * transaction, persists the fixture scores + derived winner, the report record
 * (weather, scoreboard snapshot, petty cash), each team's winnings to the
 * treasury, post-match fan factor, per-player PE (incl. the MJP 4-PE grant),
 * and the 1D16 injury outcomes (bb2025-rules). A fixture already played or
 * forfeited returns 409 with no re-award (idempotency).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; fixtureId: string }> },
) {
  const { id, fixtureId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fixture = await prisma.fixture.findFirst({
    where: { id: fixtureId },
    include: {
      league: { select: { id: true, status: true, ownerId: true } },
      homeTeam: {
        select: {
          id: true,
          userId: true,
          raceId: true,
          roster: true,
          coaching: true,
          treasury: true,
          players: { select: { rosterPlayerId: true, valueBonus: true } },
        },
      },
      awayTeam: {
        select: {
          id: true,
          userId: true,
          raceId: true,
          roster: true,
          coaching: true,
          treasury: true,
          players: { select: { rosterPlayerId: true, valueBonus: true } },
        },
      },
    },
  });
  if (!fixture || fixture.league.status !== "started" || fixture.leagueId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = fixture.league.ownerId === userId;
  const isCaptain =
    fixture.homeTeam.userId === userId || fixture.awayTeam.userId === userId;
  if (!isAdmin && !isCaptain) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (fixture.winnerId != null || fixture.homeScore != null || fixture.awayScore != null) {
    return NextResponse.json(
      { error: "This fixture already has a result" },
      { status: 409 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof rawBody !== "object" || rawBody === null) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const raw = rawBody as Record<string, unknown>;
  const home = parseTeamResult(raw.home);
  const away = parseTeamResult(raw.away);
  if (!home || !away) {
    return NextResponse.json({ error: "Invalid result payload" }, { status: 400 });
  }
  if (!scoresMatchReportedTotals(home.players, home.score, away.players, away.score)) {
    return NextResponse.json(
      { error: "Per-player touchdowns must equal the reported score" },
      { status: 400 },
    );
  }

  const homeTeamId = fixture.homeTeam.id;
  const awayTeamId = fixture.awayTeam.id;
  const winnerId = deriveWinnerId(home.score, away.score, homeTeamId, awayTeamId);

  // Server-owned dice, applied through pure rules modules.
  const preHomeFf = preMatchFanFactor({ roll3: rollD3(), dedicatedFans: dedicatedFansOf(fixture.homeTeam) });
  const preAwayFf = preMatchFanFactor({ roll3: rollD3(), dedicatedFans: dedicatedFansOf(fixture.awayTeam) });
  const homeOutcome: MatchOutcome = home.score > away.score ? "win" : home.score < away.score ? "loss" : "draw";
  const awayOutcome: MatchOutcome = away.score > home.score ? "win" : away.score < home.score ? "loss" : "draw";
  const postHomeFf = postMatchFanFactor({ ff: preHomeFf, result: homeOutcome, roll6: rollD6() });
  const postAwayFf = postMatchFanFactor({ ff: preAwayFf, result: awayOutcome, roll6: rollD6() });
  const homeWinnings = computeWinnings({ ffHome: preHomeFf, ffAway: preAwayFf, ownTds: home.score, heldBall: home.heldBall });
  const awayWinnings = computeWinnings({ ffHome: preAwayFf, ffAway: preHomeFf, ownTds: away.score, heldBall: away.heldBall });

  const homeMvp = computeMvpGrantee(home.nominations, rollD6());
  const awayMvp = computeMvpGrantee(away.nominations, rollD6());
  const homeAwards = computeTeamPeAwards(home.players, homeMvp);
  const awayAwards = computeTeamPeAwards(away.players, awayMvp);

  const homeCasualties = home.players.reduce((total, p) => total + p.casualties, 0);
  const awayCasualties = away.players.reduce((total, p) => total + p.casualties, 0);
  const homeInjuries = resolveTeamInjuries(homeCasualties, Array.from({ length: homeCasualties }, () => rollD16()));
  const awayInjuries = resolveTeamInjuries(awayCasualties, Array.from({ length: awayCasualties }, () => rollD16()));

  const homeParts = raceTvParts(fixture.homeTeam);
  const awayParts = raceTvParts(fixture.awayTeam);
  const homeTv = computeTeamTv(homeParts.rosterCost, homeParts.coachingCost, homeParts.valueBonus);
  const awayTv = computeTeamTv(awayParts.rosterCost, awayParts.coachingCost, awayParts.valueBonus);
  const pettyCash = computePettyCash(homeTv, awayTv);

  const scoreboard = {
    home: { score: home.score, postFf: postHomeFf, casualties: homeCasualties, injuries: homeInjuries, pe: homeAwards },
    away: { score: away.score, postFf: postAwayFf, casualties: awayCasualties, injuries: awayInjuries, pe: awayAwards },
    winnerId,
  };

  await ensurePlayersForTeam(homeTeamId, Array.isArray(fixture.homeTeam.roster) ? (fixture.homeTeam.roster as unknown as PlayerEntry[]) : []);
  await ensurePlayersForTeam(awayTeamId, Array.isArray(fixture.awayTeam.roster) ? (fixture.awayTeam.roster as unknown as PlayerEntry[]) : []);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.fixture.update({
      where: { id: fixtureId },
      data: { homeScore: home.score, awayScore: away.score, winnerId },
    });
    const report = await tx.matchResult.create({
      data: {
        fixtureId,
        weather: typeof raw.weather === "string" ? raw.weather : null,
        scores: scoreboard as never,
        pettyCash,
        loadedBy: userId,
      },
    });
    await tx.team.update({
      where: { id: homeTeamId },
      data: { treasury: { increment: homeWinnings } },
    });
    await tx.team.update({
      where: { id: awayTeamId },
      data: { treasury: { increment: awayWinnings } },
    });
    for (const award of homeAwards) {
      await tx.player.updateMany({
        where: { teamId: homeTeamId, rosterPlayerId: award.rosterPlayerId },
        data: { pe: { increment: award.pe } },
      });
    }
    for (const award of awayAwards) {
      await tx.player.updateMany({
        where: { teamId: awayTeamId, rosterPlayerId: award.rosterPlayerId },
        data: { pe: { increment: award.pe } },
      });
    }
    return report;
  });

  return NextResponse.json({
    fixtureId,
    status: "played",
    homeScore: home.score,
    awayScore: away.score,
    winnerId,
    winnings: { home: homeWinnings, away: awayWinnings },
    pettyCash,
    resultId: updated.id,
  });
}

/**
 * PUT /api/leagues/[id]/fixtures/[fixtureId]/result
 * Admin-only correction of a played fixture. A captain or a foreign user is
 * rejected (403 captain, 404 foreign, no mutation). The correction records an
 * audit `MatchResultCorrection` row (before/after snapshot, actor, correctedAt)
 * and re-runs the PE rules against the corrected payload, applying only the
 * positive `max(0, new - old)` deltas so PE already spent is never revoked.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; fixtureId: string }> },
) {
  const { id, fixtureId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fixture = await prisma.fixture.findFirst({
    where: { id: fixtureId },
    include: {
      league: { select: { id: true, status: true, ownerId: true } },
      homeTeam: {
        select: {
          id: true,
          userId: true,
          raceId: true,
          roster: true,
          coaching: true,
          players: { select: { rosterPlayerId: true, valueBonus: true } },
        },
      },
      awayTeam: {
        select: {
          id: true,
          userId: true,
          raceId: true,
          roster: true,
          coaching: true,
          players: { select: { rosterPlayerId: true, valueBonus: true } },
        },
      },
      result: true,
    },
  });
  if (!fixture || fixture.league.status !== "started" || fixture.leagueId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = fixture.league.ownerId === userId;
  if (!isAdmin) {
    const isCaptain =
      fixture.homeTeam.userId === userId || fixture.awayTeam.userId === userId;
    if (isCaptain) {
      return NextResponse.json(
        { error: "Only the league owner can correct a result" },
        { status: 403 },
      );
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!fixture.result) {
    return NextResponse.json(
      { error: "This fixture has no result to correct" },
      { status: 409 },
    );
  }
  const resultId = fixture.result.id;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof rawBody !== "object" || rawBody === null) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const raw = rawBody as Record<string, unknown>;
  const home = parseTeamResult(raw.home);
  const away = parseTeamResult(raw.away);
  if (!home || !away) {
    return NextResponse.json({ error: "Invalid result payload" }, { status: 400 });
  }
  if (!scoresMatchReportedTotals(home.players, home.score, away.players, away.score)) {
    return NextResponse.json(
      { error: "Per-player touchdowns must equal the reported score" },
      { status: 400 },
    );
  }

  const homeTeamId = fixture.homeTeam.id;
  const awayTeamId = fixture.awayTeam.id;
  const winnerId = deriveWinnerId(home.score, away.score, homeTeamId, awayTeamId);

  // Correction re-runs the PE rules; the previous awards live in the snapshot.
  const prevScores = (fixture.result.scores ?? {}) as {
    home: { score: number; postFf?: number; pe: { rosterPlayerId: string; pe: number }[] };
    away: { score: number; postFf?: number; pe: { rosterPlayerId: string; pe: number }[] };
  };
  const homeMvp = computeMvpGrantee(home.nominations, rollD6());
  const awayMvp = computeMvpGrantee(away.nominations, rollD6());
  const homeAwards = computeTeamPeAwards(home.players, homeMvp);
  const awayAwards = computeTeamPeAwards(away.players, awayMvp);
  const sumAwards = (list: { rosterPlayerId: string; pe: number }[]) =>
    new Map(list.map((a) => [a.rosterPlayerId, a.pe]));
  const prevHomePe = sumAwards(prevScores?.home?.pe ?? []);
  const prevAwayPe = sumAwards(prevScores?.away?.pe ?? []);

  const scoreboard = {
    home: { score: home.score, postFf: prevScores?.home?.postFf ?? 0, casualties: 0, pe: homeAwards },
    away: { score: away.score, postFf: prevScores?.away?.postFf ?? 0, casualties: 0, pe: awayAwards },
    winnerId,
  };

  await prisma.$transaction(async (tx) => {
    await tx.fixture.update({
      where: { id: fixtureId },
      data: { homeScore: home.score, awayScore: away.score, winnerId },
    });
    await tx.matchResult.update({
      where: { id: resultId },
      data: { scores: scoreboard as never, weather: typeof raw.weather === "string" ? raw.weather : null },
    });
    await tx.matchResultCorrection.create({
      data: {
        resultId,
        correctedBy: userId,
        before: prevScores as never,
        after: scoreboard as never,
      },
    });
    const apply: { teamId: string; award: { rosterPlayerId: string; pe: number } }[] = [
      ...homeAwards.map((a) => ({ teamId: homeTeamId, award: a })),
      ...awayAwards.map((a) => ({ teamId: awayTeamId, award: a })),
    ];
    for (const { teamId, award } of apply) {
      const prev = teamId === homeTeamId ? prevHomePe.get(award.rosterPlayerId) ?? 0 : prevAwayPe.get(award.rosterPlayerId) ?? 0;
      const delta = Math.max(0, award.pe - prev);
      if (delta === 0) continue; // spent PE never revoked
      await tx.player.updateMany({
        where: { teamId, rosterPlayerId: award.rosterPlayerId },
        data: { pe: { increment: delta } },
      });
    }
  });

  return NextResponse.json({
    fixtureId,
    status: "played",
    homeScore: home.score,
    awayScore: away.score,
    winnerId,
  });
}
