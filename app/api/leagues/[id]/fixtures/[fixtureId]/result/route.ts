import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { maybeCloseLeague } from "@/lib/standings";
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
  resolveCasualtyOutcomes,
  type ResultPlayerAction,
  type CasualtyVictim,
  type ResolvedCasualty,
} from "@/lib/result";
import { rollD3, rollD6, rollD16 } from "@/lib/random";
import { clearSuspensionUpdate, injurySuspensionUpdate } from "@/lib/playerInjuries";
import { ensurePlayersForTeam } from "@/lib/players";
import { isJourneymanId } from "@/lib/journeymen";
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
  casualties: CasualtyVictim[];
}

/** Parses the team's reported casualty victims ({team, rosterPlayerId}).
 * RAU-13 defensive: a crafted journeyman id is dropped — the form can only
 * reference REAL roster players, and a Novato's injury never persists. */
function parseCasualties(raw: unknown): CasualtyVictim[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null)
    .map((c) => ({
      team: c.team === "home" || c.team === "away" ? c.team : null,
      rosterPlayerId: typeof c.rosterPlayerId === "string" ? c.rosterPlayerId : null,
    }))
    .filter((c): c is CasualtyVictim => c.team !== null && c.rosterPlayerId !== null)
    .filter((c) => !isJourneymanId(c.rosterPlayerId));
}

function asPlayerActions(raw: unknown): ResultPlayerAction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (p): p is Record<string, unknown> =>
        typeof p === "object" && p !== null && typeof p.rosterPlayerId === "string",
    )
    // RAU-13 defensive: a journeyman id cannot earn PE through the form — the
    // form references roster players only, and a Novato never gets PE.
    .filter((p) => !isJourneymanId(p.rosterPlayerId as string))
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
  // The client contract (`ResultPayload`) sends `ballHeld`; treat an undefined
  // legacy `heldBall` as absent so the boolean guard below rejects both.
  const heldBall = typeof team.ballHeld === "boolean" ? team.ballHeld : team.heldBall;
  if (typeof score !== "number" || typeof heldBall !== "boolean") return null;
  const players = asPlayerActions(team.players);
  const mvp = team.mvp as Record<string, unknown> | undefined;
  const nominations = Array.isArray(mvp?.nominations)
    ? (mvp.nominations as unknown[])
        .filter((n): n is string => typeof n === "string")
        // RAU-13 defensive: a journeyman can never be the MJP grantee.
        .filter((n) => !isJourneymanId(n))
    : [];
  if (nominations.length !== 6) return null;
  return { score, heldBall, players, nominations, casualties: parseCasualties(team.casualties) };
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

/** Minimal Player write surface used by `persistCasualtyOutcomes`. */
type PlayerPersistenceTx = {
  findMany(args: Record<string, unknown>): Promise<
    { teamId: string; rosterPlayerId: string; injuries: unknown; alive: boolean }[]
  >;
  updateMany(args: Record<string, unknown>): Promise<unknown>;
};

/**
 * Appends each resolved casualty's injury band to the victim's Player row,
 * marking the victim dead when the outcome is Muerto and flagging a lasting
 * band (apaleado/grave/permanent) as unavailable for the NEXT match (RAU-12).
 * Runs inside the result `$transaction`. Behaviour mirrors
 * `ensurePlayersForTeam`'s skip-unknown: a victim with no backfilled Player row
 * is skipped, an already-dead Player is skipped (no revive / re-append), and
 * duplicate victim ids are applied once. The caller CLEARS both teams'
 * pre-existing suspension flags BEFORE invoking this (a player injured in THIS
 * match starts their suspension after it, not during).
 */
