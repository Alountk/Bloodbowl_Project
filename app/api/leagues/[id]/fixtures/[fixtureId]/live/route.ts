import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAuthEnabled } from "@/lib/auth-mode";
import { resolveLiveAccess } from "@/lib/liveAccess";
import { liveHub, type HubSubscriber, type TickSnapshot } from "@/lib/liveHub";
import {
  liveMatchRowToState,
  consentLiveMatch,
  retractLiveConsent,
  beginLiveMatch,
  applyTransition,
  pauseLiveMatch,
  resumeLiveMatch,
} from "@/lib/liveStore";
import {
  applyEndTurn,
  applyTD,
  applyCompletion,
  applyEndMatch,
  applyRequestTurn,
  REQUEST_TURN_COOLDOWN_MS,
  toLiveViewState,
  type FixtureStartState,
  type LiveMatchState,
  type TeamSide,
} from "@/lib/liveMatch";
import { resolveEventPermission, type EventKind } from "@/lib/livePhase";

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
    status: "open" | "started";
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

/** Maps persisted LiveEvent rows to the DTO shape (LM-6/`serializeLive` parity). */
function toEventDtos(rows: PersistedLiveEventRow[]): LiveEventDto[] {
  return rows.map((e) => ({
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

/** Converts the loaded fixture context to the state machine's start guard input. */
function fixtureStartState(ctx: FixtureContext): FixtureStartState {
  const played = ctx.homeScore != null || ctx.awayScore != null || ctx.result != null;
  return { scheduled: ctx.scheduledAt != null, played, result: ctx.result != null };
}

/** Per-viewer side (D19): the session user's team in this fixture, if any. */
function viewerSide(ctx: FixtureContext, userId: string | null): "home" | "away" | null {
  if (userId === null) return null;
  if (userId === ctx.homeOwnerId) return "home";
  if (userId === ctx.awayOwnerId) return "away";
  return null;
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
  | { type: "casualty"; side: TeamSide; victimRosterId: string; band?: unknown }
  | { type: "foul"; side: TeamSide; playerRosterId: string; victimRosterId?: unknown }
  | { type: "requestTurn" }
  | { type: "endMatch" };

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
      const result = await beginLiveMatch({ liveMatchId: row.id, fixtureId, now }, deps);
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
    await applyTransition({ liveMatchId: row.id, fixtureId, current, next, now }, deps);
  } catch (error) {
    if ((error as { status?: number }).status === 409) {
      return Response.json({ error: "Sequence conflict" }, { status: 409 });
    }
    throw error;
  }

  return Response.json({ view: toLiveViewState(next, now, { viewerSide: side }) }, { status: 200 });
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
