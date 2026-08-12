/**
 * In-memory SSE fan-out hub (LM-6, D2).
 *
 * A narrow, coalesced interface the SSE route and the store use, swappable for
 * a multi-instance pub/sub adapter later. The DB stays the source of truth; the
 * hub is a fast fan-out for live connections plus the per-match clock ticker
 * and the active-coach disconnect grace (LM-7).
 *
 * Slice-2 scope notes:
 * - `publish(fixtureId, payload)` fans out to that fixture's subscribers and is
 *   a no-op when none exist.
 * - The 1s ticker runs ONLY when the league's turn-clock option is enabled
 *   (LM-5: clockless leagues never tick). It advances the active coach's
 *   remaining clock and emits a `tick` with the server-derived clock values;
 *   the DB `seq` of the tick is attached by the store when it persists (PR 3),
 *   never fabricated here (LM-6 seq stays DB-authoritative).
 * - The 10s grace pause is keyed to the ACTIVE coach's SSE connection and is
 *   armed only when clocks are enabled (LM-7). When the active coach's last
 *   connection drops, a 10s timer fires `onGraceExpired` unless a reconnect
 *   cancels it first. PR 3 wires `onGraceExpired` to persist `paused=true`.
 */

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
  /** Clock config straight from the League row (LM-5). */
  channel: {
    turnClockEnabled: boolean;
    turnClockSeconds: number;
  };
  /** Called once when the active coach's grace window expires without reconnect. */
  onGraceExpired?: (fixtureId: string) => void;
}

/** The clock snapshot the ticker advances; the store owns the authoritative `seq`. */
export interface TickSnapshot {
  seq: number;
  activeSide: "home" | "away";
  homeClock: number;
  awayClock: number;
  paused?: boolean;
}

type SubscriberEntry = HubSubscriber & {
  coachId?: string | null;
};

interface Channel {
  subs: Set<SubscriberEntry>;
  activeCoachId: string | null;
  config: { turnClockEnabled: boolean; turnClockSeconds: number };
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
  /** Starts the 1s clock ticker for a fixture (no-op when clocks are disabled). */
  startTicking(fixtureId: string, snapshot: TickSnapshot): void;
  stopTicking(fixtureId: string): void;
}

/** Process-wide hub singleton the SSE route consumes (swappable for multi-instance later). */
export const liveHub: LiveHub = createLiveHub();

export function createLiveHub(): LiveHub {
  const channels = new Map<string, Channel>();

  function channel(fixtureId: string): Channel {
    let ch = channels.get(fixtureId);
      if (!ch) {
      ch = {
        subs: new Set(),
        activeCoachId: null,
        config: { turnClockEnabled: true, turnClockSeconds: 240 },
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
    // LM-7: no grace pause on clockless leagues.
    if (!ch.config.turnClockEnabled) return;
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
    if (!state || state.paused) return;
    if (state.activeSide === "home") state.homeClock = Math.max(state.homeClock - 1, 0);
    else state.awayClock = Math.max(state.awayClock - 1, 0);
    if (ch.subs.size > 0) {
      const payload = {
        kind: "tick",
        seq: state.seq,
        activeSide: state.activeSide,
        homeClock: state.homeClock,
        awayClock: state.awayClock,
      };
      for (const sub of ch.subs) sub.notify(payload);
    }
  }

  return {
    subscribe({ fixtureId, subscriber, coachId, activeCoachId, channel: config, onGraceExpired }) {
      const ch = channel(fixtureId);
      const entry = subscriber as SubscriberEntry;
      entry.coachId = coachId;
      ch.subs.add(entry);
      ch.activeCoachId = activeCoachId ?? ch.activeCoachId;
      ch.config = config;
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
      if (!ch.config.turnClockEnabled) return;
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
