import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAuthEnabled } from "@/lib/auth-mode";
import { resolveLiveAccess } from "@/lib/liveAccess";
import { liveHub, type HubSubscriber, type TickSnapshot } from "@/lib/liveHub";
import { rollD6, rollD3 } from "@/lib/random";
import {
  liveMatchRowToState,
  consentLiveMatch,
  retractLiveConsent,
  beginLiveMatch,
  applyTransition,
  pauseLiveMatch,
  resumeLiveMatch,
  proposeConcedeLiveMatch,
  declineConcedeLiveMatch,
  acceptConcedeLiveMatch,
  proposeCasualtyLiveMatch,
  confirmCasualtyLiveMatch,
  rollLiveMvp,
  resolveLiveMatch,
  nominateMvpLiveMatch,
  hireJourneymanLiveMatch,
  resolutionWinningsSeen,
  resolutionFanRoll,
  resolutionAdvance,
  resolutionMvpConfirm,
  resolutionMvpReveal,
  resolutionCasualtiesDone,
  resolutionJourneymenDone,
} from "@/lib/liveStore";
import {
  applyEndTurn,
  applyTD,
  applyCompletion,
  applyEndMatch,
  applyRequestTurn,
  REQUEST_TURN_COOLDOWN_MS,
  toLiveViewState,
  isDisplayEvent,
  deriveCasualtyOutcome,
  type FixtureStartState,
  type LiveMatchState,
  type TeamSide,
} from "@/lib/liveMatch";
import {
  checkActorInvariant,
  playerSide,
  resolveEventPermission,
  CASUALTY_CAUSES,
  type EventKind,
  type RosterSideMap,
  type CasualtyCause,
} from "@/lib/livePhase";
import { ensurePlayersForTeam } from "@/lib/players";
import { mergeRosterWithJourneymen, type ServedPlayer } from "@/lib/journeymen";
import type { PlayerEntry } from "@/features/teams/types";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;
/** How often the pending gap-queue is drained after the snapshot (live fan-out). */
const FLUSH_MS = 250;

export interface FixtureContext {
  id: string;
  leagueId: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
  scheduledAt: Date | null;
  homeScore: number | null;
  awayScore: number | null;
  winnerId: string | null;
  result: unknown | null;
  homeOwnerId: string | null;
  awayOwnerId: string | null;
  league: {
    ownerId: string;
    status: "open" | "started" | "finished";
    memberUserIds: string[];
  };
}

type Gateway =
  | { kind: "deny"; status: 401 | 403 | 404; error: string }
  | { kind: "allow"; context: FixtureContext };

/** A persisted LiveEvent row as loaded for the snapshot timeline. */
interface PersistedLiveEventRow {
  seq: number;
  kind: string;
  side: "home" | "away" | null;
  playerRosterId: string | null;
  half: number;
  turnNumber: number;
  payload: unknown;
  createdAt: Date;
}

/** The client DTO shape for a live event (mirrors `serializeLive` + `LiveMatchEventDto`). */
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

/** Maps persisted LiveEvent rows to the DTO shape (LM-6/`serializeLive` parity),
 * filtering OUT non-display kinds (LM-16): the snapshot feed carries only
 * `start|td|completion|casualty|foul|endHalf|endMatch|mvp`. `turn`/`turnStart`/
 * `requestTurn` stay in the DB (audit) and reach the client ONLY via the
 * unfiltered hub fan-out (D25: the live nudge is live-only). */
function toEventDtos(rows: PersistedLiveEventRow[]): LiveEventDto[] {
  return rows
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
    }));
}

/**
 * Loads a fixture (scoped to the league) with its league membership + clock
 * config, then resolves the expose/control gate via `liveAccess`. 401 without a
 * session in both auth modes; 404 for a foreign/unknown league or a STARTED
 * fixture the user isn't part of (no existence leak); otherwise the context is
 * returned. The control path additionally checks fixture-coach ownership in the
 * handler (a league member who is not a fixture coach gets 403).
 */
async function loadFixtureGate(
  id: string,
  fixtureId: string,
  userId: string | null,
  action: "read" | "control",
): Promise<Gateway> {
  const fixture = await prisma.fixture.findFirst({
    where: { id: fixtureId, leagueId: id },
    select: {
      id: true,
      leagueId: true,
      round: true,
      homeTeamId: true,
      awayTeamId: true,
      scheduledAt: true,
      homeScore: true,
      awayScore: true,
      winnerId: true,
      result: true,
      homeTeam: { select: { userId: true } },
      awayTeam: { select: { userId: true } },
      league: {
        select: {
          ownerId: true,
          status: true,
          teams: { select: { userId: true }, where: { archivedAt: null } },
        },
      },
    },
  });

  const league = fixture?.league ?? null;
  const gate = resolveLiveAccess({
    authEnabled: isAuthEnabled(),
    userId,
    league: league
      ? {
          ownerId: league.ownerId,
          status: league.status,
          memberUserIds: league.teams.map((t) => t.userId),
        }
      : null,
    action,
  });

  if (gate === 401 || gate === 404 || !fixture || !league) {
    const status = gate === 401 ? 401 : 404;
    return { kind: "deny", status, error: status === 401 ? "Unauthorized" : "Not found" };
  }

  return {
    kind: "allow",
    context: {
      id: fixture.id,
      leagueId: fixture.leagueId,
      round: fixture.round,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      scheduledAt: fixture.scheduledAt,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      winnerId: fixture.winnerId,
      result: fixture.result,
      homeOwnerId: fixture.homeTeam?.userId ?? null,
      awayOwnerId: fixture.awayTeam?.userId ?? null,
      league: {
        ownerId: league.ownerId,
        status: league.status,
        memberUserIds: league.teams.map((t) => t.userId),
      },
    },
  };
}

/** The team's dedicated-fans characteristic (coaching.dedicatedFans), used as
 * the fan-factor `base` (D4, LM-22). Result-route `dedicatedFansOf` precedent. */
function dedicatedFansOf(coaching: unknown): number {
  if (typeof coaching !== "object" || coaching === null) return 0;
  const c = coaching as Record<string, unknown>;
  return typeof c.dedicatedFans === "number" ? c.dedicatedFans : 0;
}

/** Converts the loaded fixture context to the state machine's start guard input. */
function fixtureStartState(ctx: FixtureContext): FixtureStartState {
  const played = ctx.homeScore != null || ctx.awayScore != null || ctx.result != null;
  return { played, result: ctx.result != null };
}

