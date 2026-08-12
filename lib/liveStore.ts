/**
 * Live-match persistence + fan-out store (LM-6, D4/D6).
 *
 * The control POST uses these functions to run the pure transition (from
 * `lib/liveMatch.ts`) and persist it atomically under an optimistic `seq`
 * guard, then publish to the hub AFTER commit:
 *
 * - `startLiveMatch` inserts the initial LiveMatch row + first `start` event and
 *   publishes the initial view state (LM-3 start guard lives here: rejects a
 *   played/result fixture or an already-existing live match).
 * - `applyTransition` bumps an existing LiveMatch row via `updateMany({ where: {
 *   id, seq: prev } })`; a 0-row result ⇒ double action / seq conflict → 409. The
 *   delta LiveEvent(s) are created in the same transaction so the guard and the
 *   append are atomic. Publish happens only after the transaction commits.
 *
 * `league` is the clock config from the League row (LM-5); the DB stays the
 * source of truth and `seq` remains monotonically increasing (LM-6).
 */

import type { LiveMatch, LiveEvent, Prisma } from "@prisma/client";
import {
  startMatch,
  toLiveViewState,
  type FixtureStartState,
  type LeagueClockConfig,
  type LiveMatchState,
  type TeamSide,
} from "./liveMatch";

/** Minimal Prisma transaction surface the store uses (injectable for tests). */
export interface StoreTx {
  liveMatch: {
    updateMany(args: Prisma.LiveMatchUpdateManyArgs): Promise<{ count: number }>;
    create?(args: Prisma.LiveMatchCreateArgs): Promise<LiveMatch>;
  };
  liveEvent: {
    create(args: Prisma.LiveEventCreateArgs): Promise<LiveEvent>;
  };
}

/** Minimal Prisma + hub surfaces the store needs (injectable for tests). */
export interface StoreDeps {
  prisma: {
    $transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T>;
    liveMatch: Pick<StoreTx["liveMatch"], "create">;
  };
  hub: {
    publish(fixtureId: string, payload: unknown): void;
  };
}

/** Converts a persisted LiveMatch row (ISO statuses/timestamps) into a pure state. */
export function liveMatchRowToState(
  row: Partial<LiveMatch> & {
    id: string;
    fixtureId: string;
    status: LiveMatch["status"];
    half: number;
    turnNumber: number;
    activeSide: TeamSide;
    homeClock: number;
    awayClock: number;
    homeScore: number;
    awayScore: number;
    seq: number;
    paused: boolean;
    clockStartedAt: Date | string | null;
    finishedAt: Date | string | null;
  },
  league: LeagueClockConfig,
): LiveMatchState {
  return {
    seq: row.seq,
    status: row.status,
    half: row.half,
    turnNumber: row.turnNumber,
    activeSide: row.activeSide,
    homeClock: row.homeClock,
    awayClock: row.awayClock,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    paused: row.paused,
    clockStartedAt: row.clockStartedAt ? new Date(row.clockStartedAt).getTime() : null,
    finishedAt: row.finishedAt ? new Date(row.finishedAt).getTime() : null,
    league,
    events: [],
  };
}

function rowData(next: LiveMatchState): Prisma.LiveMatchUpdateManyMutationInput {
  return {
    status: next.status,
    half: next.half,
    turnNumber: next.turnNumber,
    activeSide: next.activeSide,
    homeClock: next.homeClock,
    awayClock: next.awayClock,
    homeScore: next.homeScore,
    awayScore: next.awayScore,
    paused: next.paused,
    clockStartedAt: next.clockStartedAt != null ? new Date(next.clockStartedAt) : null,
    finishedAt: next.finishedAt != null ? new Date(next.finishedAt) : null,
  };
}

export interface ApplyTransitionInput {
  liveMatchId: string;
  fixtureId: string;
  current: LiveMatchState;
  next: LiveMatchState;
  league: LeagueClockConfig;
  now: number;
}

/** Shared optimistic-guard persistence: bump seq, write fields, append delta events. */
async function persistAndPublish(
  input: { liveMatchId: string; fixtureId: string; currentSeq: number; next: LiveMatchState; now: number },
  deps: StoreDeps,
): Promise<number> {
  const nextSeq = input.currentSeq + 1;
  const eventsToPersist = input.next.events.filter((e) => e.seq > input.currentSeq);

  await deps.prisma.$transaction(async (tx) => {
    const updated = await tx.liveMatch.updateMany({
      where: { id: input.liveMatchId, seq: input.currentSeq },
      data: { ...rowData(input.next), seq: nextSeq },
    });
    if (updated.count === 0) {
      throw Object.assign(new Error("seq conflict"), { status: 409 });
    }
    for (const event of eventsToPersist) {
      await tx.liveEvent.create({
        data: {
          liveMatchId: input.liveMatchId,
          seq: event.seq,
          kind: event.kind,
          side: event.side,
          playerRosterId: event.playerRosterId,
          half: event.half,
          turnNumber: event.turnNumber,
          payload: event.payload as never,
        },
      });
    }
  });

  const bounded = { ...input.next, seq: nextSeq };
  deps.hub.publish(input.fixtureId, toLiveViewState(bounded, input.now));
  return nextSeq;
}

