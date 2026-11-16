"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { resolveInjury } from "@/lib/rules/injuries";
import { blockDice, blockDie, type BlockDieFace } from "@/lib/rules/blocks";
import { BLOCK_FACE_LABELS, causeLabel, liveEventLabel } from "./liveEventLabels";
import { RollStepper } from "./rollStepper";
import {
  ACTIVE_CAUSES,
  SELF_CAUSES,
  buildGuidedCommand,
  buildKnockdownCommand,
  buildScoredCommand,
  buildVictimInjuryCommand,
  buildWeatherCommand,
  dorsalMap,
  eligiblePlayers,
  isActiveActor,
  knockdownVictimOf,
  positionName,
  shortName,
  statsFor,
  type GuidedSelections,
  type KnockdownCommand,
} from "./liveActionEntry";
import { weatherLabel } from "./matchSummary";
import { WEATHER_KINDS } from "@/lib/rules/weather";
import type { LiveCommand, MatchPlayer } from "./api";

/**
 * Design-A contextual action dock for the live match (LM-46): replaces BOTH the
 * FAB menu and the Design-B player-first strip. A FIXED bar over the viewport's
 * bottom shows the actions a viewer may legally record RIGHT NOW, per role:
 *
 *  - ACTIVE coach:  Touchdown · Pase completo · Baja causada · Falta.
 *  - NON-active coach: only casualty records they are allowed to author on the
 *    rival's turn — "Baja propia" (their own dodge/crowd wound) and "Baja —
 *    ambos derribados" (a rival fallen blocker whose own defender caused the
 *    both-down, DEC-1). A spectator/admin or a non-live match sees nothing.
 *
 * Tapping an action opens a centered MODAL listing the players involved as chips
 * (dorsal + short name; alive + not `missNextMatch` only). TD/Pase are TWO
 * TOUCHES (action → player fires instantly). Baja/Falta use a guided stepper
 * that reuses the shared `RollStepper` for the 1D16(+1D6) band; the guided
 * command fires AUTOMATICALLY the moment the last required selection is made
 * (there is no Registrar button). The pass-turn reason chips fire `endTurn`
 * immediately on click (there is no Confirmar button). The SERVER stays
 * authoritative (the raw rolls are what the route reads), ack stays a feed-card
 * concern (this dock never renders ✓/✗).
 *
 * The modal's chips mirror the strip's old pickers but are rebuilt here around
 * the action-first mental model (mockup Design A): who-before-what is gone.
 *
 * MVA-5 (T9 Slice C): `variant="acta"` swaps the BAR for the Acta en Vivo
 * quick-capture dock (artboard 08 "FIXED BOTTOM QUICK-CAPTURE ACTION DOCK" —
 * + TD / + Pase / + Baja / + Evento / Fin Turno, icon + uppercase label on
 * square panels). It is a pure restyle: the buttons drive the SAME flows and
 * the SAME guided sheets/machinery above; the legacy variant (default) stays
 * byte-identical for V1. The artboard bar shows the full five actions to the
 * ACTIVE coach; the NON-active coach keeps only their LM-12-legal casualty
 * records (never a button whose command would 409 — MVA-4 principle).
 *
 * Slice E (T4 capture surface): the acta "+ Evento" opens a CHOICE step first
 * — Falta · Intercepción · Lanzar compañero · Aterrizar sano (labels from the
 * shared `liveEventLabels` taxonomy). Falta routes into the EXISTING guided
 * flow; the LM-13 scored actions are two-touch `buildScoredCommand` captures
 * like TD/Pase. The choice rides the SAME ACTIVE-coach window as its siblings
 * (MVA-4), and V1's legacy Falta chip keeps opening the guided flow directly.
 */

type Flow =
  | "td"
  | "completion"
  | "casualtyCaused"
  | "foul"
  | "interception"
  | "throwTeamMate"
  | "landedSafe"
  | "weather"
  | "eventChoice"
  | "selfInflicted"
  | "bothDown"
  | "block"
  | "passTurn";

/** The "+ Evento" choice step (Slice E): the recordable acta events — Falta
 * plus the LM-13 scored actions, and the S2 "Cambiar clima" capture. All are
 * ACTIVE-coach captures, so the choice rides exactly the window its entry
 * button already gates (MVA-4). T17 leads with «Bloqueo» — the guided combat
 * chain (S10.1) is the core capture of the match's "toma y daca". */
const EVENT_CHOICES = [
  "block",
  "foul",
  "interception",
  "throwTeamMate",
  "landedSafe",
  "weather",
] as const;

/** True for the instant two-touch scored actions (own player pick → fire).
 *  Accepts the nullable flow state (a closed sheet is never a scored flow). */
function isScoredFlow(
  flow: Flow | null,
): flow is "td" | "completion" | "interception" | "throwTeamMate" | "landedSafe" {
  return (
    flow === "td" ||
    flow === "completion" ||
    flow === "interception" ||
    flow === "throwTeamMate" ||
    flow === "landedSafe"
  );
}

/** The end-turn reasons the active coach can pick (no preselection). */
type TurnReason = "voluntary" | "turnover" | "injury";

/** The guided flows that map onto a `buildGuidedCommand` kind. */
type GuidedKind = "casualty" | "selfInflicted" | "bothDown" | "foul";

/** Maps a guided `Flow` to its `buildGuidedCommand` kind (null for TD/Pase/pass). */
function guidedKindFor(flow: Flow): GuidedKind | null {
  switch (flow) {
    case "casualtyCaused":
      return "casualty";
    case "selfInflicted":
      return "selfInflicted";
    case "bothDown":
      return "bothDown";
    case "foul":
      return "foul";
    default:
      return null;
  }
}