/** Per-viewer side (D19): the session user's team in this fixture, if any. */
function viewerSide(ctx: FixtureContext, userId: string | null): "home" | "away" | null {
  if (userId === null) return null;
  if (userId === ctx.homeOwnerId) return "home";
  if (userId === ctx.awayOwnerId) return "away";
  return null;
}

/**
 * Materializes both teams' rosters (idempotent) and returns the two Team rows so
 * the begin handler can build the server-owned kickoff input from their
 * `treasury` and `coaching.dedicatedFans` (D3/D4). The Player rows are the live
 * feed/EventControls roster source; they are lazily created by the result route
 * today, so a live match's roster would otherwise be EMPTY (no names/dorsals).
 * A team row normally exists, but a fixture whose team was deleted returns
 * nothing for that side.
 */
async function materializeTeamRosters(
  ctx: FixtureContext,
): Promise<{ id: string; treasury: number; coaching: unknown }[]> {
  const teams = await prisma.team.findMany({
    where: { id: { in: [ctx.homeTeamId, ctx.awayTeamId] } },
    select: { id: true, treasury: true, coaching: true, roster: true },
  });
  for (const team of teams) {
    const roster = Array.isArray(team.roster) ? (team.roster as unknown as PlayerEntry[]) : [];
    await ensurePlayersForTeam(team.id, roster);
  }
  return teams.map(({ id, treasury, coaching }) => ({ id, treasury, coaching }));
}

/**
 * Loads BOTH teams' served match rosters (roster-order merge + the race-bank
 * journeymen, `mergeRosterWithJourneymen`) — the same derivation the fixture
 * GET serves, so the journeyman NAMES the begin flow persists in the timeline
 * event match the FAB/combos exactly. Used by the begin handler (to build the
 * `journeymen` kickoff input) and by `loadRosterSideMap` (actor invariants).
 */
