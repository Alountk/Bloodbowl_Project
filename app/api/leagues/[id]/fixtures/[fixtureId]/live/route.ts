import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAuthEnabled } from "@/lib/auth-mode";
import { resolveLiveAccess } from "@/lib/liveAccess";
import { liveHub, type HubSubscriber } from "@/lib/liveHub";

export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

/**
 * A live-state snapshot dropped on the stream. `seq` is the monotonic DB
 * sequence; this slice reads it defensively from the fixture's optional `live`
 * snapshot (populated by the control/store work in later slices) and falls back
 * to 0 when no live match has started.
 */
interface OptionalLiveSnapshot {
  seq?: number;
  [key: string]: unknown;
}

function seqOf(payload: unknown): number {
  return typeof payload === "object" && payload !== null && typeof (payload as { seq?: unknown }).seq === "number"
    ? (payload as { seq: number }).seq
    : 0;
}

/**
 * GET /api/leagues/[id]/fixtures/[fixtureId]/live
 *
 * SSE subscribe stream (LM-1, D1): same-origin JWT cookie, no separate token.
 * Gate mirrors the fixture-GET matrix via `liveAccess` (LM-2): 401 without a
 * session in both auth modes (AUTH_MODE=local realtime 401s by design), 404 for
 * a foreign/unknown league or a STARTED-league fixture the user isn't part of,
 * 200 owner/any-member.
 *
 * Stream lifecycle (D7 snapshot-first, LM-8):
 *   1. `event: snapshot` (no id) first — current live state, or nil when no
 *      live match has started yet (publishes still arrive later).
 *   2. `event: event id:<seq>` for every gap event with seq > snapshot.seq,
 *      deduped by seq so reconnects never see stale replays.
 *   3. `event: heartbeat` every 15s (never advances the Last-Event-ID cursor).
 *   4. Later hub publishes stream as `event: event` / `event: state`.
 * Cancelling/aborting the stream tears down the hub subscription so no
 * subscriber leaks. The subscribe happens BEFORE the DB snapshot read to close
 * the subscribe race: publishes buffered between subscribe and the snapshot
 * emit are drained, deduped, and sent after the snapshot (D7).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; fixtureId: string }> },
) {
  const { id, fixtureId } = await params;
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const fixture = await prisma.fixture.findFirst({
    where: { id: fixtureId, leagueId: id },
    include: {
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
    action: "read",
  });
  if (gate !== "allow") {
    return Response.json({ error: gate === 401 ? "Unauthorized" : "Not found" }, { status: gate });
  }
  if (!league) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const live = (fixture as { live?: OptionalLiveSnapshot }).live ?? null;
  const snapshotSeq = live?.seq ?? 0;

  // The closure the hub calls for every publish. It queues gap events (> the
  // snapshot seq) for the stream to flush AFTER the snapshot frame, and drops
  // duplicate/stale seqs. Buffered events that arrive between `subscribe` and
  // this wiring are what the subscribe-race drain replays.
  const pending: { seq: number; payload: unknown }[] = [];
  const seen = new Set<number>();
  const notify: HubSubscriber["notify"] = (payload) => {
    const seq = seqOf(payload);
    if (seq <= snapshotSeq) return; // dup/stale — below or equal snapshot cursor
    if (seen.has(seq)) return; // already delivered
    seen.add(seq);
    pending.push({ seq, payload });
  };

  const subscriber: HubSubscriber = { notify };
  const channel = {
    turnClockEnabled: league.turnClockEnabled,
    turnClockSeconds: league.turnClockSeconds,
  };

  // Subscribe BEFORE the DB snapshot read/write to close the subscribe race.
  let dispose: (() => void) | null = liveHub.subscribe({
    fixtureId,
    subscriber,
    coachId: userId,
    activeCoachId: null,
    channel,
  });

  // Wired inside the stream's `start`; the stream's `cancel()` invokes it.
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

      // Snapshot-first (LM-8): no `id` field on the snapshot frame.
      controller.enqueue(
        encoder.encode(
          `event: snapshot\ndata: ${JSON.stringify({
            seq: snapshotSeq,
            live,
            fixture: {
              id: fixture!.id,
              leagueId: fixture!.leagueId,
              round: fixture!.round,
              homeTeamId: fixture!.homeTeamId,
              awayTeamId: fixture!.awayTeamId,
            },
          })}\n\n`,
        ),
      );

      // Drain the gap captured since subscribe (before the snapshot was ready).
      flush();

      // Heartbeat keepalive (15s) — never advances the Last-Event-ID cursor.
      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode("event: heartbeat\ndata: {}\n\n"));
      }, HEARTBEAT_MS);

      // Reader cancellation (abort/close) tears the hub subscription down.
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
