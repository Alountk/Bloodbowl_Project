import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { liveHub } from "@/lib/liveHub";
import { expireStaleLiveMatches } from "@/lib/liveStore";
import { deriveLiveClock, type LiveMatchStatus, type TeamSide } from "@/lib/liveMatch";
import {
  isShareLinkActive,
  reduceWatchMatch,
  type WatchFrameInput,
} from "@/lib/watchAccess";
import { deriveFixtureStatus } from "@/app/api/leagues/[id]/route";

/**
 * The SINGLE generic 404 body for an unknown token OR an expired/played share
 * link (MSL-3). It is byte-identical in every case so the route never reveals
 * whether a token exists — no existence leak, no expired-vs-unknown distinction.
 */
const SHARE_LINK_GONE = "Este link ya no está disponible";

function gone() {
  return NextResponse.json({ error: SHARE_LINK_GONE }, { status: 404 });
}

/** A raw Prisma LiveMatch row with the nested events the reduced read selects. */
interface RawLiveRow {
  seq: number;
  status: LiveMatchStatus;
  half: number;
  turnNumber: number;
  activeSide: TeamSide;
  homeScore: number;
  awayScore: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  homeTurnMs: number;
  awayTurnMs: number;
  paused: boolean;
  clockStartedAt: Date | null;
  events: {
    seq: number;
    kind: string;
    side: TeamSide | null;
    playerRosterId: string | null;
    half: number;
    turnNumber: number;
    payload: unknown;
    createdAt: Date;
  }[];
}

/**
 * Maps a persisted LiveMatch row to the whitelist frame `reduceWatchFrame`
 * consumes. The unified clock is derived with the SAME `deriveLiveClock` helper
 * the member `serializeLive`/`toLiveViewState` use, so the guest clock can never
 * drift from the member clock. The frame still carries the private row fields
 * downstream — `reduceWatchFrame` drops every non-public field.
 */
function toWatchFrame(row: RawLiveRow, now: number): WatchFrameInput {
  const clock = deriveLiveClock(
    {
      status: row.status,
      activeSide: row.activeSide,
      paused: row.paused,
      clockStartedAt: row.clockStartedAt ? row.clockStartedAt.getTime() : null,
      homeTurnMs: row.homeTurnMs,
      awayTurnMs: row.awayTurnMs,
    },
    now,
  );
  return {
    seq: row.seq,
    status: row.status,
    half: row.half,
    turnNumber: row.turnNumber,
    activeSide: row.activeSide,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    startedAt: row.startedAt ? row.startedAt.getTime() : null,
    finishedAt: row.finishedAt ? row.finishedAt.getTime() : null,
    elapsed: clock.elapsed,
    homeTurnMs: clock.homeTurnMs,
    awayTurnMs: clock.awayTurnMs,
    paused: clock.paused,
    events: row.events.map((event) => ({
      seq: event.seq,
      kind: event.kind,
      side: event.side,
      playerRosterId: event.playerRosterId,
      half: event.half,
      turnNumber: event.turnNumber,
      payload: event.payload,
      at: event.createdAt.getTime(),
    })),
  };
}

/**
 * GET /api/watch/[token]
 * The PUBLIC read-only share link (MSL-3/MSL-4). NO session is consulted — the
 * token itself is the capability. Guards, in order:
 *   - a token that resolves to no fixture → generic 404
 *   - a fixture with a recorded outcome (scores / winner / MatchResult) → the
 *     SAME generic 404 (derived expiry; expired and unknown are indistinguishable)
 *   - otherwise → 200 with the reduced `WatchMatchDto` (fixture identity, the two
 *     team identities, and the reduced live view — never rosters, coaching, PE,
 *     MVP, resolution, inducements, consent, or winnings).
 *
 * LMR-3 parity: exactly like the member fixture GET, an abandoned (>8h) live
 * match is lazily auto-closed BEFORE the reduced read so a guest never sees a
 * stale `live` view. The sweep is seq-guarded/idempotent and failure-tolerant.
 * If the sweep freezes the scoreboard, the link's derived expiry flips to the
 * generic 404 (the match is no longer unresolved).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // 1. Resolve the token to its fixture (lightweight gate). Unknown OR inactive
  //    tokens short-circuit to the identical 404 with no further reads/writes.
  const resolved = await prisma.fixture.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      homeScore: true,
      awayScore: true,
      winnerId: true,
      result: { select: { id: true } },
    },
  });
  if (!resolved || !isShareLinkActive(resolved)) {
    return gone();
  }

  // 2. LMR-3: lazily auto-close an abandoned live match BEFORE reading, so the
  //    served reduced `live` is never stale. A failure must not break the read.
  try {
    await expireStaleLiveMatches({ prisma, hub: liveHub }, { fixtureId: resolved.id });
  } catch {
    // Transparent maintenance — the next read retries.
  }

  // 3. The reduced read. Re-check the derived expiry: the sweep may have just
  //    frozen the scoreboard (which closes the link).
  const fixture = await prisma.fixture.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      round: true,
      scheduledAt: true,
      homeScore: true,
      awayScore: true,
      winnerId: true,
      result: { select: { id: true } },
      homeTeam: { select: { id: true, name: true, raceId: true, emblem: true } },
      awayTeam: { select: { id: true, name: true, raceId: true, emblem: true } },
      liveMatch: {
        select: {
          seq: true,
          status: true,
          half: true,
          turnNumber: true,
          activeSide: true,
          homeScore: true,
          awayScore: true,
          startedAt: true,
          finishedAt: true,
          homeTurnMs: true,
          awayTurnMs: true,
          paused: true,
          clockStartedAt: true,
          events: {
            orderBy: { seq: "asc" },
            select: {
              seq: true,
              kind: true,
              side: true,
              playerRosterId: true,
              half: true,
              turnNumber: true,
              payload: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });
  if (!fixture || !isShareLinkActive(fixture)) {
    return gone();
  }

  const now = Date.now();
  return NextResponse.json(
    reduceWatchMatch({
      fixture: {
        id: fixture.id,
        round: fixture.round,
        status: deriveFixtureStatus(fixture),
        scheduledAt: fixture.scheduledAt,
        homeScore: fixture.homeScore,
        awayScore: fixture.awayScore,
        winnerId: fixture.winnerId,
        homeTeam: fixture.homeTeam,
        awayTeam: fixture.awayTeam,
        liveMatch: fixture.liveMatch ? toWatchFrame(fixture.liveMatch, now) : null,
        result: fixture.result,
      },
    }),
  );
}