/**
 * Persists one transition: optimistic `updateMany` on the previous `seq` (a
 * 0-row result → seq conflict / double action), appends the delta event rows in
 * the SAME transaction, then publishes the new view state after commit. Throws
 * with `status: 409` when the guard reports 0 rows.
 */
export async function applyTransition(
  input: ApplyTransitionInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const nextSeq = await persistAndPublish(
    {
      liveMatchId: input.liveMatchId,
      fixtureId: input.fixtureId,
      currentSeq: input.current.seq,
      next: input.next,
      now: input.now,
    },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...input.next, seq: nextSeq }, input.now) };
}

export interface PauseResumeInput {
  liveMatchId: string;
  fixtureId: string;
  current: LiveMatchState;
  league: LeagueClockConfig;
  now: number;
}

/**
 * Hub-driven internal pause (LM-7/D6): sets `paused=true` and `clockStartedAt=null`
 * (the active clock stops consuming time) under the optimistic seq guard, then
 * publishes. Repeating a pause when already paused is a no-op acceptance (no
 * seq bump, no mutation).
 */
export async function pauseLiveMatch(input: PauseResumeInput, deps: StoreDeps): Promise<void> {
  if (input.current.paused) return;
  const paused: LiveMatchState = {
    ...input.current,
    paused: true,
    clockStartedAt: null,
    events: [],
  };
  await persistAndPublish(
    {
      liveMatchId: input.liveMatchId,
      fixtureId: input.fixtureId,
      currentSeq: input.current.seq,
      next: paused,
      now: input.now,
    },
    deps,
  );
}

/**
 * Hub-driven resume (LM-7): clears the pause and restarts the active clock at
 * `now` (`paused=false`, `clockStartedAt=now`) so the remaining time recomputes
 * from the persisted reset timestamp.
 */
export async function resumeLiveMatch(input: PauseResumeInput, deps: StoreDeps): Promise<void> {
  if (!input.current.paused) return;
  const resumed: LiveMatchState = {
    ...input.current,
    paused: false,
    clockStartedAt: input.now,
    events: [],
  };
  await persistAndPublish(
    {
      liveMatchId: input.liveMatchId,
      fixtureId: input.fixtureId,
      currentSeq: input.current.seq,
      next: resumed,
      now: input.now,
    },
    deps,
  );
}

export interface StartLiveMatchInput {
  fixtureId: string;
  fixture: FixtureStartState;
  league: LeagueClockConfig;
  now: number;
}

/**
 * Starts a live match from a scheduled fixture (LM-3). Rejects a played/result
 * fixture; the unique `fixtureId` guard turns a double-start into 409 (P2002).
 * Creates the LiveMatch row + `start` event atomically and publishes the initial
 * view state (start guard enforced via `startMatch`'s canStart).
 */
export async function startLiveMatch(
  input: StartLiveMatchInput,
  deps: StoreDeps,
): Promise<{ liveMatchId: string; view: ReturnType<typeof toLiveViewState> }> {
  const pending: LiveMatchState = {
    seq: 0,
    status: "pending",
    half: 1,
    turnNumber: 1,
    activeSide: "home",
    homeClock: 0,
    awayClock: 0,
    homeScore: 0,
    awayScore: 0,
    paused: false,
    clockStartedAt: null,
    finishedAt: null,
    league: input.league,
    events: [],
  };

  let started: LiveMatchState;
  try {
    started = startMatch(pending, input.fixture, input.now);
  } catch {
    throw Object.assign(new Error("match cannot start"), { status: 409 });
  }

  const startEvents = started.events.filter((e) => e.seq > 0);

  let liveMatchId = "";
  try {
    liveMatchId = await deps.prisma.$transaction(async (tx) => {
      const created = await tx.liveMatch.create!({
        data: {
          fixtureId: input.fixtureId,
          status: started.status,
          half: started.half,
          turnNumber: started.turnNumber,
          activeSide: started.activeSide,
          homeClock: started.homeClock,
          awayClock: started.awayClock,
          homeScore: started.homeScore,
          awayScore: started.awayScore,
          seq: started.events.length > 0 ? 1 : 0,
          paused: false,
          clockStartedAt: started.clockStartedAt != null ? new Date(started.clockStartedAt) : null,
        },
      });
      for (const event of startEvents) {
        await tx.liveEvent.create({
          data: {
            liveMatchId: created.id,
            seq: event.seq,
            kind: event.kind,
            side: event.side,
            playerRosterId: event.playerRosterId,
            half: event.half,
            turnNumber: event.turnNumber,
            payload: event.payload as never,
          },
        });
      }
      return created.id;
    });
  } catch (error) {
    // P2002 on unique fixtureId → a live match is already started.
    if ((error as { code?: string }).code === "P2002") {
      throw Object.assign(new Error("already started"), { status: 409 });
    }
    throw error;
  }

  const view = toLiveViewState(started, input.now);
  deps.hub.publish(input.fixtureId, view);
  return { liveMatchId, view };
}
