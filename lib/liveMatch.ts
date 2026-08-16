/**
 * Pure live-match state machine (LM-3/LM-11 two-phase consent, LM-4 turn
 * alternation, LM-5 unified clock).
 *
 * All transitions are pure: they take a `LiveMatchState` value and return a NEW
 * state with invariants applied (consent→pending/ready, begin→live, alternation,
 * no double action, 1..8 turns per half, half flip, TD-ends-turn, auto-finish).
 * The store (`lib/liveStore.ts`) persists the result atomically under the
 * optimistic `seq` guard; this module never touches Prisma, timers, or the hub
 * (`lib/result.ts` precedent — zero-mock testable).
 *
 * Unified clock (LM-5): the match clock is server-owned and informational — NO
 * per-turn limit, NO auto-end at zero (D4 removed). `startedAt` anchors the
 * kickoff (informational); `homeTurnMs`/`awayTurnMs` accumulate server-side only
 * while the active side's turn runs; `clockStartedAt` is the current running
 * turn-segment start (null while paused or pre-live). Accumulators bump at
 * boundaries (turn flip / pause / finish) by `(now - clockStartedAt)`.
 * Transitions take an optional `now` (epoch ms) so accumulation is deterministic
 * under test; the store passes `Date.now()`.
 */

import { resolveInjury, permanentAttribute as permanentAttributeOf } from "./rules/injuries";
import type { InjuryOutcomeKind, PermanentAttribute } from "./rules/injuries";
import type { CasualtyCause } from "./livePhase";

export type TeamSide = "home" | "away";
export type LiveMatchStatus = "pending" | "ready" | "live" | "finished";
export type LiveEventKind =
  | "start"
  | "turn"
  | "td"
  | "completion"
  | "casualty"
  | "foul"
  | "endHalf"
  | "endMatch"
  | "turnStart"
  | "requestTurn"
  | "mvp"
  | "expensive_mistake"
  | "fan_factor"
  | "concede";

/**
 * The display-worthy kinds that reach the feed DTOs (LM-16): the history shows
 * `start|td|completion|casualty|foul|endHalf|endMatch|mvp|concede`. `turn`,
 * `turnStart` and `requestTurn` stay in the DB (audit/replay) and live-only
 * (nudge banner) but MUST NEVER appear in a feed DTO. Shared by BOTH
 * serializers (`toEventDtos` in the live route and `serializeLive` in the
 * fixture GET) so the feed and the render can never drift (D23). Unknown kinds
 * are rejected so a future raw kind never leaks without a deliberate filter
 * change.
 */
export function isDisplayEvent(kind: string): boolean {
  switch (kind) {
    case "start":
    case "td":
    case "completion":
    case "casualty":
    case "foul":
    case "endHalf":
    case "endMatch":
    case "mvp":
    case "expensive_mistake":
    case "fan_factor":
    case "concede":
      return true;
    default:
      return false;
  }
}

/**
 * Nudge cooldown (D17): a `requestTurn` nudge is persisted at most once per
 * window, keyed on the last persisted `requestTurn` event's timestamp. Extras
 * within the window → the route rejects with 409, no mutation.
 */
export const REQUEST_TURN_COOLDOWN_MS = 60_000;

/**
 * Whether a fixture is a valid start target (LM-3): not played and with no
 * result. An agreed date is NOT required — the date negotiation is an optional
 * reminder (avisador), never a gate on starting the match.
 */
export interface FixtureStartState {
  played: boolean;
  result: boolean;
}

export interface LiveEventRecord {
  seq: number;
  kind: LiveEventKind;
  side: TeamSide | null;
  playerRosterId: string | null;
  half: number;
  turnNumber: number;
  payload: Record<string, unknown>;
  at: number;
}

export interface LiveMatchState {
  seq: number;
  status: LiveMatchStatus;
  half: number;
  turnNumber: number;
  activeSide: TeamSide;
  homeConsented: boolean;
  awayConsented: boolean;
  startedAt: number | null;
  homeTurnMs: number;
  awayTurnMs: number;
  homeScore: number;
  awayScore: number;
  paused: boolean;
  clockStartedAt: number | null;
  finishedAt: number | null;
  /** RAU-38: the side that proposed to concede, or null when none is pending. */
  concedeProposedBy: TeamSide | null;
  /** RAU-39: the ACTIVE coach's pending casualty proposal (causer/victim/cause/
   * rolls), or null when none is pending. The defender confirms it to persist
   * the casualty event (see `confirmCasualty`). */
  pendingCasualty: PendingCasualty | null;
  events: LiveEventRecord[];
}