async function loadServedRosters(
  ctx: FixtureContext,
): Promise<{ home: ServedPlayer[]; away: ServedPlayer[] }> {
  const [teamRows, players] = await Promise.all([
    prisma.team.findMany({
      where: { id: { in: [ctx.homeTeamId, ctx.awayTeamId] } },
      select: { id: true, raceId: true, roster: true },
    }),
    prisma.player.findMany({
      where: { teamId: { in: [ctx.homeTeamId, ctx.awayTeamId] } },
      select: {
        teamId: true,
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
    }),
  ]);
  const servedFor = (teamId: string): ServedPlayer[] => {
    const team = teamRows.find((t) => t.id === teamId);
    return mergeRosterWithJourneymen({
      id: teamId,
      raceId: team?.raceId ?? "human",
      roster: team?.roster,
      players: players.filter((p) => p.teamId === teamId),
    });
  };
  return { home: servedFor(ctx.homeTeamId), away: servedFor(ctx.awayTeamId) };
}

/**
 * Loads the materialized Player rows for BOTH teams and groups their
 * `rosterPlayerId`s by side into a `RosterSideMap` (LM-12/D1). The map powers
 * `checkActorInvariant`: a foul victim / casualty causer MUST resolve to a
 * roster player on the opposite side. Reads the idempotent `ensurePlayersForTeam`
 * backfill, so it runs after `begin` materializes the rosters.
 *
 * RAU-13: the map ALSO resolves each side's Journeymen (Novatos) — the fixture
 * GET serves them selectable in the EventControls pools, so a foul victim or
 * casualty causer whose id is a served journeyman must pass the actor
 * invariants (a journeyman leaves after the match; nothing is persisted for it).
 */
async function loadRosterSideMap(ctx: FixtureContext): Promise<RosterSideMap> {
  const { home, away } = await loadServedRosters(ctx);
  return {
    home: new Set(home.map((p) => p.rosterPlayerId)),
    away: new Set(away.map((p) => p.rosterPlayerId)),
  };
}

/**
 * GET /api/leagues/[id]/fixtures/[fixtureId]/live
 *
 * SSE subscribe stream (LM-1, D1): same-origin JWT cookie, no separate token.
 * Stream lifecycle (D7 snapshot-first, LM-8):
 *   1. `event: snapshot` (no id) first — current live state, or nil. The
 *      snapshot carries the persisted events (full timeline) so a fresh or
 *      reloading client sees the nudges/TDs/casualties without a reconnect.
 *   2. `event: event id:<seq>` for every gap event with seq > snapshot.seq,
 *      deduped by seq so reconnects never replay stale events.
 *   3. `event: heartbeat` every 15s (never advances the Last-Event-ID cursor).
 *   4. Later hub publishes stream as `event: event` / `event: state`.
 * Abort cancels the stream and tears down the hub subscription. The
 * subscribe-to-hub happens BEFORE the DB snapshot read to close the subscribe
 * race: publishes buffered between subscribe and the snapshot emit are drained
 * and deduped after the snapshot (D7).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; fixtureId: string }> },
) {
  const { id, fixtureId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const gate = await loadFixtureGate(id, fixtureId, userId, "read");
  if (gate.kind === "deny") {
    return Response.json({ error: gate.error }, { status: gate.status });
  }
  const ctx = gate.context;

  // Rewind to the persisted live row (if any) so reconnects see the current
  // server-derived clocks and replay the gap since their cursor.
  const liveRow = await prisma.liveMatch.findFirst({ where: { fixtureId } });
  const live = liveRow ? liveMatchRowToState(liveRow) : null;
  const snapshotSeq = live?.seq ?? 0;

  // Load the persisted events so a fresh/reloading client receives the full
  // timeline (requestTurn nudges, TDs, casualties) in the snapshot instead of an
  // empty feed — the timeline must survive a reload.
  const persistedEvents = liveRow
    ? await prisma.liveEvent.findMany({
        where: { liveMatchId: liveRow.id },
        orderBy: { seq: "asc" },
      })
    : [];

  // The closure the hub calls for every publish. It queues gap events (> the
  // snapshot seq) for the stream to flush AFTER the snapshot frame, and drops
  // duplicate/stale seqs.
  const pending: { seq: number; payload: unknown }[] = [];
  const seen = new Set<number>();
  const notify: HubSubscriber["notify"] = (payload) => {
    const seq =
      typeof payload === "object" && payload !== null && typeof (payload as { seq?: unknown }).seq === "number"
        ? (payload as { seq: number }).seq
        : 0;
    if (seq <= snapshotSeq) return; // dup/stale — below or equal snapshot cursor
    if (seen.has(seq)) return;
    seen.add(seq);
    pending.push({ seq, payload });
  };

  const subscriber: HubSubscriber = { notify };
  const now = Date.now();

  // LM-5 unified-clock ticker: when a live match exists, start the hub's 1s
  // info-only ticker that derives + publishes the ACTIVE side's accumulated
  // time. There is NO auto-end at zero and NO `onClockExpired` seam (D4 removed);
  // the ticker only recomputes the derived values from the persisted anchor.
  const snapshot: TickSnapshot | null =
    live && live.status === "live"
      ? {
          seq: live.seq,
          status: live.status,
          activeSide: live.activeSide,
          homeConsented: live.homeConsented,
          awayConsented: live.awayConsented,
          startedAt: live.startedAt,
          homeTurnMs: live.homeTurnMs,
          awayTurnMs: live.awayTurnMs,
          homeScore: live.homeScore,
          awayScore: live.awayScore,
          finishedAt: live.finishedAt,
          paused: live.paused,
          clockStartedAt: live.clockStartedAt,
        }
      : null;
  if (snapshot) {
    liveHub.startTicking(fixtureId, snapshot);
  }

  // Grace (LM-7): the ACTIVE coach's connection drives the 10s auto-pause. A
  // reconnect by the active coach resumes a paused clock. Identity is the user
  // cookie, so a new device with the same coach recovers control (LM-8).
  const activeCoachId = live
    ? live.activeSide === "home"
      ? ctx.homeOwnerId
      : ctx.awayOwnerId
    : null;

  // If the active coach reconnects while the match is paused, resume it.
  if (live && live.paused && userId === activeCoachId) {
    const rowForResume = await prisma.liveMatch.findFirst({ where: { fixtureId } });
    if (rowForResume) {
      try {
        await resumeLiveMatch(
          { liveMatchId: rowForResume.id, fixtureId, current: live, now },
          { prisma, hub: liveHub },
        );
      } catch {
        // Resume raced with a transition — a later publish reconciles.
      }
    }
  }

  const graceHandler = async (fixtureIdArg: string) => {
    if (fixtureIdArg !== fixtureId) return;
    const row = await prisma.liveMatch.findFirst({ where: { fixtureId } });
    if (!row) return;
    const current = liveMatchRowToState(row);
    if (current.status !== "live") return;
    try {
      await pauseLiveMatch(
        { liveMatchId: row.id, fixtureId, current, now: Date.now() },
        { prisma, hub: liveHub },
      );
    } catch {
      // A concurrent transition won the seq; the hub publishes the latest state.
    }
  };

  // Subscribe BEFORE the DB snapshot write to close the subscribe race.
  let dispose: (() => void) | null = liveHub.subscribe({
    fixtureId,
    subscriber,
    coachId: userId,
    activeCoachId,
    onGraceExpired: graceHandler,
  });

  let onCancel: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const flush = () => {
        if (closed) return;
        pending.sort((a, b) => a.seq - b.seq);
        while (pending.length) {
          const item = pending.shift()!;
          controller.enqueue(
            encoder.encode(`event: event\nid: ${item.seq}\ndata: ${JSON.stringify(item.payload)}\n\n`),
          );
        }
      };

      const snapshotPayload = live
        ? {
            // D19: the snapshot carries the per-viewer side (computed server-side).
            ...toLiveViewState(live, Date.now(), { viewerSide: viewerSide(ctx, userId) }),
            seq: snapshotSeq,
            events: toEventDtos(persistedEvents),
          }
        : { seq: 0, live: null };

      // Snapshot-first (LM-8): no `id` field on the snapshot frame.
      controller.enqueue(
        encoder.encode(
          `event: snapshot\ndata: ${JSON.stringify({
            ...snapshotPayload,
            fixture: {
              id: ctx.id,
              leagueId: ctx.leagueId,
              round: ctx.round,
              homeTeamId: ctx.homeTeamId,
              awayTeamId: ctx.awayTeamId,
            },
          })}\n\n`,
        ),
      );

      flush();

      // Live fan-out (LM-8): hub publishes that arrive AFTER the snapshot are
      // buffered in `pending` and drained on a short interval so a live
      // transition (turn flip, nudge) reaches every connected coach WITHOUT a
      // reload. Flushing only once at start meant the queue never drained and
      // live frames were silently lost.
      const flushTimer = setInterval(() => {
        if (closed) return;
        flush();
      }, FLUSH_MS);

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode("event: heartbeat\ndata: {}\n\n"));
      }, HEARTBEAT_MS);

      onCancel = () => {
        if (closed) return;
        closed = true;
        clearInterval(flushTimer);
        clearInterval(heartbeat);
        dispose?.();
        dispose = null;
      };
    },
    cancel() {
      onCancel?.();
      return Promise.resolve();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      "x-accel-buffering": "no",
    },
  });
}

/** Control command payloads (LM-4/D10/D11/LM-11). `mvp` is deliberately absent
 * (LM-14): it is NEVER a live command — the result route writes it. */
type ControlCommand =
  | { type: "consent"; side: TeamSide }
  | { type: "retractConsent"; side: TeamSide }
  | { type: "begin" }
  | { type: "endTurn"; side: TeamSide }
  | { type: "td"; side: TeamSide; playerRosterId: string }
  | { type: "completion"; side: TeamSide; playerRosterId: string }
  | {
      type: "casualty";
      side: TeamSide;
      victimRosterId: string;
      /** Self-inflicted only (dodge/crowd): the victim's OWN side records the
       * injury directly with NO confirmation (LM-12 self-inflicted). The band
       * is derived server-side from `roll16`. */
      cause: CasualtyCause;
      roll16: number;
      roll6?: number;
    }
  | {
      type: "proposeCasualty";
      victimRosterId: string;
      causerRosterId: string;
      /** One of blitz|foul|block (causer-required causes — the
       * dodge/crowd path is the direct self-inflicted `casualty`). */
      cause: CasualtyCause;
      roll16: number;
      roll6?: number;
    }
  | { type: "confirmCasualty" }
  | { type: "foul"; side: TeamSide; playerRosterId: string; victimRosterId: string }
  | { type: "requestTurn" }
  | { type: "endMatch" }
  | { type: "concede" }
  | { type: "concedeRespond"; accept: boolean }
  | {
      /** RAU-49: server-owned PREVIEW roll for the resolution modal — validates
       * the persisted per-side MJP nominations (RAU-51: BOTH sides must have
       * nominated), rolls the MVP 1D6 + post-match FF dice and PERSISTS the
       * result as `LiveMatch.pendingResolution` (in the same transaction). The
       * `resolveMatch` command then reuses those EXACT rolls at commit, so the
       * previewed summary is what gets reported. Overwriting a previous preview
       * on re-roll is fine; 409 when already resolved or a side has not
       * nominated yet. */
      type: "rollMvp";
    }
  | {
      /** RAU-49: THE end-of-match closure — persists the PE awards, treasuries,
       * post-match FF, the MatchResult row, closes the fixture (idempotent for
       * a concede walkover) and runs `maybeCloseLeague` in ONE transaction.
       * RAU-51: rolls/reuses the persisted per-side nominations, never a body. */
      type: "resolveMatch";
    }
  | {
      /** RAU-51: a coach submits THEIR OWN side's six MJP nominations (the
       * route enforces the caller owns that side's team). Persisted per-side on
       * `LiveMatch.mvpNominations`; replace-on-resubmit; both sides gate the
       * roll. 400 invalid/dead/suspended nominees, 409 not finished/resolved. */
      type: "nominateMvp";
      side: TeamSide;
      players: string[];
    }
  | {
      /** RAU-14: the post-resolve journeyman decision. `hire: true` pays the
       * race Lineman cost from the treasury and makes the Novato a permanent
       * roster player; `hire: false` ("Dejar ir") just removes the option. The
       * route enforces the caller owns THAT side (like `nominateMvp`). */
      type: "hireJourneyman";
      side: TeamSide;
      journeymanId: string;
      hire: boolean;
    }
  | {
      /** Per-side wizard step 1 advance: winnings → fans (display-only). */
      type: "resolutionWinningsSeen";
      side: TeamSide;
    }
  | {
      /** Per-side wizard step 2: the server-owned dedicated-fans 1D6 roll. */
      type: "resolutionFanRoll";
      side: TeamSide;
    }
  | {
      /** Per-side wizard step advance: fans → mvp (requires the fan roll). */
      type: "resolutionAdvance";
      side: TeamSide;
      step: "fans" | "mvp";
    }
  | {
      /** Per-side wizard step 3: the FINAL MVP confirm (irrevocable). */
      type: "resolutionMvpConfirm";
      side: TeamSide;
    }
  | {
      /** Wizard step 4 gate: the MVP reveal (BOTH sides confirmed). */
      type: "resolutionMvpReveal";
      side: TeamSide;
    }
  | {
      /** Per-side wizard step 4 advance: the casualties were seen. */
      type: "resolutionCasualtiesDone";
      side: TeamSide;
    }
  | {
      /** Per-side wizard step 5 (LAST): the journeymen step is complete. */
      type: "resolutionJourneymenDone";
      side: TeamSide;
    };

function isControlCommand(value: unknown): value is ControlCommand {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (typeof c.type !== "string") return false;
  switch (c.type) {
    case "consent":
    case "retractConsent":
      return c.side === "home" || c.side === "away";
    case "begin":
    case "requestTurn":
      return true;
    case "endTurn":
      return c.side === "home" || c.side === "away";
    case "td":
    case "completion":
      return (c.side === "home" || c.side === "away") && typeof c.playerRosterId === "string";
    case "casualty":
      // Self-inflicted direct casualty: victim side + a KNOWN cause + roll16.
      return (
        (c.side === "home" || c.side === "away") &&
        typeof c.victimRosterId === "string" &&
        typeof c.cause === "string" &&
        (CASUALTY_CAUSES as readonly string[]).includes(c.cause) &&
        typeof c.roll16 === "number"
      );
    case "proposeCasualty":
      // The ACTIVE coach's proposal: causer + victim + a KNOWN cause + roll16.
      return (
        typeof c.victimRosterId === "string" &&
        typeof c.causerRosterId === "string" &&
        typeof c.cause === "string" &&
        (CASUALTY_CAUSES as readonly string[]).includes(c.cause) &&
        typeof c.roll16 === "number"
      );
    case "confirmCasualty":
      return true;
    case "foul":
      // LM-6: `victimRosterId` is REQUIRED on a foul command.
      return (
        (c.side === "home" || c.side === "away") &&
        typeof c.playerRosterId === "string" &&
        typeof c.victimRosterId === "string"
      );
    case "endMatch":
      return true;
    case "concede":
      return true;
    case "concedeRespond":
      return typeof c.accept === "boolean";
    case "rollMvp":
    case "resolveMatch":
      // RAU-51: the resolution commands no longer carry the nominations in the
      // body — the server rolls from the PERSISTED per-side `mvpNominations`.
      return true;
    case "nominateMvp":
      // RAU-51: the caller's side + their six roster ids (6-distinct + roster/
      // availability membership are validated in the store → 400).
      return (
        (c.side === "home" || c.side === "away") &&
        Array.isArray(c.players) &&
        c.players.every((p) => typeof p === "string")
      );
    case "hireJourneyman":
      // RAU-14: the caller's side + the synthetic journeyman id + the decision.
      return (
        (c.side === "home" || c.side === "away") &&
        typeof c.journeymanId === "string" &&
        typeof c.hire === "boolean"
      );
    case "resolutionWinningsSeen":
    case "resolutionFanRoll":
    case "resolutionMvpConfirm":
    case "resolutionMvpReveal":
    case "resolutionCasualtiesDone":
    case "resolutionJourneymenDone":
      // Per-side wizard commands: the caller's own side only.
      return c.side === "home" || c.side === "away";
    case "resolutionAdvance":
      // The fans→mvp / winnings→fans step advance.
      return (
        (c.side === "home" || c.side === "away") &&
        (c.step === "fans" || c.step === "mvp")
      );
    default:
      return false;
  }
}

/**
 * POST /api/leagues/[id]/fixtures/[fixtureId]/live
 *
 * Control route (LM-2): gates via `liveAccess` then restricts to the fixture
 * coaches (home/away team owners) or the league admin. A league member who is
 * not a fixture coach → 403; a foreign/unknown league → 404 (no existence
 * leak). Runs the pure transition through the store (optimistic `seq` guard →
 * 409 on double-action) and fans the new view state out via the hub after
 * commit. Responses: 200 {view}, 400 (bad command), 403 (spectator), 404
 * (foreign), 409 (invalid transition / seq conflict / consent on played /
 * begin-not-ready).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; fixtureId: string }> },
) {
  const { id, fixtureId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const gate = await loadFixtureGate(id, fixtureId, userId, "control");
  if (gate.kind === "deny") {
    // OPEN control for a known-but-unauthorized user is 403; foreign/unknown is 404.
    const status = gate.status === 401 ? 401 : gate.status;
    return Response.json({ error: gate.error }, { status });
  }
  const ctx = gate.context;

  // Fixture-coach / admin check (LM-2): owner of home or away team, or the
  // league admin, acts; any other member is a spectator → 403.
  if (
    !ctx.homeOwnerId ||
    !ctx.awayOwnerId ||
    (userId !== ctx.homeOwnerId && userId !== ctx.awayOwnerId && userId !== ctx.league.ownerId)
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (userId === null) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let command: unknown;
  try {
    command = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isControlCommand(command)) {
    return Response.json({ error: "Unsupported command" }, { status: 400 });
  }

  // RAU-40: a finished league is definitive — no live control command (incl. a
  // concede accept/decline) may mutate it further. The SSE read stream above
  // stays open so the finished match remains watchable.
  // RAU-14 EXCEPTION: the post-resolve journeyman hire/let-go is NOT a
  // live-play control — it is the product-mandated post-"Match reported"
  // decision, which for the season's LAST fixture happens AFTER the resolve
  // finished the league atomically. The hire mutates only the team roster /
  // treasury and the persisted journeymen list, never the league or the result.
  if (ctx.league.status === "finished" && command.type !== "hireJourneyman") {
    return Response.json({ error: "League is finished" }, { status: 409 });
  }

  const now = Date.now();
  const deps = { prisma, hub: liveHub };
  const side = viewerSide(ctx, userId);

  // Lifecycle commands (LM-11/LM-3): consent creates/updates the row, retract
  // clears the boolean, begin takes a ready match live via the first turn.
  if (command.type === "consent") {
    try {
      const result = await consentLiveMatch(
        { fixtureId, fixture: fixtureStartState(ctx), side: command.side, now },
        deps,
      );
      // D19: the POST response carries the per-viewer side (hub frames don't).
      return Response.json({ view: { ...result.view, viewerSide: side } }, { status: 200 });
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        return Response.json({ error: "Cannot consent on played/result fixture" }, { status: 409 });
      }
      throw error;
    }
  }

  if (command.type === "retractConsent") {
    const row = await prisma.liveMatch.findFirst({ where: { fixtureId } });
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    try {
      const result = await retractLiveConsent(
        { liveMatchId: row.id, fixtureId, side: command.side, now },
        deps,
      );
      return Response.json({ view: { ...result.view, viewerSide: side } }, { status: 200 });
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        return Response.json({ error: "Sequence conflict" }, { status: 409 });
      }
      throw error;
    }
  }

  if (command.type === "begin") {
    const row = await prisma.liveMatch.findFirst({ where: { fixtureId } });
    if (!row) return Response.json({ error: "Not found" }, { status: 404 });
    try {
      // Materialize both rosters so the live feed/controls resolve player names
      // and dorsals from the very first turn (D21), and return the two Team
      // rows so the kickoff input is built from their server-authoritative
      // treasury + coaching.dedicatedFans (D3/D4, LM-22/23).
      const teams = await materializeTeamRosters(ctx);
      const home = teams.find((t) => t.id === ctx.homeTeamId);
      const away = teams.find((t) => t.id === ctx.awayTeamId);
      // RAU-13: the begin flow persists a `journeyman` timeline event per side
      // that fields novatos — the served rosters share the fixture GET's naming
      // (deterministic per match), so the feed and the FAB agree on the names.
      const served = await loadServedRosters(ctx);
      const journeymenSide = (side: "home" | "away") => {
        const jrny = served[side].filter((p) => p.journeyman);
        return jrny.length > 0 ? { count: jrny.length, names: jrny.map((p) => p.name) } : undefined;
      };
      // RAU-14: the PERSISTED journeymen (synthetic id + the served race-bank
      // name) ride the begin write so the post-resolve hire flow can reference
      // them — the same derivation as the timeline event above.
      const persistedJourneymen = (side: "home" | "away") =>
        served[side].filter((p) => p.journeyman).map((p) => ({ id: p.rosterPlayerId, name: p.name }));
      // LM-21/LM-16: every kickoff die is rolled server-side here; any rolls in
      // the POST body are ignored. D3 for a minor deduction, the D6 keep pair
      // for a catastrophe, and the per-team 1D6 em + 1D6 fan rolls.
      const diceFor = () => ({
        em: rollD6(),
        d3: rollD3(),
        keep: [rollD6(), rollD6()] as [number, number],
        fan: rollD6(),
      });
      const kickoff = {
        now,
        half: 1,
        turnNumber: 1,
        home: {
          teamId: ctx.homeTeamId,
          treasury: home?.treasury ?? 0,
          dedicatedFans: dedicatedFansOf(home?.coaching),
        },
        away: {
          teamId: ctx.awayTeamId,
          treasury: away?.treasury ?? 0,
          dedicatedFans: dedicatedFansOf(away?.coaching),
        },
        dice: { home: diceFor(), away: diceFor() },
        journeymen: {
          home: journeymenSide("home"),
          away: journeymenSide("away"),
        },
      };
      const result = await beginLiveMatch(
        {
          liveMatchId: row.id,
          fixtureId,
          now,
          kickoff,
          // RAU-14: persist the fielded novatos atomically with the begin rows.
          journeymen: {
            home: persistedJourneymen("home"),
            away: persistedJourneymen("away"),
          },
        },
        deps,
      );
      return Response.json({ view: { ...result.view, viewerSide: side } }, { status: 200 });
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        return Response.json({ error: "Sequence conflict" }, { status: 409 });
      }
      throw error;
    }
  }

  // Advance / record / end require an existing live match row.
  const row = await prisma.liveMatch.findFirst({ where: { fixtureId } });
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const current = liveMatchRowToState(row);

  // requestTurn (LM-13/D17): the NON-active coach nudges the active coach. It
  // does NOT flip the turn nor change turn/clock state — only a labeled event
  // persists, rate-limited by the 60s cooldown.
  if (command.type === "requestTurn") {
    if (side === null) {
      return Response.json({ error: "No side to request a turn" }, { status: 409 });
    }
    if (side === current.activeSide) {
      // The active coach already has the turn.
      return Response.json({ error: "Already your turn" }, { status: 409 });
    }
    if (current.status !== "live") {
      return Response.json({ error: "Match not live" }, { status: 409 });
    }
    // Cooldown (D17): reject a nudge whose last persisted requestTurn is < 60s.
    const lastNudge = await prisma.liveEvent.findFirst({
      where: { liveMatchId: row.id, kind: "requestTurn" },
      orderBy: { id: "desc" },
    });
    const lastNudgeAt = lastNudge ? new Date(lastNudge.createdAt).getTime() : 0;
    if (now - lastNudgeAt < REQUEST_TURN_COOLDOWN_MS) {
      return Response.json({ error: "Request turn cooldown" }, { status: 409 });
    }

    const next = applyRequestTurn(current, { side }, now);
    try {
      await applyTransition({ liveMatchId: row.id, fixtureId, current, next, now }, deps);
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        return Response.json({ error: "Sequence conflict" }, { status: 409 });
      }
      throw error;
    }
    return Response.json({ view: toLiveViewState(next, now, { viewerSide: side }) }, { status: 200 });
  }

  // RAU-38 concede commands: a fixture coach with a side proposes to concede or
  // responds (accept/decline) to the rival's proposal. The state machine guards
  // live-only + responder roles; the admin/spectator without a side is rejected
  // with 409 (mirrors the requestTurn no-side guard). NOT turn-phase events —
  // they skip the LM-12 side gate below.
  if (command.type === "concede") {
    if (side === null) {
      return Response.json({ error: "No side to concede" }, { status: 409 });
    }
    try {
      const result = await proposeConcedeLiveMatch(
        { liveMatchId: row.id, fixtureId, side, now },
        deps,
      );
      return Response.json({ view: { ...result.view, viewerSide: side } }, { status: 200 });
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        return Response.json({ error: "Cannot concede in current state" }, { status: 409 });
      }
      throw error;
    }
  }

  if (command.type === "concedeRespond") {
    if (side === null) {
      return Response.json({ error: "No side to respond" }, { status: 409 });
    }
    try {
      const result = command.accept
        ? await acceptConcedeLiveMatch(
            {
              liveMatchId: row.id,
              fixtureId,
              side,
              homeTeamId: ctx.homeTeamId,
              awayTeamId: ctx.awayTeamId,
              leagueId: ctx.leagueId,
              now,
            },
            deps,
          )
        : await declineConcedeLiveMatch({ liveMatchId: row.id, fixtureId, side, now }, deps);
      return Response.json({ view: { ...result.view, viewerSide: side } }, { status: 200 });
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        return Response.json({ error: "Cannot respond to concede in current state" }, { status: 409 });
      }
      throw error;
    }
  }

  // RAU-49/RAU-51: the end-of-match RESOLUTION commands. `nominateMvp` is the
  // per-coach nomination of their OWN side (the route enforces the caller owns
  // that side's team); `rollMvp` is a server-owned preview that requires BOTH
  // sides nominated and reveals the rolled MVP grantees + post-match FF,
  // persisting them as `pendingResolution` so the commit reuses the SAME rolls;
  // the `resolveMatch` command is THE CLOSURE — it persists the PE awards, the
  // treasuries, the FF snapshot, the `MatchResult` row, closes the fixture
  // (idempotent for the concede walkover) and runs `maybeCloseLeague` in ONE
  // transaction. All three skip the LM-12 side gate below (they are not
  // turn-phase events); the coach/admin gate + the finished-league guard already
  // ran. `nominateMvp` is additionally restricted to the side's OWN owner.
  if (command.type === "nominateMvp") {
    if (side === null) {
      return Response.json({ error: "No side to nominate" }, { status: 409 });
    }
    if (command.side !== side) {
      return Response.json({ error: "Not your team" }, { status: 409 });
    }
    try {
      const result = await nominateMvpLiveMatch(
        {
          fixtureId,
          teamId: command.side === "home" ? ctx.homeTeamId : ctx.awayTeamId,
          side: command.side,
          players: command.players,
          now,
        },
        deps,
      );
      return Response.json({ view: { ...result.view, viewerSide: side } }, { status: 200 });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 400) return Response.json({ error: "Invalid MVP nominations" }, { status: 400 });
      if (status === 409) {
        return Response.json({ error: "Cannot nominate MVP in current state" }, { status: 409 });
      }
      if (status === 404) return Response.json({ error: "Not found" }, { status: 404 });
      throw error;
    }
  }

  if (command.type === "rollMvp") {
    try {
      const roll = await rollLiveMvp(
        {
          fixtureId,
          homeTeamId: ctx.homeTeamId,
          awayTeamId: ctx.awayTeamId,
          now,
        },
        deps,
      );
      return Response.json({ view: toLiveViewState(current, now, { viewerSide: side }), roll }, { status: 200 });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 400) return Response.json({ error: "Invalid MVP nominations" }, { status: 400 });
      if (status === 409) {
        if ((error as Error).message === "both sides must nominate first") {
          return Response.json({ error: "Both sides must nominate first" }, { status: 409 });
        }
        return Response.json({ error: "Cannot roll MVP for a resolved match" }, { status: 409 });
      }
      if (status === 404) return Response.json({ error: "Not found" }, { status: 404 });
      throw error;
    }
  }

  if (command.type === "resolveMatch") {
    try {
      // Lazy Player backfill parity with the result route: the PE/casualty
      // writes target Player rows keyed by (teamId, rosterPlayerId).
      await materializeTeamRosters(ctx);
      const resolved = await resolveLiveMatch(
        {
          fixtureId,
          leagueId: ctx.leagueId,
          homeTeamId: ctx.homeTeamId,
          awayTeamId: ctx.awayTeamId,
          loadedBy: userId as string,
          now,
        },
        deps,
      );
      return Response.json(
        { view: toLiveViewState(current, now, { viewerSide: side }), resolved },
        { status: 200 },
      );
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 400) return Response.json({ error: "Invalid MVP nominations" }, { status: 400 });
      if (status === 409) {
        if ((error as Error).message === "both sides must nominate first") {
          return Response.json({ error: "Both sides must nominate first" }, { status: 409 });
        }
        return Response.json({ error: "Cannot resolve match in current state" }, { status: 409 });
      }
      if (status === 404) return Response.json({ error: "Not found" }, { status: 404 });
      throw error;
    }
  }

  // RAU-14: the post-resolve journeyman decision (hire / let go). Restricted to
  // the side's OWN owner like `nominateMvp` — each coach decides their own
  // Novatos; an admin/bye viewer without a side is rejected with 409.
  if (command.type === "hireJourneyman") {
    if (side === null) {
      return Response.json({ error: "No side to hire" }, { status: 409 });
    }
    if (command.side !== side) {
      return Response.json({ error: "Not your team" }, { status: 409 });
    }
    try {
      const result = await hireJourneymanLiveMatch(
        {
          fixtureId,
          teamId: command.side === "home" ? ctx.homeTeamId : ctx.awayTeamId,
          side: command.side,
          journeymanId: command.journeymanId,
          hire: command.hire,
          now,
        },
        deps,
      );
      return Response.json(result, { status: 200 });
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 400) return Response.json({ error: "Unknown journeyman" }, { status: 400 });
      if (status === 404) return Response.json({ error: "Not found" }, { status: 404 });
      if (status === 409) {
        const message = error instanceof Error ? error.message : "Cannot hire in current state";
        return Response.json({ error: message }, { status: 409 });
      }
      throw error;
    }
  }

  // The per-side RESOLUTION WIZARD commands (RAU-52 rework): each coach advances
  // THEIR OWN side's step cursor (winnings → fans → mvp → mvp-done → casualties
  // → journeymen → done). Every command is restricted to the caller's OWN side
  // (like `nominateMvp`), persists the side's progress server-side (a refresh
  // resumes at the persisted step), and is idempotent — a re-sent command after
  // the side already advanced returns the current view.
  if (
    command.type === "resolutionWinningsSeen" ||
    command.type === "resolutionFanRoll" ||
    command.type === "resolutionAdvance" ||
    command.type === "resolutionMvpConfirm" ||
    command.type === "resolutionMvpReveal" ||
    command.type === "resolutionCasualtiesDone" ||
    command.type === "resolutionJourneymenDone"
  ) {
    if (side === null) {
      return Response.json({ error: "No side to resolve" }, { status: 409 });
    }
    if (command.side !== side) {
      return Response.json({ error: "Not your team" }, { status: 409 });
    }
    const input = {
      fixtureId,
      teamId: command.side === "home" ? ctx.homeTeamId : ctx.awayTeamId,
      side: command.side,
      now,
      // The close context: the LAST wizard command that reaches BOTH-done
      // auto-closes the match atomically (RAU-40 kept).
      leagueId: ctx.leagueId,
      homeTeamId: ctx.homeTeamId,
      awayTeamId: ctx.awayTeamId,
      loadedBy: userId as string,
    };
    try {
      switch (command.type) {
        case "resolutionWinningsSeen": {
          const result = await resolutionWinningsSeen(input, deps);
          return Response.json({ view: { ...result.view, viewerSide: side } }, { status: 200 });
        }
        case "resolutionFanRoll": {
          const result = await resolutionFanRoll(input, deps);
          return Response.json(
            { view: { ...result.view, viewerSide: side }, fans: result.fans },
            { status: 200 },
          );
        }
        case "resolutionAdvance": {
          const result = await resolutionAdvance({ ...input, step: command.step }, deps);
          return Response.json({ view: { ...result.view, viewerSide: side } }, { status: 200 });
        }
        case "resolutionMvpConfirm": {
          const result = await resolutionMvpConfirm(input, deps);
          return Response.json({ view: { ...result.view, viewerSide: side } }, { status: 200 });
        }
        case "resolutionMvpReveal": {
          const result = await resolutionMvpReveal(input, deps);
          return Response.json(
            { view: { ...result.view, viewerSide: side }, mvp: result.mvp },
            { status: 200 },
          );
        }
        case "resolutionCasualtiesDone": {
          const result = await resolutionCasualtiesDone(input, deps);
          return Response.json({ view: { ...result.view, viewerSide: side } }, { status: 200 });
        }
        case "resolutionJourneymenDone": {
          const result = await resolutionJourneymenDone(input, deps);
          return Response.json({ view: { ...result.view, viewerSide: side } }, { status: 200 });
        }
      }
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 400) return Response.json({ error: "Invalid resolution command" }, { status: 400 });
      if (status === 404) return Response.json({ error: "Not found" }, { status: 404 });
      if (status === 409) {
        const message = error instanceof Error ? error.message : "Cannot advance the resolution in current state";
        return Response.json({ error: message }, { status: 409 });
      }
      throw error;
    }
  }

  // RAU-39 casualty commands: the ACTIVE coach PROPOSES a casualty they
  // inflicted (causer + victim + cause + rolls); the NON-proposer CONFIRMS it.
  // Like concede, these are NOT turn-phase events — they skip the LM-12 side
  // gate below (the state machine enforces the active-proposer / responder
  // roles). A spectator/admin without a side is rejected with 409.
  if (command.type === "proposeCasualty") {
    if (side === null) {
      return Response.json({ error: "No side to propose a casualty" }, { status: 409 });
    }
    // LM-12 actor-side invariant: the causer MUST resolve to a roster player on
    // the PROPOSER's side and the victim on the OPPOSITE side (the propose path
    // reuses the shared invariant helper with `actorSide` = the VICTIM's side).
    const rosters = await loadRosterSideMap(ctx);
    const victimSide = side === "home" ? "away" : "home";
    const causerOk =
      checkActorInvariant({
        kind: "casualty",
        actorSide: victimSide,
        opponentId: command.causerRosterId,
        cause: command.cause,
        rosters,
      }) === "allow";
    const victimOk = playerSide(rosters, command.victimRosterId) === victimSide;
    if (!causerOk || !victimOk) {
      return Response.json({ error: "Invalid actor side" }, { status: 409 });
    }
    try {
      const result = await proposeCasualtyLiveMatch(
        {
          liveMatchId: row.id,
          fixtureId,
          side,
          victimRosterId: command.victimRosterId,
          causerRosterId: command.causerRosterId,
          cause: command.cause,
          roll16: command.roll16,
          roll6: command.roll6,
          now,
        },
        deps,
      );
      return Response.json({ view: { ...result.view, viewerSide: side } }, { status: 200 });
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        return Response.json({ error: "Cannot propose a casualty in current state" }, { status: 409 });
      }
      throw error;
    }
  }

  if (command.type === "confirmCasualty") {
    if (side === null) {
      return Response.json({ error: "No side to confirm a casualty" }, { status: 409 });
    }
    try {
      const result = await confirmCasualtyLiveMatch(
        { liveMatchId: row.id, fixtureId, side, now },
        deps,
      );
      return Response.json({ view: { ...result.view, viewerSide: side } }, { status: 200 });
    } catch (error) {
      if ((error as { status?: number }).status === 409) {
        return Response.json({ error: "Cannot confirm a casualty in current state" }, { status: 409 });
      }
      throw error;
    }
  }

  // Side-aware event gate (LM-12/D14): only run the pure side matrix for the
  // event commands (endTurn/pass, TD, completion, casualty, foul); a deny maps
  // to 409 (the only callers reaching here are fixture coaches or the no-team
  // admin — a spectator member was already 403'd by the coach/admin gate above,
  // and a foreign user 404'd by `loadFixtureGate`).
  if (
    command.type === "endTurn" ||
    command.type === "td" ||
    command.type === "completion" ||
    command.type === "casualty" ||
    command.type === "foul"
  ) {
    const kind: EventKind =
      command.type === "endTurn"
        ? "passTurn"
        : command.type === "td"
          ? "td"
          : command.type === "completion"
            ? "completion"
            : command.type === "casualty"
              ? "casualty"
              : "foul";
    const victimSide = command.type === "casualty" ? command.side : undefined;
    if (
      resolveEventPermission({
        callerSide: side,
        activeSide: current.activeSide,
        kind,
        victimSide,
      }) === "deny"
    ) {
      return Response.json({ error: "Not your turn" }, { status: 409 });
    }

    if (command.type === "casualty") {
      // RAU-39: the direct casualty command is SELF-INFLICTED ONLY (dodge/crowd
      // on the caller's OWN player, no confirmation). A caused casualty (any
      // other cause) MUST go through proposeCasualty → confirmCasualty; a
      // dodge/crowd casualty on the OPPONENT is impossible (self-inflicted);
      // a causer is strictly denied (LM-12).
      const raw = command as unknown as Record<string, unknown>;
      if (command.side !== side) {
        return Response.json({ error: "Self-inflicted casualties only on your own player" }, { status: 409 });
      }
      if (command.cause !== "dodge" && command.cause !== "crowd") {
        return Response.json({ error: "Caused casualties go through proposeCasualty" }, { status: 409 });
      }
      if (raw.causerRosterId != null) {
        return Response.json({ error: "Invalid actor side" }, { status: 409 });
      }
    }

    // LM-12 actor-side invariants (D1): a foul's victim MUST resolve to a
    // roster player on the side OPPOSITE the aggressor. The pure check needs the
    // materialized rosters, so we load them here (after the side gate, only for
    // foul/casualty). A deny → 409 with no mutation.
    if (command.type === "foul" || command.type === "casualty") {
      const rosters = await loadRosterSideMap(ctx);
      const actorSide = command.side; // foul = aggressor side; casualty = victim side
      const opponentId = command.type === "foul" ? command.victimRosterId : undefined;
      if (
        checkActorInvariant({
          kind: command.type,
          actorSide,
          opponentId,
          cause: command.type === "casualty" ? command.cause : undefined,
          rosters,
        }) === "deny"
      ) {
        return Response.json({ error: "Invalid actor side" }, { status: 409 });
      }
    }
  }

  let next: LiveMatchState | null = null;
  if (command.type === "endTurn") {
    try {
      next = applyEndTurn(current, { side: command.side }, now);
    } catch {
      return Response.json({ error: "Invalid transition" }, { status: 409 });
    }
  } else if (command.type === "td") {
    try {
      next = applyTD(current, { side: command.side, playerRosterId: command.playerRosterId }, now);
    } catch {
      return Response.json({ error: "Invalid transition" }, { status: 409 });
    }
  } else if (command.type === "completion") {
    // LM-15: the active-coach branch is enforced by the side gate above. A
    // completion appends a ★1 event with NO turn flip.
    next = applyCompletion(current, { side: command.side, playerRosterId: command.playerRosterId }, now);
  } else if (command.type === "casualty") {
    // RAU-39: a SELF-INFLICTED (dodge/crowd) casualty on the caller's own player
    // is recorded directly, NO confirmation — the band is derived server-side
    // from the 1D16 roll (mirrors `confirmCasualty`). A roll/derivation failure
    // (e.g. a permanent band without the 1D6) maps to 409, never a 500.
    try {
      next = recordCasualty(current, command, now);
    } catch {
      return Response.json({ error: "Invalid casualty roll" }, { status: 409 });
    }
  } else if (command.type === "foul") {
    next = recordFoul(current, command, now);
  } else if (command.type === "endMatch") {
    try {
      next = applyEndMatch(current, now);
    } catch {
      return Response.json({ error: "Invalid transition" }, { status: 409 });
    }
  }

  if (!next) {
    return Response.json({ error: "Unsupported command" }, { status: 400 });
  }

  try {
    await applyTransition({ liveMatchId: row.id, fixtureId, current, next, now }, deps);
  } catch (error) {
    if ((error as { status?: number }).status === 409) {
      return Response.json({ error: "Sequence conflict" }, { status: 409 });
    }
    throw error;
  }

  return Response.json({ view: toLiveViewState(next, now, { viewerSide: side }) }, { status: 200 });
}

/** Records a SELF-INFLICTED (dodge/crowd) casualty on the caller's own player
 * (RAU-39): the band is DERIVED server-side from the 1D16 roll via the rulebook
 * table (with the 1D6 attribute roll when the band is permanent), never
 * client-chosen. The payload carries the same shape as a confirmed two-phase
 * casualty (minus the causer — the invariant gate already rejected one). */
function recordCasualty(state: LiveMatchState, cmd: Extract<ControlCommand, { type: "casualty" }>, now: number): LiveMatchState {
  const { band, permanentAttribute: permanentAttributeOutcome } = deriveCasualtyOutcome(cmd.roll16, cmd.roll6);
  return {
    ...state,
    seq: state.seq,
    events: [
      ...state.events,
      {
        seq: state.seq + 1,
        kind: "casualty",
        side: cmd.side,
        playerRosterId: cmd.victimRosterId,
        half: state.half,
        turnNumber: state.turnNumber,
        payload: {
          victimRosterId: cmd.victimRosterId,
          cause: cmd.cause,
          roll16: cmd.roll16,
          ...(cmd.roll6 != null ? { roll6: cmd.roll6 } : {}),
          band,
          ...(permanentAttributeOutcome != null ? { permanentAttribute: permanentAttributeOutcome } : {}),
        },
        at: now,
      },
    ],
  };
}

/** Records a foul event (D10: no parallel dice path; result POST stays
 * authoritative). LM-6: the payload carries the REQUIRED `victimRosterId`. */
function recordFoul(state: LiveMatchState, cmd: Extract<ControlCommand, { type: "foul" }>, now: number): LiveMatchState {
  return {
    ...state,
    events: [
      ...state.events,
      {
        seq: state.seq + 1,
        kind: "foul",
        side: cmd.side,
        playerRosterId: cmd.playerRosterId,
        half: state.half,
        turnNumber: state.turnNumber,
        payload: { victimRosterId: cmd.victimRosterId },
        at: now,
      },
    ],
  };
}
