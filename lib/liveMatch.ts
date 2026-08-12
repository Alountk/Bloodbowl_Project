/**
 * Pure live-match state machine (LM-3/LM-4, D4/D5/D11).
 *
 * All transitions are pure: they take a `LiveMatchState` value and return a NEW
 * state with invariants applied (alternation, no double action, 1..8 turns per
 * half, half flip, TD-ends-turn, clock-0 auto-ends-turn, auto-finish). The
 * store (`lib/liveStore.ts`) persists the result atomically under the
 * optimistic `seq` guard; this module never touches Prisma, timers, or the hub
 * (`lib/result.ts` precedent — zero-mock testable).
 *
 * Clocks are league-configured (LM-5): duration comes from the League row, never
 * a constant; leagues with the option off run clockless (clock fields inert).
 * `clockStartedAt` is the single "active clock began running" timestamp; the
 * active team's remaining time = `persistedClock - (now - clockStartedAt)` while
 * `live && !paused`. Transitions take an optional `now` (epoch ms) so clock
 * resets are deterministic under test; the store passes `Date.now()`.
 */

export type TeamSide = "home" | "away";
export type LiveMatchStatus = "pending" | "live" | "finished";
export type LiveEventKind =
  | "start"
  | "turn"
  | "td"
  | "casualty"
  | "foul"
  | "endHalf"
  | "endMatch";

export interface LeagueClockConfig {
  turnClockEnabled: boolean;
  turnClockSeconds: 120 | 240 | 360;
}

/** Whether a fixture is a valid start target (LM-3): scheduled, not played, no result. */
export interface FixtureStartState {
  scheduled: boolean;
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
  homeClock: number;
  awayClock: number;
  homeScore: number;
  awayScore: number;
  paused: boolean;
  clockStartedAt: number | null;
  finishedAt: number | null;
  league: LeagueClockConfig;
  events: LiveEventRecord[];
}

/** DTO for subscribers/snapshot (LM-8). Clocks are null when disabled (LM-5). */
export interface LiveMatchViewState {
  seq: number;
  status: LiveMatchStatus;
  half: number;
  turnNumber: number;
  activeSide: TeamSide;
  turnClockEnabled: boolean;
  homeClock: number | null;
  awayClock: number | null;
  homeScore: number;
  awayScore: number;
  paused: boolean | null;
  finishedAt: number | null;
}

const TURNS_PER_HALF = 8;

function other(side: TeamSide): TeamSide {
  return side === "home" ? "away" : "home";
}

function throwInvalid(reason: string): never {
  throw new Error(reason);
}

/**
 * True when the live-match instance (by current status) may be started from the
 * given fixture. `status === "live"|"finished"` already counts as started; a
 * usable (scheduled, no result) fixture is required otherwise (LM-3).
 */
export function canStart(
  status: LiveMatchStatus,
  fixture: FixtureStartState,
  league: LeagueClockConfig,
): boolean {
  void league; // the clock config only matters once a match is live (LM-5)
  if (status === "live" || status === "finished") return false;
  return fixture.scheduled && !fixture.played && !fixture.result;
}

/**
 * Starts a pending live match: validates the fixture is a valid start target,
 * sets status live (half 1, turn 1, home active) and initializes both clocks to
 * the league duration (LM-5), starting the active home clock.
 */
