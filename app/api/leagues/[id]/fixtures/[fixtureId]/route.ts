import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deriveLiveClock, isDisplayEvent } from "@/lib/liveMatch";
import { enrichFixture } from "@/app/api/leagues/[id]/route";
import type { PlayerEntry } from "@/features/teams/types";

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

/**
 * The shared live-match DTO (D8/D13/D19): consumed by MatchView, timeline,
 * prefill, and the live SSE/POST routes. Field-set parity with
 * `toLiveViewState` (unified clock) is asserted by a test.
 */
export interface LiveDto {
  seq: number;
  status: "pending" | "ready" | "live" | "finished";
  half: number;
  turnNumber: number;
  activeSide: "home" | "away";
  homeConsented: boolean;
  awayConsented: boolean;
  viewerSide: "home" | "away" | null;
  startedAt: number | null;
  elapsed: number;
  homeTurnMs: number;
  awayTurnMs: number;
  paused: boolean;
  homeScore: number;
  awayScore: number;
  finishedAt: number | null;
  /** RAU-38: the side that proposed to concede, or null when none is pending. */
  concedeProposedBy: "home" | "away" | null;
  /** RAU-39: the pending casualty proposal, or null when none is pending. */
  pendingCasualty: Record<string, unknown> | null;
  events: LiveEventDto[];
}

