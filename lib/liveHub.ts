/**
 * Process-wide SSE hub (LM-1/D1 fan-out, LM-5 unified-clock ticker, LM-7 grace).
 *
 * Fan-out is per-fixture: each publish is delivered to every live SSE subscriber
 * of that fixture. The hub also tracks the ACTIVE coach so it can arm a 10s grace
 * window when that coach's last connection drops (LM-7) and run the 1s
 * info-only ticker that derives + publishes the active side's accumulated time
 * (LM-5). The unified clock is always running once live (no league clock option
 * gate — the deprecated option never constrained live matches).
 *
 * The ticker is informational: it computes `deriveLiveClock` at each 1s tick from
 * the persisted-anchored snapshot (accumulators + `clockStartedAt` running segment
 * start) and publishes derived values ONLY — there is NO per-tick DB write and NO
 * auto-end at zero (`onClockExpired` removed, D4). `seq` on the tick frame is the
 * snapshot's seq (the store owns the authoritative `seq`).
 */

import { deriveLiveClock, type ClockRowFields } from "./liveMatch";

export interface HubSubscriber {
  notify(payload: unknown): void;
}

export interface SubscribeInput {
  fixtureId: string;
  subscriber: HubSubscriber;
  /** Session user id; null for non-coach spectators. */
  coachId: string | null;
  /** The coach whose team is on the active turn, if the hub knows it. */
  activeCoachId: string | null;
  /** Called once when the active coach's grace window expires without reconnect. */
  onGraceExpired?: (fixtureId: string) => void;
}

/** The persisted-anchored clock snapshot the ticker derives from (LM-5). */
export interface TickSnapshot {
  seq: number;
  status: ClockRowFields["status"];
  activeSide: "home" | "away";
  homeConsented: boolean;
  awayConsented: boolean;
  startedAt: number | null;
  homeTurnMs: number;
  awayTurnMs: number;
  homeScore: number;
  awayScore: number;
  finishedAt: number | null;
  paused: boolean;
  clockStartedAt: number | null;
}

type SubscriberEntry = HubSubscriber & {
  coachId?: string | null;
};

interface Channel {
  subs: Set<SubscriberEntry>;
  activeCoachId: string | null;
  /** Fixture-level grace handler (pause persistence), set by subscribe. */
  onGraceExpired: ((fixtureId: string) => void) | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
  tickTimer: ReturnType<typeof setInterval> | null;
  tickState: TickSnapshot | null;
}

const GRACE_MS = 10_000;
const TICK_MS = 1_000;

export interface LiveHub {
  /** Registers a subscriber and returns an idempotent dispose function. */
  subscribe(input: SubscribeInput): () => void;
  unsubscribe(fixtureId: string, subscriber: HubSubscriber): void;
  /** Fans out to a fixture's subscribers; no-op when none exist. */
  publish(fixtureId: string, payload: unknown): void;
  /**
   * Starts the 1s info-only ticker for a fixture (always runs once live — the
   * unified clock has no option gate). Each tick derives the active side's
   * accumulated time and fans it out; the ticker NEVER stops on zero (no
   * auto-end, D4 removed).
   */
  startTicking(fixtureId: string, snapshot: TickSnapshot): void;
  stopTicking(fixtureId: string): void;
}

/**
 * Process-wide hub singleton the SSE route consumes. Under `next dev`
 * (Turbopack) the module is re-evaluated per request, so a plain module-level
 * export would give the SSE subscriber and the POST publisher DIFFERENT hub
 * instances — fan-out would never reach the other coach. Attaching the instance
 * to `globalThis` makes it stable for the whole process (standard Next dev
 * workaround). `createLiveHub` stays exported so tests build isolated hubs.
 */
const g = globalThis as unknown as { __liveHub?: LiveHub };
export const liveHub: LiveHub = g.__liveHub ?? (g.__liveHub = createLiveHub());