export interface LiveActionDockProps {
  viewerSide: "home" | "away" | null;
  activeSide: "home" | "away";
  /** "live" shows the dock; spectator/admin (`viewerSide` null) never. */
  status: "pending" | "ready" | "live" | "finished";
  /** The viewer's OWN roster — scorer / causer / aggressor / own victim. */
  roster: MatchPlayer[];
  /** Rival (opposite the viewer): casualty victim + both-down fallen blocker. */
  opponentRoster: MatchPlayer[];
  /** RAU-48: race ids for the position label of each roster. */
  rosterRaceId: string;
  opponentRaceId: string;
  /** Wraps `act`: the `/api/.../live` POST command. */
  onSubmit: (cmd: LiveCommand) => Promise<void>;
  /** "acta" = the Acta en Vivo quick-capture bar (artboard 08, MVA-5);
   *  "legacy" (default) = the Design-A chip bar (V1 — never changes). */
  variant?: "legacy" | "acta";
  /** S6: the acta capture bar renders only once the match has really started
   *  (pre-match sequence finished). Default true — served matches are underway. */
  matchStarted?: boolean;
}

/** Artboard 08 quick-capture icons (Material Symbols paths on the 960 grid,
 *  copied verbatim from the artboard — inline SVG only, no icon fonts). */
const ACTA_ICONS = {
  football:
    "M480-480ZM362-202 202-362q-3 38-1.5 79t7.5 73q23 7 69.5 9t84.5-1Zm96-16q59-13 106-37t82-59q34-34 58-80.5T742-500L500-742q-57 14-103 38.5T316-644q-35 35-59.5 81.5T218-458l240 240Zm-62-122-56-56 224-224 56 56-224 224Zm362-256q4-39 2.5-81t-8.5-73q-23-8-69.5-10t-84.5 2l160 162ZM310-120q-57 0-104-8.5T148-148q-11-12-19.5-60T120-314q0-119 36-220.5T258-702q66-66 169-102t223-36q58 0 104.5 8.5T812-812q11 12 19.5 60t8.5 108q0 117-36 218.5T702-258q-65 65-168 101.5T310-120Z",
  send: "M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z",
  medical:
    "M160-80q-33 0-56.5-23.5T80-160v-480q0-33 23.5-56.5T160-720h160v-80q0-33 23.5-56.5T400-880h160q33 0 56.5 23.5T640-800v80h160q33 0 56.5 23.5T880-640v480q0 33-23.5 56.5T800-80H160Zm0-80h640v-480H160v480Zm240-560h160v-80H400v80ZM160-160v-480 480Zm280-200v120h80v-120h120v-80H520v-120h-80v120H320v80h120Z",
  more: "M240-400q-33 0-56.5-23.5T160-480q0-33 23.5-56.5T240-560q33 0 56.5 23.5T320-480q0 33-23.5 56.5T240-400Zm240 0q-33 0-56.5-23.5T400-480q0-33 23.5-56.5T480-560q33 0 56.5 23.5T560-480q0 33-23.5 56.5T480-400Zm240 0q-33 0-56.5-23.5T640-480q0-33 23.5-56.5T720-560q33 0 56.5 23.5T800-480q0 33-23.5 56.5T720-400Z",
  flag: "M200-120v-680h360l16 80h224v400H520l-16-80H280v280h-80Zm300-440Zm86 160h134v-240H510l-16-80H280v240h290l16 80Z",
} as const;

/** The artboard panel tones (rulebook-light tokens only — AGENTS.md rule 5). */
const ACTA_TONE = {
  navy: "border-border bg-panel text-navy hover:bg-fill-hover",
  red: "border-border bg-panel text-red hover:bg-fill-hover",
  slate: "border-border bg-panel text-slate-strong hover:bg-fill-hover",
  solidRed: "border-red bg-red text-white shadow-sm hover:bg-red-hover",
} as const;

/** MVA-6 floating feedback (artboard 09 `data-label` values verbatim, keyed by
 *  the flow that fired — navy pill for captures, red for Fin Turno). The artboard
 *  defines no per-kind label for the Slice E choice-sheet captures, so they float
 *  the artboard's generic event feedback from the + Evento button. */
const ACTA_FEEDBACK: Record<Flow, { text: string; tone: "navy" | "red" }> = {
  td: { text: "+3 SPP (TD)", tone: "navy" },
  completion: { text: "+1 SPP (Pase)", tone: "navy" },
  casualtyCaused: { text: "+2 SPP (Baja)", tone: "navy" },
  foul: { text: "Evento Registrado", tone: "navy" },
  interception: { text: "Evento Registrado", tone: "navy" },
  throwTeamMate: { text: "Evento Registrado", tone: "navy" },
  landedSafe: { text: "Evento Registrado", tone: "navy" },
  weather: { text: "Evento Registrado", tone: "navy" },
  eventChoice: { text: "Evento Registrado", tone: "navy" },
  selfInflicted: { text: "+2 SPP (Baja)", tone: "navy" },
  bothDown: { text: "+2 SPP (Baja)", tone: "navy" },
  block: { text: "Evento Registrado", tone: "navy" },
  passTurn: { text: "Cambio de Turno", tone: "red" },
};

interface ActaFloatFeedback {
  /** Remount key: each fired capture replays the one-shot float. */
  id: number;
  text: string;
  tone: "navy" | "red";
}

/** T17 (S10.4.1): one chain outcome awaiting the VICTIM owner's injury roll. */
interface PendingInjury {
  id: number;
  victimId: string;
  victimSide: "home" | "away";
  /** T23: the injury arose from a «Ambos caen» fall — keeps the DEC-1
   *  «(Ambos derribados)» marker copy on its row (never a causer). */
  bothDown?: boolean;
}

/** T23 (S10.3): one fallen player awaiting its armour 2D6 inside the chain —
 *  `ownerSide` routes the broken-armour callout to the victim's OWNER
 *  (S10.4.1: each victim's owner marks their own herida). */
interface ArmourTarget {
  playerId: string;
  ownerSide: "home" | "away";
  /** The catalog AV (null = unknown — never invented, never "broken"). */
  av: number | null;
}

/** One artboard quick-capture action: icon + uppercase label stacked on a
 *  square-ish panel. Hover/press feedback via the artboard transitions; the
 *  MVA-6 float (`acta-motion-float-feedback`, artboard 09 `.floating-feedback`)
 *  rises from the button when the capture fires (decorative only). */
