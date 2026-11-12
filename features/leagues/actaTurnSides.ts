import { eventAuthorSide } from "@/lib/livePhase";
import type { LiveMatchEventDto } from "./api";

/**
 * Turn → side derivation (S3 — «los turnos deberian tener el color de cada
 * equipo»): ONE source for WHOSE turn a timeline card / header stepper pill
 * represents, so both surfaces tint by the same team color. The palette is
 * the established SIDE coding the event cards use (`--side`): home navy,
 * away red, both-or-unknown slate neutral (AGENTS.md rule 5 — no new colors).
 *
 * The rule (the timeline's original voting logic, extracted unchanged):
 *  - every capture votes the side that ACTED (`actingSideOf`): the acta's
 *    scored actions vote their own `side`, a CAUSED casualty votes its
 *    CAUSER's side, a self-inflicted one votes nothing;
 *  - a turn's side is the unanimous non-null vote across its captures —
 *    mixed votes or no acting capture → null ("AMBOS EQUIPOS");
 *  - while the match is live the ACTIVE turn belongs to `activeSide` — the
 *    vote can never contradict whose turn it is. Once not live the vote rules.
 */

/** The side a turn belongs to; null = both teams / not derivable. */
export type TurnSide = "home" | "away" | null;

/** BB2025: a half is 8 team-turn rounds (parity with the acta stepper). */
export const TURNS_PER_HALF = 8;

/** The live-state slice the derivation reads (active turn + status). */
export interface TurnSideActive {
  status: "pending" | "ready" | "live" | "finished";
  half: number;
  turnNumber: number;
  activeSide: "home" | "away";
}

/** The casualty causer's roster id, or null for self-inflicted (dodge/crowd). */
export function causerIdOf(event: LiveMatchEventDto): string | null {
  const causer = event.payload.causerRosterId;
  return typeof causer === "string" && causer ? causer : null;
}

/** The side that ACTED on an event (turn-owning vote): acting player's side. */
export function actingSideOf(event: LiveMatchEventDto): TurnSide {
  if (
    event.kind === "td" ||
    event.kind === "completion" ||
    event.kind === "foul" ||
    // LM-13 (Slice E, verifier defect 2): the acta-vocabulary scored actions
    // are the acting side's own captures — they vote the turn exactly like a
    // completion, never the AMBOS EQUIPOS fallback.
    event.kind === "interception" ||
    event.kind === "throwTeamMate" ||
    event.kind === "landedSafe"
  ) {
    return event.side;
  }
  if (event.kind === "casualty") {
    return eventAuthorSide(event.kind, event.side, causerIdOf(event));
  }
  return null;
}

/**
 * The turn's owning side from its captures alone: the unanimous non-null
 * `actingSideOf` vote — mixed votes or no acting capture → null.
 */
export function turnSideOfEvents(events: readonly LiveMatchEventDto[]): TurnSide {
  const votes = new Set(
    events.map(actingSideOf).filter((side): side is "home" | "away" => side != null),
  );
  return votes.size === 1 ? [...votes][0] : null;
}

/**
 * The owning side of ONE turn: the active coach's side while their turn is
 * live (unconditional), else the turn's event vote.
 */
export function turnSideOf(
  events: readonly LiveMatchEventDto[],
  half: number,
  turn: number,
  active: TurnSideActive,
): TurnSide {
  if (active.status === "live" && half === active.half && turn === active.turnNumber) {
    return active.activeSide;
  }
  return turnSideOfEvents(
    events.filter((event) => event.half === half && event.turnNumber === turn),
  );
}

/**
 * The owning side of EVERY turn of a half — index = turn - 1, length
 * `TURNS_PER_HALF`. The header stepper's tint source.
 */
export function turnSidesOf(
  events: readonly LiveMatchEventDto[],
  half: number,
  active: TurnSideActive,
): TurnSide[] {
  return Array.from({ length: TURNS_PER_HALF }, (_, index) =>
    turnSideOf(events, half, index + 1, active),
  );
}
