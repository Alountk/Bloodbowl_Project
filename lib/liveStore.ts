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
  proposeConcede,
  declineConcede,
  acceptConcede,
  proposeCasualty,
  confirmCasualty,
  toLiveViewState,
  isStartableFixture,
  type FixtureStartState,
  type LiveMatchState,
  type PendingCasualty,
  type TeamSide,
} from "./liveMatch";
import type { CasualtyCause } from "./livePhase";
import { buildKickoffEvents, type BuildKickoffEventsInput } from "./kickoff";
import { maybeCloseLeague } from "./standings";
import { computeWinnings, preMatchFanFactor } from "@/lib/rules";
import { rollD3 } from "@/lib/random";
import { DEFAULT_COACHING, isCoachingStaff } from "@/features/teams/types";

/** Minimal Prisma transaction surface the store uses (injectable for tests). */
export interface StoreTx {
  liveMatch: {
    updateMany(args: Prisma.LiveMatchUpdateManyArgs): Promise<{ count: number }>;
    create?(args: Prisma.LiveMatchCreateArgs): Promise<LiveMatch>;
    /** RAU-44: the finish-time idempotency read — already-persisted winnings
     * are never recomputed/overwritten (the row is terminal once finished). */
    findUnique(args: {
      where: { id: string };
      select: { winnings: true };
    }): Promise<{ winnings: Prisma.JsonValue | null } | null>;
  };
  liveEvent: {
    create(args: Prisma.LiveEventCreateArgs): Promise<LiveEvent>;
  };
  team: {
    updateMany(args: Prisma.TeamUpdateManyArgs): Promise<{ count: number }>;
    /** RAU-44: reads each side's `coaching` JSON to derive its roster
     * dedicated-fans characteristic for the finish-time winnings formula. */
    findMany(args: {
      where: { id: { in: string[] } };
      select: { id: true; coaching: true };
    }): Promise<{ id: string; coaching: Prisma.JsonValue | null }[]>;
  };
  /** RAU-38: the accept-concede transaction closes the fixture (winner + scores)
   * in the SAME tx as the `concede` event rows. */
  fixture: {
    update(args: Prisma.FixtureUpdateArgs): Promise<unknown>;
    /** RAU-40: the tx must be able to re-read the league's fixtures so the
     * accept-concede can auto-close the season when this was the last one. */
    findMany(args: Prisma.FixtureFindManyArgs): Promise<{ homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null; winnerId: string | null }[]>;
    /** RAU-44: resolves the fixture's two team ids for the finish-time
     * dedicated-fans read. */
    findUnique(args: {
      where: { id: string };
      select: { homeTeamId: true; awayTeamId: true };
    }): Promise<{ homeTeamId: string; awayTeamId: string } | null>;
  };
  /** RAU-40: the league row surface `maybeCloseLeague` needs (status read +
   * finished/champion write) inside the accept-concede transaction. */
  league: {
    findUnique(args: {
      where: { id: string };
      select: { status: true };
    }): Promise<{ status: "open" | "started" | "finished" } | null>;
    update(args: {
      where: { id: string };
      data: { status: "finished"; championTeamId: string | null };
    }): Promise<unknown>;
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
  /** RAU-44: the finish-time pre-match FF 1D3 source — injectable so tests are
   * deterministic; defaults to the server-owned real roll. */
  rollD3?: () => number;
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
  /** RAU-38: the side that proposed to concede (null until proposed/resolved). */
  concedeProposedBy: TeamSide | null;
  /** RAU-39: the pending casualty proposal JSON (null until proposed/confirmed). */
  pendingCasualty: Prisma.JsonValue | null;
}

/** Defensively parses a persisted `pendingCasualty` JSON value into the pure
 * state shape; malformed/unknown values collapse to null (never crash). */
function toPendingCasualty(value: Prisma.JsonValue | null): PendingCasualty | null {
  if (value == null || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const proposerSide = v.proposerSide;
  const cause = v.cause;
  const roll16 = v.roll16;
  const roll6 = v.roll6;
  if (
    (proposerSide !== "home" && proposerSide !== "away") ||
    typeof v.victimRosterId !== "string" ||
    typeof v.causerRosterId !== "string" ||
    typeof cause !== "string" ||
    typeof roll16 !== "number"
  ) {
    return null;
  }
  return {
    proposerSide,
    victimRosterId: v.victimRosterId,
    causerRosterId: v.causerRosterId,
    cause: cause as CasualtyCause,
    roll16,
    ...(typeof roll6 === "number" ? { roll6 } : {}),
  };
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
    concedeProposedBy: row.concedeProposedBy,
    pendingCasualty: toPendingCasualty(row.pendingCasualty ?? null),
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
    concedeProposedBy: next.concedeProposedBy,
    // Nullable JSON: SQL NULL when no proposal is pending (Prisma's TS input
    // type omits bare `null`, so the value is cast — the runtime JSON write is
    // exactly the object, or SQL NULL when cleared).
    pendingCasualty: next.pendingCasualty as unknown as
      | Prisma.NullableJsonNullValueInput
      | Prisma.InputJsonValue,
  };
}

/** The team's dedicated-fans characteristic from its persisted `coaching` JSON
 * (result-route `dedicatedFansOf` precedent); a malformed/absent value falls
 * back to the roster default (1). */
function dedicatedFansOf(coaching: Prisma.JsonValue | null): number {
  return isCoachingStaff(coaching) ? coaching.dedicatedFans : DEFAULT_COACHING.dedicatedFans;
}

/**
 * RAU-44: computes the per-team match winnings for a transition that FINISHES
 * the live match (`next.status === "finished"`), mirroring the result route's
 * server-owned formula — per team a fresh 1D3 + the roster dedicated fans gives
 * the pre-match FF, then `computeWinnings` with `heldBall: true` (a live end
 * never grants the +10k "never held the ball" bonus; the admin corrects it when
 * the result is loaded). Treasury is NOT touched here — it still applies at
 * result-load, so nothing is double-applied. Returns null unless the match JUST
 * finished AND the row has no persisted winnings yet (idempotent: a finished
 * row is terminal, so this guards a re-entrant/retried finish).
 */
async function computeLiveWinnings(
  input: {
    liveMatchId: string;
    fixtureId: string;
    next: LiveMatchState;
    /** RAU-44: the walkover scoreboard for a CONCEDED match (2-0 to the winner).
     * The live state's own scoreboard stays 0-0 on a concede, so without this the
     * winner would lose the 2-TD winnings boost. Auto-finishes pass undefined. */
    finalScore?: { homeScore: number; awayScore: number };
  },
  tx: StoreTx,
  deps: StoreDeps,
): Promise<{ home: number; away: number } | null> {
  if (input.next.status !== "finished") return null;

  const existing = await tx.liveMatch.findUnique({
    where: { id: input.liveMatchId },
    select: { winnings: true },
  });
  if (existing?.winnings != null) return null;

  const fixture = await tx.fixture.findUnique({
    where: { id: input.fixtureId },
    select: { homeTeamId: true, awayTeamId: true },
  });
  if (!fixture) return null;

  const teams = await tx.team.findMany({
    where: { id: { in: [fixture.homeTeamId, fixture.awayTeamId] } },
    select: { id: true, coaching: true },
  });
  const byId = new Map(teams.map((team) => [team.id, team]));

  const roll = deps.rollD3 ?? rollD3;
  const preHomeFf = preMatchFanFactor({
    roll3: roll(),
    dedicatedFans: dedicatedFansOf(byId.get(fixture.homeTeamId)?.coaching ?? null),
  });
  const preAwayFf = preMatchFanFactor({
    roll3: roll(),
    dedicatedFans: dedicatedFansOf(byId.get(fixture.awayTeamId)?.coaching ?? null),
  });

  const homeScore = input.finalScore?.homeScore ?? input.next.homeScore;
  const awayScore = input.finalScore?.awayScore ?? input.next.awayScore;

  return {
    home: computeWinnings({
      ffHome: preHomeFf,
      ffAway: preAwayFf,
      ownTds: homeScore,
      heldBall: true,
    }),
    away: computeWinnings({
      ffHome: preAwayFf,
      ffAway: preHomeFf,
      ownTds: awayScore,
      heldBall: true,
    }),
  };
}

/** Shared optimistic-guard persistence: bump seq, write fields, append delta events. */
async function persistAndPublish(
  input: {
    liveMatchId: string;
    fixtureId: string;
    currentSeq: number;
    next: LiveMatchState;
    now: number;
    /** Optional per-team treasury decrements to commit in the SAME transaction as
     * the event rows (LM-23 atomicity): a failure rolls back events AND treasury. */
    treasuryUpdates?: { teamId: string; amountLost: number }[];
    /** RAU-38: when set, closes the fixture (winner + scores) in the SAME
     * transaction as the event rows — a concession's victory is atomic with its
     * `concede` event, never a partial state. `leagueId` lets the store run the
     * RAU-40 season-close check (last fixture → finished + champion) atomically. */
    closeFixture?: {
      winnerId: string;
      homeScore: number;
      awayScore: number;
      leagueId: string;
    };
  },
  deps: StoreDeps,
): Promise<number> {
  const eventsToPersist = input.next.events.filter((e) => e.seq > input.currentSeq);
  // Advance the row seq past BOTH the previous value and every newly-appended
  // delta event. Most transitions emit exactly one event (seq = currentSeq+1),
  // but `beginMatch` emits the kickoff-plus-start/turnStart set, so the row must
  // advance to the highest event seq — otherwise the next transition's event
  // collides on `@@unique([liveMatchId, seq])` (P2002).
  const highestEventSeq = eventsToPersist.reduce((max, e) => Math.max(max, e.seq), input.currentSeq);
  const nextSeq = Math.max(input.currentSeq + 1, highestEventSeq);

  await deps.prisma.$transaction(async (tx) => {
    // RAU-44: a finish transition computes + persists the deterministic per-team
    // winnings IN this SAME transaction (atomic with the event rows below) so
    // the finished feed can show "Ganancias" immediately at end. The reads are
    // static roster data; the write rides the seq-guarded updateMany so a
    // concurrent finish can never double-apply (finished is terminal anyway).
    const liveWinnings = await computeLiveWinnings(
      { ...input, finalScore: input.closeFixture },
      tx,
      deps,
    );
    const updated = await tx.liveMatch.updateMany({
      where: { id: input.liveMatchId, seq: input.currentSeq },
      data: {
        ...rowData(input.next),
        seq: nextSeq,
        ...(liveWinnings ? { winnings: liveWinnings } : {}),
      },
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
    // LM-23: the treasury decrements are part of the SAME transaction as the
    // event rows, so a failure rolls BOTH back. The delta is ≤ half treasury
    // (serious-incident) or the kept remainder (catastrophe), never negative.
    for (const update of input.treasuryUpdates ?? []) {
      await tx.team.updateMany({
        where: { id: update.teamId },
        data: { treasury: { decrement: update.amountLost } },
      });
    }
    // RAU-38: the conceded match's victory (fixture winner + walkover-style
    // scores) commits atomically with the `concede` event rows — a failed
    // fixture write rolls back the events too.
    if (input.closeFixture) {
      await tx.fixture.update({
        where: { id: input.fixtureId },
        data: {
          winnerId: input.closeFixture.winnerId,
          homeScore: input.closeFixture.homeScore,
          awayScore: input.closeFixture.awayScore,
        },
      });
      // RAU-40: a concession counts as played — when it was the season's LAST
      // fixture the league closes in this SAME transaction (finished + champion).
      await maybeCloseLeague(tx, input.closeFixture.leagueId);
    }
  });

  const bounded = { ...input.next, seq: nextSeq };
  // The fan-out frame carries the view PLUS this transition's delta events so a
  // connected client can apply the new state and append the events to its
  // timeline in one frame (no reload, no second DB read). `eventsToPersist` is
  // always the event rows created in the SAME transaction (empty for
  // pause/resume/retract-style transitions that emit no event).
  deps.hub.publish(input.fixtureId, {
    ...toLiveViewState(bounded, input.now),
    events: eventsToPersist,
  });
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
    concedeProposedBy: null,
    pendingCasualty: null,
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
  /** Optional kickoff input (LM-21/22/23): when present, the begin transition
   * builds the em/em/fan_factor events and commits the treasury deltas atomically. */
  kickoff?: BuildKickoffEventsInput;
}

/**
 * Begins the first turn: `ready → live` ONLY via `beginMatch` (LM-3/LM-11).
 * When a kickoff input is supplied, builds the kickoff events via
 * `buildKickoffEvents` (LM-21) and passes the treasury deltas into
 * `persistAndPublish` so they commit in the same transaction as the event rows
 * (LM-23). A retried begin (already-live) is mapped to 409 (LM-21 idempotency);
 * the optimistic seq guard also returns 409 on a concurrent double-begin.
 */
export async function beginLiveMatch(
  input: BeginLiveMatchInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);

  const kickoff = input.kickoff
    ? buildKickoffEvents(input.kickoff)
    : { events: [], treasuryUpdates: [] as { teamId: string; amountLost: number }[] };

  let next: LiveMatchState;
  try {
    next = beginMatch(current, input.now, kickoff.events);
  } catch (error) {
    // LM-21: a begin on an already-live match is a retry → 409, never a 500.
    if (error instanceof Error && error.message.includes("begin only from ready")) {
      throw Object.assign(error, { status: 409 });
    }
    throw error;
  }

  const nextSeq = await persistAndPublish(
    {
      liveMatchId: row.id,
      fixtureId: input.fixtureId,
      currentSeq: current.seq,
      next,
      now: input.now,
      treasuryUpdates: kickoff.treasuryUpdates,
    },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

export interface ConcedeInput {
  liveMatchId: string;
  fixtureId: string;
  /** The caller's side — for propose the PROPOSER, for decline the responder. */
  side: TeamSide;
  now: number;
}

export interface AcceptConcedeInput extends ConcedeInput {
  homeTeamId: string;
  awayTeamId: string;
  /** RAU-40: the fixture's league — the accept-concede close check needs it. */
  leagueId: string;
}

/**
 * RAU-38 propose: persists `concedeProposedBy = side` under the optimistic seq
 * guard. A retried propose from the same side is an idempotent no-op returning
 * the current view; a double-propose by the other side or a non-live propose is
 * a state-machine rejection mapped to 409.
 */
export async function proposeConcedeLiveMatch(
  input: ConcedeInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);
  let next: LiveMatchState;
  try {
    next = proposeConcede(current, input.side);
  } catch (error) {
    // Every pure transition rejection is a state-machine guard → 409.
    throw Object.assign(error as Error, { status: 409 });
  }
  if (next === current) {
    return { seq: current.seq, view: toLiveViewState(current, input.now) };
  }
  const nextSeq = await persistAndPublish(
    { liveMatchId: row.id, fixtureId: input.fixtureId, currentSeq: current.seq, next, now: input.now },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

/**
 * RAU-38 decline: the NON-proposer rejects a pending concession, clearing
 * `concedeProposedBy` so the match continues. A decline with no pending
 * proposal is an idempotent no-op; the proposer declining their own proposal
 * is a state-machine rejection → 409.
 */
export async function declineConcedeLiveMatch(
  input: ConcedeInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);
  let next: LiveMatchState;
  try {
    next = declineConcede(current, input.side);
  } catch (error) {
    throw Object.assign(error as Error, { status: 409 });
  }
  if (next === current) {
    return { seq: current.seq, view: toLiveViewState(current, input.now) };
  }
  const nextSeq = await persistAndPublish(
    { liveMatchId: row.id, fixtureId: input.fixtureId, currentSeq: current.seq, next, now: input.now },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

/**
 * RAU-38 accept: the NON-proposer accepts a pending concession → the match
 * finishes and the ACCEPTOR's team wins. The victory is awarded in the SAME
 * transaction as the `concede` event rows (`closeFixture`): the fixture gets
 * the acceptor as `winnerId` plus the walkover-style 2-0 scores (forfeit
 * precedent) so it closes as played and a later result load 409s. A concession
 * 409). A concession is NOT a played match — no PE/MVP are computed here
 * (documented choice); the winnings snapshot IS persisted at finish like any
 * live end (RAU-44: `persistAndPublish` computes `{ home, away }` when the
 * row reaches `finished`), while the scoreboard in the live state stays
 * untouched. A retried accept (already finished) or an accept of one's own
 * proposal is a state-machine rejection → 409 (the optimistic seq guard
 * catches a concurrent double-accept too).
 */
export async function acceptConcedeLiveMatch(
  input: AcceptConcedeInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);
  let next: LiveMatchState;
  try {
    next = acceptConcede(current, input.side, input.now);
  } catch (error) {
    throw Object.assign(error as Error, { status: 409 });
  }
  const isHome = input.side === "home";
  const winnerTeamId = isHome ? input.homeTeamId : input.awayTeamId;
  const homeScore = isHome ? 2 : 0;
  const awayScore = isHome ? 0 : 2;
  const nextSeq = await persistAndPublish(
    {
      liveMatchId: row.id,
      fixtureId: input.fixtureId,
      currentSeq: current.seq,
      next,
      now: input.now,
      closeFixture: {
        winnerId: winnerTeamId,
        homeScore,
        awayScore,
        leagueId: input.leagueId,
      },
    },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

export interface ProposeCasualtyInput {
  liveMatchId: string;
  fixtureId: string;
  /** The caller's side — MUST be the ACTIVE side (the state machine enforces). */
  side: TeamSide;
  victimRosterId: string;
  causerRosterId: string;
  cause: CasualtyCause;
  roll16: number;
  roll6?: number;
  now: number;
}

export interface ConfirmCasualtyInput {
  liveMatchId: string;
  fixtureId: string;
  /** The caller's side — the responder, opposite the proposer. */
  side: TeamSide;
  now: number;
}

/**
 * RAU-39 propose: persists `pendingCasualty` (the ACTIVE coach's casualty
 * proposal) under the optimistic seq guard. Any state-machine rejection
 * (non-live, double-propose, non-active caller, invalid rolls) is mapped to 409;
 * the optimistic guard catches a concurrent double-propose too.
 */
export async function proposeCasualtyLiveMatch(
  input: ProposeCasualtyInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);
  let next: LiveMatchState;
  try {
    next = proposeCasualty(current, {
      side: input.side,
      victimRosterId: input.victimRosterId,
      causerRosterId: input.causerRosterId,
      cause: input.cause,
      roll16: input.roll16,
      roll6: input.roll6,
    });
  } catch (error) {
    throw Object.assign(error as Error, { status: 409 });
  }
  const nextSeq = await persistAndPublish(
    { liveMatchId: row.id, fixtureId: input.fixtureId, currentSeq: current.seq, next, now: input.now },
    deps,
  );
  return { seq: nextSeq, view: toLiveViewState({ ...next, seq: nextSeq }, input.now) };
}

/**
 * RAU-39 confirm: the NON-proposer confirms a pending casualty → the `casualty`
 * event persists ATOMICALLY (band derived server-side from the 1D16 roll) and
 * `pendingCasualty` clears, all in the same transaction. A casualty has no money
 * effect — no treasury/winnings are involved (unlike the kickoff EM). Any
 * state-machine rejection (non-live, no proposal, proposer-self) → 409.
 */
export async function confirmCasualtyLiveMatch(
  input: ConfirmCasualtyInput,
  deps: StoreDeps,
): Promise<{ seq: number; view: ReturnType<typeof toLiveViewState> }> {
  const row = await deps.prisma.liveMatch.findFirst({ where: { fixtureId: input.fixtureId } });
  if (!row) throw Object.assign(new Error("not found"), { status: 404 });
  const current = liveMatchRowToState(row);
  let next: LiveMatchState;
  try {
    next = confirmCasualty(current, input.side, input.now);
  } catch (error) {
    throw Object.assign(error as Error, { status: 409 });
  }
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
}/**
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