/**
 * RAU-39: a pending casualty proposed by the ACTIVE coach (the attacker):
 * `proposerSide` is the attacker's side; `victimRosterId` is an OPPONENT-side
 * player and `causerRosterId` the attacker's OWN player (LM-12 invariant — the
 * route enforces the sides). `roll16` is the 1D16 injury roll the players
 * actually rolled; `roll6` is the 1D6 attribute roll REQUIRED when the derived
 * band is `permanent` (13-14). The band is DERIVED server-side at confirm via
 * the rulebook table — never client-chosen.
 */
export interface PendingCasualty {
  proposerSide: TeamSide;
  victimRosterId: string;
  causerRosterId: string;
  cause: CasualtyCause;
  roll16: number;
  roll6?: number;
}

/**
 * DTO for subscribers/snapshot/POST/GET (LM-8, D19). Per-side accumulators and
 * `elapsed` are unified-clock derived; the deprecated per-turn clock fields are
 * gone. `viewerSide` is per-viewer (D19): snapshot / POST response / fixture-GET
 * set it; hub fan-out frames carry `null`.
 */
export interface LiveMatchViewState {
  seq: number;
  status: LiveMatchStatus;
  half: number;
  turnNumber: number;
  activeSide: TeamSide;
  homeConsented: boolean;
  awayConsented: boolean;
  viewerSide: "home" | "away" | null;
  startedAt: number | null;
  elapsed: number;
  homeTurnMs: number;
  awayTurnMs: number;
  paused: boolean;
  homeScore: number;
  awayScore: number;
  finishedAt: number | null;
  /** RAU-38: the side that proposed to concede, or null when none is pending. */
  concedeProposedBy: TeamSide | null;
  /** RAU-39: the pending casualty proposal, or null when none is pending. */
  pendingCasualty: PendingCasualty | null;
}

const TURNS_PER_HALF = 8;

function other(side: TeamSide): TeamSide {
  return side === "home" ? "away" : "home";
}

function throwInvalid(reason: string): never {
  throw new Error(reason);
}

/**
 * True when the fixture is a valid start target (LM-3): not played and with no
 * result. An agreed date is NOT required — the date negotiation is just an
 * optional reminder, never a gate on starting the match.
 */
export function isStartableFixture(fixture: FixtureStartState): boolean {
  return !fixture.played && !fixture.result;
}

/**
 * Records a coach's consent to start (LM-11, D16): the LiveMatch row is created
 * on FIRST consent. Sets the side's boolean; later consents are idempotent no-ops.
 * When BOTH booleans are true the status becomes `ready`; otherwise it stays
 * `pending` and waits indefinitely (no timeout, no clock). Consent is only valid
 * on an un-played, un-resulted fixture while the match is pre-live.
 */
export function consentStart(
  state: LiveMatchState,
  cmd: { side: TeamSide },
): LiveMatchState {
  if (state.status === "live" || state.status === "finished") {
    throwInvalid("consent only before live");
  }
  const consented = state.status === "ready" || state[cmd.side === "home" ? "homeConsented" : "awayConsented"];
  if (consented) return state; // already consented (idempotent)
  const next =
    cmd.side === "home"
      ? { homeConsented: true, awayConsented: state.awayConsented }
      : { awayConsented: true, homeConsented: state.homeConsented };
  const both = next.homeConsented && next.awayConsented;
  return { ...state, ...next, status: both ? ("ready" as const) : ("pending" as const) };
}

/**
 * Clears a coach's consent (LM-11): the match returns to `pending`. A no-op when
 * that side never consented.
 */
export function retractConsent(
  state: LiveMatchState,
  cmd: { side: TeamSide },
): LiveMatchState {
  const currentlyConsented =
    cmd.side === "home" ? state.homeConsented : state.awayConsented;
  if (!currentlyConsented) return state;
  const next =
    cmd.side === "home"
      ? { homeConsented: false, awayConsented: state.awayConsented }
      : { awayConsented: false, homeConsented: state.homeConsented };
  return { ...state, ...next, status: "pending" as const };
}