function ActaDockButton({
  icon,
  label,
  tone,
  onClick,
  feedback,
}: {
  icon: keyof typeof ACTA_ICONS;
  label: string;
  tone: keyof typeof ACTA_TONE;
  onClick: () => void;
  /** MVA-6: the floating badge for the LAST capture this action fired. */
  feedback?: ActaFloatFeedback | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center rounded-sm border px-1 py-1.5 ${ACTA_TONE[tone]}`}
    >
      <svg viewBox="0 0 960 960" aria-hidden="true" focusable="false" className="size-5">
        <path d={ACTA_ICONS[icon]} fill="currentColor" />
      </svg>
      <span className="mt-0.5 whitespace-nowrap text-[10px] font-bold uppercase">{label}</span>
      {feedback != null ? (
        <span
          key={feedback.id}
          aria-hidden="true"
          className={`acta-motion-float-feedback rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
            feedback.tone === "red" ? "bg-red text-white" : "bg-navy text-white"
          }`}
        >
          {feedback.text}
        </span>
      ) : null}
    </button>
  );
}

/** A guided step inside the dock sheet: pick chips vs a RollStepper stage. */
type GuidedStage =
  | { kind: "cause"; causes: typeof ACTIVE_CAUSES }
  | { kind: "choice" }
  | { kind: "pickOwn" }
  | { kind: "pickRival" }
  | { kind: "selfCause" }
  | { kind: "roll" }
  | { kind: "blockRoll" }
  | { kind: "blockFace" }
  | { kind: "armourRoll" }
  | { kind: "weatherKind" }
  | { kind: "weatherRoll" };

/** The ordered stages a guided flow walks (based on the mockup stepper). */
function stagesFor(flow: Flow): GuidedStage[] {
  switch (flow) {
    case "td":
    case "completion":
    case "interception":
    case "throwTeamMate":
    case "landedSafe":
      // Two-touch scored actions: the sheet only picks the own player → fires.
      return [{ kind: "pickOwn" }];
    case "eventChoice":
      // Slice E: the + Evento choice step (Falta / LM-13 scored actions / S2
      // weather).
      return [{ kind: "choice" }];
    case "weather":
      // S2 (Cambiar clima): pick the new weather kind, then optionally record
      // the 2D6 that produced it ("Sin tirada" skips it).
      return [{ kind: "weatherKind" }, { kind: "weatherRoll" }];
    case "casualtyCaused":
      return [
        { kind: "cause", causes: ACTIVE_CAUSES },
        { kind: "pickOwn" },
        { kind: "pickRival" },
        { kind: "roll" },
      ];
    case "block":
      // T17 (S10.1): the real combat chain — block dice by ST -> pick a face
      // -> (defender falls) armour 2D6 vs the victim's AV. The knockdown entry
      // fires from the face/armour stage; a broken armour opens the VICTIM
      // side's pending-injury callout (S10.4.1) for the 1D16.
      return [
        { kind: "pickOwn" },
        { kind: "pickRival" },
        { kind: "blockRoll" },
        { kind: "blockFace" },
        { kind: "armourRoll" },
      ];
    case "foul":
      return [{ kind: "pickOwn" }, { kind: "pickRival" }];
    case "selfInflicted":
      return [{ kind: "pickOwn" }, { kind: "selfCause" }, { kind: "roll" }];
    case "bothDown":
      return [{ kind: "pickOwn" }, { kind: "pickRival" }, { kind: "roll" }];
    default:
      return [];
  }
}

/** Compose a chip button for one participant in the dock sheet. */
function playerChip(
  p: MatchPlayer,
  dorsal: number,
  side: "own" | "rival",
  position: string,
  selected: boolean,
  onPick: () => void,
) {
  return (
    <button
      key={p.rosterPlayerId}
      type="button"
      data-testid={side === "own" ? "dock-player-own" : "dock-player-rival"}
      aria-pressed={selected}
      aria-label={`#${dorsal} ${shortName(p)} (${position})`}
      onClick={onPick}
      className={`rounded border px-2 py-1 text-xs font-bold ${
        selected
          ? "border-navy bg-navy text-white"
          : "border-border bg-panel text-navy hover:bg-background"
      }`}
    >
      #{dorsal} {shortName(p)}
    </button>
  );
}

/**
 * T17 (S10.4.1): the VICTIM side's pending-injury callout — shown once the
 * combat chain ended in a broken armour («si rompe»). The victim's owner marks
 * the herida ONLY if it happens (apothecaries, regeneration, …): «TIRAR 1D16
 * DE LESIÓN» records the roll-inclusive capture (1D16 + 1D6 on Permanente,
 * auto-fired like every guided flow) and «Sin herida» dismisses it with no
 * record. Copy mirrors the acta timeline's MVA-4 callout; tokens stay
 * rulebook-light (AGENTS.md rule 5).
 */