export function startMatch(
  state: LiveMatchState,
  fixture: FixtureStartState,
  now: number = 0,
): LiveMatchState {
  if (!canStart(state.status, fixture, state.league)) {
    throwInvalid("match cannot start");
  }
  const clock = state.league.turnClockSeconds;
  return {
    ...state,
    status: "live",
    half: 1,
    turnNumber: 1,
    activeSide: "home",
    homeClock: state.league.turnClockEnabled ? clock : 0,
    awayClock: state.league.turnClockEnabled ? clock : 0,
    homeScore: 0,
    awayScore: 0,
    paused: false,
    finishedAt: null,
    clockStartedAt: state.league.turnClockEnabled ? now : null,
    events: [
      ...state.events,
      {
        seq: state.seq + 1,
        kind: "start",
        side: null,
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
 * active side (no double action / out-of-turn → throw). Flips the active side
 * and increments the turn; at half-1 turn 8 the half flips to 2 and away starts
 * turn 1; at half-2 turn 8 completion the match auto-finishes (D5). The new
 * active side's clock resets to the league duration when clocks are enabled.
 */
export function applyEndTurn(
  state: LiveMatchState,
  cmd: { side: TeamSide },
  now: number = state.clockStartedAt ?? 0,
): LiveMatchState {
  if (cmd.side !== state.activeSide) throwInvalid("out-of-turn");
  if (state.status !== "live") throwInvalid("match not live");
  const { nextActive, nextHalf, nextTurnNumber, final } = advanceTurnIndex(state);
  return turnTransition(state, { nextActive, nextHalf, nextTurnNumber, final }, now);
}

/**
 * Records a TD for `cmd.side`: increments that side's score, flips the active
 * side (TD auto-ends the turn per D11), resets the new active side's clock, and
 * appends the `td` event. A TD scored in half-2 turn 8 finishes the match (D5).
 */
export function applyTD(
  state: LiveMatchState,
  cmd: { side: TeamSide; playerRosterId: string },
  now: number = state.clockStartedAt ?? 0,
): LiveMatchState {
  if (cmd.side !== state.activeSide) throwInvalid("out-of-turn");
  if (state.status !== "live") throwInvalid("match not live");

  const homeScore = state.homeScore + (cmd.side === "home" ? 1 : 0);
  const awayScore = state.awayScore + (cmd.side === "away" ? 1 : 0);
  const tdEvent: LiveEventRecord = {
    seq: state.seq + 1,
    kind: "td",
    side: cmd.side,
    playerRosterId: cmd.playerRosterId,
    half: state.half,
    turnNumber: state.turnNumber,
    payload: {},
    at: now,
  };

  const scored = { ...state, homeScore, awayScore };

  // A TD in half-2 turn 8 finishes the match immediately (D5).
  if (state.half === 2 && state.turnNumber === TURNS_PER_HALF) {
    return {
      ...scored,
      status: "finished" as const,
      activeSide: other(state.activeSide),
      finishedAt: now,
      paused: false,
      clockStartedAt: null,
      events: [...scored.events, tdEvent],
    };
  }

  // Otherwise: flip the active side, reset clocks, append the td event.
  return {
    ...scored,
    activeSide: other(state.activeSide),
    homeClock: scored.league.turnClockEnabled ? scored.league.turnClockSeconds : 0,
    awayClock: scored.league.turnClockEnabled ? scored.league.turnClockSeconds : 0,
    paused: false,
    clockStartedAt: scored.league.turnClockEnabled ? now : null,
    events: [...scored.events, tdEvent],
  };
}

/**
 * Ends the match explicitly (concession/admin, D5), preserving the scoreboard.
 */
export function applyEndMatch(
  state: LiveMatchState,
  now: number = state.clockStartedAt ?? 0,
): LiveMatchState {
  if (state.status === "finished") throwInvalid("already finished");
  return {
    ...state,
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
 * D4 clock-expiry auto-end: when the ACTIVE team's clock reaches 0 (and clocks
 * are enabled, match live), the turn auto-ends with the SAME transition as
 * `applyEndTurn` — flip to the other side, half flip at turn 8, half-2 turn-8
 * finishes. A `turn`/`endHalf`/`endMatch` event records it (keeps the minimum
 * taxonomy — no separate `timeout` event). No-op when the active clock has time
 * left, when clocks are disabled (LM-5 clockless leagues never tick/auto-end),
 * or when the match is not live.
 */
export function autoEndTurnOnClockZero(
  state: LiveMatchState,
  now: number = state.clockStartedAt ?? 0,
): LiveMatchState {
  if (state.status !== "live") return state;
  if (!state.league.turnClockEnabled) return state;
  const activeClock = state.activeSide === "home" ? state.homeClock : state.awayClock;
  if (activeClock > 0) return state;
  // Same transition as endTurn: advance indices, reset clocks, append the event.
  return turnTransition(state, advanceTurnIndex(state), now);
}

/** Computes the next turn indices after `applyEndTurn` (LM-4 turn caps/half flip). */
function advanceTurnIndex(state: LiveMatchState): {
  nextActive: TeamSide;
  nextHalf: number;
  nextTurnNumber: number;
  final: boolean;
} {  const turnNumber = state.turnNumber + 1;
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

/** Shared end-of-turn transition: applies indices, resets clocks, appends the event. */
function turnTransition(
  state: LiveMatchState,
  n: { nextActive: TeamSide; nextHalf: number; nextTurnNumber: number; final: boolean },
  now: number,
): LiveMatchState {
  const kind: LiveEventKind = n.final ? "endMatch" : n.nextHalf !== state.half ? "endHalf" : "turn";
  const enabled = state.league.turnClockEnabled;
  return {
    ...state,
    activeSide: n.nextActive,
    half: n.nextHalf,
    turnNumber: n.nextTurnNumber,
    status: n.final ? "finished" : "live",
    finishedAt: n.final ? now : null,
    homeClock: enabled ? state.league.turnClockSeconds : 0,
    awayClock: enabled ? state.league.turnClockSeconds : 0,
    paused: false,
    clockStartedAt: enabled ? now : null,
    events: [
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
    ],
  };
}

/**
 * Maps the state to the subscriber DTO (LM-8). Clocks are `null` and `paused`
 * is `null` when the league disables clocks (LM-5). When clocks are enabled, the
 * ACTIVE team's clock is reduced by the elapsed time since `clockStartedAt`;
 * the non-active clock is untouched; a paused clock doesn't tick.
 */
export function toLiveViewState(
  state: LiveMatchState,
  now: number,
): LiveMatchViewState {
  if (!state.league.turnClockEnabled) {
    return {
      seq: state.seq,
      status: state.status,
      half: state.half,
      turnNumber: state.turnNumber,
      activeSide: state.activeSide,
      turnClockEnabled: false,
      homeClock: null,
      awayClock: null,
      homeScore: state.homeScore,
      awayScore: state.awayScore,
      paused: null,
      finishedAt: state.finishedAt,
    };
  }

  const elapsed =
    state.paused || state.clockStartedAt == null ? 0 : Math.max(now - state.clockStartedAt, 0);
  const homeClock = state.homeClock - (state.activeSide === "home" ? elapsed : 0);
  const awayClock = state.awayClock - (state.activeSide === "away" ? elapsed : 0);

  return {
    seq: state.seq,
    status: state.status,
    half: state.half,
    turnNumber: state.turnNumber,
    activeSide: state.activeSide,
    turnClockEnabled: true,
    homeClock: Math.max(homeClock, 0),
    awayClock: Math.max(awayClock, 0),
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    paused: state.paused,
    finishedAt: state.finishedAt,
  };
}