/**
 * A live event row without its `seq` — the shape callers pass into a transition
 * that assigns monotonic seqs (e.g. `beginMatch` splices the kickoff events).
 */
export type LiveMatchTransitionEvent = Omit<LiveEventRecord, "seq">;

/**
 * Begins the FIRST turn (LM-3/LM-11): `ready → live` happens ONLY here. Requires
 * status ready (both coaches consented). Sets the kickoff anchor `startedAt` and
 * the running segment start `clockStartedAt`, starts half 1 turn 1 on the home
 * side, and appends the kickoff events (LM-21) BEFORE the `start` and
 * `turnStart("home")` events, so the persisted seq order is em(home), em(away),
 * fan_factor, start, turnStart — all sharing the same `at` (= now, minute 0′).
 * `kickoffEvents` are optional so legacy 2-param callers/tests still compile.
 */
export function beginMatch(
  state: LiveMatchState,
  now: number,
  kickoffEvents: LiveMatchTransitionEvent[] = [],
): LiveMatchState {
  if (state.status === "live" || state.status === "finished") {
    throwInvalid("begin only from ready");
  }
  if (state.status !== "ready" || !state.homeConsented || !state.awayConsented) {
    throwInvalid("match not ready");
  }
  // The kickoff events are assigned seqs +1..+N first; start/turnStart follow at
  // seq +N+1/+N+2 so begin emits `2 + kickoffEvents.length` events total.
  const normalizedKickoff: LiveEventRecord[] = kickoffEvents.map((event, i) => ({
    ...event,
    seq: state.seq + 1 + i,
  }));
  const startSeq = state.seq + 1 + normalizedKickoff.length;
  const turnStartSeq = startSeq + 1;
  return {
    ...state,
    status: "live",
    half: 1,
    turnNumber: 1,
    activeSide: "home",
    startedAt: now,
    homeTurnMs: 0,
    awayTurnMs: 0,
    paused: false,
    clockStartedAt: now,
    finishedAt: null,
    events: [
      ...state.events,
      ...normalizedKickoff,
      {
        seq: startSeq,
        kind: "start",
        side: null,
        playerRosterId: null,
        half: 1,
        turnNumber: 1,
        payload: {},
        at: now,
      },
      {
        seq: turnStartSeq,
        kind: "turnStart",
        side: "home",
        playerRosterId: null,
        half: 1,
        turnNumber: 1,
        payload: {},
        at: now,
      },
    ],
  };
}

/**
 * Ends the active team's turn (LM-4): the caller's `side` must currently be the
 * active side (no double action / out-of-turn → throw). Bumps the outgoing
 * side's accumulator by `(now - clockStartedAt)` before flipping (LM-5); sets the
 * new segment start to `now`; flips the active side and increments the turn; at
 * half-1 turn 8 the half flips to 2 (away starts turn 1); at half-2 turn 8 the
 * match auto-finishes (D5).
 */
export function applyEndTurn(
  state: LiveMatchState,
  cmd: { side: TeamSide },
  now: number,
): LiveMatchState {
  if (cmd.side !== state.activeSide) throwInvalid("out-of-turn");
  if (state.status !== "live") throwInvalid("match not live");
  const { nextActive, nextHalf, nextTurnNumber, final } = advanceTurnIndex(state);
  return turnTransition(accumulate(state, now), { nextActive, nextHalf, nextTurnNumber, final }, now);
}

/**
 * Records a TD for `cmd.side`: increments that side's score, flips the active
 * side (TD auto-ends the turn per D11), bumps the outgoing accumulator, and
 * appends the `td` event. A TD scored in half-2 turn 8 finishes the match (D5).
 */
