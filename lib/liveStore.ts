/**
 * Live-match persistence + fan-out store (LM-6, D16/D18).
 *
 * The control POST uses these functions to run the pure transition (from
 * `lib/liveMatch.ts`) and persist it atomically under an optimistic `seq`
 * guard, then publish to the hub AFTER commit:
 *
 * - `consentLiveMatch` creates the LiveMatch row on FIRST consent (D16) or
 *   applies a subsequent consent as a transition; when both booleans are true
 *   the persisted status becomes `ready` (LM-11).
 * - `retractLiveConsent` clears a side's boolean and returns the row to
 *   `pending`.
 * - `beginLiveMatch` runs `ready → live` ONLY via the first turn (LM-3).
 * - `applyTransition` bumps an existing LiveMatch row via `updateMany({ where: {
 *   id, seq: prev } })`; a 0-row result ⇒ double action / seq conflict → 409. The
 *   delta LiveEvent(s) are created in the same transaction so the guard and the
 *   append are atomic. Publish happens only after the transaction commits.
 *
 * The unified clock (LM-5) makes the DB the source of truth: the active side's
 * accumulator is bumped at boundaries (`applyTransition` callers already folded
 * in-flight via `accumulate`; `pauseLiveMatch` bumps it on grace expiry per LM-7/
 * D18) and `clockStartedAt` is the running segment start (null while paused or
 * pre-live). `seq` remains monotonically increasing (LM-6).
 */

import type { LiveMatch, LiveEvent, Prisma } from "@prisma/client";
import {
  beginMatch,
  consentStart,
  retractConsent,
  toLiveViewState,
  isStartableFixture,
  type FixtureStartState,
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
    liveMatch: {
      create(args: Prisma.LiveMatchCreateArgs): Promise<LiveMatch>;
      findFirst(args: Prisma.LiveMatchFindFirstArgs): Promise<LiveMatch | null>;
    };
  };
  hub: {
    publish(fixtureId: string, payload: unknown): void;
  };
}

/** The persisted row fields the store maps to/from a pure state. */
interface LiveMatchRowFields {
  id: string;
  fixtureId: string;
  status: LiveMatch["status"];
  half: number;
  turnNumber: number;
  activeSide: TeamSide;
  homeConsented: boolean;
  awayConsented: boolean;
  startedAt: Date | string | null;
  homeTurnMs: number;
  awayTurnMs: number;
  homeScore: number;
  awayScore: number;
  seq: number;
  paused: boolean;
  clockStartedAt: Date | string | null;
  finishedAt: Date | string | null;
}

/** Converts a persisted LiveMatch row (ISO statuses/timestamps) into a pure state. */
export function liveMatchRowToState(
  row: Partial<LiveMatch> & LiveMatchRowFields,
): LiveMatchState {
  return {
    seq: row.seq,
    status: row.status,
    half: row.half,
    turnNumber: row.turnNumber,
    activeSide: row.activeSide,
    homeConsented: row.homeConsented,
    awayConsented: row.awayConsented,
    startedAt: row.startedAt ? new Date(row.startedAt).getTime() : null,
    homeTurnMs: row.homeTurnMs,
    awayTurnMs: row.awayTurnMs,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    paused: row.paused,
    clockStartedAt: row.clockStartedAt ? new Date(row.clockStartedAt).getTime() : null,
    finishedAt: row.finishedAt ? new Date(row.finishedAt).getTime() : null,
    events: [],
  };
}

function rowData(next: LiveMatchState): Prisma.LiveMatchUpdateManyMutationInput {
  return {
    status: next.status,
    half: next.half,
    turnNumber: next.turnNumber,
    activeSide: next.activeSide,
    homeConsented: next.homeConsented,
    awayConsented: next.awayConsented,
    startedAt: next.startedAt != null ? new Date(next.startedAt) : null,
    homeTurnMs: next.homeTurnMs,
    awayTurnMs: next.awayTurnMs,
    homeScore: next.homeScore,
    awayScore: next.awayScore,
    paused: next.paused,
    clockStartedAt: next.clockStartedAt != null ? new Date(next.clockStartedAt) : null,
    finishedAt: next.finishedAt != null ? new Date(next.finishedAt) : null,
  };
}