export function createLiveHub(): LiveHub {
  const channels = new Map<string, Channel>();

  function channel(fixtureId: string): Channel {
    let ch = channels.get(fixtureId);
    if (!ch) {
      ch = {
        subs: new Set(),
        activeCoachId: null,
        onGraceExpired: null,
        graceTimer: null,
        tickTimer: null,
        tickState: null,
      };
      channels.set(fixtureId, ch);
    }
    return ch;
  }

  function activeCoachConnected(ch: Channel): boolean {
    if (!ch.activeCoachId) return false;
    let count = 0;
    for (const sub of ch.subs) {
      if (sub.coachId === ch.activeCoachId) count++;
    }
    return count > 0;
  }

  function clearGrace(ch: Channel) {
    if (ch.graceTimer) {
      clearTimeout(ch.graceTimer);
      ch.graceTimer = null;
    }
  }

  function armGrace(ch: Channel, fixtureId: string) {
    clearGrace(ch);
    ch.graceTimer = setTimeout(() => {
      ch.graceTimer = null;
      // Fire the match-level pause handler ONLY if the active coach is still
      // disconnected when the window ends.
      if (!activeCoachConnected(ch)) {
        ch.onGraceExpired?.(fixtureId);
      }
    }, GRACE_MS);
  }

  function tick(ch: Channel) {
    const state = ch.tickState;
    if (!state) return;
    if (ch.subs.size > 0) {
      // Derive the active side's accumulated time at this instant (LM-5). No
      // state mutation, no DB write — the ticker is purely informational.
      const clock = deriveLiveClock(
        {
          status: state.status,
          activeSide: state.activeSide,
          paused: state.paused,
          clockStartedAt: state.clockStartedAt,
          homeTurnMs: state.homeTurnMs,
          awayTurnMs: state.awayTurnMs,
        },
        Date.now(),
      );
      const payload = {
        kind: "tick",
        seq: state.seq,
        status: state.status,
        activeSide: state.activeSide,
        homeConsented: state.homeConsented,
        awayConsented: state.awayConsented,
        startedAt: state.startedAt,
        homeTurnMs: clock.homeTurnMs,
        awayTurnMs: clock.awayTurnMs,
        elapsed: clock.elapsed,
        paused: clock.paused,
        homeScore: state.homeScore,
        awayScore: state.awayScore,
        finishedAt: state.finishedAt,
      };
      for (const sub of ch.subs) sub.notify(payload);
    }
  }

  return {
    subscribe({ fixtureId, subscriber, coachId, activeCoachId, onGraceExpired }) {
      const ch = channel(fixtureId);
      const entry = subscriber as SubscriberEntry;
      entry.coachId = coachId;
      ch.subs.add(entry);
      ch.activeCoachId = activeCoachId ?? ch.activeCoachId;
      // The (single) fixture-level grace handler is (re)set by this subscribe.
      if (onGraceExpired) ch.onGraceExpired = onGraceExpired;

      // A (re)connect by the active coach clears a pending grace pause.
      if (ch.activeCoachId && coachId === ch.activeCoachId) clearGrace(ch);

      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        this.unsubscribe(fixtureId, subscriber);
      };
    },

    unsubscribe(fixtureId, subscriber) {
      const ch = channels.get(fixtureId);
      if (!ch) return;
      const entry = subscriber as SubscriberEntry;
      ch.subs.delete(entry);
      if (!activeCoachConnected(ch)) armGrace(ch, fixtureId);
    },

    publish(fixtureId, payload) {
      const ch = channels.get(fixtureId);
      if (!ch || ch.subs.size === 0) return;
      for (const sub of ch.subs) sub.notify(payload);
    },

    startTicking(fixtureId, snapshot) {
      const ch = channel(fixtureId);
      if (ch.tickTimer) return;
      ch.tickState = snapshot;
      ch.tickTimer = setInterval(() => tick(ch), TICK_MS);
    },

    stopTicking(fixtureId) {
      const ch = channels.get(fixtureId);
      if (!ch) return;
      if (ch.tickTimer) {
        clearInterval(ch.tickTimer);
        ch.tickTimer = null;
      }
    },
  };
}