export function applyTD(
  state: LiveMatchState,
  cmd: { side: TeamSide; playerRosterId: string },
  now: number,
): LiveMatchState {
  if (cmd.side !== state.activeSide) throwInvalid("out-of-turn");
  if (state.status !== "live") throwInvalid("match not live");

  const scored = { ...state, homeScore: state.homeScore + (cmd.side === "home" ? 1 : 0), awayScore: state.awayScore + (cmd.side === "away" ? 1 : 0) };
  const tdEvent: LiveEventRecord = {
    seq: state.seq + 1,
    kind: "td" as const,
    side: cmd.side,
    playerRosterId: cmd.playerRosterId,
    half: state.half,
    turnNumber: state.turnNumber,
    payload: {},
    at: now,
  };

  // A TD in half-2 turn 8 finishes the match immediately (D5).
  if (state.half === 2 && state.turnNumber === TURNS_PER_HALF) {
    return {
      ...accumulate(scored, now),
      status: "finished" as const,
      activeSide: other(state.activeSide),
      finishedAt: now,
      paused: false,
      clockStartedAt: null,
      events: [...state.events, tdEvent],
    };
  }

  // Otherwise flip the active side; the accumulator bumps before flipping.
  const bumped = accumulate(scored, now);
  return {
    ...bumped,
    activeSide: other(state.activeSide),
    paused: false,
    clockStartedAt: now,
    events: [...bumped.events, tdEvent],
  };
}

/**
 * Ends the match explicitly (concession/admin, D5), preserving the scoreboard.
 * Bumps the active side's accumulator before finishing (LM-5).
 */
export function applyEndMatch(
  state: LiveMatchState,
  now: number,
): LiveMatchState {
  if (state.status === "finished") throwInvalid("already finished");
  const bumped = accumulate(state, now);
  return {
    ...bumped,
    status: "finished",
    finishedAt: now,
    paused: false,
    clockStartedAt: null,
    events: [
      ...state.events,
      {
        seq: state.seq + 1,
        kind: "endMatch",
        side: null,
        playerRosterId: null,
        half: state.half,
        turnNumber: state.turnNumber,
        payload: {},
        at: now,
      },
    ],
  };
}

/** Computes the next turn indices after an end-turn (LM-4 turn caps/half flip). */
function advanceTurnIndex(state: LiveMatchState): {
  nextActive: TeamSide;
  nextHalf: number;
  nextTurnNumber: number;
  final: boolean;
} {
  const turnNumber = state.turnNumber + 1;
  if (state.half === 1 && turnNumber > TURNS_PER_HALF) {
    // Half-1 turn 8 completes → half 2, away starts turn 1.
    return { nextActive: "away", nextHalf: 2, nextTurnNumber: 1, final: false };
  }
  if (state.half === 2 && turnNumber > TURNS_PER_HALF) {
    // Half-2 turn 8 completes → the match finishes.
    return { nextActive: other(state.activeSide), nextHalf: 2, nextTurnNumber: TURNS_PER_HALF, final: true };
  }
  return { nextActive: other(state.activeSide), nextHalf: state.half, nextTurnNumber: turnNumber, final: false };
}

/** Bumps the ACTIVE side's accumulator by the in-flight segment elapsed (LM-5). */
function accumulate(state: LiveMatchState, now: number): LiveMatchState {
  if (state.status !== "live" || state.paused || state.clockStartedAt == null) return state;
  const inFlight = Math.max(now - state.clockStartedAt, 0);
  if (inFlight === 0) return state;
  if (state.activeSide === "home") {
    return { ...state, homeTurnMs: state.homeTurnMs + inFlight };
  }
  return { ...state, awayTurnMs: state.awayTurnMs + inFlight };
}

/** Shared end-of-turn transition: applies indices, appends the turn event. */
function turnTransition(
  state: LiveMatchState,
  n: { nextActive: TeamSide; nextHalf: number; nextTurnNumber: number; final: boolean },
  now: number,
): LiveMatchState {
  const kind: LiveEventKind = n.final ? "endMatch" : n.nextHalf !== state.half ? "endHalf" : "turn";
  // LM-13: whenever a turn begins (the flip lands), persist an explicit labeled
  // `turnStart(nextActive)` event so the OTHER coach's client shows "Tu turno".
  const events: LiveEventRecord[] = n.final
    ? [
        ...state.events,
        {
          seq: state.seq + 1,
          kind,
          side: null,
          playerRosterId: null,
          half: n.nextHalf,
          turnNumber: n.nextTurnNumber,
          payload: {},
          at: now,
        },
      ]
    : [
        ...state.events,
        {
          seq: state.seq + 1,
          kind,
          side: null,
          playerRosterId: null,
          half: n.nextHalf,
          turnNumber: n.nextTurnNumber,
          payload: {},
          at: now,
        },
        {
          seq: state.seq + 2,
          kind: "turnStart",
          side: n.nextActive,
          playerRosterId: null,
          half: n.nextHalf,
          turnNumber: n.nextTurnNumber,
          payload: {},
          at: now,
        },
      ];
  return {
    ...state,
    activeSide: n.nextActive,
    half: n.nextHalf,
    turnNumber: n.nextTurnNumber,
    status: n.final ? "finished" : "live",
    finishedAt: n.final ? now : null,
    paused: false,
    clockStartedAt: n.final ? null : now,
    events,
  };
}

