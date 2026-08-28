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
  | "concede"
  | "journeyman";

/**
 * The display-worthy kinds that reach the feed DTOs (LM-16): the history shows
 * `start|td|completion|casualty|foul|endHalf|endMatch|mvp|concede|journeyman`.
 * `turn`, `turnStart` and `requestTurn` stay in the DB (audit/replay) and
 * live-only (nudge banner) but MUST NEVER appear in a feed DTO. Shared by BOTH
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
    case "journeyman":
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
  /** RAU-51: the persisted per-side MJP nominations (null per side = that coach
   * has not nominated yet). Not part of the turn lifecycle — carried on the
   * state so the shared DTO exposes it for the per-side resolution modal. */
  mvpNominations: MvpNominations;
  /** The per-side RESOLUTION WIZARD cursor (see `ResolutionState`) — the
   * resumable end-of-match step machine. Not part of the turn lifecycle;
   * carried so the shared DTO exposes it for the modal's resume-at-step. */
  resolutionState: ResolutionState;
  events: LiveEventRecord[];
}

/**
 * RAU-51: the per-side MJP nominations persisted on the LiveMatch row. Each
 * side's SIX rosterPlayerIds, or null while that coach has not nominated. The
 * whole value is null until the FIRST side nominates (defensive parse).
 */
export interface MvpNominations {
  home: string[] | null;
  away: string[] | null;
}

/** A LiveMatch whose sides have not nominated anything yet (RAU-51 default). */
export const EMPTY_MVP_NOMINATIONS: MvpNominations = { home: null, away: null };

/**
 * Defensively parses a persisted `mvpNominations` JSON value (RAU-51):
 * malformed/unknown values collapse each side to null (never crash). A side
 * that nominated carries its six ids; anything else reads as "not nominated".
 */
export function parseMvpNominations(value: unknown): MvpNominations {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return EMPTY_MVP_NOMINATIONS;
  }
  const raw = value as Record<string, unknown>;
  const side = (candidate: unknown): string[] | null =>
    Array.isArray(candidate) && candidate.some((x) => typeof x === "string")
      ? candidate.filter((x): x is string => typeof x === "string")
      : null;
  return { home: side(raw.home), away: side(raw.away) };
}

/**
 * The per-side RESOLUTION WIZARD step cursor (the resumable end-of-match
 * sequence). Each coach advances their OWN side independently; only the MVP
 * reveal waits for BOTH sides. Steps in order:
 *  - "winnings":  the finish-time winnings display (+ the maintenance-cost row
 *                 placeholder — NOT implemented, shown as 0 with a note).
 *  - "fans":      the server-owned 1D6 dedicated-fans roll (rulebook p.103).
 *  - "mvp":       the coach's six checkbox nominations + the SEND + the FINAL
 *                 confirm ("¿estás seguro?") — after the confirm, no going back.
 *  - "mvp-done":  the coach's confirm is locked; waits for the rival's.
 *  - "casualties":the MVP REVEAL (both sides' confirms needed) + the casualty
 *                 outcomes, visibly applying the roster state (alive /
 *                 missNextMatch / injuries).
 *  - "journeymen":the ≥11-healthy check + the fielded Novato hire/let-go step.
 *  - "done":      the side completed; when BOTH sides are done the match closes.
 */
export type ResolutionStep =
  | "winnings"
  | "fans"
  | "mvp"
  | "mvp-done"
  | "casualties"
  | "journeymen"
  | "done";

/** One side's persisted wizard progress. `fans` is the persisted server-owned
 * roll once rolled (absent/null until then). Every step action persists the
 * side's progress server-side, so a refresh resumes at the current step. */
export interface ResolutionSideState {
  step: ResolutionStep;
  fansDone: boolean;
  /** The persisted server-owned 1D6 fan roll (rulebook p.103) once rolled —
   * `{ roll, before, after, direction }`. Null until the coach rolls. */
  fans: { roll: number; before: number; after: number; direction: "up" | "stay" | "down" } | null;
  mvpConfirmed: boolean;
  mvpRolled: boolean;
  casualtiesDone: boolean;
  journeymenDone: boolean;
}

/** The persisted per-side resolution state on the LiveMatch row. */
export interface ResolutionState {
  home: ResolutionSideState;
  away: ResolutionSideState;
}

/** A side that has not started the wizard: step "winnings", nothing done. */
export function emptyResolutionSide(): ResolutionSideState {
  return {
    step: "winnings",
    fansDone: false,
    fans: null,
    mvpConfirmed: false,
    mvpRolled: false,
    casualtiesDone: false,
    journeymenDone: false,
  };
}

/** A LiveMatch whose sides have not started the resolution wizard yet. */
export const EMPTY_RESOLUTION_STATE: ResolutionState = {
  home: emptyResolutionSide(),
  away: emptyResolutionSide(),
};

/**
 * Defensively parses a persisted `resolutionState` JSON value (additive): a
 * malformed or legacy shape (missing the wizard) collapses EACH side to the
 * empty per-side state (never crash). A side with partial progress keeps it.
 */
