import { prisma } from "@/lib/prisma";
import { liveHub, type HubSubscriber, type TickSnapshot } from "@/lib/liveHub";
import { liveMatchRowToState } from "@/lib/liveStore";
import { toLiveViewState, type TeamSide } from "@/lib/liveMatch";
import {
  isShareLinkActive,
  reduceWatchFrame,
  type WatchFrameInput,
} from "@/lib/watchAccess";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;
/** How often the pending gap-queue is drained after the snapshot (live fan-out). */
const FLUSH_MS = 250;

/**
 * The SINGLE generic 404 body for an unknown token OR an expired/played share
 * link (MSL-3). Byte-identical to `GET /api/watch/[token]` so the SSE surface
 * never reveals whether a token exists — no existence leak, no expired-vs-unknown
 * distinction.
 */
const SHARE_LINK_GONE = "Este link ya no está disponible";

function gone() {
  return Response.json({ error: SHARE_LINK_GONE }, { status: 404 });
}

/** A persisted LiveEvent row as loaded for the snapshot timeline. */
interface PersistedLiveEventRow {
  seq: number;
  kind: string;
  side: TeamSide | null;
  playerRosterId: string | null;
  half: number;
  turnNumber: number;
  payload: unknown;
  createdAt: Date;
}

/** Maps persisted rows to the whitelist event input `reduceWatchFrame` filters. */
function toWatchEventInputs(rows: PersistedLiveEventRow[]) {
  return rows.map((event) => ({
    seq: event.seq,
    kind: event.kind,
    side: event.side,
    playerRosterId: event.playerRosterId,
    half: event.half,
    turnNumber: event.turnNumber,
    payload: event.payload,
    at: event.createdAt.getTime(),
  }));
}

/**
 * GET /api/watch/[token]/live
 *
 * The PUBLIC guest SSE stream (MSL-5 / LM-32). NO session is consulted — the
 * token itself is the capability. Guards, in order:
 *   - a token that resolves to no fixture → generic 404
 *   - a fixture with a recorded outcome (scores / winner / MatchResult) → the
 *     SAME generic 404 (derived expiry; expired and unknown are indistinguishable)
 *   - otherwise → an SSE stream.
 *
 * Every frame the hub publishes to this guest is passed through
 * `reduceWatchFrame` (whitelist + `viewerSide:null` + display-event filter), so
 * no private field (`mvpNominations`, `resolutionState`, `inducements`, consent
 * flags, concede state, …) can ever reach the guest. The subscription uses
 * `coachId:null` and NO `onGraceExpired`: a guest must never (re)arm the active
 * coach's pause timer (LM-7/MSL-5). Stream format mirrors the member SSE route
 * (`event: snapshot` first, then `event: event id:<seq>`, `event: heartbeat`),
 * so the guest client consumes it exactly like the member stream.
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
  const fixtureId = resolved.id;

  // 2. Rewind to the persisted live row (if any) so the snapshot carries the
  //    server-derived clocks, and load the persisted timeline for the snapshot.
  const liveRow = await prisma.liveMatch.findFirst({ where: { fixtureId } });
  const live = liveRow ? liveMatchRowToState(liveRow) : null;
  const snapshotSeq = live?.seq ?? 0;
  const persistedEvents: PersistedLiveEventRow[] = liveRow
    ? await prisma.liveEvent.findMany({ where: { liveMatchId: liveRow.id }, orderBy: { seq: "asc" } })
    : [];

  // The closure the hub calls for every publish. It buffers the REDUCED frame
  // (whitelist-picked) so the stream flushes guest-safe data only, and drops
  // duplicate/stale seqs (below or equal the snapshot cursor).
  const pending: { seq: number; data: string }[] = [];
  const seen = new Set<number>();
  const notify: HubSubscriber["notify"] = (payload) => {
    if (typeof payload !== "object" || payload === null) return;
    const p = payload as Record<string, unknown>;
    const kind = typeof p.kind === "string" ? p.kind : undefined;
    // An `ack` frame is a member-only affordance (the rival's ✓/✗) and carries
    // the ack state + an event seq that may sit below the cursor — never forward.
    if (kind === "ack") return;
    const seq = typeof p.seq === "number" ? p.seq : 0;
    // A reset frame (`live:null`) is already minimal/public — forward it so the
    // guest drops the live view (the client's `live: null` branch).
    if ("live" in p && p.live === null) {
      if (seq <= snapshotSeq || seen.has(seq)) return;
      seen.add(seq);
      pending.push({ seq, data: JSON.stringify({ seq, live: null }) });
      return;
    }
    if (seq <= snapshotSeq) return; // dup/stale — below or equal snapshot cursor
    if (seen.has(seq)) return;
    seen.add(seq);
    // MSL-5: reduce EVERY hub frame to the guest whitelist. The tick/ack `kind`
    // discriminator is preserved so the guest client can skip 1s info ticks
    // (the clock is derived locally by `useLiveClock`).
    const reduced = {
      ...reduceWatchFrame(p as unknown as WatchFrameInput),
      ...(kind ? { kind } : {}),
    };
    pending.push({ seq, data: JSON.stringify(reduced) });
  };

  const now = Date.now();

  // LM-5 unified-clock ticker: when a live match exists, start the hub's 1s
  // info-only ticker (idempotent — a member subscriber may have started it).
  const tickSnapshot: TickSnapshot | null =
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
  if (tickSnapshot) {
    liveHub.startTicking(fixtureId, tickSnapshot);
  }

  // Subscribe BEFORE the snapshot emit to close the subscribe race: publishes
  // buffered between subscribe and the snapshot are drained and deduped after.
  // `coachId:null` + no `onGraceExpired` → the guest is inert for LM-7.
  let dispose: (() => void) | null = liveHub.subscribe({
    fixtureId,
    subscriber: { notify },
    coachId: null,
    activeCoachId: null,
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
          controller.enqueue(encoder.encode(`event: event\nid: ${item.seq}\ndata: ${item.data}\n\n`));
        }
      };

      // Snapshot-first (LM-8): the reduced live view, or `live:null` when the
      // fixture has no live row. No `id` field on the snapshot frame.
      const snapshotPayload = live
        ? reduceWatchFrame({
            ...toLiveViewState(live, now),
            seq: snapshotSeq,
            events: toWatchEventInputs(persistedEvents),
          })
        : { seq: 0, live: null };

      controller.enqueue(
        encoder.encode(`event: snapshot\ndata: ${JSON.stringify(snapshotPayload)}\n\n`),
      );

      flush();

      // Live fan-out: hub publishes that arrive AFTER the snapshot are buffered
      // in `pending` and drained on a short interval so a live transition
      // reaches every connected guest WITHOUT a reload.
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
