"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { resolveInjury } from "@/lib/rules/injuries";
import { CASUALTY_CAUSES, eventAuthorSide, type CasualtyCause } from "@/lib/livePhase";
import { isDisplayEvent } from "@/lib/liveMatch";
import { deriveMinute } from "@/lib/liveFeed";
import {
  bothDownMarkerLabel,
  causeLabel,
  eventSpp,
  KICKOFF_OUTCOME_LABELS,
  liveEventLabel,
} from "./liveEventLabels";
import {
  buildGuidedCommand,
  CAUSES_REQUIRING_CAUSER,
  positionName,
  SELF_CAUSES,
  type GuidedSelections,
} from "./liveActionEntry";
import { RollStepper } from "./rollStepper";
import type { LiveCommand, LiveMatchEventDto, MatchTeamDetail } from "./api";

/**
 * Acta en Vivo turn timeline (MVA-3 timeline half + MVA-4, T8 Slice B): the
 * "MAIN CONTENT: TURN TIMELINE" section of
 * `design/match-report-redesign/08-acta-en-vivo.html` — per-turn cards over
 * the live feed, newest turn first:
 *
 *   - card header: "T6 • GOUGED EYE" (per-half turn tag + acting team) with
 *     the EN JUEGO / COMPLETADO / CERRADO state chip and "Min N'" label;
 *     left accent red on the active card, navy on the rest;
 *   - event rows (live/completed cards): kind badge (+1 TD / CASUALTY /
 *     +1 SPP…), bold player + muted role/number, one-line description and
 *     the SPP marker on the right — captured data renders WITHOUT re-entry
 *     (S3);
 *   - compact icon + sentence rows on closed cards (T4 style);
 *   - the MVA-4 pending injury-roll callout inside the card owning a casualty
 *     whose 1D16 is still missing: warning label, player + armor-break line,
 *     the "TIRAR 1D16 DE LESIÓN" action and the BB2025 D16 severity table
 *     (S1 — bands verbatim).
 *
 * Turn states: the ACTIVE turn renders EN JUEGO; while live, the turn right
 * before it renders COMPLETADO and older turns CERRADO (the MVA-3 scenario:
 * "turns 1-4 closed, turn 5 completed, turn 6 active"); on a finished match
 * the last turn renders COMPLETADO and every older one CERRADO. Card titles
 * fall back to "AMBOS EQUIPOS" when a turn's events span both teams.
 *
 * The pending-roll action resolves through the EXISTING flow — the shared
 * `RollStepper` (1D16 + conditional 1D6) feeding the guided `casualty`
 * command shape (`buildGuidedCommand` → the live action API): the server
 * keeps deriving the band (`bb2025-rules`), nothing rolls client-side and no
 * new endpoint exists. Copy is Spanish per the match-section convention;
 * tokens stay rulebook-light (AGENTS.md rule 5) — the artboard's band tints
 * map 1:1 onto the existing `bruise-*…dead-*` tokens. Icons: inline Material
 * Symbols paths verbatim from artboard 08 (viewBox 0 0 960 960). Motion (T10
 * Slice D, MVA-6): the artboard 09 keyframes live in `app/globals.css` under
 * the namespaced `.acta-motion-*` classes (reduced-motion fallback included)
 * and are decorative only — see `actaMotion.test.tsx`.
 */

/**
 * MVA-6 row-highlight source: the seqs that JUST arrived in the feed (the
 * artboard's `highlight-flash` on the appended row — it clears when the next
 * capture lands). Purely presentational state: no timers, no animation-event
 * dependency, nothing waits on frames.
 */
function useFreshSeqs(events: readonly LiveMatchEventDto[]): ReadonlySet<number> {
  const seenMax = useRef<number | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<number>>(() => new Set());
  useEffect(() => {
    const max = events.reduce((highest, event) => Math.max(highest, event.seq), 0);
    if (seenMax.current == null) {
      // First paint: every row is already there — none is "just arrived".
      seenMax.current = max;
      return;
    }
    if (max > seenMax.current) {
      const added = new Set(
        events.filter((event) => event.seq > (seenMax.current ?? 0)).map((event) => event.seq),
      );
      seenMax.current = max;
      setFresh(added);
    }
  }, [events]);
  return fresh;
}

