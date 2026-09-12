"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { resolveInjury } from "@/lib/rules/injuries";
import { causeLabel } from "./liveEventLabels";
import { RollStepper } from "./rollStepper";
import {
  ACTIVE_CAUSES,
  SELF_CAUSES,
  buildGuidedCommand,
  buildScoredCommand,
  dorsalMap,
  eligiblePlayers,
  isActiveActor,
  positionName,
  shortName,
  type GuidedSelections,
} from "./liveActionEntry";
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
 */

type Flow =
  | "td"
  | "completion"
  | "casualtyCaused"
  | "foul"
  | "selfInflicted"
  | "bothDown"
  | "passTurn";

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
  /** LM-28/MVT-7: the ACTIVE team's display name for the dock bar's
   * "Turno {team}" status label (only shown to the active coach). Optional so
   * direct-dock tests (which render no header) can omit it; MatchView provides
   * it. */
  activeTeamName?: string;
}

/** A guided step inside the dock sheet: pick chips vs a RollStepper stage. */
type GuidedStage =
  | { kind: "cause"; causes: typeof ACTIVE_CAUSES }
  | { kind: "pickOwn" }
  | { kind: "pickRival" }
  | { kind: "selfCause" }
  | { kind: "roll" };

/** The ordered stages a guided flow walks (based on the mockup stepper). */
function stagesFor(flow: Flow): GuidedStage[] {
  switch (flow) {
    case "td":
    case "completion":
      // Two-touch TD / Pase: the sheet only picks the own player → fires.
      return [{ kind: "pickOwn" }];
    case "casualtyCaused":
      return [
        { kind: "cause", causes: ACTIVE_CAUSES },
        { kind: "pickOwn" },
        { kind: "pickRival" },
        { kind: "roll" },
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

export function LiveActionDock({
  viewerSide,
  activeSide,
  status,
  roster,
  opponentRoster,
  rosterRaceId,
  opponentRaceId,
  onSubmit,
  activeTeamName,
}: LiveActionDockProps) {
  const { t } = useI18n();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [selections, setSelections] = useState<GuidedSelections>({});
  const [reason, setReason] = useState<TurnReason | null>(null);

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
  };

  const close = () => {
    setFlow(null);
    setStepIndex(0);
    setSelections({});
    setReason(null);
  };

  const nextStep = () => setStepIndex((i) => i + 1);

  /** Fire a complete command and reset the flow. */
  const submit = (cmd: LiveCommand) => {
    void onSubmit(cmd);
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
    if (flow === "td" || flow === "completion") {
      // Touch #2 fires immediately (2-touch TD / Pase). No modal, no roll.
      submit(buildScoredCommand(flow, viewerSide, p.rosterPlayerId));
      return;
    }
    // Guided flows: remember the pick in its stage-slot according to role, then
    // fire automatically when it was the last required selection.
    const slot =
      side === "own"
        ? flow === "bothDown" || flow === "casualtyCaused" || flow === "foul"
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

  // The centered modal that hosts the open flow (the dock bar stays underneath).
  const modalContent = (() => {
    if (!openFlow) return null;
    // The small step label above the title — ONLY the player-pick steps carry
    // one (the cause and roll steps name themselves in the title below).
    const heading = (() => {
      if (stage?.kind === "pickOwn") {
        if (flow === "td" || flow === "completion") return "";
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

  return (
    <section
      data-testid="live-action-dock"
      aria-label={t("match.dock.actions")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border"
    >
      {/* The centered modal sits ABOVE the bar. The bar is a sibling wrapper so
          its backdrop blur never becomes the modal's containing block (which
          would collapse the overlay's `fixed inset-0`). */}
      {modalContent}
      <div className="bg-white/95 shadow-[0_-2px_10px_rgba(18,34,90,0.08)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-1.5 px-3 py-2">
          {active && activeTeamName ? (
            <small
              role="status"
              className="mr-1 text-[10px] font-bold uppercase tracking-wide text-slate-500"
            >
              {t("match.turnOfTeam", { team: activeTeamName })}
            </small>
          ) : null}
          {dockButtons}
        </div>
      </div>
    </section>
  );
}
