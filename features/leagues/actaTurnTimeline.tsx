"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  type ActivePrayers,
  type MatchActivePrayers,
} from "@/lib/rules/inducements";
import { resolveInjury } from "@/lib/rules/injuries";
import { CASUALTY_CAUSES, type CasualtyCause } from "@/lib/livePhase";
import { isDisplayEvent } from "@/lib/liveMatch";
import { deriveMinute } from "@/lib/liveFeed";
import {
  bothDownMarkerLabel,
  causeLabel,
  eventCategoryTab,
  eventSpp,
  KICKOFF_OUTCOME_LABELS,
  liveEventLabel,
  provisionalCasualtySpp,
} from "./liveEventLabels";
import {
  buildGuidedCommand,
  CAUSES_REQUIRING_CAUSER,
  positionName,
  SELF_CAUSES,
  type GuidedSelections,
} from "./liveActionEntry";
import { RollStepper } from "./rollStepper";
import {
  causerIdOf,
  captureAuthorOf,
  gameTurnSidesOf,
  type TurnSide,
} from "./actaTurnSides";
import type { LiveCommand, LiveMatchEventDto, MatchTeamDetail } from "./api";

/**
 * Acta en Vivo turn timeline (MVA-3 timeline half + MVA-4, T8 Slice B; chat
 * redesign T2-T4, `design/stitch-timeline-chat/01`): the chronology as a CHAT
 * FEED of per-HALF-TURN groups (T8 / L37: ONE GROUP per (half, turnNumber,
 * side) — one each time a coach plays), newest first. The group chrome is a
 * CENTERED separator chip — "T{n} · {TEAM or SISTEMA}" + the
 * EN JUEGO / COMPLETADO / CERRADO state chip — and the group article itself
 * is TRANSPARENT (no panel border/shadow): the bubbles sit directly on the
 * background:
 *
 *   - chat bubbles (T3/S2 — ONE component for every row): the EVENT's own
 *     team side (LM-12) hugs LEFT with the navy accent bar (home) or mirrors
 *     RIGHT with the red one (away); side-null system rows render CENTERED in
 *     slate with no author badge. Closed groups keep the same bubbles, muted.
 *     Inside each bubble: the category tab (`acta-event-tab` — the label slot
 *     until T5 adds the action icons: «Casualty» red only, «Pase», «TD»,
 *     «Derribo»…), bold player + muted role/number and the one-line
 *     description, the capture-author badge (S10.4.2), the earned SPP tab
 *     (`acta-event-spp` — captured data renders WITHOUT re-entry, S3) and the
 *     casualty's «Lo que informa quien la recibe» note (`acta-victim-note`);
 *   - per-message timestamps (T4/S3): every bubble carries its own «Min N'»
 *     from `deriveMinute(event.at, startedAt)` on its footer;
 *   - the MVA-4 pending injury-roll callout inside the group owning a casualty
 *     whose 1D16 is still missing: warning label, player + armor-break line,
 *     the "TIRAR 1D16 DE LESIÓN" action and the BB2025 D16 severity table
 *     (S1 — bands verbatim).
 *
 * Turn states: the ACTIVE half-turn renders EN JUEGO (its card always shows,
 * even before any action); while live, the card right before it renders
 * COMPLETADO and older cards CERRADO (the MVA-3 scenario: "turns 1-4 closed,
 * turn 5 completed, turn 6 active"); once the match is over the last turn
 * renders COMPLETADO and every older card CERRADO. Group titles fall back to
 * "SISTEMA" only on a pair's neutral system card (side-null captures).
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
  // T4 (S3): the per-message timestamp marker (the artboard's «🕐 Min N'»).
  clock:
    "M200-360A280 280 0 1 0 760-360A280 280 0 1 0 200-360ZM280-360A200 200 0 1 1 680-360A200 200 0 1 1 280-360ZM466-500h28v140h-28ZM480-374h140v28H480Z",
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
  /** Stable map key: `{half}:{turnNumber}:{side}` (`both` = neutral card). */
  key: string;
  half: number;
  turnNumber: number;
  state: TurnCardState;
  /** The coach playing this HALF-TURN (the card's grouping side) — null only
   *  on the pair's neutral "SISTEMA" card (system captures, no side). */
  actingSide: TurnSide;
  /** The latest capture timestamp of the turn (the bubbles carry each their
   *  own minute — T4/S3). */
  minuteAt: number;
  /** Display events in capture order (seq asc). */
  events: LiveMatchEventDto[];
  /** Casualties of this turn still awaiting their 1D16 (MVA-4). */
  pendingInjuries: LiveMatchEventDto[];
}

