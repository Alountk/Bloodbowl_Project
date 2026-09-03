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
 * Tapping an action opens a SHEET over the dock listing the players involved as
 * chips (dorsal + short name; alive + not `missNextMatch` only). TD/Pase are TWO
 * TOUCHES (action → player fires instantly). Baja/Falta use a guided stepper
 * that reuses the shared `RollStepper` for the 1D16(+1D6) band — the SERVER stays
 * authoritative (the raw rolls are what the route reads), ack stays a feed-card
 * concern (this dock never renders ✓/✗).
 *
 * The sheet's chips mirror the strip's old pickers but are rebuilt here around
 * the action-first mental model (mockup Design A): who-before-what is gone.
 */

type Flow =
  | "td"
  | "completion"
  | "casualtyCaused"
  | "foul"
  | "selfInflicted"
  | "bothDown";

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
          ? "border-[#12225a] bg-[#12225a] text-white"
          : "border-[#e2e8f0] bg-white text-[#12225a] hover:bg-[#f8fafc]"
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
}: LiveActionDockProps) {
  const { t } = useI18n();
  const [flow, setFlow] = useState<Flow | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [selections, setSelections] = useState<GuidedSelections>({});

  // Gates: spectator (no side) or a non-live match → no dock at all.
  if (viewerSide == null || status !== "live") return null;
  const active = isActiveActor(viewerSide, activeSide);

  const own = eligiblePlayers(roster);
  const rival = eligiblePlayers(opponentRoster);
  const ownDorsal = dorsalMap(roster);
  const rivalDorsal = dorsalMap(opponentRoster);

  const derivedKind =
    selections.roll16 === "" || selections.roll16 == null
      ? null
      : resolveInjury(Number(selections.roll16)).kind;
  const needsRoll6 = derivedKind === "permanent";

  const begin = (next: Flow) => {
    setFlow(next);
    setStepIndex(0);
    setSelections({});
  };

  const close = () => {
    setFlow(null);
    setStepIndex(0);
    setSelections({});
  };

  const setRoll16 = (n: number) => setSelections((s) => ({ ...s, roll16: n, roll6: "" }));
  const setRoll6 = (n: number) => setSelections((s) => ({ ...s, roll6: n }));

  const nextStep = () => setStepIndex((i) => i + 1);

  /** Fire a complete command. Two-touch flows submit directly; guided ones go
   * through the Registrar button at the roll/confirm boundary. */
  const submit = (cmd: LiveCommand) => {
    void onSubmit(cmd);
    close();
  };

  const pickPlayer = (p: MatchPlayer, side: "own" | "rival") => {
    if (flow === "td" || flow === "completion") {
      // Touch #2 fires immediately (2-touch TD / Pase). No modal, no roll.
      submit(buildScoredCommand(flow, viewerSide, p.rosterPlayerId));
      return;
    }
    // Guided flows: remember the pick in its stage-slot according to role.
    if (side === "own") {
      const slot =
        flow === "bothDown" || flow === "casualtyCaused" || flow === "foul"
          ? "causerId"
          : "victimId"; // selfInflicted victim is each own fallen player
      setSelections((s) => ({ ...s, [slot]: p.rosterPlayerId }));
    } else {
      setSelections((s) => ({ ...s, victimId: p.rosterPlayerId }));
    }
    nextStep();
  };

  // --- Guided stage render ------------------------------------------------

  const openFlow = flow ?? null;
  const stages = openFlow ? stagesFor(openFlow) : [];
  const stage = stages[Math.min(stepIndex, stages.length)];
  const isRollStage = openFlow != null && stage?.kind === "roll";

  const canRegister = (() => {
    if (openFlow == null) return false;
    if (openFlow === "bothDown" || openFlow === "casualtyCaused") {
      const readyRoll = selections.roll16 !== "" && selections.roll16 != null;
      return (
        selections.causerId != null &&
        selections.victimId != null &&
        readyRoll &&
        (!needsRoll6 || (selections.roll6 !== "" && selections.roll6 != null))
      );
    }
    if (openFlow === "selfInflicted") {
      const readyRoll = selections.roll16 !== "" && selections.roll16 != null;
      return (
        selections.cause != null &&
        selections.victimId != null &&
        readyRoll &&
        (!needsRoll6 || (selections.roll6 !== "" && selections.roll6 != null))
      );
    }
    if (openFlow === "foul") {
      return selections.causerId != null && selections.victimId != null;
    }
    return false;
  })();

  const register = () => {
    if (!openFlow || !canRegister) return;
    const guidedKind =
      openFlow === "casualtyCaused"
        ? "casualty"
        : openFlow === "selfInflicted"
          ? "selfInflicted"
          : openFlow === "bothDown"
            ? "bothDown"
            : openFlow === "foul"
              ? "foul"
              : null;
    if (!guidedKind) return;
    const cmd = buildGuidedCommand(
      guidedKind,
      viewerSide,
      selections as GuidedSelections,
    );
    if (cmd) submit(cmd);
  };

  // Lay out the fixed dock bar + an expanding sheet (when a flow is open).
  const sheetContent = (() => {
    if (!openFlow) return null;
    const heading = (() => {
      if (stage?.kind === "cause") return t("match.controls.injuryCause");
      if (stage?.kind === "selfCause") return t("match.controls.injuryCause");
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

    return (
      <div
        data-testid="live-action-sheet"
        className="rounded-t-xl border border-b-0 border-[#e2e8f0] bg-white px-3 pb-2 pt-3 shadow-[0_-6px_18px_rgba(18,34,90,0.12)]"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            {heading ? (
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {heading}
              </p>
            ) : null}
            <p className="truncate text-sm font-bold text-[#12225a]">
              {t("match.dock.sheetTitle")}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={t("match.dock.closeSheet")}
            className="rounded border border-[#e2e8f0] px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-[#f8fafc]"
          >
            {t("match.dock.closeSheet")}
          </button>
        </div>

        {/* Guided stages: cause / self-cause chips sit above the pool in their
            own step; own/rival pools are shown one at a time. */}
        {stage?.kind === "cause" ||
        stage?.kind === "selfCause" ? (
          <div data-testid="dock-cause-pool" className="flex flex-wrap gap-1.5">
            {(stage.kind === "cause" ? ACTIVE_CAUSES : SELF_CAUSES).map((c) => (
              <button
                key={c}
                type="button"
                data-testid="dock-cause-option"
                aria-pressed={selections.cause === c}
                onClick={() => {
                  setSelections((s) => ({ ...s, cause: c }));
                  nextStep();
                }}
                className={`rounded border px-2 py-1 text-xs font-bold ${
                  selections.cause === c
                    ? "border-[#d11938] bg-[#d11938] text-white"
                    : "border-[#e2e8f0] bg-white text-[#12225a] hover:bg-[#f8fafc]"
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

        {/* Registrar: any guided flow after its chip/roll stages are met. */}
        {openFlow !== "td" && openFlow !== "completion" ? (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              data-testid="live-action-submit"
              onClick={register}
              disabled={!canRegister}
              className="rounded bg-[#12225a] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1d48] disabled:opacity-40"
            >
              {t("match.controls.record")}
            </button>
          </div>
        ) : null}
      </div>
    );
  })();

  /** The action chips shown in the dock bar by role. Non-active has NO TD /
   *  Pase / Falta — only the casualty records they are allowed to author. */
  const dockButtons = (() => {
    if (active) {
      return (
        <>
          <button
            type="button"
            onClick={() => begin("td")}
            className="rounded border border-[#e6d9a8] bg-white px-3 py-1.5 text-xs font-bold text-[#8a6d1a]
               hover:bg-[#f8fafc]"
            role="button"
            aria-label={`${t("match.menu.td")}`}
            title={t("match.menu.td")}
          >
            TD
          </button>
          <button
            type="button"
            onClick={() => begin("completion")}
            className="rounded border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-bold text-[#12225a]
               hover:bg-[#f8fafc]"
            role="button"
            aria-label={t("match.menu.completion")}
            title={t("match.menu.completion")}
          >
            {t("match.menu.completion")}
          </button>
          <button
            type="button"
            onClick={() => begin("casualtyCaused")}
            className="rounded border border-[#f3c1c8] bg-white px-3 py-1.5 text-xs font-bold text-[#d11938]
               hover:bg-[#f8fafc]"
            role="button"
            aria-label={t("match.strip.casualty")}
            title={t("match.strip.casualty")}
          >
            {t("match.strip.casualty")}
          </button>
          <button
            type="button"
            onClick={() => begin("foul")}
            className="rounded border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-bold text-[#12225a]
               hover:bg-[#f8fafc]"
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
          className="rounded border border-[#e2e8f0] bg-white px-3 py-1.5 text-xs font-bold text-[#12225a]
             hover:bg-[#f8fafc]"
          role="button"
          aria-label={t("match.strip.selfInflicted")}
          title={t("match.strip.selfInflicted")}
        >
          {t("match.strip.selfInflicted")}
        </button>
        <button
          type="button"
          onClick={() => begin("bothDown")}
          className="rounded border border-[#f3c1c8] bg-white px-3 py-1.5 text-xs font-bold text-[#d11938]
             hover:bg-[#f8fafc]"
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e2e8f0] bg-white/95 shadow-[0_-2px_10px_rgba(18,34,90,0.08)] backdrop-blur"
    >
      {/* The fixed dock grows upward: the sheet renders ABOVE the chips row. */}
      <div className="mx-auto w-full max-w-3xl px-3 pt-1">
        {sheetContent}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[#e2e8f0] py-2">
          <p className="mr-1 hidden text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:inline">
            {t("match.dock.actions")}
          </p>
          {dockButtons}
        </div>
      </div>
    </section>
  );
}