/** Shared optimistic-guard persistence: bump seq, write fields, append delta events. */
async function persistAndPublish(
  input: { liveMatchId: string; fixtureId: string; currentSeq: number; next: LiveMatchState; now: number },
  deps: StoreDeps,
): Promise<number> {
  const eventsToPersist = input.next.events.filter((e) => e.seq > input.currentSeq);
  // Advance the row seq past BOTH the previous value and every newly-appended
  // delta event. Most transitions emit exactly one event (seq = currentSeq+1),
  // but `beginMatch` emits TWO (`start` + `turnStart`), so the row must advance
  // to the highest event seq — otherwise the next transition's event collides
  // on `@@unique([liveMatchId, seq])` (P2002).
  const highestEventSeq = eventsToPersist.reduce((max, e) => Math.max(max, e.seq), input.currentSeq);
  const nextSeq = Math.max(input.currentSeq + 1, highestEventSeq);

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

export interface ApplyTransitionInput {
  liveMatchId: string;
  fixtureId: string;
  current: LiveMatchState;
  next: LiveMatchState;
  now: number;
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

/**
 * Creates an initial pending LiveMatch row whose ONE consented boolean is set
 * (D16: the row exists only once a coach consents). Used by `consentLiveMatch`
 * when no row exists yet. Publishes the pending view.
 */
async function createFirstConsent(
  input: { fixtureId: string; side: TeamSide; now: number },
  deps: StoreDeps,
): Promise<{ liveMatchId: string; view: ReturnType<typeof toLiveViewState> }> {
  const homeConsented = input.side === "home";
  const awayConsented = input.side === "away";
  const state: LiveMatchState = {
    seq: 0,
    status: "pending",
    half: 1,
    turnNumber: 1,
    activeSide: "home",
    homeConsented,
    awayConsented,
    startedAt: null,
    homeTurnMs: 0,
    awayTurnMs: 0,
    homeScore: 0,
    awayScore: 0,
    paused: false,
    clockStartedAt: null,
    finishedAt: null,
    events: [],
  };

  const liveMatchId = await deps.prisma.$transaction(async (tx) => {
    const created = await tx.liveMatch.create!({
      data: {
        fixtureId: input.fixtureId,
        status: "pending" as const,
        half: 1,
        turnNumber: 1,
        activeSide: "home" as const,
        homeConsented,
        awayConsented,
        startedAt: null,
        homeTurnMs: 0,
        awayTurnMs: 0,
        homeScore: 0,
        awayScore: 0,
        seq: 0,
        paused: false,
        clockStartedAt: null,
      },
    });
    return created.id;
  });

  const view = toLiveViewState(state, input.now);
  deps.hub.publish(input.fixtureId, view);
  return { liveMatchId, view };
}

export interface ConsentLiveMatchInput {
  fixtureId: string;
  fixture: FixtureStartState;
  side: TeamSide;
  now: number;
}

/**
 * Records a coach's consent (LM-11, D16): the LiveMatch row is created on the
 * FIRST consent (create-on-first-consent); a subsequent consent transitions an
 * existing row. Both consents → `ready`. Doubly-consenting the same side is an
 * idempotent no-op. Rejects a played/result-loaded fixture with 409 before any
 * write. P2002 race on create → re-read + apply the transition.
 */
export async function consentLiveMatch(
  input: ConsentLiveMatchInput,
  deps: StoreDeps,
): Promise<{ liveMatchId: string; view: ReturnType<typeof toLiveViewState> }> {
  if (!isStartableFixture(input.fixture)) {
    throw Object.assign(new Error("consent not allowed on played/result fixture"), { status: 409 });
  }

  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) {
    return createFirstConsent({ fixtureId: input.fixtureId, side: input.side, now: input.now }, deps);
  }

  const current = liveMatchRowToState(row);
  const next = consentStart(current, { side: input.side });
  if (next === current) {
    return { liveMatchId: row.id, view: toLiveViewState(current, input.now) };
  }
  const nextSeq = await persistAndPublish(
    { liveMatchId: row.id, fixtureId: input.fixtureId, currentSeq: current.seq, next, now: input.now },
    deps,
  );
  return { liveMatchId: row.id, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

export interface RetractLiveConsentInput {
  liveMatchId: string;
  fixtureId: string;
  side: TeamSide;
  now: number;
}

/**
 * Clears a coach's consent, returning the match to `pending` (LM-11). No-op when
 * that side never consented.
 */
export async function retractLiveConsent(
  input: RetractLiveConsentInput,
  deps: StoreDeps,
): Promise<{ view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);
  const next = retractConsent(current, { side: input.side });
  if (next === current) {
    return { view: toLiveViewState(current, input.now) };
  }
  const nextSeq = await persistAndPublish(
    { liveMatchId: row.id, fixtureId: input.fixtureId, currentSeq: current.seq, next, now: input.now },
    deps,
  );
  return { view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

export interface BeginLiveMatchInput {
  liveMatchId: string;
  fixtureId: string;
  now: number;
}

/**
 * Begins the first turn: `ready → live` ONLY via `beginMatch` (LM-3/LM-11).
 * Persists the live state + the `start`/`turnStart` events atomically.
 */
export async function beginLiveMatch(
  input: BeginLiveMatchInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);
  const next = beginMatch(current, input.now);
  const nextSeq = await persistAndPublish(
    { liveMatchId: row.id, fixtureId: input.fixtureId, currentSeq: current.seq, next, now: input.now },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

export interface PauseResumeInput {
  liveMatchId: string;
  fixtureId: string;
  current: LiveMatchState;
  now: number;
}

/**
 * Hub-driven internal pause (LM-7/D18): bumps the ACTIVE accumulator by the
 * in-flight segment `(now - clockStartedAt)`, then sets `paused=true` and
 * `clockStartedAt=null` (the active clock consumes no further time) under the
 * optimistic seq guard, then publishes. Repeating a pause when already paused is
 * a no-op acceptance (no seq bump, no mutation). Survives restarts (persisted).
 */
export async function pauseLiveMatch(input: PauseResumeInput, deps: StoreDeps): Promise<void> {
  if (input.current.paused) return;
  const bumped = bumpActiveAccumulator(input.current, input.now);
  const paused: LiveMatchState = {
    ...bumped,
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
 * Hub-driven resume (LM-7): clears the pause and restarts the running segment at
 * `now` (`paused=false`, `clockStartedAt=now`) so accumulation resumes from the
 * persisted accumulators (never zero). Repurposed unified-clock segment resume.
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

/** Bumps the ACTIVE side's accumulator by the live in-flight segment elapsed (LM-5). */
function bumpActiveAccumulator(state: LiveMatchState, now: number): LiveMatchState {
  if (state.status !== "live" || state.clockStartedAt == null) return state;
  const inFlight = Math.max(now - state.clockStartedAt, 0);
  if (inFlight === 0) return state;
  return state.activeSide === "home"
    ? { ...state, homeTurnMs: state.homeTurnMs + inFlight }
    : { ...state, awayTurnMs: state.awayTurnMs + inFlight };
}
