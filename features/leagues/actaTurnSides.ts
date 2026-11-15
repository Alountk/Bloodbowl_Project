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

/**
 * The coach who REGISTERED a capture (S10.4.2 — «quién la registró», the
 * capture-author badge): the side that acted (`actingSideOf`), falling back to
 * the event's own side for a causer-less casualty (the victim's coach typed
 * it). A side-less system capture has NO coach registrar (null).
 */
export function captureAuthorOf(event: LiveMatchEventDto): TurnSide {
  return actingSideOf(event) ?? event.side;
}

/**
 * S10.4 (T16 — L54 supersedes T8's capture-author grouping): the GAME TURN's
 * side of every capture — whose half-turn was being played when the action was
 * registered — keyed by event `seq`. Side-less captures are ABSENT (they keep
 * their neutral «AMBOS EQUIPOS» card).
 *
 * The derivation walks the feed's TURN BOUNDARIES — the rows a pass leaves
 * behind — because events carry no capture-time turn stamp and the event
 * writers are fixed surfaces (a payload stamp would break v5 hydration of old
 * saves, so the turn is derived instead):
 *
 *  - the DEMO reducer stamps ONE `turnStart` per «Fin Turno» AFTER the
 *    half-turn's captures (actaDemoReducer `endTurn` — a TRAILING marker whose
 *    side is the coach whose turn just ended): a capture belongs to the
 *    half-turn its NEXT in-pair `turnStart` closes;
 *  - the live store (`lib/liveMatch` turnTransition) stamps `turn` +
 *    `turnStart(nextActive)` at the OPENING of the new half-turn (a LEADING
 *    marker whose side is the incoming coach). The `turn` row is its signature
 *    (demo feeds never emit one): there a capture belongs to the half-turn its
 *    latest preceding `turnStart` opened;
 *  - the half-turn still being played has no closing boundary yet: it resolves
 *    to `active.activeSide` (so a rival's capture mid-turn groups live, with
 *    no re-group when the boundary lands);
 *  - feeds with NO boundary evidence (legacy v5 saves, constructed feeds)
 *    fall back to the capture author — the best remaining evidence, and
 *    exactly T8's attribution for old content where author == turn side.
 */
export function gameTurnSidesOf(
  events: readonly LiveMatchEventDto[],
  active: Pick<TurnSideActive, "status" | "half" | "turnNumber" | "activeSide">,
): ReadonlyMap<number, "home" | "away"> {
  const sides = new Map<number, "home" | "away">();
  const byPair = new Map<string, LiveMatchEventDto[]>();
  for (const event of events) {
    const key = `${event.half}:${event.turnNumber}`;
    const group = byPair.get(key) ?? [];
    group.push(event);
    byPair.set(key, group);
  }
  for (const group of byPair.values()) {
    const ordered = [...group].sort((a, b) => a.seq - b.seq);
    const boundaries = ordered.filter((event) => event.kind === "turnStart");
    // Live-store feeds lead their half-turn markers with a `turn` row (the
    // demo reducer never emits one) — mirrored reading below.
    const leading = ordered.some((event) => event.kind === "turn");
    for (const event of ordered) {
      if (event.side == null) continue; // neutral capture — no game turn
      const boundary = leading
        ? [...boundaries].reverse().find((mark) => mark.seq < event.seq)
        : boundaries.find((mark) => mark.seq > event.seq);
      const beingPlayed =
        active.status === "live" &&
        event.half === active.half &&
        event.turnNumber === active.turnNumber;
      const owner =
        boundary?.side ??
        (beingPlayed ? active.activeSide : captureAuthorOf(event)) ??
        event.side;
      sides.set(event.seq, owner);
    }
  }
  return sides;
}