/**
 * B1 (T8 / L37, regrouped by S10.4 / T16 per L54): groups the feed into ONE
 * CARD PER HALF-TURN — keyed `(half, turnNumber, side)` where `side` is the
 * GAME TURN's side (whose turn was being played — `gameTurnSidesOf`), one card
 * each time a coach plays (T1 Águilas, T1 Colmillos, T2 …), never one merged
 * card per turn pair. NEWEST FIRST: half/turn descending and, within a pair,
 * the half-turn played SECOND (the pair's newest play) above the opener —
 * `active.turnStarter` names the opener (it flips with the halves per the
 * kickoff receiver rule); without a `turnStarter` the fallback counts the
 * active side as the pair's newest play.
 *
 * The bucket side of a capture is its GAME TURN (S10.4.2 — NOT the capture
 * author): «el jugador que placa informa del placaje y el jugador que recibe
 * marca la herida» — both coaches capture during the SAME turn, so every
 * action lands on the card of the half-turn being played, whatever coach
 * registered it. The registrar still shows on the row itself (the
 * "Registrado por …" badge — S10.4.2 role transparency). A capture with no
 * coach attribution at all (mid-match weather / endHalf / endMatch …) keeps
 * its OWN neutral card keyed with the turn — sorted as the pair's OLDEST entry
 * (its exact moment inside the pair is unknowable) and titled "SISTEMA".
 *
 * S1: side-null FACT captures (fan factor, weather, the start marker) that
 * precede the first in-play capture are PRE-MATCH facts — the «Antes del
 * partido» block substitutes them, so the timeline never renders those rows
 * and never opens a neutral card for them. A fact captured after the match is
 * underway stays (a mid-match weather change renders as a system bubble).
 * Feeds with no turn-boundary evidence (legacy v5 saves, constructed feeds)
 * fall back to the capture author — see `gameTurnSidesOf`.
 *
 * States: the ACTIVE half-turn always renders its card with EN JUEGO — even
 * before any action («cuando pase el turno deberia salir la card») — while a
 * half-turn that closes with NO recorded display event shows NO card at all
 * («si no hay nada que registrar esta card deberia desaparecer»). While live
 * the card right before the active one renders COMPLETADO and every older
 * card CERRADO; once not live every card of the active pair (the "last turn")
 * renders COMPLETADO and the rest CERRADO. A casualty awaiting its 1D16 lands
 * in `pendingInjuries` unless a LATER capture already resolved the same
 * victim (then the resolved row renders it — never a stale callout).
 */
/** S1: the side-null fact kinds the «Antes del partido» block already reports. */
const PRE_MATCH_FACT_KINDS: ReadonlySet<string> = new Set([
  "start",
  "fan_factor",
  "weather",
]);