/** Material Symbols paths (960 grid) copied from artboard 08 — inline SVG only. */
const ICON_PATHS = {
  warning:
    "m40-120 440-760 440 760H40Zm138-80h604L480-720 178-200Zm302-40q17 0 28.5-11.5T520-280q0-17-11.5-28.5T480-320q-17 0-28.5 11.5T440-280q0 17 11.5 28.5T480-240Zm-40-120h80v-200h-80v200Zm40-100Z",
  dice: "M300-240q25 0 42.5-17.5T360-300q0-25-17.5-42.5T300-360q-25 0-42.5 17.5T240-300q0 25 17.5 42.5T300-240Zm0-360q25 0 42.5-17.5T360-660q0-25-17.5-42.5T300-720q-25 0-42.5 17.5T240-660q0 25 17.5 42.5T300-600Zm180 180q25 0 42.5-17.5T540-480q0-25-17.5-42.5T480-540q-25 0-42.5 17.5T420-480q0 25 17.5 42.5T480-420Zm180 180q25 0 42.5-17.5T720-300q0-25-17.5-42.5T660-360q-25 0-42.5 17.5T600-300q0 25 17.5 42.5T660-240Zm0-360q25 0 42.5-17.5T720-660q0-25-17.5-42.5T660-720q-25 0-42.5 17.5T600-660q0 25 17.5 42.5T660-600ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z",
  foul: "M440-200q-100 0-170-70t-70-170q0-11 1-22t3-22q-5 2-12 3t-12 1q-42 0-71-29t-29-71q0-42 27.5-71t69.5-29q33 0 59.5 18.5T274-614q33-30 75.5-48t90.5-18h440v160H680v80q0 100-70 170t-170 70ZM180-540q17 0 28.5-11.5T220-580q0-17-11.5-28.5T180-620q-17 0-28.5 11.5T140-580q0 17 11.5 28.5T180-540Zm260 240q58 0 99-41t41-99q0-58-41-99t-99-41q-58 0-99 41t-41 99q0 58 41 99t99 41Zm0-60q33 0 56.5-23.5T520-440q0-33-23.5-56.5T440-520q-33 0-56.5 23.5T360-440q0 33 23.5 56.5T440-360Zm0-80Z",
  send: "M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z",
  medical:
    "M160-80q-33 0-56.5-23.5T80-160v-480q0-33 23.5-56.5T160-720h160v-80q0-33 23.5-56.5T400-880h160q33 0 56.5 23.5T640-800v80h160q33 0 56.5 23.5T880-640v480q0 33-23.5 56.5T800-80H160Zm0-80h640v-480H160v480Zm240-560h160v-80H400v80ZM160-160v-480 480Zm280-200v120h80v-120h120v-80H520v-120h-80v120H320v80h120Z",
  run: "M480-480ZM362-202 202-362q-3 38-1.5 79t7.5 73q23 7 69.5 9t84.5-1Zm96-16q59-13 106-37t82-59q34-34 58-80.5T742-500L500-742q-57 14-103 38.5T316-644q-35 35-59.5 81.5T218-458l240 240Zm-62-122-56-56 224-224 56 56-224 224Zm362-256q4-39 2.5-81t-8.5-73q-23-8-69.5-10t-84.5 2l160 162ZM310-120q-57 0-104-8.5T148-148q-11-12-19.5-60T120-314q0-119 36-220.5T258-702q66-66 169-102t223-36q58 0 104.5 8.5T812-812q11 12 19.5 60t8.5 108q0 117-36 218.5T702-258q-65 65-168 101.5T310-120Z",
  dots: "M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z",
} as const;

function ActaIcon({
  name,
  className = "",
}: {
  name: keyof typeof ICON_PATHS;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 960 960" aria-hidden="true" focusable="false" className={className}>
      <path d={ICON_PATHS[name]} fill="currentColor" />
    </svg>
  );
}

/**
 * S1 (BB2025 D16 severity table, bands VERBATIM): the five rows of the
 * callout's legend. `rowClass` maps the artboard's per-band tints onto the
 * existing `bruise-*…dead-*` tokens (identical values — no new colors).
 */
