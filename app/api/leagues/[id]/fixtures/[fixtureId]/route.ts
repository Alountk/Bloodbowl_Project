import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { enrichFixture } from "@/app/api/leagues/[id]/route";

/** A persisted live event, serialized for the timeline (LM-10). */
interface LiveEventDto {
  seq: number;
  kind: string;
  side: "home" | "away" | null;
  playerRosterId: string | null;
  half: number;
  turnNumber: number;
  payload: Record<string, unknown>;
  at: number;
}

/** The shared live-match DTO (D8/D13): consumed by MatchView, timeline, prefill. */
interface LiveDto {
  seq: number;
  status: "pending" | "live" | "finished";
  half: number;
  turnNumber: number;
  activeSide: "home" | "away";
  turnClockEnabled: boolean;
  homeClock: number | null;
  awayClock: number | null;
  homeScore: number;
  awayScore: number;
  paused: boolean | null;
  finishedAt: number | null;
  events: LiveEventDto[];
}

/** A raw Prisma LiveMatch row (with nested events) cast structurally. */
interface LiveMatchRow {
  id: string;
  status: "pending" | "live" | "finished";
  half: number;
  turnNumber: number;
  activeSide: "home" | "away";
  homeClock: number;
  awayClock: number;
  homeScore: number;
  awayScore: number;
  seq: number;
  paused: boolean;
  finishedAt: Date | null;
  events: {
    seq: number;
    kind: string;
    side: "home" | "away" | null;
    playerRosterId: string | null;
    half: number;
    turnNumber: number;
    payload: unknown;
    createdAt: Date;
  }[];
}

/** Pure: serializes a LiveMatch row + league clock config into the shared DTO. */
function serializeLive(row: LiveMatchRow, turnClockEnabled: boolean): LiveDto {
  return {
    seq: row.seq,
    status: row.status,
    half: row.half,
    turnNumber: row.turnNumber,
    activeSide: row.activeSide,
    turnClockEnabled,
    homeClock: turnClockEnabled ? row.homeClock : null,
    awayClock: turnClockEnabled ? row.awayClock : null,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    paused: turnClockEnabled ? row.paused : null,
    finishedAt: row.finishedAt ? new Date(row.finishedAt).getTime() : null,
    events: row.events.map((e) => ({
      seq: e.seq,
      kind: e.kind,
      side: e.side,
      playerRosterId: e.playerRosterId,
      half: e.half,
      turnNumber: e.turnNumber,
      payload:
        typeof e.payload === "object" && e.payload !== null && !Array.isArray(e.payload)
          ? (e.payload as Record<string, unknown>)
          : {},
      at: new Date(e.createdAt).getTime(),
    })),
  };
}

/**
 * GET /api/leagues/[id]/fixtures/[fixtureId]
 * Returns a single fixture together with its persisted `MatchResult` snapshot
 * and both teams' enriched rosters. The fixture is enriched via `enrichFixture`
 * (derived status + resolved owner refs) and its nested `homeTeam`/`awayTeam`
 * are stripped (D3) so the response is normalized: `{ fixture, result,
 * homeTeam, awayTeam }`.
 *
 * Visibility follows the league detail gate (D6): unauthenticated → 401; the
 * fixture is looked up scoped to the league (`findFirst({id, leagueId})`) so a
 * missing fixture or one in another league → 404 with no existence leak; a
 * STARTED league is visible only to the league owner or any current member,
 * else 404 (identical body, no status leak); an OPEN league is visible to any
 * authenticated user (defensive — no fixtures exist while open).
 *
 * A walkover (fixture forfeited: scores set, no `MatchResult` row) returns
 * `result: null` (MV-2). Read-only, identical in both `AUTH_MODE` variants —
 * the route never reads the env, only `auth()`.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; fixtureId: string }> },
) {
  const { id, fixtureId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const fixture = await prisma.fixture.findFirst({
    where: { id: fixtureId, leagueId: id },
    include: {
      league: {
        select: {
          status: true,
          ownerId: true,
          turnClockEnabled: true,
          turnClockSeconds: true,
          teams: { select: { userId: true }, where: { archivedAt: null } },
        },
      },
      liveMatch: {
        include: { events: { orderBy: { seq: "asc" } } },
      },
      homeTeam: {
        select: {
          id: true,
          name: true,
          raceId: true,
          userId: true,
          user: { select: { id: true, name: true, email: true, avatar: true } },
          players: {
            select: {
              rosterPlayerId: true,
              name: true,
              positionalKey: true,
              pe: true,
              skills: true,
              injuries: true,
              alive: true,
              valueBonus: true,
            },
          },
        },
      },
      awayTeam: {
        select: {
          id: true,
          name: true,
          raceId: true,
          userId: true,
          user: { select: { id: true, name: true, email: true, avatar: true } },
          players: {
            select: {
              rosterPlayerId: true,
              name: true,
              positionalKey: true,
              pe: true,
              skills: true,
              injuries: true,
              alive: true,
              valueBonus: true,
            },
          },
        },
      },
      result: true,
    },
  });
  // Missing fixture or one in another league → 404 (no existence leak).
  if (!fixture) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Started league: owner or any current member only, else identical 404.
  if (fixture.league.status === "started") {
    const isMember = fixture.league.teams.some((team) => team.userId === userId);
    if (fixture.league.ownerId !== userId && !isMember) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  // D3: `fixture` = enriched output with nested teams stripped; `result` stays
  // top-level (null for a walkover); teams carry the normalized roster/coach.
  // The nested `liveMatch` is also stripped from `fixture` and surfaced as the
  // shared `live` DTO (D8/D13).
  const enriched = enrichFixture(fixture as never);
  const { homeTeam, awayTeam } = fixture;
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    homeTeam: _strippedHome,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    awayTeam: _strippedAway,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    liveMatch: _strippedLive,
    ...fixtureRest
  } = enriched;

  const live = fixture.liveMatch
    ? serializeLive(fixture.liveMatch as LiveMatchRow, fixture.league.turnClockEnabled)
    : null;

  return NextResponse.json({
    fixture: fixtureRest,
    result: fixture.result ?? null,
    homeTeam,
    awayTeam,
    live,
  });
}