export function turnCardsOf(
  events: readonly LiveMatchEventDto[],
  active: {
    status: "pending" | "ready" | "live" | "finished";
    half: number;
    turnNumber: number;
    activeSide: "home" | "away";
    /** Side that OPENED the current turn pair (the demo pair rule). */
    turnStarter?: "home" | "away" | null;
  },
): ActaTurnCard[] {
  // The side that opens each PAIR of `half` (plays the half-turn first):
  // `turnStarter` opens the current half's pairs and — flipped with the
  // halves per the kickoff receiver rule — the OTHER half's pairs opened
  // with its rival. Without a `turnStarter` the fallback counts the active
  // side as the pair's newest play, so the opener is its rival.
  const fallbackOpener: "home" | "away" =
    active.activeSide === "home" ? "away" : "home";
  const openerOf = (half: number): "home" | "away" => {
    const opener = active.turnStarter ?? fallbackOpener;
    if (active.turnStarter == null || half === active.half) return opener;
    return opener === "home" ? "away" : "home";
  };
  /** Within-pair recency: second play (newest) > opener > neutral (oldest). */
  const pairRank = (card: ActaTurnCard): number =>
    card.actingSide == null ? -1 : card.actingSide === openerOf(card.half) ? 0 : 1;

  const byTurn = new Map<string, ActaTurnCard>();
  const ensure = (half: number, turnNumber: number, side: TurnSide): ActaTurnCard => {
    const key = `${half}:${turnNumber}:${side ?? "both"}`;
    let card = byTurn.get(key);
    if (card == null) {
      card = {
        key,
        half,
        turnNumber,
        state: "closed",
        actingSide: side,
        minuteAt: 0,
        events: [],
        pendingInjuries: [],
      };
      byTurn.set(key, card);
    }
    return card;
  };

  const visible = events.filter((event) => isDisplayEvent(event.kind));
  // S10.4 (T16): the GAME TURN's side each capture belongs to — whose
  // half-turn was being played when it was registered (the turn-start
  // boundaries the feed carries). Side-less captures have NO entry → their
  // neutral "both" card below.
  const gameTurns = gameTurnSidesOf(events, active);
  // S1: the first IN-PLAY capture (anything that is not a pre-match fact
  // kind) delimits the pre-match block: fact rows before it belong to
  // «Antes del partido»; a fact row after it is a mid-match system event.
  let firstInPlaySeq = Number.POSITIVE_INFINITY;
  for (const event of visible) {
    if (!PRE_MATCH_FACT_KINDS.has(event.kind) && event.seq < firstInPlaySeq) {
      firstInPlaySeq = event.seq;
    }
  }
  for (const event of visible) {
    const side = gameTurns.get(event.seq) ?? null;
    if (
      side == null &&
      PRE_MATCH_FACT_KINDS.has(event.kind) &&
      event.seq < firstInPlaySeq
    ) {
      continue;
    }
    const card = ensure(event.half, event.turnNumber, side);
    card.events.push(event);
    card.minuteAt = Math.max(card.minuteAt, event.at);
  }

  // The ACTIVE half-turn always shows its card (EN JUEGO) — even empty.
  if (active.status === "live") ensure(active.half, active.turnNumber, active.activeSide);

  const cards = [...byTurn.values()].sort(
    (a, b) => b.half - a.half || b.turnNumber - a.turnNumber || pairRank(b) - pairRank(a),
  );

  if (active.status === "live") {
    const activeIndex = cards.findIndex(
      (card) =>
        card.half === active.half &&
        card.turnNumber === active.turnNumber &&
        card.actingSide === active.activeSide,
    );
    if (activeIndex >= 0) cards[activeIndex].state = "live";
    // The card right before the active one is the half-turn that just closed.
    const previous = activeIndex >= 0 ? cards[activeIndex + 1] : undefined;
    if (previous != null) previous.state = "completed";
  } else {
    // The "last turn" (the active pair) renders COMPLETADO once not live.
    for (const card of cards) {
      if (card.half === active.half && card.turnNumber === active.turnNumber) {
        card.state = "completed";
      }
    }
  }

  // Pending casualties cleared by a later resolved capture of the same victim.
  for (const card of cards) {
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

  return cards;
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

/** T25 («Plegarias a Nuffle»): the EARNING side's active blessings — a
 * casualty pays its CAUSER side (opposite the victim's row side, LM-12), any
 * other event its own acting side. Absent set (or a side-less system row) →
 * no blessings (the T24 earn rule exactly). */
function earnerPrayersOf(
  event: LiveMatchEventDto,
  match?: MatchActivePrayers,
): ActivePrayers {
  if (match == null || event.side == null) return [];
  return match[event.kind === "casualty" ? opposite(event.side) : event.side];
}

/** T18 (folder-tab acta rows, design/acta-folder-tabs/01): the CATEGORY tab —
 *  short labels («Casualty» red only), never the SPP count (L60: «+1 SPP» was
 *  never a title) and never the long composed chain label (it stays the row's
 *  text). Unknown kinds keep their own label. */
function tabFor(event: LiveMatchEventDto): { label: string; injury?: boolean } {
  return eventCategoryTab(event) ?? { label: liveEventLabel(event) };
}

/** The inverted bottom SPP tab text (TD +3 · casualty +2 · completion +1 …) —
 *  rendered ONLY when earned (T18: SPP is a consequence, never a title).
 *  T24 (L78, «external-assets/Puntos de SPP.md»): the gate is the EARNER — rows
 *  that pay NOBODY never show a tab: a SELF-INFLICTED casualty (dodge/crowd)
 *  has no causer (RAU-47 «no-causer pays no-★»), Faltas earn no SPP (user
 *  table: «Faltas … no genera SPP»), and the Both-Down/pifia rows pay nothing
 *  (the `bothDown` flag rides them precisely to zero them — T23's flagged flat
 *  +2). A CAUSED record may carry no `causerRosterId` of its own (the demo's
 *  split combat chain records the herida on the victim side — the causer
 *  context rides the chain's «Derribo» row), so the CAUSE is the earn signal,
 *  never the payload's causer field. T25 («Plegarias a Nuffle»): the foul/crowd
 *  zero-rows consult the per-prayer exception seams — the blessing unlocks the
 *  award for the EARNING team only. T27 (L87/L88): the skill/team rows ride
 *  the same shared rule (flags in the payload — `causerSkills` /
 *  `brawlinBrutes`), so every zero seam and flag is enforced in ONE place: a
 *  pending row provisions its causal award (★3 under «Brutos Peleones») and an
 *  unmet seam/flag provisions NOTHING — never a provisional flash. */
function sppMarkerFor(
  event: LiveMatchEventDto,
  prayers: ActivePrayers,
): { text: string; className: string } | null {
  // A pending casualty provisions the flat causal (artboard T5 row — settles
  // at roll time); a resolved one follows the shared `eventSpp` rule (T24 +
  // the T25 blessings + the T27 flag rows).
  const value = isPendingInjuryRoll(event)
    ? provisionalCasualtySpp(event, prayers)
    : eventSpp(event, prayers);
  if (value <= 0) return null;
  return {
    text: `+${value} SPP`,
    className: event.kind === "casualty" ? "text-red" : "text-navy",
  };
}

/**
 * T18 (L62): the casualty row's two voices — the attacker-side mark (the
 * cause + both-down marker, «X marca herida a Y» lives in the subject) and
 * what the RECEIVER reports (the injury roll + its consequences, or its
 * pending status). Both parts keep the shipped copy byte-identical (the
 * composed `descriptionFor` string is `mark · note`).
 */
function casualtyVoices(event: LiveMatchEventDto): { mark: string; note: string } {
  const bothDown = bothDownMarkerLabel(event.payload);
  const suffix = bothDown ? ` (${bothDown})` : "";
  const cause = typeof event.payload.cause === "string" ? causeLabel(event.payload.cause) : "Baja";
  const roll16 = event.payload.roll16;
  const note =
    typeof roll16 === "number"
      ? `Tirada 1D16: ${roll16} · ${bandLabel(resolveInjury(roll16).kind)}`
      : "Tirada de lesión pendiente.";
  return { mark: `${cause}${suffix}`, note };
}

/** The one-line event description (captured data, never re-entered — S3). */
function descriptionFor(
  event: LiveMatchEventDto,
  teams: TeamMap,
): string {
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
      const { mark, note } = casualtyVoices(event);
      return `${mark} · ${note}`;
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

/** S10.4.2 (T16): the capture-author badge copy — «quién la registró». */
function authorBadgeLabel(event: LiveMatchEventDto, teams: TeamMap): string {
  const author = captureAuthorOf(event);
  return author != null ? `Registrado por ${teams[author].name}` : "Registro de sistema";
}

/**
 * T18 (L62): the victim-note's own recorder badge — «Lo que informa quien la
 * recibe» is reported by the RECEIVER's coach (a casualty's `side` is the
 * victim's side, LM-12). Derived from the EXISTING payload — no new injury
 * data flows.
 */
function victimBadgeLabel(event: LiveMatchEventDto, teams: TeamMap): string {
  return event.side != null
    ? `Registrado por ${teams[event.side].name}`
    : "Registro de sistema";
}

/**
 * T3 (S2 chat bubbles): ONE bubble for every captured row — live, completed
 * and closed groups render the SAME layout (closed groups mute it: slate tab
 * + slate-strong text) and side-null system rows render as CENTERED slate
 * bubbles with no author badge. Side identity («Implementar tal cual»,
 * `design/stitch-timeline-chat/01`): the bubble follows the EVENT's own team
 * side (LM-12 — the victim's side on a casualty row) — home hugs LEFT with
 * the navy accent bar, away mirrors RIGHT with the red one. The chrome keeps
 * the shipped T18 atoms: the category tab (`acta-event-tab` — the label slot
 * until T5 adds the action icons), the bold player + description, the
 * capture-author badge (S10.4.2), the SPP tab (`acta-event-spp`) and the
 * casualty's victim note (`acta-victim-note`); T4/S3 puts the per-message
 * «Min N'» on the bubble footer.
 */
function EventBubble({
  event,
  teams,
  fresh,
  muted,
  activePrayers,
  startedAt,
}: {
  event: LiveMatchEventDto;
  teams: TeamMap;
  fresh: boolean;
  muted: boolean;
  activePrayers?: MatchActivePrayers;
  startedAt: number | null;
}) {
  const tab = tabFor(event);
  const marker = sppMarkerFor(event, earnerPrayersOf(event, activePrayers));
  const system = event.side == null;
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
  // T18 (L62) voice split: the body keeps the attacker-side mark («X marca
  // herida a Y» = the subject + the cause line) with its recorder badge; the
  // injury roll + consequences live in the «Lo que informa quien la recibe»
  // sub-box with the RECEIVER's own badge.
  const voices = event.kind === "casualty" ? casualtyVoices(event) : null;
  // T3: home bubbles hug LEFT (navy accent), away bubbles MIRROR (red accent
  // on the outer edge). Row side = the EVENT's team side (fixed).
  const mirrored = event.side === "away";
  // T4/S3: the per-message timestamp — the bubble's own capture minute.
  const minute = startedAt != null ? deriveMinute(event.at, startedAt) : "0'";
  return (
    <div
      data-testid="acta-event-row"
      data-kind={event.kind}
      className={`relative flex w-[92%] flex-col gap-2 rounded-sm border border-border p-2.5 ${
        system
          ? "mx-auto border-l-4 border-l-slate bg-fill-hover"
          : mirrored
            ? "ml-auto border-r-4 border-r-red bg-panel"
            : "mr-auto border-l-4 border-l-navy bg-panel"
      } ${fresh ? "acta-motion-row-flash" : ""}`}
    >
      <div className="flex items-start gap-2">
        <span
          data-testid="acta-event-tab"
          className={`flex h-[26px] shrink-0 items-center rounded-sm px-3 text-[10px] font-bold uppercase tracking-[0.12em] text-white ${
            muted || system ? "bg-slate" : tab.injury ? "bg-red" : "bg-navy"
          }`}
        >
          {tab.label}
        </span>
        <div className="min-w-0 flex-1">
          {/* The description gets the FULL width — the old inline category
              chip no longer steals it (T18, L60). */}
          <p className={`text-sm ${muted ? "text-slate-strong" : "text-ink"}`}>
            {subject}
          </p>
          <p className="text-xs text-slate">
            {voices != null ? voices.mark : descriptionFor(event, teams)}
          </p>
          {voices != null ? (
            <div
              data-testid="acta-victim-note"
              className={`mt-2.5 border border-border bg-background px-2.5 py-2 ${
                // T20 (L70, the user's exact words): «cuando el jugador es el de
                // la derecha deberiamos cambiar border-l-red y border-l-[3px] a
                // border-r-red y border-r-[3px]» — the accent stays on the
                // mirrored OUTER edge.
                mirrored
                  ? "rounded-l-sm border-r-[3px] border-r-red"
                  : "rounded-r-sm border-l-[3px] border-l-red"
              }`}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-red">
                Lo que informa quien la recibe
              </p>
              <p className="mt-1 text-xs text-slate">{voices.note}</p>
              <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate">
                {victimBadgeLabel(event, teams)}
              </p>
            </div>
          ) : null}
        </div>
      </div>
      {/* T4/S3: every bubble carries its own «Min N'» + the capture-author
          badge (S10.4.2 role transparency — never dropped on team rows; a
          side-less system bubble has no author to name, T3). */}
      <div className="flex items-center gap-1.5">
        <ActaIcon name="clock" className="size-4 shrink-0 text-slate" />
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate">
          Min {minute}
        </span>
        {system ? null : (
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate">
            · {authorBadgeLabel(event, teams)}
          </span>
        )}
        {marker != null ? (
          <div
            data-testid="acta-event-spp"
            className={`ml-auto w-fit rounded-sm border border-border bg-fill-hover px-3 py-1 text-[11px] font-bold ${marker.className}`}
          >
            {marker.text}
          </div>
        ) : null}
      </div>
    </div>
  );
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
  /** The current wall clock (kept for API stability — since T4 every bubble
   *  renders its OWN capture minute, so nothing derives from `now` anymore). */
  now: number;
  /** The live-match state slice the turn states derive from. */
  active: {
    status: "pending" | "ready" | "live" | "finished";
    half: number;
    turnNumber: number;
    activeSide: "home" | "away";
    /** Side that OPENED the current turn pair (the demo pair rule). */
    turnStarter?: "home" | "away" | null;
  };
  /** The viewing coach's side (null → spectator/admin, no roll action). */
  viewerSide: "home" | "away" | null;
  /** The EXISTING live command pathway (`sendLiveCommand` via the V2 `act`). */
  onSubmit?: (command: LiveCommand) => Promise<void> | void;
  /** T25 («Plegarias a Nuffle»): the per-side active-prayer sets (the
   * blessings rolled from each team's pre-match prayers-to-nuffle inducement).
   * Optional seam — absent = no blessings active (the T24 earn rule exactly). */
  activePrayers?: MatchActivePrayers;
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
  active,
  viewerSide,
  onSubmit,
  activePrayers,
}: ActaTurnTimelineProps) {
  const teams: TeamMap = { home: homeTeam, away: awayTeam };
  const cards = turnCardsOf(events, active);
  const fresh = useFreshSeqs(events);
  return (
    <div data-testid="acta-turn-timeline" className="flex flex-col gap-3 px-4 py-3">
      {cards.map((card, index) => {
        const chip = STATE_CHIP[card.state];
        const teamLabel = card.actingSide ? teams[card.actingSide].name : "SISTEMA";
        return (
          <article
            key={card.key}
            data-testid="acta-turn-card"
            data-half={card.half}
            data-turn={card.turnNumber}
            data-state={card.state}
            className={`acta-motion-fade-in-up acta-motion-stagger-${Math.min(index + 1, 5)} flex flex-col gap-2.5`}
          >
            {/* T2/S2: the group chrome is a CENTERED separator chip — the
                article itself is transparent (no panel): the bubbles sit
                directly on the background. The state stays visible through
                the EN JUEGO / COMPLETADO / CERRADO chip (S3: never
                state-coded colors). */}
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
              <span className="flex items-center gap-1.5 rounded-sm border border-border bg-fill-hover px-2 py-1">
                <span
                  className={`font-display text-[11px] font-bold uppercase tracking-wide ${
                    card.state === "closed" ? "text-slate-strong" : "text-ink"
                  }`}
                >
                  T{card.turnNumber} · {teamLabel}
                </span>
                <span
                  className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${chip.className}`}
                >
                  {chip.label}
                </span>
              </span>
              <span aria-hidden="true" className="h-px flex-1 bg-border" />
            </div>
            {card.events.map((event) => (
              <EventBubble
                key={event.seq}
                event={event}
                teams={teams}
                fresh={fresh.has(event.seq)}
                muted={card.state === "closed"}
                activePrayers={activePrayers}
                startedAt={startedAt}
              />
            ))}
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
          </article>
        );
      })}
    </div>
  );
}