export const SEVERITY_BANDS = [
  {
    roll: "1-8",
    kind: "bruise",
    label: "Magullado (Sin efecto duradero)",
    rowClass: "bg-bruise-fill text-bruise-text",
  },
  {
    roll: "9-10",
    kind: "apaleado",
    label: "Apaleado (Pierde el resto del partido)",
    rowClass: "bg-apaleado-fill text-apaleado-text",
  },
  {
    roll: "11-12",
    kind: "grave",
    label: "Grave (Pasa a la enfermería)",
    rowClass: "bg-grave-fill text-grave-text",
  },
  {
    roll: "13-14",
    kind: "permanent",
    label: "Permanente (-1 Característica permanente)",
    rowClass: "bg-permanent-fill text-permanent-text",
  },
  {
    roll: "15-16",
    kind: "dead",
    label: "Muerto (Ataúd / Regeneración requerida)",
    rowClass: "bg-dead-fill text-dead-text",
  },
] as const;

/** A casualty whose 1D16 injury roll was never captured → roll pending (MVA-4). */
export function isPendingInjuryRoll(event: LiveMatchEventDto): boolean {
  return event.kind === "casualty" && typeof event.payload.roll16 !== "number";
}

/** The casualty victim's roster id (payload first, feed field fallback). */
function victimIdOf(event: LiveMatchEventDto): string | null {
  const fromPayload = event.payload.victimRosterId;
  if (typeof fromPayload === "string" && fromPayload) return fromPayload;
  return event.playerRosterId;
}

/** The casualty causer's roster id, or null for self-inflicted (dodge/crowd). */
function causerIdOf(event: LiveMatchEventDto): string | null {
  const causer = event.payload.causerRosterId;
  return typeof causer === "string" && causer ? causer : null;
}

/**
 * B4: rebuilds the RECORDED casualty's own `casualty` command shape plus the
 * rolled 1D16(+1D6) — the EXISTING pending-roll resolution flow. The command
 * goes through `buildGuidedCommand` (the live action API builder the dock
 * uses), so the shape, the band derivation (`bb2025-rules`) and the server
 * semantics stay untouched; only the roll values are added. Null when the
 * event carries no resolvable cause/victim (defensive — never throws).
 */
export function injuryRollCommand(
  event: LiveMatchEventDto,
  roll16: number,
  roll6?: number,
): LiveCommand | null {
  const cause = event.payload.cause;
  const victimId = victimIdOf(event);
  if (
    event.kind !== "casualty" ||
    event.side == null ||
    typeof cause !== "string" ||
    !(CASUALTY_CAUSES as readonly string[]).includes(cause) ||
    victimId == null
  ) {
    return null;
  }
  const causerId = causerIdOf(event);
  const selections: GuidedSelections = {
    cause: cause as CasualtyCause,
    causerId: causerId ?? undefined,
    victimId,
    roll16,
    roll6: roll6 ?? "",
  };
  if (causerId == null) {
    return buildGuidedCommand("selfInflicted", event.side, selections);
  }
  // The caused / both-down forms are authored from the CAUSER's side
  // (`buildGuidedCommand` flips it to the victim's side, the command's `side`).
  const authorSide = event.side === "home" ? "away" : "home";
  return buildGuidedCommand(
    event.payload.bothDown === true ? "bothDown" : "casualty",
    authorSide,
    selections,
  );
}

/**
 * Whether `viewerSide` may record this casualty's injury roll RIGHT NOW —
 * true ONLY where the live route accepts the exact command
 * `injuryRollCommand` rebuilds (MVA-4 "Roll action only where the command is
 * accepted" — never a button whose command would 409):
 *  - self-inflicted (causer-less dodge/crowd): the victim's own coach, any
 *    turn window — the route's own-player form is self-inflicted only
 *    ("Self-inflicted casualties are dodge/crowd only");
 *  - caused record: the CAUSER side (author) while it is the ACTIVE coach —
 *    the route rejects the own-player form and non-active rival-victim ones;
 *  - both-down record (D1): the author side only while it is NOT the active
 *    coach — the marker is rejected on the active coach's record.
 * Spectators/admins never see the action.
 */