/**
 * Records a `requestTurn` nudge (LM-13): the NON-active coach asks for the turn.
 * Appends a labeled `requestTurn` event for the requesting `side` WITHOUT
 * flipping the turn or changing any turn/clock state (activeSide, clock, and
 * scores all stay identical). The route enforces the non-active caller + the
 * 60s cooldown (D17) before calling this.
 */
export function applyRequestTurn(
  state: LiveMatchState,
  cmd: { side: TeamSide },
  now: number,
): LiveMatchState {
  return {
    ...state,
    events: [
      ...state.events,
      {
        seq: state.seq + 1,
        kind: "requestTurn",
        side: cmd.side,
        playerRosterId: null,
        half: state.half,
        turnNumber: state.turnNumber,
        payload: {},
        at: now,
      },
    ],
  };
}

/**
 * Records a `completion` (completed pass) event (LM-15/LM-6): a ★1 SPP award for
 * the throwing player. Like `applyRequestTurn`, it appends a labeled event
 * WITHOUT flipping the turn or changing any turn/clock/score state (activeSide,
 * clock, and scores stay identical). The route enforces the active-coach caller +
 * side gate before calling this. ★1 rides in the payload (`{ spp: 1 }`, D24); the
 * `eventSpp` helper derives it from the kind for the feed. The next event seq is
 * monotonic (`state.seq + 1`); the row `seq` bump is handled by the store.
 */
export function applyCompletion(
  state: LiveMatchState,
  cmd: { side: TeamSide; playerRosterId: string },
  now: number,
): LiveMatchState {
  return {
    ...state,
    events: [
      ...state.events,
      {
        seq: state.seq + 1,
        kind: "completion",
        side: cmd.side,
        playerRosterId: cmd.playerRosterId,
        half: state.half,
        turnNumber: state.turnNumber,
        payload: { spp: 1 },
        at: now,
      },
    ],
  };
}

/**
 * RAU-38: a coach proposes to concede the match. Only valid while the match is
 * LIVE and no proposal is pending. A retried propose from the SAME side is an
 * idempotent no-op (LM-21-style retry safety — a network retry never errors);
 * a second proposal from the OTHER side while one is pending is rejected, as is
 * any propose outside `live`.
 */
export function proposeConcede(
  state: LiveMatchState,
  side: TeamSide,
): LiveMatchState {
  if (state.status !== "live") throwInvalid("concede only while live");
  if (state.concedeProposedBy != null) {
    if (state.concedeProposedBy === side) return state; // idempotent retry
    throwInvalid("concede already proposed");
  }
  return { ...state, concedeProposedBy: side };
}

/**
 * RAU-38: the NON-proposer declines a pending concession, clearing it so the
 * match continues untouched. A decline with no pending proposal is a no-op
 * (retry-safe); the PROPOSER cannot decline their own proposal.
 */
export function declineConcede(
  state: LiveMatchState,
  side: TeamSide,
): LiveMatchState {
  if (state.concedeProposedBy == null) return state;
  if (side === state.concedeProposedBy) throwInvalid("proposer cannot respond to own concede");
  return { ...state, concedeProposedBy: null };
}

/**
 * RAU-38: the NON-proposer accepts a pending concession → the match FINISHES
 * immediately with the ACCEPTOR as winner (the store records the victory on the
 * fixture in the SAME transaction as this event). Appends a `concede` event
 * whose `side` is the SURRENDERING side (`concedeProposedBy`) and whose payload
 * carries `{ winnerSide }` (the acceptor). Bumps the ACTIVE accumulator before
 * finishing (LM-5 parity with `applyEndMatch`). A concession is NOT a played
 * match — the store awards only the walkover-style victory (no winnings/PE).
 */