async function persistCasualtyOutcomes(
  player: PlayerPersistenceTx,
  teamIdFor: (role: "home" | "away") => string,
  resolved: readonly ResolvedCasualty[],
): Promise<void> {
  const deduped = Array.from(
    new Map(resolved.map((c) => [`${c.team}:${c.rosterPlayerId}`, c])).values(),
  );
  if (deduped.length === 0) return;
  const existing = await player.findMany({
    where: {
      OR: deduped.map((c) => ({ teamId: teamIdFor(c.team), rosterPlayerId: c.rosterPlayerId })),
    },
  });
  const rowByKey = new Map(existing.map((row) => [`${row.teamId}:${row.rosterPlayerId}`, row]));
  for (const c of deduped) {
    const teamId = teamIdFor(c.team);
    const row = rowByKey.get(`${teamId}:${c.rosterPlayerId}`);
    if (!row) continue; // unknown roster id — not backfilled → skip
    if (!row.alive) continue; // already dead → skip (no revive / re-append)
    const injuries = Array.isArray(row.injuries) ? row.injuries : [];
    await player.updateMany({
      where: { teamId, rosterPlayerId: c.rosterPlayerId },
      data: {
        injuries: [...injuries, { kind: c.outcome.kind }] as never,
        ...injurySuspensionUpdate(c.outcome.kind, row.alive),
      },
    });
  }
}