export function canResolveInjuryRoll(
  event: LiveMatchEventDto,
  viewerSide: "home" | "away" | null,
  active: { status: string; activeSide: "home" | "away" },
): boolean {
  if (active.status !== "live" || viewerSide == null || event.kind !== "casualty" || event.side == null) {
    return false;
  }
  const cause = typeof event.payload.cause === "string" ? (event.payload.cause as CasualtyCause) : null;
  const causerId = causerIdOf(event);
  if (causerId == null) {
    // Self-inflicted form (causer-less): the victim's own coach only, and only
    // for dodge/crowd — any other own-player form 409s at the shape gate.
    return viewerSide === event.side && cause != null && SELF_CAUSES.includes(cause);
  }
  // Caused form: only the CAUSER side (author) may ever submit it — the
  // victim's coach is rejected ("Self-inflicted casualties are dodge/crowd
  // only") and so is any rival-victim record outside the windows below.
  const authorSide = event.side === "home" ? "away" : "home";
  if (viewerSide !== authorSide) return false;
  if (event.payload.bothDown === true) {
    // D1: the both-down marker is accepted ONLY from the NON-active coach.
    return active.activeSide !== viewerSide;
  }
  // Plain caused form: accepted ONLY while the author side is the active coach.
  return active.activeSide === viewerSide && cause != null && CAUSES_REQUIRING_CAUSER.has(cause);
}

export type TurnCardState = "live" | "completed" | "closed";

export interface ActaTurnCard {
  /** Stable map key: `{half}:{turnNumber}`. */
  key: string;
  half: number;
  turnNumber: number;
  state: TurnCardState;
  /** The side whose turn this was (author votes) — null = "AMBOS EQUIPOS". */
  actingSide: "home" | "away" | null;
  /** The latest capture timestamp of the turn (the card's minute). */
  minuteAt: number;
  /** Display events in capture order (seq asc). */
  events: LiveMatchEventDto[];
  /** Casualties of this turn still awaiting their 1D16 (MVA-4). */
  pendingInjuries: LiveMatchEventDto[];
}