/** A raw Prisma LiveMatch row (with nested events) cast structurally. */
interface LiveMatchRow {
  id: string;
  status: "pending" | "ready" | "live" | "finished";
  half: number;
  turnNumber: number;
  activeSide: "home" | "away";
  homeConsented: boolean;
  awayConsented: boolean;
  startedAt: Date | null;
  homeTurnMs: number;
  awayTurnMs: number;
  homeScore: number;
  awayScore: number;
  seq: number;
  paused: boolean;
  clockStartedAt: Date | null;
  finishedAt: Date | null;
  concedeProposedBy: "home" | "away" | null;
  pendingCasualty: unknown;
  /** RAU-44: the persisted per-team live winnings JSON (`{ home, away }`),
   * null until the match reaches `finished`. */
  winnings: unknown;
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

/**
 * Pure: serializes a LiveMatch row into the shared unified-clock DTO. Uses
 * `deriveLiveClock` (shared with `toLiveViewState`) so the active side's
 * accumulation at read time is derived identically — field-set parity is
 * asserted by a test. `viewerSide` is per-viewer (D19).
 */
export function serializeLive(
  row: LiveMatchRow,
  viewerSide: "home" | "away" | null,
  now: number,
): LiveDto {
  const clock = deriveLiveClock(
    {
      status: row.status,
      activeSide: row.activeSide,
      paused: row.paused,
      clockStartedAt: row.clockStartedAt ? new Date(row.clockStartedAt).getTime() : null,
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
    homeConsented: row.homeConsented,
    awayConsented: row.awayConsented,
    viewerSide,
    startedAt: row.startedAt ? new Date(row.startedAt).getTime() : null,
    elapsed: clock.elapsed,
    homeTurnMs: clock.homeTurnMs,
    awayTurnMs: clock.awayTurnMs,
    paused: clock.paused,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    finishedAt: row.finishedAt ? new Date(row.finishedAt).getTime() : null,
    concedeProposedBy: row.concedeProposedBy,
    pendingCasualty:
      typeof row.pendingCasualty === "object" && row.pendingCasualty !== null && !Array.isArray(row.pendingCasualty)
        ? (row.pendingCasualty as Record<string, unknown>)
        : null,
    // LM-16: only display-worthy kinds reach the fixture GET; `turn`/`turnStart`/
    // `requestTurn` stay in the DB (audit/replay) and are never shown here.
    events: row.events
      .filter((e) => isDisplayEvent(e.kind))
      .map((e) => ({
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

/** The persisted per-team winnings served for a finished live match (RAU-44):
 * `{ home, away }` from the LiveMatch row's `winnings`, or null when the JSON
 * is absent/malformed (defensive — never crash on a stale/foreign shape). */
export function parseLiveWinnings(value: unknown): { home: number; away: number } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.home !== "number" || typeof v.away !== "number") return null;
  return { home: v.home, away: v.away };
}

/**
 * Builds the served `players` roster for a team side (D21): the squad ALWAYS
 * carries every roster entry (id → rosterPlayerId, name, positionalKey) so the
 * Design-A feed and EventControls mini-form resolve names/positions/dorsals even
 * during a LIVE match before the lazy `Player` progression rows exist. When a
 * `Player` row is present it is overlaid (progression fields, alive) so a played
 * match keeps the authoritative post-result state. Dorsal = roster index + 1.
 */
function mergeRosterPlayers(
  team: { roster: unknown; players: MatchPlayerRow[] },
): MatchPlayerRow[] {
  const entries = Array.isArray(team.roster) ? (team.roster as PlayerEntry[]) : [];
  const rowByRef = new Map(team.players.map((p) => [p.rosterPlayerId, p]));
  // Roster JSON is the identity source and its order is deterministic; a
  // Player-progression row, when present, overlays the live fields.
  return entries.map((e) => {
    const row = rowByRef.get(e.id);
    return {
      rosterPlayerId: e.id,
      name: row?.name ?? e.name,
      positionalKey: row?.positionalKey ?? e.positionalKey,
      pe: row?.pe ?? 0,
      skills: row?.skills ?? [],
      injuries: row?.injuries ?? [],
      alive: row?.alive ?? true,
      // RAU-12: the suspension flag only exists on a Player row; a roster entry
      // without one is available.
      missNextMatch: row?.missNextMatch ?? false,
      valueBonus: row?.valueBonus ?? 0,
    };
  });
}

/** A Prisma `Player` row as served for a match roster. */
interface MatchPlayerRow {
  rosterPlayerId: string;
  name: string;
  positionalKey: string;
  pe: number;
  skills: unknown;
  injuries: unknown;
  alive: boolean;
  missNextMatch: boolean;
  valueBonus: number;
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
          roster: true,
          players: {
            orderBy: { id: "asc" }, // D21: stable row order for dorsal = index+1
            select: {
              rosterPlayerId: true,
              name: true,
              positionalKey: true,
              pe: true,
              skills: true,
              injuries: true,
              alive: true,
              missNextMatch: true,
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
          roster: true,
          players: {
            orderBy: { id: "asc" }, // D21: stable row order for dorsal = index+1
            select: {
              rosterPlayerId: true,
              name: true,
              positionalKey: true,
              pe: true,
              skills: true,
              injuries: true,
              alive: true,
              missNextMatch: true,
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

  // Started/finished league: owner or any current member only, else identical
  // 404 (a finished league keeps its member shield, RAU-40).
  if (fixture.league.status === "started" || fixture.league.status === "finished") {
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

  // D19: per-viewer side computed server-side from the session + team owners.
  const side: "home" | "away" | null =
    userId === fixture.homeTeam.userId
      ? "home"
      : userId === fixture.awayTeam.userId
        ? "away"
        : null;

  const live = fixture.liveMatch
    ? serializeLive(fixture.liveMatch as LiveMatchRow, side, Date.now())
    : null;

  return NextResponse.json({
    fixture: fixtureRest,
    result: fixture.result ?? null,
    homeTeam: { ...homeTeam, players: mergeRosterPlayers(homeTeam as never) },
    awayTeam: { ...awayTeam, players: mergeRosterPlayers(awayTeam as never) },
    live,
    // RAU-44: the winnings persisted at live finish are surfaced ONLY once the
    // match is finished (a pending/live row has none). Once the result is
    // loaded, `result.scores.*.winnings` are the official numbers and this is
    // ignored by the summary/feed (result non-null wins).
    liveWinnings:
      fixture.liveMatch?.status === "finished"
        ? parseLiveWinnings(fixture.liveMatch.winnings)
        : null,
  });
}