function PendingInjuryCallout({
  victimName,
  victimDorsal,
  onRoll,
  onDismiss,
}: {
  victimName: string;
  victimDorsal: number;
  onRoll: (roll16: number, roll6?: number) => void;
  onDismiss: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [roll16, setRoll16] = useState<number | "">("");
  const [roll6, setRoll6] = useState<number | "">("");
  const handleRoll16 = (n: number) => {
    setRoll16(n);
    setRoll6("");
    // Auto-fire the moment the band does not need the permanent 1D6.
    if (resolveInjury(n).kind !== "permanent") onRoll(n);
  };
  const handleRoll6 = (n: number) => {
    setRoll6(n);
    if (roll16 !== "") onRoll(Number(roll16), n);
  };
  return (
    <div
      data-testid="dock-pending-injury"
      className="acta-motion-pulse-glow space-y-2 rounded-sm border-2 border-red bg-panel p-3"
    >
      <p className="text-[10px] font-bold uppercase tracking-wider text-red">
        TIRADA DE LESIÓN PENDIENTE
      </p>
      <p className="text-xs font-medium text-ink">
        Tirada de lesión requerida para{" "}
        <strong className="text-navy">
          {victimName} (#{victimDorsal})
        </strong>{" "}
        tras romperse la armadura (Bloqueo).
      </p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          data-testid="dock-injury-roll"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="rounded bg-navy px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-navy-hover"
        >
          TIRAR 1D16 DE LESIÓN
        </button>
        <button
          type="button"
          data-testid="dock-injury-dismiss"
          onClick={onDismiss}
          className="rounded border border-border bg-panel px-3 py-1.5 text-xs font-bold text-navy hover:bg-background"
        >
          Sin herida
        </button>
      </div>
      {open ? (
        <div data-testid="dock-injury-stepper">
          <RollStepper
            roll16={roll16}
            roll6={roll6}
            onRoll16={handleRoll16}
            onRoll6={handleRoll6}
            fn={t}
          />
        </div>
      ) : null}
    </div>
  );
}

export function LiveActionDock({
  viewerSide,
  activeSide,
  status,
  roster,
  opponentRoster,
  rosterRaceId,
  opponentRaceId,
  onSubmit,
  variant = "legacy",
  matchStarted = true,
}: LiveActionDockProps) {
  const { t } = useI18n();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [selections, setSelections] = useState<GuidedSelections>({});
  const [reason, setReason] = useState<TurnReason | null>(null);
  // MVA-6: the floating "+SPP" feedback of the LAST fired acta capture
  // (replaced on the next fire — no timers, no animation-event dependency).
  const [feedback, setFeedback] = useState<(ActaFloatFeedback & { action: Flow }) | null>(null);
  // T17 (S10.4.1): chain outcomes awaiting the VICTIM owner's injury roll —
  // opened when the armour broke; dock-local (the flow surface owns the
  // hand-off between the two coaches).
  const [pendingInjuries, setPendingInjuries] = useState<PendingInjury[]>([]);
  // T23 (S10.3): the fallen players still awaiting their armour 2D6 in the
  // current chain (the «Ambos caen» face falls TWO: defender, then attacker).
  const [armourTargets, setArmourTargets] = useState<ArmourTarget[]>([]);

  // Gates: spectator (no side) or a non-live match → no dock at all.
  if (viewerSide == null || status !== "live") return null;
  const active = isActiveActor(viewerSide, activeSide);

  const own = eligiblePlayers(roster);
  const rival = eligiblePlayers(opponentRoster);
  const ownDorsal = dorsalMap(roster);
  const rivalDorsal = dorsalMap(opponentRoster);

  const begin = (next: Flow) => {
    setFlow(next);
    setStepIndex(0);
    setSelections({});
    setReason(null); // no preselection: the reason chips start unpressed
    setArmourTargets([]);
  };

  const close = () => {
    setFlow(null);
    setStepIndex(0);
    setSelections({});
    setReason(null);
    setArmourTargets([]);
  };

  const nextStep = () => setStepIndex((i) => i + 1);

  /** Fire a command WITHOUT closing the sheet (mid-chain entries — T23). */
  const fire = (cmd: LiveCommand | KnockdownCommand) => {
    const source = flow;
    // T17 transport seam: `api.ts`'s `LiveCommand` is a fixed surface outside
    // this slice — the additive `knockdown` command (applied by the demo
    // reducer's `applyCommand`) rides it by cast. The production route does
    // not accept it yet (demo-first, same stance as the S3 kickoff machinery).
    void onSubmit(cmd as LiveCommand);
    if (variant === "acta" && source != null) {
      const next = ACTA_FEEDBACK[source];
      // The incrementing id remounts the badge so the one-shot float replays.
      setFeedback((prev) => ({
        id: (prev?.id ?? 0) + 1,
        action: source,
        ...next,
      }));
    }
  };

  /** Fire a complete command and reset the flow. */
  const submit = (cmd: LiveCommand | KnockdownCommand) => {
    fire(cmd);
    close();
  };

  /**
   * Pure completion check for a guided flow against a CANDIDATE selections
   * object (never the stale state). `buildGuidedCommand` treats the 1D6 as
   * optional, so a permanent band (13-14) additionally requires the 1D6 pick
   * before the flow counts as complete.
   */
  const isGuidedComplete = (kind: GuidedKind, next: GuidedSelections): boolean => {
    if (buildGuidedCommand(kind, viewerSide, next) == null) return false;
    const r16 = next.roll16;
    const needs6 =
      r16 != null && r16 !== "" && resolveInjury(Number(r16)).kind === "permanent";
    return !needs6 || (next.roll6 !== "" && next.roll6 != null);
  };

  /**
   * Applies the NEXT selections and either fires the flow (when the last
   * required pick completed it) or advances the visible stage. Completeness is
   * checked on `next`, so it never races the async state update.
   */
  const applyGuided = (next: GuidedSelections, advance: boolean) => {
    if (flow == null) return;
    setSelections(next);
    const kind = guidedKindFor(flow);
    if (kind != null && isGuidedComplete(kind, next)) {
      const cmd = buildGuidedCommand(kind, viewerSide, next);
      if (cmd) {
        submit(cmd);
        return;
      }
    }
    if (advance) nextStep();
  };

  const setRoll16 = (n: number) => applyGuided({ ...selections, roll16: n, roll6: "" }, false);
  const setRoll6 = (n: number) => applyGuided({ ...selections, roll6: n }, false);

  const pickPlayer = (p: MatchPlayer, side: "own" | "rival") => {
    if (isScoredFlow(flow)) {
      // Touch #2 fires immediately (2-touch TD / Pase / LM-13 scored actions).
      // No modal, no roll.
      submit(buildScoredCommand(flow, viewerSide, p.rosterPlayerId));
      return;
    }
    // Guided flows: remember the pick in its stage-slot according to role, then
    // fire automatically when it was the last required selection.
    const slot =
      side === "own"
        ? flow === "bothDown" || flow === "casualtyCaused" || flow === "foul" || flow === "block"
          ? "causerId"
          : "victimId" // selfInflicted victim is each own fallen player
        : "victimId";
    applyGuided({ ...selections, [slot]: p.rosterPlayerId }, true);
  };

  // --- Guided stage render ------------------------------------------------

  const openFlow = flow ?? null;
  const stages = openFlow ? stagesFor(openFlow) : [];
  const stage = stages[Math.min(stepIndex, stages.length)];
  const isRollStage = openFlow != null && stage?.kind === "roll";

  /** LM-28: fires the ACTIVE coach's pass with the clicked reason. The dock gate
   * already proved viewerSide === activeSide (only an active coach reaches this);
   * ends once via `submit`. */
  const firePassTurn = (value: TurnReason) => {
    if (flow !== "passTurn" || viewerSide == null) return;
    setReason(value);
    submit({ type: "endTurn", side: viewerSide, reason: value });
  };

  /** S2: fires the "Cambiar clima" capture with the recorded d6 — `null` skips
   *  it (the roll stays optional, exactly like the command contract). */
  const fireWeather = (roll: number | null) => {
    const cmd = buildWeatherCommand(selections.weather ?? "", roll ?? "");
    if (cmd) submit(cmd);
  };

  /** T17: the picked pair's catalog stats (ST/AV) — null when the fixture's
   *  positional is not in the race catalog (honest degradation, never an
   *  invented number). */
  const attackerStats = statsFor(
    rosterRaceId,
    own.find((p) => p.rosterPlayerId === selections.causerId)?.positionalKey ?? "",
  );
  const victimStats = statsFor(
    opponentRaceId,
    rival.find((p) => p.rosterPlayerId === selections.victimId)?.positionalKey ?? "",
  );
  /** T17: the block dice count from the ST comparison (standard BB — the
   *  unknown-stats fallback keeps the common two-dice block, never invented
   *  numbers). */
  const blockDiceCount =
    attackerStats != null && victimStats != null && attackerStats.st < victimStats.st
      ? 1
      : 2;

  /** T17 · S10.1: throws the block dice by ST (lib/rules/blocks — imported,
   *  never transcribed). An unresolvable ST never invents stats: the standard
   *  two-dice block is rolled and the display keeps the "?" marker. */
  const throwBlockDice = () => {
    const faces =
      attackerStats != null && victimStats != null
        ? blockDice(attackerStats.st, victimStats.st)
        : Array.from({ length: 2 }, () => blockDie());
    setSelections({ ...selections, blockDice: faces, face: undefined, armourRoll: "" });
    nextStep();
  };

  /** T17: the picked face — a Push records nothing (no derribo); a defender
   *  knockdown continues into the armour stage. T23 (S10.3 closed): «Ambos
   *  caen» registers the row-only derribo (shipped shape, both players) AND
   *  continues with one armour stage per fallen player — each broken armour
   *  opens the victim OWNER's pending-injury callout (S10.4.1). An attacker
   *  fall stays row-only (out of T23's scope). */
  const pickBlockFace = (face: BlockDieFace) => {
    if (viewerSide == null) return;
    const falls = knockdownVictimOf(face);
    if (falls == null) {
      close();
      return;
    }
    const oppSide: "home" | "away" = viewerSide === "home" ? "away" : "home";
    const defenderTarget: ArmourTarget = {
      playerId: selections.victimId ?? "",
      ownerSide: oppSide,
      av: victimStats?.av ?? null,
    };
    if (falls === "defender") {
      setArmourTargets([defenderTarget]);
      applyGuided({ ...selections, face }, true);
      return;
    }
    const cmd = buildKnockdownCommand({
      recorderSide: viewerSide,
      causerId: selections.causerId ?? "",
      victimId: selections.victimId ?? "",
      blockDice: selections.blockDice ?? [],
      face,
    });
    if (cmd == null) {
      close();
      return;
    }
    if (falls === "both") {
      // T23: the derribo row keeps its shipped shape (fires at face pick) and
      // the chain CONTINUES: the defender's armour first, then the attacker's.
      fire(cmd);
      setSelections({ ...selections, face });
      setArmourTargets([
        defenderTarget,
        {
          playerId: selections.causerId ?? "",
          ownerSide: viewerSide,
          av: attackerStats?.av ?? null,
        },
      ]);
      nextStep();
      return;
    }
    submit(cmd); // attacker fall: row only
  };

  /** T17/T23: the current fallen player's armour 2D6 vs their AV. A single
   *  defender knockdown (T17) travels TOGETHER with the derribo entry (the
   *  armour fields ride it) and ends the chain; the both-down follow-ups
   *  (T23) are chain-internal — only a BROKEN armour leaves a trace: the
   *  victim OWNER's pending-injury callout («solo si llega a producirse»). */
  const fireArmour = (armourRoll: number) => {
    const head = armourTargets[0];
    if (head == null || viewerSide == null) {
      close();
      return;
    }
    // The break condition is the rulebook's »más de AR rompe« (strictly
    // greater); an unknown AV never invents a break (honest degradation).
    const broken = head.av != null && armourRoll > head.av;
    const rest = armourTargets.slice(1);
    setArmourTargets(rest);
    if (selections.face !== "bothDown") {
      const face = selections.face;
      if (face == null || selections.causerId == null || selections.victimId == null) return;
      const cmd = buildKnockdownCommand({
        recorderSide: viewerSide,
        causerId: selections.causerId,
        victimId: selections.victimId,
        blockDice: selections.blockDice ?? [],
        face,
        armourRoll,
        victimAv: head.av,
      });
      if (cmd == null) {
        close();
        return;
      }
      submit(cmd);
      if (broken) pushPendingInjury(head);
      return;
    }
    // T23: the derribo row already fired at face pick — a broken armour only
    // opens the victim OWNER's callout; the chain ends with the last target.
    if (broken) pushPendingInjury(head);
    if (rest.length === 0) close();
  };

  /** T17/T23: queue the broken-armour hand-off for the victim's OWNER — the
   *  callout renders only in that coach's dock (S10.4.1). */
  const pushPendingInjury = (target: ArmourTarget) =>
    setPendingInjuries((prev) => [
      ...prev,
      {
        id: (prev[prev.length - 1]?.id ?? 0) + 1,
        victimId: target.playerId,
        victimSide: target.ownerSide,
        bothDown: selections.face === "bothDown",
      },
    ]);

  /** T17 (S10.4.1): the victim owner's roll-inclusive injury capture from the
   *  pending callout — «solo si llega a producirse» (see «Sin herida»). T23:
   *  a both-down injury keeps the DEC-1 marker on its row. */
  const fireVictimInjury = (
    pending: PendingInjury,
    roll16: number,
    roll6?: number,
  ) => {
    const cmd = buildVictimInjuryCommand(
      pending.victimSide,
      pending.victimId,
      roll16,
      roll6 ?? "",
      "block",
      pending.bothDown === true,
    );
    setPendingInjuries((prev) => prev.filter((item) => item.id !== pending.id));
    if (cmd) submit(cmd);
  };
  const dismissVictimInjury = (id: number) =>
    setPendingInjuries((prev) => prev.filter((item) => item.id !== id));

  // The centered modal that hosts the open flow (the dock bar stays underneath).
  const modalContent = (() => {
    if (!openFlow) return null;
    // The small step label above the title — ONLY the player-pick steps carry
    // one (the cause and roll steps name themselves in the title below).
    const heading = (() => {
      if (stage?.kind === "pickOwn") {
        if (isScoredFlow(flow)) return "";
        if (flow === "foul") return t("match.controls.aggressor");
        if (flow === "selfInflicted") return t("match.controls.victim");
        return t("match.controls.causer"); // casualty / both-down causer
      }
      if (stage?.kind === "pickRival") {
        if (flow === "foul") return t("match.controls.foulVictim");
        return t("match.controls.victim");
      }
      return "";
    })();

    // The bold title tracks the CURRENT step — picking a cause, picking a
    // player, rolling the injury, or the pass-turn reason — so the roll stage
    // never keeps a stale "pick the player" line.
    const title =
      flow === "passTurn"
        ? t("match.turnReason.heading")
        : stage?.kind === "roll"
          ? t("match.dock.rollTitle")
          : stage?.kind === "cause" || stage?.kind === "selfCause"
            ? t("match.controls.injuryCause")
            : stage?.kind === "blockRoll"
              ? "Dados de bloqueo"
              : stage?.kind === "blockFace"
                ? "Resultado del bloqueo"
                : stage?.kind === "armourRoll"
                  ? "Tirada de armadura"
                  : stage?.kind === "weatherKind"
                    ? "Cambiar clima"
                    : stage?.kind === "weatherRoll"
                      ? "Tirada de clima"
                      : t("match.dock.sheetTitle");

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div
          data-testid="live-action-modal"
          className="w-full max-w-md rounded-lg border border-border bg-panel p-4 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              {heading ? (
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {heading}
                </p>
              ) : null}
              <p className="truncate text-sm font-bold text-navy">{title}</p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t("match.dock.closeSheet")}
              className="rounded border border-border px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-background"
            >
              {t("match.dock.closeSheet")}
            </button>
          </div>

          {/* Guided stages: cause / self-cause chips sit above the pool in their
              own step; own/rival pools are shown one at a time. */}
          {stage?.kind === "cause" || stage?.kind === "selfCause" ? (
            <div data-testid="dock-cause-pool" className="flex flex-wrap gap-1.5">
              {(stage.kind === "cause" ? ACTIVE_CAUSES : SELF_CAUSES).map((c) => (
                <button
                  key={c}
                  type="button"
                  data-testid="dock-cause-option"
                  aria-pressed={selections.cause === c}
                  onClick={() => applyGuided({ ...selections, cause: c }, true)}
                  className={`rounded border px-2 py-1 text-xs font-bold ${
                    selections.cause === c
                      ? "border-red bg-red text-white"
                      : "border-border bg-panel text-navy hover:bg-background"
                  }`}
                >
                  {causeLabel(c, t)}
                </button>
              ))}
            </div>
          ) : null}

          {/* Slice E: the + Evento choice step — the recordable acta events,
              labeled by the shared live-event taxonomy (never new copy). Picking
              one routes into that event's EXISTING machinery below. The S2
              "Cambiar clima" entry is the deliberate capture-side literal (its
              event label stays "Clima" via the taxonomy). */}
          {stage?.kind === "choice" ? (
            <div data-testid="dock-event-pool" className="flex flex-wrap gap-1.5">
              {EVENT_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  data-testid="dock-event-option"
                  onClick={() => begin(choice)}
                  className="rounded border border-border bg-panel px-2 py-1 text-xs font-bold text-navy hover:bg-background"
                >
                  {choice === "block"
                    ? causeLabel("block", t)
                    : choice === "weather"
                      ? "Cambiar clima"
                      : liveEventLabel({ kind: choice, half: 1, turnNumber: 1, payload: {} }, t)}
                </button>
              ))}
            </div>
          ) : null}

          {/* S2 (Cambiar clima): the weather-kind chips (the known BB2025
              kinds, labeled via the shared `weatherLabel` taxonomy). Picking
              one advances to the optional d6 stage — the capture fires there. */}
          {stage?.kind === "weatherKind" ? (
            <div data-testid="dock-weather-pool" className="flex flex-wrap gap-1.5">
              {WEATHER_KINDS.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  data-testid="dock-weather-option"
                  aria-pressed={selections.weather === kind}
                  onClick={() => applyGuided({ ...selections, weather: kind }, true)}
                  className={`rounded border px-2 py-1 text-xs font-bold ${
                    selections.weather === kind
                      ? "border-navy bg-navy text-white"
                      : "border-border bg-panel text-navy hover:bg-background"
                  }`}
                >
                  {weatherLabel(kind, t)}
                </button>
              ))}
            </div>
          ) : null}

          {/* S2: the optional 2D6 stage (mirror of the guided roll steppers).
              The rulebook weather roll is 2D6 — lib/rules/weather
              `weatherFromRoll` maps the 2-12 band — so the chips offer every
              2..12 outcome. A value chip fires the capture WITH the roll;
              "Sin tirada" fires it without one — no Registrar button
              (guided-flow principle). */}
          {stage?.kind === "weatherRoll" ? (
            <div data-testid="dock-weather-roll" className="flex flex-wrap gap-1.5">
              {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                <button
                  key={n}
                  type="button"
                  data-testid="dock-weather-roll-option"
                  onClick={() => fireWeather(n)}
                  className="rounded border border-border bg-panel px-2 py-1 text-xs font-bold text-navy hover:bg-background"
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                onClick={() => fireWeather(null)}
                className="rounded border border-border bg-panel px-2 py-1 text-xs font-bold text-navy hover:bg-background"
              >
                Sin tirada
              </button>
            </div>
          ) : null}

          {/* T17 · S10.1: the block-dice stage — the ST comparison drives the
              dice count (lib/rules/blocks `blockDice`: 2 dice when the attacker
              is at least as strong, else 1) and the throw button rolls them. */}
          {stage?.kind === "blockRoll" ? (
            <div data-testid="dock-block-roll" className="space-y-2">
              <p className="text-xs text-slate">
                {`FUE ${attackerStats?.st ?? "?"} vs FUE ${
                  victimStats?.st ?? "?"
                } · ${blockDiceCount} ${blockDiceCount === 1 ? "dado" : "dados"}`}
              </p>
              <button
                type="button"
                data-testid="dock-block-throw"
                onClick={throwBlockDice}
                className="rounded bg-navy px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-navy-hover"
              >
                Tirar dados de bloqueo
              </button>
            </div>
          ) : null}

          {/* T17: the rolled faces ARE the pickable chips (Push x2 collapses to
              one chip — picking a face, not a die). */}
          {stage?.kind === "blockFace" ? (
            <div data-testid="dock-block-face" className="flex flex-wrap gap-1.5">
              {[...new Set(selections.blockDice ?? [])].map((face) => (
                <button
                  key={face}
                  type="button"
                  data-testid="dock-block-face-option"
                  aria-pressed={selections.face === face}
                  onClick={() => pickBlockFace(face)}
                  className={`rounded border px-2 py-1 text-xs font-bold ${
                    selections.face === face
                      ? "border-navy bg-navy text-white"
                      : "border-border bg-panel text-navy hover:bg-background"
                  }`}
                >
                  {BLOCK_FACE_LABELS[face] ?? face}
                </button>
              ))}
            </div>
          ) : null}

          {/* T17: the armour 2D6 vs the current fallen player's AV (manual
              sum entry, same pattern as the weather 2D6 stage). »más de AR
              rompe« is the rulebook break condition (strictly greater). T23:
              the stage walks the chain's fallen players («Ambos caen» falls
              TWO — defender first, then the attacker). */}
          {stage?.kind === "armourRoll" ? (
            <div data-testid="dock-armour-roll" className="space-y-2">
              <p className="text-xs text-slate">
                {(() => {
                  const target = armourTargets[0];
                  const victim = [...own, ...rival].find(
                    (p) => p.rosterPlayerId === target?.playerId,
                  );
                  const av = target?.av ?? null;
                  return `Armadura de ${victim?.name ?? "la víctima"} · AR ${
                    av != null ? `${av}+` : "desconocida"
                  }${av != null ? ` · 2D6 (más de ${av} rompe)` : ""}`;
                })()}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                  <button
                    key={n}
                    type="button"
                    data-testid="dock-armour-roll-option"
                    onClick={() => fireArmour(n)}
                    className="rounded border border-border bg-panel px-2 py-1 text-xs font-bold text-navy hover:bg-background"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {stage?.kind === "pickOwn" ? (
            <>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {t("match.dock.yourSide")}
              </p>
              <div data-testid="dock-pool-own" className="flex flex-wrap gap-1.5">
                {own.map((p) => {
                  const dorsal = ownDorsal.get(p.rosterPlayerId) ?? 0;
                  const position = p.journeyman
                    ? t("match.journeyman")
                    : positionName(rosterRaceId, p.positionalKey);
                  return playerChip(
                    p,
                    dorsal,
                    "own",
                    position,
                    selections.causerId === p.rosterPlayerId ||
                      selections.victimId === p.rosterPlayerId,
                    () => pickPlayer(p, "own"),
                  );
                })}
              </div>
            </>
          ) : null}

          {stage?.kind === "pickRival" ? (
            <>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {t("match.dock.rival")}
              </p>
              <div data-testid="dock-pool-rival" className="flex flex-wrap gap-1.5">
                {rival.map((p) => {
                  const dorsal = rivalDorsal.get(p.rosterPlayerId) ?? 0;
                  const position = p.journeyman
                    ? t("match.journeyman")
                    : positionName(opponentRaceId, p.positionalKey);
                  return playerChip(
                    p,
                    dorsal,
                    "rival",
                    position,
                    selections.victimId === p.rosterPlayerId,
                    () => pickPlayer(p, "rival"),
                  );
                })}
              </div>
            </>
          ) : null}

          {isRollStage ? (
            <div data-testid="dock-roll-stage">
              <RollStepper
                roll16={selections.roll16 ?? ""}
                roll6={selections.roll6 ?? ""}
                onRoll16={setRoll16}
                onRoll6={setRoll6}
                fn={t}
              />
            </div>
          ) : null}

          {/* LM-28/MVT-7: the ACTIVE coach's pass-turn reason stage. Clicking a
              reason chip fires endTurn immediately (no preselection, no confirm). */}
          {openFlow === "passTurn" ? (
            <div data-testid="dock-turnreason-stage" className="mt-1">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["voluntary", t("match.turnReason.voluntary")],
                    ["turnover", t("match.turnReason.turnover")],
                    ["injury", t("match.turnReason.injury")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="button"
                    aria-pressed={reason === value}
                    onClick={() => firePassTurn(value)}
                    className={`rounded border px-3 py-1 text-xs font-bold ${
                      reason === value
                        ? "border-red bg-red text-white"
                        : "border-border bg-panel text-navy hover:bg-background"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  })();

  /** The action chips shown in the dock bar by role. Non-active has NO TD /
   *  Pase / Falta — only the casualty records they are allowed to author. */
  const dockButtons = (() => {
    if (active) {
      return (
        <>
          {/* MVT-7: the ONLY pass-turn control lives here in the bottom dock —
              never in the sticky header (MVT-3). A normal red chip; opening it
              shows the reason modal whose chips fire endTurn on click. */}
          <button
            type="button"
            onClick={() => begin("passTurn")}
            role="button"
            aria-label={t("match.endTurn")}
            title={t("match.endTurn")}
            className="rounded border border-red bg-red px-3 py-1.5 text-xs font-bold text-white hover:bg-red-hover"
          >
            {t("match.endTurn")}
          </button>
          <button
            type="button"
            onClick={() => begin("td")}
            className="rounded border border-chip-td-border bg-panel px-3 py-1.5 text-xs font-bold text-chip-td-text
               hover:bg-background"
            role="button"
            aria-label={`${t("match.menu.td")}`}
            title={t("match.menu.td")}
          >
            TD
          </button>
          <button
            type="button"
            onClick={() => begin("completion")}
            className="rounded border border-border bg-panel px-3 py-1.5 text-xs font-bold text-navy
               hover:bg-background"
            role="button"
            aria-label={t("match.menu.completion")}
            title={t("match.menu.completion")}
          >
            {t("match.menu.completion")}
          </button>
          <button
            type="button"
            onClick={() => begin("casualtyCaused")}
            className="rounded border border-[#f3c1c8] bg-panel px-3 py-1.5 text-xs font-bold text-red
               hover:bg-background"
            role="button"
            aria-label={t("match.strip.casualty")}
            title={t("match.strip.casualty")}
          >
            {t("match.strip.casualty")}
          </button>
          <button
            type="button"
            onClick={() => begin("foul")}
            className="rounded border border-border bg-panel px-3 py-1.5 text-xs font-bold text-navy
               hover:bg-background"
            role="button"
            aria-label={t("match.menu.foul")}
            title={t("match.menu.foul")}
          >
            {t("match.menu.foul")}
          </button>
        </>
      );
    }
    return (
      <>
        <button
          type="button"
          onClick={() => begin("selfInflicted")}
          className="rounded border border-border bg-panel px-3 py-1.5 text-xs font-bold text-navy
             hover:bg-background"
          role="button"
          aria-label={t("match.strip.selfInflicted")}
          title={t("match.strip.selfInflicted")}
        >
          {t("match.strip.selfInflicted")}
        </button>
        <button
          type="button"
          onClick={() => begin("bothDown")}
          className="rounded border border-[#f3c1c8] bg-panel px-3 py-1.5 text-xs font-bold text-red
             hover:bg-background"
          role="button"
          aria-label={t("match.strip.bothDown")}
          title={t("match.strip.bothDown")}
        >
          {t("match.strip.bothDown")}
        </button>
      </>
    );
  })();

  /** MVA-6: the float badge only on the button whose capture fired it — the
   *  + Evento button also carries the captures fired from its choice sheet. */
  const floatFor = (...actions: Flow[]): ActaFloatFeedback | null =>
    feedback != null && actions.includes(feedback.action) ? feedback : null;

  return (
    <section
      data-testid={variant === "acta" ? "acta-capture-dock" : "live-action-dock"}
      aria-label={t("match.dock.actions")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border"
    >
      {/* The centered modal sits ABOVE the bar. The bar is a sibling wrapper so
          its backdrop blur never becomes the modal's containing block (which
          would collapse the overlay's `fixed inset-0`). */}
      {modalContent}
      {/* T17 (S10.4.1): the VICTIM side's pending-injury callouts — shown when
          the combat chain ended in a broken armour and the viewer is the
          victim's owner (never the tackler side, never a spectator). */}
      {flow == null
        ? pendingInjuries
            .filter((pending) => pending.victimSide === viewerSide)
            .map((pending) => {
              const victim = [...own, ...rival].find(
                (p) => p.rosterPlayerId === pending.victimId,
              );
              const dorsal =
                ownDorsal.get(pending.victimId) ??
                rivalDorsal.get(pending.victimId) ??
                0;
              return (
                <PendingInjuryCallout
                  key={pending.id}
                  victimName={victim?.name ?? "el jugador"}
                  victimDorsal={dorsal}
                  onRoll={(roll16, roll6) =>
                    fireVictimInjury(pending, roll16, roll6)
                  }
                  onDismiss={() => dismissVictimInjury(pending.id)}
                />
              );
            })
        : null}
      {variant === "acta" ? (
        matchStarted ? (
        /* MVA-5 (artboard 08 "FIXED BOTTOM QUICK-CAPTURE ACTION DOCK"): white
           panel bar with the 5-column icon+label grid. The artboard's `bottom-14`
           (above the shared bottom nav) resolves to `bottom-0` here — the bottom
           nav anchor is not part of the app shell yet. The full five actions
           render for the ACTIVE coach; the non-active coach keeps only their
           LM-12-legal casualty records (never a 409 button — MVA-4 principle). */
        <div className="bg-panel px-2 py-2 shadow-[0_-4px_12px_rgba(18,34,90,0.08)]">
          <div
            data-testid="acta-capture-grid"
            className={`grid gap-1.5 ${active ? "grid-cols-5" : "grid-cols-2"}`}
          >
            {active ? (
              <>
                <ActaDockButton icon="football" label="+ TD" tone="navy" onClick={() => begin("td")} feedback={floatFor("td")} />
                <ActaDockButton icon="send" label="+ Pase" tone="navy" onClick={() => begin("completion")} feedback={floatFor("completion")} />
                <ActaDockButton icon="medical" label="+ Baja" tone="red" onClick={() => begin("casualtyCaused")} feedback={floatFor("casualtyCaused")} />
                <ActaDockButton icon="more" label="+ Evento" tone="slate" onClick={() => begin("eventChoice")} feedback={floatFor("block", "foul", "interception", "throwTeamMate", "landedSafe", "weather", "eventChoice")} />
                <ActaDockButton icon="flag" label="Fin Turno" tone="solidRed" onClick={() => begin("passTurn")} feedback={floatFor("passTurn")} />
              </>
            ) : (
              <>
                <ActaDockButton
                  icon="medical"
                  label={t("match.strip.selfInflicted")}
                  tone="navy"
                  onClick={() => begin("selfInflicted")}
                  feedback={floatFor("selfInflicted")}
                />
                <ActaDockButton
                  icon="medical"
                  label={t("match.strip.bothDown")}
                  tone="red"
                  onClick={() => begin("bothDown")}
                  feedback={floatFor("bothDown")}
                />
              </>
            )}
          </div>
        </div>
        ) : null
      ) : (
        <div className="bg-white/95 shadow-[0_-2px_10px_rgba(18,34,90,0.08)] backdrop-blur">
          {/* Align the bar's content with the app's main content (same horizontal
              padding as the shell) so the chips line up with the event cards'
              edges, and center them within that width. */}
          <div className="flex w-full flex-wrap items-center justify-center gap-1.5 px-4 py-2 sm:px-6">
            {dockButtons}
          </div>
        </div>
      )}
    </section>
  );
}
