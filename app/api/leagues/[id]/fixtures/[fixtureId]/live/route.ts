import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAuthEnabled } from "@/lib/auth-mode";
import { resolveLiveAccess } from "@/lib/liveAccess";
import { liveHub, type HubSubscriber } from "@/lib/liveHub";
import { liveMatchRowToState, startLiveMatch, applyTransition, pauseLiveMatch, resumeLiveMatch } from "@/lib/liveStore";
import {
  applyEndTurn,
  applyTD,
  applyEndMatch,
  toLiveViewState,
  type FixtureStartState,
  type LeagueClockConfig,
  type LiveMatchState,
  type LiveMatchViewState,
  type TeamSide,
} from "@/lib/liveMatch";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

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
    status: "open" | "started";
    turnClockEnabled: boolean;
    turnClockSeconds: 120 | 240 | 360;
    memberUserIds: string[];
  };
}

type Gateway =
  | { kind: "deny"; status: 401 | 403 | 404; error: string }
  | { kind: "allow"; context: FixtureContext };

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
          turnClockEnabled: true,
          turnClockSeconds: true,
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
        turnClockEnabled: league.turnClockEnabled,
        turnClockSeconds: league.turnClockSeconds as 120 | 240 | 360,
        memberUserIds: league.teams.map((t) => t.userId),
      },
    },
  };
}

/** Converts the loaded fixture context to the state machine's start guard input. */
function fixtureStartState(ctx: FixtureContext): FixtureStartState {
  const played = ctx.homeScore != null || ctx.awayScore != null || ctx.result != null;
  return { scheduled: ctx.scheduledAt != null, played, result: ctx.result != null };
}

function clockConfig(ctx: FixtureContext): LeagueClockConfig {
  return {
    turnClockEnabled: ctx.league.turnClockEnabled,
    turnClockSeconds: ctx.league.turnClockSeconds,
  };
}

/**
 * GET /api/leagues/[id]/fixtures/[fixtureId]/live
 *
 * SSE subscribe stream (LM-1, D1): same-origin JWT cookie, no separate token.
 * Stream lifecycle (D7 snapshot-first, LM-8):
 *   1. `event: snapshot` (no id) first — current live state, or nil.
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
  const live = liveRow ? liveMatchRowToState(liveRow, clockConfig(ctx)) : null;
  const snapshotSeq = live?.seq ?? 0;

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
  const channel = {
    turnClockEnabled: ctx.league.turnClockEnabled,
    turnClockSeconds: ctx.league.turnClockSeconds,
  };
  const now = Date.now();

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
          { liveMatchId: rowForResume.id, fixtureId, current: live, league: clockConfig(ctx), now },
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
    const current = liveMatchRowToState(row, clockConfig(ctx));
    if (current.status !== "live") return;
    try {
      await pauseLiveMatch(
        { liveMatchId: row.id, fixtureId, current, league: clockConfig(ctx), now: Date.now() },
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
    channel,
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
            ...toLiveViewState(live, Date.now()),
            seq: snapshotSeq,
            events: [],
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

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode("event: heartbeat\ndata: {}\n\n"));
      }, HEARTBEAT_MS);

      onCancel = () => {
        if (closed) return;
        closed = true;
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

/** Control command payloads (LM-4/D10/D11). */
type ControlCommand =
  | { type: "start" }
  | { type: "endTurn"; side: TeamSide }
  | { type: "td"; side: TeamSide; playerRosterId: string }
  | { type: "casualty"; side: TeamSide; victimRosterId: string; band?: unknown }
  | { type: "foul"; side: TeamSide; playerRosterId: string; victimRosterId?: unknown }
  | { type: "endMatch" };

function isControlCommand(value: unknown): value is ControlCommand {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  if (typeof c.type !== "string") return false;
  switch (c.type) {
    case "start":
      return true;
    case "endTurn":
      return c.side === "home" || c.side === "away";
    case "td":
      return (c.side === "home" || c.side === "away") && typeof c.playerRosterId === "string";
    case "casualty":
      return (c.side === "home" || c.side === "away") && typeof c.victimRosterId === "string";
    case "foul":
      return (c.side === "home" || c.side === "away") && typeof c.playerRosterId === "string";
    case "endMatch":
      return true;
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
 * (foreign), 409 (invalid transition / seq conflict / start on played / already
 * started).
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

  const league = clockConfig(ctx);
  const now = Date.now();
  const deps = { prisma, hub: liveHub };

  // START inserts the live match (LM-3 start guard; 409 on invalid/duplicate).
  if (command.type === "start") {
    try {
      await startLiveMatch({ fixtureId, fixture: fixtureStartState(ctx), league, now }, deps);
    } catch {
      return Response.json({ error: "Cannot start match" }, { status: 409 });
    }
    return Response.json({ view: await currentView(fixtureId, league, now) }, { status: 200 });
  }

  // Advance / record / end require an existing live match row.
  const row = await prisma.liveMatch.findFirst({ where: { fixtureId } });
  if (!row) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const current = liveMatchRowToState(row, league);

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
  } else if (command.type === "casualty") {
    // Coach-reported injury band is immutable once recorded (D10). The band is
    // carried through; the result POST later re-rolls authoritatively.
    next = recordCasualty(current, command, now);
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
    await applyTransition({ liveMatchId: row.id, fixtureId, current, next, league, now }, deps);
  } catch (error) {
    if ((error as { status?: number }).status === 409) {
      return Response.json({ error: "Sequence conflict" }, { status: 409 });
    }
    throw error;
  }

  return Response.json({ view: toLiveViewState(next, now) }, { status: 200 });
}

/** Reads the persisted live row back and maps it to the view state (used after a start). */
async function currentView(
  fixtureId: string,
  league: LeagueClockConfig,
  now: number,
): Promise<LiveMatchViewState> {
  const row = await prisma.liveMatch.findFirst({ where: { fixtureId } });
  if (!row) return { seq: 0, status: "pending", half: 1, turnNumber: 1, activeSide: "home", turnClockEnabled: league.turnClockEnabled, homeClock: null, awayClock: null, homeScore: 0, awayScore: 0, paused: null, finishedAt: null };
  return toLiveViewState(liveMatchRowToState(row, league), now);
}

/** Records a coach-reported casualty with its (immutable) injury band (D10). */
function recordCasualty(state: LiveMatchState, cmd: Extract<ControlCommand, { type: "casualty" }>, now: number): LiveMatchState {
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
        payload: { band: cmd.band ?? null },
        at: now,
      },
    ],
  };
}

/** Records a foul event (D10: no parallel dice path; result POST stays authoritative). */
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
        payload: {},
        at: now,
      },
    ],
  };
}