export function parseResolutionState(value: unknown): ResolutionState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return EMPTY_RESOLUTION_STATE;
  }
  const raw = value as Record<string, unknown>;
  const side = (candidate: unknown): ResolutionSideState => {
    if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
      return emptyResolutionSide();
    }
    const s = candidate as Record<string, unknown>;
    const steps: ResolutionStep[] = [
      "winnings",
      "fans",
      "mvp",
      "mvp-done",
      "casualties",
      "journeymen",
      "done",
    ];
    const step = steps.find((candidateStep) => candidateStep === s.step);
    const fans = s.fans;
    const parsedFans: ResolutionSideState["fans"] =
      typeof fans === "object" &&
      fans !== null &&
      !Array.isArray(fans) &&
      typeof (fans as Record<string, unknown>).roll === "number" &&
      typeof (fans as Record<string, unknown>).before === "number" &&
      typeof (fans as Record<string, unknown>).after === "number" &&
      (["up", "stay", "down"] as const).includes((fans as Record<string, unknown>).direction as never)
        ? {
            roll: (fans as Record<string, unknown>).roll as number,
            before: (fans as Record<string, unknown>).before as number,
            after: (fans as Record<string, unknown>).after as number,
            direction: (fans as Record<string, unknown>).direction as "up" | "stay" | "down",
          }
        : null;
    return {
      step: step ?? "winnings",
      fansDone: s.fansDone === true,
      fans: parsedFans,
      mvpConfirmed: s.mvpConfirmed === true,
      mvpRolled: s.mvpRolled === true,
      casualtiesDone: s.casualtiesDone === true,
      journeymenDone: s.journeymenDone === true,
    };
  };
  return { home: side(raw.home), away: side(raw.away) };
}

/**
 * Defensively parses a persisted `pendingResolution` MVP-grantees value (the
 * reveal persisted `{ mvp: { home, away } }`): malformed/absent collapses to
 * null per side (never crash). Surfaced on the fixture GET so the modal's
 * casualties step can show who got the MVP after a refresh.
 */
export function parseMvpGrantees(value: unknown): { home: string | null; away: string | null } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { home: null, away: null };
  }
  const pending = value as Record<string, unknown>;
  const mvp = pending.mvp as Record<string, unknown> | undefined;
  if (!mvp || typeof mvp.home !== "string" || typeof mvp.away !== "string") {
    return { home: null, away: null };
  }
  return { home: mvp.home, away: mvp.away };
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
  /** RAU-51: the persisted per-side MJP nominations (null per side = that coach
   * has not nominated yet). The resolution modal needs it to render the
   * per-coach pickers/status and gate the server roll on BOTH sides. */
  mvpNominations: MvpNominations;
  /** The per-side resolution wizard cursor — the modal resumes at the persisted
   * step after a close/refresh (see `ResolutionState`). */
  resolutionState: ResolutionState;
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

/**
 * Computes the next turn indices after an end-turn (LM-4 turn caps/half flip).
 *
 * The turn number names the ROUND, shared by both sides: home T1 → away T1 →
 * home T2 → away T2. It advances ONLY when the next active side is the side
 * that STARTED the current round — half 1 starts with home, half 2 with the
 * away side (which receives the second-half kickoff). The half boundaries
 * therefore sit on the round STARTER's next appearance: half 1 ends after the
 * away side's turn 8 (home would start round 9), and the match finishes after
 * the home side's half-2 turn 8 (away would start round 9).
 */
function advanceTurnIndex(state: LiveMatchState): {
  nextActive: TeamSide;
  nextHalf: number;
  nextTurnNumber: number;
  final: boolean;
} {
  const roundStarter: TeamSide = state.half === 1 ? "home" : "away";
  const nextActive = other(state.activeSide);
  const nextTurnNumber = nextActive === roundStarter ? state.turnNumber + 1 : state.turnNumber;
  if (state.half === 1 && nextTurnNumber > TURNS_PER_HALF) {
    // Half-1 turn 8 completes → half 2, away starts turn 1.
    return { nextActive: "away", nextHalf: 2, nextTurnNumber: 1, final: false };
  }
  if (state.half === 2 && nextTurnNumber > TURNS_PER_HALF) {
    // Half-2 turn 8 completes → the match finishes.
    return { nextActive, nextHalf: 2, nextTurnNumber: TURNS_PER_HALF, final: true };
  }
  return { nextActive, nextHalf: state.half, nextTurnNumber, final: false };
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
 * RAU-39 (design B): casualties are recorded DIRECTLY by the coach who caused
 * them — there is no mandatory two-phase confirm anymore. The event is consumed
 * instantly and the rival's ✓/✗ acknowledgement is informational only (it never
 * blocks the match). The band is DERIVED server-side from the 1D16 roll via the
 * rulebook table (with the 1D6 attribute roll when permanent), never
 * client-chosen.
 */

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
    mvpNominations: state.mvpNominations,
    resolutionState: state.resolutionState,
  };
}