/** The side that ACTED on an event (turn-owning vote): acting player's side. */
function actingSideOf(event: LiveMatchEventDto): "home" | "away" | null {
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

/** BB2025: a half is 8 team-turn rounds (parity with the acta stepper). */
const TURNS_PER_HALF = 8;

/**
 * B1: groups the feed into per-turn cards, NEWEST TURN FIRST. Turns with no
 * display event get no card, except the active one (always shown so the
 * EN JUEGO chip is never missing while live). States follow the MVA-3
 * scenario — active → `live`, the turn right before it (while live) →
 * `completed`, everything older → `closed`; once finished the last turn is
 * `completed` and the rest `closed`. A casualty awaiting its 1D16 lands in
 * `pendingInjuries` unless a LATER capture already resolved the same victim
 * (then the resolved row renders it — never a stale callout).
 */
export function turnCardsOf(
  events: readonly LiveMatchEventDto[],
  active: {
    status: "pending" | "ready" | "live" | "finished";
    half: number;
    turnNumber: number;
    activeSide: "home" | "away";
  },
): ActaTurnCard[] {
  const byTurn = new Map<string, ActaTurnCard>();
  const ensure = (half: number, turnNumber: number): ActaTurnCard => {
    const key = `${half}:${turnNumber}`;
    let card = byTurn.get(key);
    if (card == null) {
      card = {
        key,
        half,
        turnNumber,
        state: "closed",
        actingSide: null,
        minuteAt: 0,
        events: [],
        pendingInjuries: [],
      };
      byTurn.set(key, card);
    }
    return card;
  };

  const visible = events.filter((event) => isDisplayEvent(event.kind));
  for (const event of visible) {
    const card = ensure(event.half, event.turnNumber);
    card.events.push(event);
    card.minuteAt = Math.max(card.minuteAt, event.at);
  }

  const activeKey = `${active.half}:${active.turnNumber}`;
  const predecessorKey =
    active.turnNumber > 1
      ? `${active.half}:${active.turnNumber - 1}`
      : `${active.half - 1}:${TURNS_PER_HALF}`;
  if (active.status === "live") ensure(active.half, active.turnNumber);

  for (const card of byTurn.values()) {
    if (card.key === activeKey) {
      card.state = active.status === "live" ? "live" : "completed";
      if (card.state === "live") card.actingSide = active.activeSide;
    } else if (active.status === "live" && card.key === predecessorKey) {
      card.state = "completed";
    }
    if (card.actingSide == null && card.state !== "live") {
      const votes = new Set(card.events.map(actingSideOf).filter((side) => side != null));
      card.actingSide = votes.size === 1 ? [...votes][0] : null;
    }
  }

  // Pending casualties cleared by a later resolved capture of the same victim.
  for (const card of byTurn.values()) {
    card.pendingInjuries = card.events.filter((event) => {
      if (!isPendingInjuryRoll(event)) return false;
      const victim = victimIdOf(event);
      return !visible.some(
        (other) =>
          other.kind === "casualty" &&
          other.seq > event.seq &&
          typeof other.payload.roll16 === "number" &&
          victim != null &&
          victimIdOf(other) === victim,
      );
    });
  }

  return [...byTurn.values()].sort(
    (a, b) => b.half - a.half || b.turnNumber - a.turnNumber,
  );
}

// --- Event row derivation -------------------------------------------------

interface ResolvedPlayer {
  name: string;
  dorsal: number;
  position: string;
}

/** Roster lookup: the dorsal is the served-array index + 1 (D21). */
function resolvePlayer(team: MatchTeamDetail, id: string | null): ResolvedPlayer | null {
  if (id == null) return null;
  const index = team.players.findIndex((p) => p.rosterPlayerId === id);
  if (index < 0) return null;
  const player = team.players[index];
  return {
    name: player.name,
    dorsal: index + 1,
    position: positionName(team.raceId, player.positionalKey),
  };
}

type TeamMap = { home: MatchTeamDetail; away: MatchTeamDetail };

function opposite(side: "home" | "away"): "home" | "away" {
  return side === "home" ? "away" : "home";
}

/** The kind badge (artboard: "+1 TD" navy · "CASUALTY" red · "+1 SPP" gray). */
function badgeFor(event: LiveMatchEventDto): { label: string; className: string } {
  switch (event.kind) {
    case "td":
      return { label: "+1 TD", className: "bg-navy text-white" };
    case "casualty":
      return { label: "CASUALTY", className: "bg-red text-white" };
    case "completion":
      return { label: "+1 SPP", className: "bg-slate-strong text-panel" };
    default:
      return {
        label: liveEventLabel(event),
        className: "border border-border bg-fill-hover text-slate-strong",
      };
  }
}

/** The right-hand SPP marker (TD +3 · casualty +2 · completion +1 …). */
function sppMarkerFor(event: LiveMatchEventDto): { text: string; className: string } | null {
  // A pending casualty shows the flat causal +2 (artboard T5 row); a resolved
  // one follows the shared `eventSpp` band rule (LM-18).
  const value = isPendingInjuryRoll(event) ? 2 : eventSpp(event);
  if (value <= 0) return null;
  return {
    text: `+${value} SPP`,
    className: event.kind === "casualty" ? "text-red" : "text-navy",
  };
}

/** The one-line event description (captured data, never re-entered — S3). */
function descriptionFor(
  event: LiveMatchEventDto,
  teams: TeamMap,
): string {
  const bothDown = bothDownMarkerLabel(event.payload);
  const suffix = bothDown ? ` (${bothDown})` : "";
  switch (event.kind) {
    case "td":
      return "Touchdown anotado.";
    case "completion":
      return "Pase completado con éxito.";
    case "foul": {
      const victim = event.side ? resolvePlayer(teams[opposite(event.side)], victimIdOf(event)) : null;
      return victim ? `Falta sobre ${victim.name} (#${victim.dorsal}).` : "Falta cometida.";
    }
    case "casualty": {
      const cause = typeof event.payload.cause === "string" ? causeLabel(event.payload.cause) : "Baja";
      const roll16 = event.payload.roll16;
      if (typeof roll16 === "number") {
        const outcome = resolveInjury(roll16);
        return `${cause}${suffix} · Tirada 1D16: ${roll16} · ${bandLabel(outcome.kind)}`;
      }
      return `${cause}${suffix} · Tirada de lesión pendiente.`;
    }
    case "mvp":
      return "MVP del partido.";
    case "expensive_mistake": {
      const outcome = typeof event.payload.outcome === "string" ? event.payload.outcome : "";
      return `Error costoso: ${KICKOFF_OUTCOME_LABELS[outcome] ?? outcome}.`;
    }
    case "fan_factor":
      return "Factor de afición actualizado.";
    case "concede":
      return "Rendición propuesta.";
    case "journeyman":
      return "Novatos unidos a la plantilla.";
    case "endHalf":
      return "Fin de la mitad.";
    case "endMatch":
      return "Fin del partido.";
    default:
      return `${liveEventLabel(event)}.`;
  }
}

/** The rulebook Spanish band label for the resolved roll line. */
function bandLabel(kind: ReturnType<typeof resolveInjury>["kind"]): string {
  switch (kind) {
    case "bruise":
      return "Magullado";
    case "apaleado":
      return "Apaleado";
    case "grave":
      return "Grave";
    case "permanent":
      return "Permanente";
    case "dead":
      return "Muerto";
  }
}

/** The bold player line: name + muted "(Role #Dorsal)". */
function playerLine(
  player: ResolvedPlayer | null,
  fallback: string,
): ReactNode {
  if (player == null) return fallback;
  return (
    <>
      <span className="font-medium">{player.name}</span>{" "}
      <span className="font-normal text-slate">
        ({player.position} #{player.dorsal})
      </span>
    </>
  );
}

function EventRow({
  event,
  teams,
  highlight,
  fresh,
}: {
  event: LiveMatchEventDto;
  teams: TeamMap;
  highlight: boolean;
  fresh: boolean;
}) {
  const badge = badgeFor(event);
  const marker = sppMarkerFor(event);
  let subject: ReactNode;
  if (event.kind === "casualty" && event.side != null) {
    // The causal line (artboard T5): "Grashnak Viletooth (#4) → Ugluk (#6)".
    const causer = resolvePlayer(teams[opposite(event.side)], causerIdOf(event));
    const victim = resolvePlayer(teams[event.side], victimIdOf(event));
    const victimText = victim ? `${victim.name} (#${victim.dorsal})` : "—";
    subject =
      causer != null ? (
        <span className="font-bold">
          {causer.name} (#{causer.dorsal}) → {victimText}
        </span>
      ) : (
        <span className="font-bold">{victimText}</span>
      );
  } else {
    const team = event.side ? teams[event.side] : null;
    subject = playerLine(
      team ? resolvePlayer(team, event.playerRosterId) : null,
      liveEventLabel(event),
    );
  }
  return (
    <div
      data-testid="acta-event-row"
      data-kind={event.kind}
      className={`flex items-start gap-2.5 rounded-sm border p-2 ${
        highlight ? "border-red/30 bg-red/5" : "border-border bg-white"
      } ${fresh ? "acta-motion-row-flash" : ""}`}
    >
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badge.className}`}
      >
        {badge.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink">{subject}</p>
        <p className="text-xs text-slate">{descriptionFor(event, teams)}</p>
      </div>
      {marker != null ? (
        <span className={`shrink-0 text-[11px] font-bold ${marker.className}`}>{marker.text}</span>
      ) : null}
    </div>
  );
}

/** Compact icon + sentence row (closed cards, T4 style). */
function CompactRow({
  event,
  teams,
  fresh,
}: {
  event: LiveMatchEventDto;
  teams: TeamMap;
  fresh: boolean;
}) {
  // The victim is the subject on a casualty row; the acting player otherwise.
  const subjectId = event.kind === "casualty" ? victimIdOf(event) : event.playerRosterId;
  const team = event.side ? teams[event.side] : null;
  const player = team ? resolvePlayer(team, subjectId) : null;
  const name = player ? `${player.name} (#${player.dorsal})` : event.side ? teams[event.side].name : "—";
  const icon: keyof typeof ICON_PATHS =
    event.kind === "td"
      ? "run"
      : event.kind === "completion"
        ? "send"
        : event.kind === "foul"
          ? "foul"
          : event.kind === "casualty"
            ? "medical"
            : "dots";
  return (
    <div
      data-testid="acta-event-row"
      data-kind={event.kind}
      data-compact="true"
      className={`flex items-start gap-2 border-b border-border pb-2 text-sm text-ink last:border-0 last:pb-0 ${
        fresh ? "acta-motion-row-flash" : ""
      }`}
    >
      <ActaIcon name={icon} className="mt-0.5 size-4 shrink-0 text-slate" />
      <p className="min-w-0 flex-1">
        <strong className="text-navy">{name}</strong> {compactSentence(event, teams)}
      </p>
    </div>
  );
}

function compactSentence(event: LiveMatchEventDto, teams: TeamMap): string {
  switch (event.kind) {
    case "td":
      return "anotó Touchdown (+3 SPP).";
    case "completion":
      return "completó Pase con éxito (+1 SPP).";
    case "foul": {
      const victim = event.side ? resolvePlayer(teams[opposite(event.side)], victimIdOf(event)) : null;
      return victim
        ? `realizó falta sobre ${victim.name} (#${victim.dorsal}).`
        : "realizó una falta.";
    }
    case "casualty": {
      const cause = typeof event.payload.cause === "string" ? causeLabel(event.payload.cause) : "baja";
      const roll16 = event.payload.roll16;
      const outcome = typeof roll16 === "number" ? bandLabel(resolveInjury(roll16).kind) : "tirada de lesión pendiente";
      return `sufrió una baja (${cause}) — ${outcome}.`;
    }
    default:
      return `${descriptionFor(event, teams)}`;
  }
}

// --- Callout (MVA-4) ------------------------------------------------------

function InjuryRollCallout({
  event,
  teams,
  viewerSide,
  active,
  onSubmit,
}: {
  event: LiveMatchEventDto;
  teams: TeamMap;
  viewerSide: "home" | "away" | null;
  active: { status: string; activeSide: "home" | "away" };
  onSubmit?: (command: LiveCommand) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [roll16, setRoll16] = useState<number | "">("");
  const [roll6, setRoll6] = useState<number | "">("");
  const canRoll = canResolveInjuryRoll(event, viewerSide, active) && onSubmit != null;

  const fire = (r16: number, r6?: number) => {
    const command = injuryRollCommand(event, r16, r6);
    setOpen(false);
    setRoll16("");
    setRoll6("");
    if (command != null && onSubmit != null) void onSubmit(command);
  };

  const handleRoll16 = (n: number) => {
    setRoll16(n);
    setRoll6("");
    // Auto-fire the moment the last required pick completes the command —
    // same behavior as the guided dock flow (the 1D6 only for Permanente).
    if (resolveInjury(n).kind !== "permanent") fire(n);
  };

  const handleRoll6 = (n: number) => {
    setRoll6(n);
    if (roll16 !== "") fire(Number(roll16), n);
  };

  const victim =
    event.side != null ? resolvePlayer(teams[event.side], victimIdOf(event)) : null;
  const cause = typeof event.payload.cause === "string" ? causeLabel(event.payload.cause) : "combate";

  return (
    <div
      data-testid="acta-injury-callout"
      className="acta-motion-pulse-glow space-y-2.5 rounded-sm border-2 border-red bg-panel p-3"
    >
      <div className="flex items-center gap-1.5 text-red">
        <ActaIcon name="warning" className="size-4.5" />
        <span className="text-[10px] font-bold uppercase tracking-wider">
          TIRADA DE LESIÓN PENDIENTE (REGLAMENTO BB2025)
        </span>
      </div>
      <p className="text-sm font-medium text-ink">
        Tirada de lesión requerida para{" "}
        <strong className="text-navy">
          {victim ? `${victim.name} (${victim.position} #${victim.dorsal})` : "el jugador"}
        </strong>{" "}
        tras romperse armadura ({cause}).
      </p>
      {canRoll ? (
        <>
          <button
            type="button"
            data-testid="acta-injury-roll"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center justify-center gap-2 rounded bg-navy px-3 py-2.5 text-sm font-bold uppercase tracking-wider text-white hover:bg-navy-hover"
          >
            <ActaIcon
              name="dice"
              className={`size-4.5 ${open ? "acta-motion-dice-shake" : ""}`}
            />
            <span>TIRAR 1D16 DE LESIÓN</span>
          </button>
          {open ? (
            <RollStepper roll16={roll16} roll6={roll6} onRoll16={handleRoll16} onRoll6={handleRoll6} />
          ) : null}
        </>
      ) : null}
      <div
        data-testid="acta-severity-table"
        className="overflow-hidden rounded-sm border border-border text-[11px]"
      >
        <div className="flex justify-between border-b border-border bg-fill-hover px-2 py-1 font-bold uppercase text-slate-strong">
          <span>Resultado 1D16</span>
          <span>Severidad BB2025</span>
        </div>
        <div className="divide-y divide-border font-medium">
          {SEVERITY_BANDS.map((band) => (
            <div
              key={band.roll}
              className={`flex items-center justify-between px-2 py-1 ${band.rowClass}`}
            >
              <span>{band.roll}</span>
              <span className="font-bold">{band.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Timeline -------------------------------------------------------------

export interface ActaTurnTimelineProps {
  events: readonly LiveMatchEventDto[];
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
  /** The kickoff anchor for the "Min N'" labels (null → 0'). */
  startedAt: number | null;
  /** The current wall clock (the live card's minute). */
  now: number;
  /** The live-match state slice the turn states derive from. */
  active: {
    status: "pending" | "ready" | "live" | "finished";
    half: number;
    turnNumber: number;
    activeSide: "home" | "away";
  };
  /** The viewing coach's side (null → spectator/admin, no roll action). */
  viewerSide: "home" | "away" | null;
  /** The EXISTING live command pathway (`sendLiveCommand` via the V2 `act`). */
  onSubmit?: (command: LiveCommand) => Promise<void> | void;
}

const STATE_CHIP: Record<TurnCardState, { label: string; className: string }> = {
  live: { label: "EN JUEGO", className: "bg-red text-white" },
  completed: {
    label: "COMPLETADO",
    className: "border border-border-subtle bg-fill-hover text-slate-strong",
  },
  closed: { label: "CERRADO", className: "border border-border bg-fill-hover text-slate" },
};

export function ActaTurnTimeline({
  events,
  homeTeam,
  awayTeam,
  startedAt,
  now,
  active,
  viewerSide,
  onSubmit,
}: ActaTurnTimelineProps) {
  const teams: TeamMap = { home: homeTeam, away: awayTeam };
  const cards = turnCardsOf(events, active);
  const fresh = useFreshSeqs(events);
  return (
    <div data-testid="acta-turn-timeline" className="flex flex-col gap-3 px-4 py-3">
      {cards.map((card, index) => {
        const chip = STATE_CHIP[card.state];
        const teamLabel = card.actingSide ? teams[card.actingSide].name : "AMBOS EQUIPOS";
        const minuteAt = card.state === "live" ? now : card.minuteAt;
        const minute = startedAt != null ? deriveMinute(minuteAt, startedAt) : "0'";
        return (
          <article
            key={card.key}
            data-testid="acta-turn-card"
            data-half={card.half}
            data-turn={card.turnNumber}
            data-state={card.state}
            className={`acta-motion-fade-in-up acta-motion-stagger-${Math.min(index + 1, 5)} overflow-hidden rounded-sm border border-border border-l-4 bg-panel shadow-sm ${
              card.state === "live" ? "border-l-red" : "border-l-navy"
            }`}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border bg-fill-hover px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={`truncate font-display text-[15px] uppercase tracking-wide ${
                    card.state === "closed" ? "text-slate-strong" : "text-ink"
                  }`}
                >
                  T{card.turnNumber} • {teamLabel}
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${chip.className}`}
                >
                  {chip.label}
                </span>
              </div>
              <span className="shrink-0 text-[11px] text-slate">Min {minute}</span>
            </div>
            {card.events.length > 0 || card.pendingInjuries.length > 0 ? (
              <div className="space-y-2.5 p-3">
                {card.events.map((event) =>
                  card.state === "closed" ? (
                    <CompactRow
                      key={event.seq}
                      event={event}
                      teams={teams}
                      fresh={fresh.has(event.seq)}
                    />
                  ) : (
                    <EventRow
                      key={event.seq}
                      event={event}
                      teams={teams}
                      highlight={card.state === "live"}
                      fresh={fresh.has(event.seq)}
                    />
                  ),
                )}
                {card.pendingInjuries.map((event) => (
                  <InjuryRollCallout
                    key={`pending-${event.seq}`}
                    event={event}
                    teams={teams}
                    viewerSide={viewerSide}
                    active={active}
                    onSubmit={onSubmit}
                  />
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