export function acceptConcede(
  state: LiveMatchState,
  side: TeamSide,
  now: number,
): LiveMatchState {
  if (state.status !== "live") throwInvalid("concede only while live");
  if (state.concedeProposedBy == null) throwInvalid("no concede proposal");
  if (side === state.concedeProposedBy) throwInvalid("cannot accept own concede");
  const surrendering = state.concedeProposedBy;
  const bumped = accumulate(state, now);
  return {
    ...bumped,
    status: "finished",
    finishedAt: now,
    paused: false,
    clockStartedAt: null,
    concedeProposedBy: null,
    events: [
      ...state.events,
      {
        seq: state.seq + 1,
        kind: "concede",
        side: surrendering,
        playerRosterId: null,
        half: state.half,
        turnNumber: state.turnNumber,
        payload: { winnerSide: side },
        at: now,
      },
    ],
  };
}

/**
 * RAU-39: validates the injury rolls a coach actually rolled. `roll16` MUST be
 * an integer in 1..16 and `roll6` (when present) an integer in 1..6; any other
 * value is rejected (the server validates ranges and derives the band, it does
 * NOT re-roll). Pure — the store/route map the throw to 409.
 */
export function validateCasualtyRolls(roll16: number, roll6?: number): void {
  if (!Number.isInteger(roll16) || roll16 < 1 || roll16 > 16) throwInvalid("invalid roll16");
  if (roll6 != null && (!Number.isInteger(roll6) || roll6 < 1 || roll6 > 6)) {
    throwInvalid("invalid roll6");
  }
}

/**
 * RAU-39: derives the casualty band from the 1D16 roll via the rulebook table
 * (`resolveInjury`, shared with the result path). A `permanent` band (13-14)
 * REQUIRES the 1D6 attribute roll and resolves the reduced attribute via
 * `permanentAttribute`; any other band ignores `roll6`. Pure and shared by the
 * state-machine confirm and the route's self-inflicted record path so the band
 * table lives in exactly one place.
 */
export function deriveCasualtyOutcome(
  roll16: number,
  roll6?: number,
): { band: InjuryOutcomeKind; permanentAttribute?: PermanentAttribute } {
  const outcome = resolveInjury(roll16);
  if (outcome.kind === "permanent") {
    if (roll6 == null) throwInvalid("permanent casualty requires a roll6");
    return { band: outcome.kind, permanentAttribute: permanentAttributeOf(roll6) };
  }
  return { band: outcome.kind };
}

/**
 * RAU-39: the ACTIVE coach (the attacker) proposes a casualty they inflicted.
 * Only valid while the match is LIVE, no casualty proposal is pending, and the
 * caller IS the active side (a non-active propose is out-of-turn). The rolls are
 * validated but the band is NOT derived yet — the defender confirms and the
 * band resolves server-side from the 1D16 table at confirm time. A second
 * proposal while one is pending is rejected (no idempotent retry: the proposal
 * carries the rolls, so a duplicate is always a state-machine rejection → 409).
 */
export function proposeCasualty(
  state: LiveMatchState,
  input: {
    side: TeamSide;
    victimRosterId: string;
    causerRosterId: string;
    cause: CasualtyCause;
    roll16: number;
    roll6?: number;
  },
): LiveMatchState {
  if (state.status !== "live") throwInvalid("casualty only while live");
  if (state.pendingCasualty != null) throwInvalid("casualty already proposed");
  if (input.side !== state.activeSide) throwInvalid("casualty propose requires the active side");
  validateCasualtyRolls(input.roll16, input.roll6);
  return {
    ...state,
    pendingCasualty: {
      proposerSide: input.side,
      victimRosterId: input.victimRosterId,
      causerRosterId: input.causerRosterId,
      cause: input.cause,
      roll16: input.roll16,
      ...(input.roll6 != null ? { roll6: input.roll6 } : {}),
    },
  };
}

/**
 * RAU-39: the NON-proposer (the defender/perjudicado) CONFIRMS a pending
 * casualty — there is no reject, the proposal can only be confirmed. Only valid
 * while LIVE, with a pending proposal, and the caller is NOT the proposer (the
 * proposer cannot confirm their own casualty). The band is DERIVED server-side
 * from the pending 1D16 roll via the rulebook table (a `permanent` band also
 * resolves the 1D6 attribute roll; roll6 was validated at propose and is
 * re-validated here). Appends the `casualty` event with `side` = the VICTIM's
 * side (the OPPOSITE of the proposer) and clears `pendingCasualty`; the match
 * continues on the same turn (no flip, no clock change).
 */