/**
 * POST /api/leagues/[id]/fixtures/[fixtureId]/result
 * Loads a match result. Authorized callers are the league owner (admin) or
 * either fixture captain (owner of the home/away team); an authenticated
 * non-participant receives 404 (no-leak). The route validates that each team's
 * per-player TD credits sum to its reported score (400 otherwise) and, in ONE
 * transaction, persists the fixture scores + derived winner, the report record
 * (weather, scoreboard snapshot incl. per-team winnings and MVP grantees, petty
 * cash), each team's winnings to the
 * treasury, post-match fan factor, per-player PE (incl. the MJP 4-PE grant),
 * and each reported casualty's server-resolved 1D16 injury persisted on the
 * victim's Player row (`injuries[]` appended, `alive:false` on death, and a
 * lasting band — apaleado/grave/permanent — flagged `missNextMatch` after
 * clearing both teams' served suspensions, RAU-12)
 * (bb2025-rules R5). A fixture already played or
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
      // D20: when a live match exists, the result transaction appends the
      // home+away mvp events to its LiveEvent list and bumps the row seq.
      liveMatch: { select: { id: true, half: true, turnNumber: true, finishedAt: true } },
    },
  });
  if (!fixture || fixture.leagueId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // RAU-40: a finished league is definitive — no result may be loaded or
  // corrected (the stored champion is final). Reject BEFORE the fixture-level
  // "already has a result" check so the league state is reported, not the fixture.
  if (fixture.league.status === "finished") {
    return NextResponse.json({ error: "League is finished" }, { status: 409 });
  }
  if (fixture.league.status !== "started") {
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

  // Server-owned 1D16 per reported victim resolves each injury band (bb2025-rules R5).
  const allVictims: CasualtyVictim[] = [...home.casualties, ...away.casualties];
  const resolvedCasualties = resolveCasualtyOutcomes(
    allVictims,
    allVictims.map(() => rollD16()),
  );
  const homeTeamVictims = resolvedCasualties.filter((c) => c.team === "home");
  const awayTeamVictims = resolvedCasualties.filter((c) => c.team === "away");

  const homeParts = raceTvParts(fixture.homeTeam);
  const awayParts = raceTvParts(fixture.awayTeam);
  const homeTv = computeTeamTv(homeParts.rosterCost, homeParts.coachingCost, homeParts.valueBonus);
  const awayTv = computeTeamTv(awayParts.rosterCost, awayParts.coachingCost, awayParts.valueBonus);
  const pettyCash = computePettyCash(homeTv, awayTv);

  // D4: the snapshot carries each side's winnings (per the MatchScoreboard
  // contract) and the server-rolled MVP grantee ids so the match view renders
  // them from persisted data (MV-2).
  const scoreboard = {
    home: { score: home.score, postFf: postHomeFf, winnings: homeWinnings, casualties: homeTeamVictims, pe: homeAwards },
    away: { score: away.score, postFf: postAwayFf, winnings: awayWinnings, casualties: awayTeamVictims, pe: awayAwards },
    winnerId,
    mvp: { home: homeMvp, away: awayMvp },
  };

  await ensurePlayersForTeam(homeTeamId, Array.isArray(fixture.homeTeam.roster) ? (fixture.homeTeam.roster as unknown as PlayerEntry[]) : []);
  await ensurePlayersForTeam(awayTeamId, Array.isArray(fixture.awayTeam.roster) ? (fixture.awayTeam.roster as unknown as PlayerEntry[]) : []);

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      // D20/LM-mvp: a fixture with a LiveMatch appends the home+away MJP grantee
      // `mvp` events to that LiveMatch's event list INSIDE this transaction. The
      // next seq is read as max(seq) in-tx and the row seq is bumped, so two
      // concurrent result submits can never collide on `@@unique([liveMatchId,
      // seq])` — the constraint is the double-submit arbiter (P2002 → 409 below).
      // It runs FIRST so a seq conflict aborts the whole result before any score
      // mutation commits (all writes are atomic either way). A fixture without a
      // LiveMatch (legacy/walkover) writes no mvp event.
      if (fixture.liveMatch) {
        const lm = fixture.liveMatch;
        const agg = await tx.liveEvent.aggregate({
          where: { liveMatchId: lm.id },
          _max: { seq: true },
        });
        const maxSeq = agg._max.seq ?? 0;
        const homeSeq = maxSeq + 1;
        const awaySeq = maxSeq + 2;
        // Validator refinement: the mvp feed minute is the load time — `at` =
        // `lm.finishedAt` when present, else `now`.
        const atMs = lm.finishedAt ? new Date(lm.finishedAt).getTime() : Date.now();
        await tx.liveEvent.createMany({
          data: [
            {
              liveMatchId: lm.id,
              seq: homeSeq,
              kind: "mvp",
              side: "home",
              playerRosterId: homeMvp,
              half: lm.half,
              turnNumber: lm.turnNumber,
              payload: {},
              createdAt: new Date(atMs),
            },
            {
              liveMatchId: lm.id,
              seq: awaySeq,
              kind: "mvp",
              side: "away",
              playerRosterId: awayMvp,
              half: lm.half,
              turnNumber: lm.turnNumber,
              payload: {},
              createdAt: new Date(atMs),
            },
          ],
        });
        // Bump the LiveMatch row seq past BOTH mvp seqs so the next live/result
        // transition's event (seq = row.seq + 1) never collides (D20).
        await tx.liveMatch.updateMany({
          where: { id: lm.id },
          data: { seq: awaySeq },
        });
      }
      await tx.fixture.update({
        where: { id: fixtureId },
        data: { homeScore: home.score, awayScore: away.score, winnerId },
      });
      // RAU-40: if this was the LAST unplayed fixture of the season, the league
      // closes atomically here — status "finished" + the standings champion.
      await maybeCloseLeague(tx, id);
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
      // RAU-12 clear: suspensions from BEFORE this match are served — every
      // player of both teams is available again, THEN the new lasting victims
      // below are re-flagged (order matters: a player injured in THIS match
      // starts their suspension AFTER it).
      await tx.player.updateMany({
        where: { teamId: { in: [homeTeamId, awayTeamId] } },
        data: clearSuspensionUpdate(),
      });
      await persistCasualtyOutcomes(
        tx.player as unknown as PlayerPersistenceTx,
        (role) => (role === "home" ? homeTeamId : awayTeamId),
        resolvedCasualties,
      );
      return report;
    });
  } catch (error) {
    // D20: a concurrent double-submit trips `@@unique([liveMatchId, seq])`
    // (Prisma P2002) inside the transaction — map it to a 409 so no duplicate
    // mvp write ever persists.
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Concurrent result load conflict" },
        { status: 409 },
      );
    }
    throw error;
  }

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
 * Correction of a played fixture, accepted from the league admin OR either
 * participant coach; a foreign actor is rejected with 404 (no existence leak).
 * The correction records an audit `MatchResultCorrection` row (before/after
 * snapshot, actor, correctedAt) and re-runs the PE rules against the corrected
 * payload, applying only the positive `max(0, new - old)` deltas so PE already
 * spent is never revoked.
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
  if (!fixture || fixture.leagueId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // RAU-40: a finished league is definitive — no result may be loaded or
  // corrected (the stored champion is final). Reject BEFORE the fixture-level
  // "already has a result" check so the league state is reported, not the fixture.
  if (fixture.league.status === "finished") {
    return NextResponse.json({ error: "League is finished" }, { status: 409 });
  }
  if (fixture.league.status !== "started") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isAdmin = fixture.league.ownerId === userId;
  const isCaptain =
    fixture.homeTeam.userId === userId || fixture.awayTeam.userId === userId;
  // A correction is accepted from the league admin OR either participant coach.
  if (!isAdmin && !isCaptain) {
    // Foreign user (not a captain, not the admin) → 404, no existence leak.
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
  const prevScores = (fixture.result.scores ?? {}) as unknown as {
    home: { score: number; postFf?: number; winnings?: number; casualties?: ResolvedCasualty[]; pe: { rosterPlayerId: string; pe: number }[] };
    away: { score: number; postFf?: number; winnings?: number; casualties?: ResolvedCasualty[]; pe: { rosterPlayerId: string; pe: number }[] };
    mvp?: { home: string; away: string };
  };
  const homeMvp = computeMvpGrantee(home.nominations, rollD6());
  const awayMvp = computeMvpGrantee(away.nominations, rollD6());
  const homeAwards = computeTeamPeAwards(home.players, homeMvp);
  const awayAwards = computeTeamPeAwards(away.players, awayMvp);
  const sumAwards = (list: { rosterPlayerId: string; pe: number }[]) =>
    new Map(list.map((a) => [a.rosterPlayerId, a.pe]));
  const prevHomePe = sumAwards(prevScores?.home?.pe ?? []);
  const prevAwayPe = sumAwards(prevScores?.away?.pe ?? []);

  // The correction re-resolves the reported victims (server-owned 1D16 per victim).
  const allVictims: CasualtyVictim[] = [...home.casualties, ...away.casualties];
  const resolvedCasualties = resolveCasualtyOutcomes(
    allVictims,
    allVictims.map(() => rollD16()),
  );
  const homeTeamVictims = resolvedCasualties.filter((c) => c.team === "home");
  const awayTeamVictims = resolvedCasualties.filter((c) => c.team === "away");

  // D4: the correction recomputes the MJP grantee (mirrors the PE re-run) and
  // preserves the prior per-side winnings — a correction never clears what the
  // original report earned. Legacy rows without winnings stay untouched
  // (forward-only: the `winnings` key is omitted, not set to undefined).
  const scoreboard = {
    home: {
      score: home.score,
      postFf: prevScores?.home?.postFf ?? 0,
      ...(prevScores?.home?.winnings != null ? { winnings: prevScores.home.winnings } : {}),
      casualties: homeTeamVictims,
      pe: homeAwards,
    },
    away: {
      score: away.score,
      postFf: prevScores?.away?.postFf ?? 0,
      ...(prevScores?.away?.winnings != null ? { winnings: prevScores.away.winnings } : {}),
      casualties: awayTeamVictims,
      pe: awayAwards,
    },
    winnerId,
    mvp: { home: homeMvp, away: awayMvp },
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
    // RAU-12 clear-then-set: the corrected result is an applied match, so the
    // served suspensions from before it are cleared and the corrected lasting
    // victims re-flagged (mirrors the POST transaction).
    await tx.player.updateMany({
      where: { teamId: { in: [homeTeamId, awayTeamId] } },
      data: clearSuspensionUpdate(),
    });
    await persistCasualtyOutcomes(
      tx.player as unknown as PlayerPersistenceTx,
      (role) => (role === "home" ? homeTeamId : awayTeamId),
      resolvedCasualties,
    );
  });

  return NextResponse.json({
    fixtureId,
    status: "played",
    homeScore: home.score,
    awayScore: away.score,
    winnerId,
  });
}