export function confirmCasualty(
  state: LiveMatchState,
  side: TeamSide,
  now: number,
): LiveMatchState {
  if (state.status !== "live") throwInvalid("casualty only while live");
  if (state.pendingCasualty == null) throwInvalid("no casualty proposal");
  if (side === state.pendingCasualty.proposerSide) throwInvalid("proposer cannot confirm own casualty");
  const pending = state.pendingCasualty;
  const { band, permanentAttribute: permanentAttributeOutcome } = deriveCasualtyOutcome(
    pending.roll16,
    pending.roll6,
  );
  return {
    ...state,
    pendingCasualty: null,
    events: [
      ...state.events,
      {
        seq: state.seq + 1,
        kind: "casualty",
        side: other(pending.proposerSide),
        playerRosterId: pending.victimRosterId,
        half: state.half,
        turnNumber: state.turnNumber,
        payload: {
          victimRosterId: pending.victimRosterId,
          causerRosterId: pending.causerRosterId,
          cause: pending.cause,
          roll16: pending.roll16,
          ...(pending.roll6 != null ? { roll6: pending.roll6 } : {}),
          band,
          ...(permanentAttributeOutcome != null ? { permanentAttribute: permanentAttributeOutcome } : {}),
        },
        at: now,
      },
    ],
  };
}

/** The row fields the unified-clock derivation needs (see `deriveLiveClock`). */
export interface ClockRowFields {
  status: LiveMatchStatus;
  activeSide: TeamSide;
  paused: boolean;
  clockStartedAt: number | null;
  homeTurnMs: number;
  awayTurnMs: number;
}

export interface DerivedClock {
  homeTurnMs: number;
  awayTurnMs: number;
  elapsed: number;
  paused: boolean;
}

/**
 * Pure unified-clock derivation (LM-5): the ACTIVE side accumulates the in-flight
 * segment `(now - clockStartedAt)` on top of its persisted accumulator while live
 * and not paused; a paused clock contributes no in-flight time. `elapsed` is the
 * sum of both accumulated sides (pauses excluded). Values resume from the
 * persisted accumulators after a restart/reconnect (never zero). Shared by
 * `toLiveViewState` and `serializeLive` to kill the clock-drift risk.
 */
export function deriveLiveClock(row: ClockRowFields, now: number): DerivedClock {
  const preLive = row.status !== "live";
  const inFlight =
    preLive || row.paused || row.clockStartedAt == null
      ? 0
      : Math.max(now - row.clockStartedAt, 0);
  const homeTurnMs = row.homeTurnMs + (row.activeSide === "home" ? inFlight : 0);
  const awayTurnMs = row.awayTurnMs + (row.activeSide === "away" ? inFlight : 0);
  return {
    homeTurnMs,
    awayTurnMs,
    elapsed: homeTurnMs + awayTurnMs,
    paused: row.paused,
  };
}

/**
 * Maps the state to the subscriber DTO (LM-8, D19). Uses `deriveLiveClock` for the
 * unified-clock fields so the same derivation is shared with `serializeLive`. The
 * deprecated per-turn clock fields (`turnClockEnabled`/`homeClock`/`awayClock`)
 * are gone. `viewerSide` is per-viewer (D19): snapshot / POST response set it; hub
 * fan-out frames leave it `null`.
 */
export function toLiveViewState(
  state: LiveMatchState,
  now: number,
  opts: { viewerSide?: "home" | "away" | null; startedAt?: number | null } = {},
): LiveMatchViewState {
  const clock = deriveLiveClock(state, now);
  return {
    seq: state.seq,
    status: state.status,
    half: state.half,
    turnNumber: state.turnNumber,
    activeSide: state.activeSide,
    homeConsented: state.homeConsented,
    awayConsented: state.awayConsented,
    viewerSide: opts.viewerSide ?? null,
    startedAt: opts.startedAt ?? state.startedAt,
    elapsed: clock.elapsed,
    homeTurnMs: clock.homeTurnMs,
    awayTurnMs: clock.awayTurnMs,
    paused: clock.paused,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    finishedAt: state.finishedAt,
    concedeProposedBy: state.concedeProposedBy,
    pendingCasualty: state.pendingCasualty,
  };
}
