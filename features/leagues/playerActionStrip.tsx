"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { CASUALTY_CAUSES, type CasualtyCause } from "@/lib/livePhase";
import { resolveInjury } from "@/lib/rules/injuries";
import { causeLabel } from "./liveEventLabels";
import { getRaceById } from "@/features/teams/data/races";
import { RollStepper } from "./rollStepper";
import type { LiveCommand, MatchPlayer } from "./api";

/**
 * Design-B player-first action strip (LM-20, D3): instead of a floating "+" menu
 * with long selects, the live panel shows TUS own alive players as chips (dorsal
 * from the full served roster index + 1, D21). Tapping a chip opens a role-aware
 * bubble asking what happened to that player:
 *
 * - ACTIVE coach: TD / Pase completo (2 touches — submit on the second tap),
 *   "Baja causada" (the tapped player is the causer, prefilled) and "Falta"
 *   (the tapped player is the aggressor).
 * - NON-active coach (turn rival): only casualty records on their OWN team —
 *   the SELF-INFLICTED dodge/crowd wound (victim = the tapped player) and the
 *   "Baja — ambos derribados" block form, where the tapped own defender is the
 *   CAUSER and the rival fallen blocker becomes the VICTIM
 *   `{side: rival, victimRosterId: rival, causerRosterId: tapped, bothDown:true}`
 *   (D1 canonical — DEC-1, the rival victim, never an own victim).
 *
 * Guided flows (casualty/foul) use chip pickers (no `<select>`) and the shared
 * `RollStepper` for the 1D16(+1D6) rolls. The SERVER matrix stays authoritative:
 * a bypass POST returns 409 (route tests). Placement mirrors the removed
 * `EventControls`: renders only when `status === "live"` and the viewer has a
 * side (LM-20 no-side → none). A spectator/admin sees nothing.
 */

const CAUSES_REQUIRING_CAUSER = new Set<CasualtyCause>(["blitz", "foul", "block"]);

/** The ACTIVE coach proposes causer-required causes for a caused Baja/Falta. */
const ACTIVE_CAUSES = CASUALTY_CAUSES.filter((c) => CAUSES_REQUIRING_CAUSER.has(c));
/** The NON-active self-inflicted wound is dodge/crowd only (no causer). */
const SELF_CAUSES = CASUALTY_CAUSES.filter((c) => !CAUSES_REQUIRING_CAUSER.has(c));

/**
 * RAU-48: the positional display name for a player line ("blitzer" → "Blitzer"),
 * resolved against the race catalog; unknown keys pass through. Exported so the
 * resolution modal's MJP pickers share the same position label (RAU-13 dorsal).
 * Moved here (previously exported from the deleted `liveControls.tsx`).
 */
export function positionName(raceId: string, positionalKey: string): string {
  const race = getRaceById(raceId);
  return race?.positionals.find((pos) => pos.key === positionalKey)?.name ?? positionalKey;
}

/** The dorsal is the served-array index + 1 (D21), matching the feed's table. */
function dorsalMap(pool: MatchPlayer[]): Map<string, number> {
  return new Map(pool.map((p, i) => [p.rosterPlayerId, i + 1]));
}

/** Chip short name: first name token (mockup "Design B"), whole name for a single token. */
function shortName(p: MatchPlayer): string {
  return p.name.trim().split(/\s+/)[0] || p.name;
}

export interface PlayerActionStripProps {
  viewerSide: "home" | "away" | null;
  activeSide: "home" | "away";
  /** "live" renders the strip; spectator/admin has `viewerSide` null. */
  status: "pending" | "ready" | "live" | "finished";
  /** The viewer's OWN roster (the strip chips) — only alive players offered. */
  roster: MatchPlayer[];
  /** Rival roster (opposite the viewer): casualty/foul victim and both-down blocker. */
  opponentRoster: MatchPlayer[];
  /** RAU-48: the race ids used for the position label of each roster. */
  rosterRaceId: string;
  opponentRaceId: string;
  /** Wraps `act`: `/api/.../live` POST command. */
  onSubmit: (cmd: LiveCommand) => Promise<void>;
}

/** The role-aware bubble flow the strip is currently showing for a tapped chip. */
type Flow = "ready" | "casualtyCaused" | "foul" | "selfInflicted" | "bothDown";

export function PlayerActionStrip({
  viewerSide,
  activeSide,
  status,
  roster,
  opponentRoster,
  rosterRaceId,
  opponentRaceId,
  onSubmit,
}: PlayerActionStripProps) {
  const { t } = useI18n();
  const [openId, setOpenId] = useState<string | null>(null);
  const [flow, setFlow] = useState<Flow>("ready");
  const [cause, setCause] = useState<CasualtyCause | "">("");
  const [victimId, setVictimId] = useState<string>("");
  const [roll16, setRoll16] = useState<number | "">("");
  const [roll6, setRoll6] = useState<number | "">("");

  // LM-20: no strip for a spectator/admin (no side) or outside a live match.
  if (viewerSide == null || status !== "live") return null;

  const isActive = viewerSide === activeSide;
  const ownPlayers = roster.filter((p) => p.alive && !p.missNextMatch);
  const rivalPlayers = opponentRoster.filter((p) => p.alive && !p.missNextMatch);
  const ownDorsal = dorsalMap(roster);
  const rivalDorsal = dorsalMap(opponentRoster);
  const openPlayer = ownPlayers.find((p) => p.rosterPlayerId === openId) ?? null;
  const oppSide = viewerSide === "home" ? "away" : "home";

  const derivedKind = roll16 === "" ? null : resolveInjury(Number(roll16)).kind;
  const needsRoll6 = derivedKind === "permanent";

  const resetFlow = () => {
    setCause("");
    setVictimId("");
    setRoll16("");
    setRoll6("");
    setFlow("ready");
  };

  const close = () => {
    setOpenId(null);
    resetFlow();
  };

  const submit = (cmd: LiveCommand) => {
    void onSubmit(cmd);
    close();
  };

  const pickPlayerForAction = (p: MatchPlayer, raceId: string, dorsal: Map<string, number>) => {
    const dorsalNumber = dorsal.get(p.rosterPlayerId) ?? 0;
    const role = p.journeyman ? t("match.journeyman") : positionName(raceId, p.positionalKey);
    return (
      <button
        key={p.rosterPlayerId}
        type="button"
        data-testid="player-action-rival"
        aria-label={`#${dorsalNumber} ${shortName(p)}${p.journeyman ? ` (${t("match.journeyman")})` : ` (${role})`}`}
        onClick={() => setVictimId(p.rosterPlayerId)}
        className={`rounded border px-2 py-1 text-xs font-bold ${
          victimId === p.rosterPlayerId
            ? "border-[#12225a] bg-[#12225a] text-white"
            : "border-[#e2e8f0] bg-white text-[#12225a] hover:bg-[#f8fafc]"
        }`}
      >
        #{dorsalNumber} {shortName(p)}
      </button>
    );
  };

  const causeChips = (causes: CasualtyCause[]) => (
    <div className="flex flex-wrap gap-1.5">
      {causes.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => {
            setCause(c);
            setVictimId("");
            setRoll16("");
            setRoll6("");
          }}
          className={`rounded border px-2 py-1 text-xs font-bold ${
            cause === c
              ? "border-[#d11938] bg-[#d11938] text-white"
              : "border-[#e2e8f0] bg-white text-[#12225a] hover:bg-[#f8fafc]"
          }`}
        >
          {causeLabel(c, t)}
        </button>
      ))}
    </div>
  );

  const submitReady = (() => {
    if (flow === "casualtyCaused") {
      return cause !== "" && victimId !== "" && roll16 !== "" && (!needsRoll6 || roll6 !== "");
    }
    if (flow === "selfInflicted") {
      return cause !== "" && roll16 !== "" && (!needsRoll6 || roll6 !== "");
    }
    if (flow === "bothDown") {
      return victimId !== "" && roll16 !== "" && (!needsRoll6 || roll6 !== "");
    }
    if (flow === "foul") {
      return victimId !== "";
    }
    return false;
  })();

  /** Registrar — builds + fires any flow; used only for guided (Baja/Falta) flows. */
  const onRegister = () => {
    if (!openPlayer) return;
    let cmd: LiveCommand | null = null;
    const activeVictimSide = oppSide;
    if (flow === "casualtyCaused" && cause && victimId && roll16 !== "") {
      const base: LiveCommand = {
        type: "casualty",
        side: activeVictimSide,
        victimRosterId: victimId,
        causerRosterId: openPlayer.rosterPlayerId,
        cause,
        roll16: Number(roll16),
      };
      if (needsRoll6 && roll6 !== "") (base as { roll6?: number }).roll6 = Number(roll6);
      cmd = base;
    } else if (flow === "selfInflicted" && cause && roll16 !== "") {
      const base: LiveCommand = {
        type: "casualty",
        side: viewerSide,
        victimRosterId: openPlayer.rosterPlayerId,
        cause,
        roll16: Number(roll16),
      };
      if (needsRoll6 && roll6 !== "") (base as { roll6?: number }).roll6 = Number(roll6);
      cmd = base;
    } else if (flow === "bothDown" && victimId && roll16 !== "") {
      // D1 canonical (DEC-1): the NON-active coach records the RIVAL's fallen
      // blocker whose OWN defender caused the both-down. Cause is fixed `block`;
      // causer = the tapped own defender; victim = the rival fallen blocker.
      const casualty: Extract<LiveCommand, { type: "casualty" }> = {
        type: "casualty",
        side: oppSide,
        victimRosterId: victimId,
        causerRosterId: openPlayer.rosterPlayerId,
        cause: "block",
        roll16: Number(roll16),
        bothDown: true,
      };
      if (needsRoll6 && roll6 !== "") casualty.roll6 = Number(roll6);
      cmd = casualty;
    } else if (flow === "foul" && victimId) {
      cmd = { type: "foul", side: viewerSide, playerRosterId: openPlayer.rosterPlayerId, victimRosterId: victimId };
    }
    if (cmd) submit(cmd);
  };

  const actionButtons = (() => {
    if (isActive) {
      return (
        <>
          <button
            type="button"
            onClick={() => openPlayer && submit({ type: "td", side: viewerSide, playerRosterId: openPlayer.rosterPlayerId })}
            className="rounded border border-[#e6d9a8] bg-white px-2 py-1 text-xs font-bold text-[#8a6d1a] hover:bg-[#f8fafc]"
          >
            {t("match.menu.td")}
          </button>
          <button
            type="button"
            onClick={() => openPlayer && submit({ type: "completion", side: viewerSide, playerRosterId: openPlayer.rosterPlayerId })}
            className="rounded border border-[#e2e8f0] bg-white px-2 py-1 text-xs font-bold text-[#12225a] hover:bg-[#f8fafc]"
          >
            {t("match.menu.completion")}
          </button>
          <button
            type="button"
            onClick={() => { setCause(""); setVictimId(""); setRoll16(""); setRoll6(""); setFlow("casualtyCaused"); }}
            className="rounded border border-[#f3c1c8] bg-white px-2 py-1 text-xs font-bold text-[#d11938] hover:bg-[#f8fafc]"
          >
            {t("match.strip.casualty")}
          </button>
          <button
            type="button"
            onClick={() => { setVictimId(""); setFlow("foul"); }}
            className="rounded border border-[#e2e8f0] bg-white px-2 py-1 text-xs font-bold text-[#12225a] hover:bg-[#f8fafc]"
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
          onClick={() => { setCause(""); setRoll16(""); setRoll6(""); setFlow("selfInflicted"); }}
          className="rounded border border-[#e2e8f0] bg-white px-2 py-1 text-xs font-bold text-[#12225a] hover:bg-[#f8fafc]"
        >
          {t("match.strip.selfInflicted")}
        </button>
        <button
          type="button"
          onClick={() => { setVictimId(""); setRoll16(""); setRoll6(""); setFlow("bothDown"); }}
          className="rounded border border-[#f3c1c8] bg-white px-2 py-1 text-xs font-bold text-[#d11938] hover:bg-[#f8fafc]"
        >
          {t("match.strip.bothDown")}
        </button>
      </>
    );
  })();

  const flowBody = (() => {
    if (flow === "casualtyCaused") {
      // Choose cause, then the RIVAL victim, then the 1D16(+1D6). The causer is
      // the tapped own player (prefilled) — no separate causer pick.
      return (
        <div className="mt-2 flex flex-col gap-2">
          {cause === "" ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {t("match.controls.injuryCause")}
              </p>
              {causeChips(ACTIVE_CAUSES)}
            </>
          ) : victimId === "" ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {t("match.controls.victim")}
              </p>
              <div data-testid="player-action-victims" className="flex flex-wrap gap-1.5">
                {rivalPlayers.map((p) => pickPlayerForAction(p, opponentRaceId, rivalDorsal))}
              </div>
            </>
          ) : (
            <RollStepper roll16={roll16} roll6={roll6} onRoll16={(n) => { setRoll16(n); setRoll6(""); }} onRoll6={setRoll6} fn={t} />
          )}
        </div>
      );
    }
    if (flow === "selfInflicted") {
      return (
        <div className="mt-2 flex flex-col gap-2">
          {cause === "" ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {t("match.controls.injuryCause")}
              </p>
              {causeChips(SELF_CAUSES)}
            </>
          ) : (
            <RollStepper roll16={roll16} roll6={roll6} onRoll16={(n) => { setRoll16(n); setRoll6(""); }} onRoll6={setRoll6} fn={t} />
          )}
        </div>
      );
    }
    if (flow === "bothDown") {
      return (
        <div className="mt-2 flex flex-col gap-2">
          {victimId === "" ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                {t("match.controls.victim")}
              </p>
              <div data-testid="player-action-blockers" className="flex flex-wrap gap-1.5">
                {rivalPlayers.map((p) => pickPlayerForAction(p, opponentRaceId, rivalDorsal))}
              </div>
            </>
          ) : (
            <RollStepper
              roll16={roll16}
              roll6={roll6}
              onRoll16={(n) => {
                setRoll16(n);
                setRoll6("");
              }}
              onRoll6={setRoll6}
              fn={t}
            />
          )}
        </div>
      );
    }
    if (flow === "foul") {
      return (
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {t("match.controls.foulVictim")}
          </p>
          <div data-testid="player-action-victims" className="flex flex-wrap gap-1.5">
            {rivalPlayers.map((p) => pickPlayerForAction(p, opponentRaceId, rivalDorsal))}
          </div>
        </div>
      );
    }
    return null;
  })();

  return (
    <section data-testid="player-action-strip" className="border-t border-[#e2e8f0] bg-white px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
        {t("match.strip.yourPlayers")}
      </p>
      {openPlayer ? (
        <div
          data-testid="player-action-bubble"
          className="mt-2 rounded-md border border-[#e2e8f0] bg-white p-3 shadow-sm"
        >
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-[#12225a]">
              {t("match.strip.bubbleTitle", {
                name: `#${ownDorsal.get(openPlayer.rosterPlayerId) ?? 0} ${shortName(openPlayer)}`,
              })}
            </p>
            <button
              type="button"
              onClick={close}
              aria-label={t("common.cancel")}
              className="rounded border border-[#e2e8f0] px-2 py-0.5 text-[11px] font-semibold text-slate-500 hover:bg-[#f8fafc]"
            >
              {t("common.cancel")}
            </button>
          </div>
          <p className="text-xs font-semibold text-[#12225a]">
            {`#${ownDorsal.get(openPlayer.rosterPlayerId) ?? 0} ${openPlayer.name}`}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">{actionButtons}</div>
          {flowBody}
          {flow !== "ready" ? (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                data-testid="player-action-submit"
                onClick={onRegister}
                disabled={!submitReady}
                className="rounded bg-[#12225a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1d48] disabled:opacity-40"
              >
                {t("match.controls.record")}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {ownPlayers.map((p) => {
          const dorsalNumber = ownDorsal.get(p.rosterPlayerId) ?? 0;
          const role = p.journeyman ? t("match.journeyman") : positionName(rosterRaceId, p.positionalKey);
          const selected = p.rosterPlayerId === openId;
          return (
            <button
              key={p.rosterPlayerId}
              type="button"
              data-testid="player-action-chip"
              aria-label={`#${dorsalNumber} ${shortName(p)}${p.journeyman ? ` (${t("match.journeyman")})` : ` (${role})`}`}
              onClick={() => {
                if (openId === p.rosterPlayerId) {
                  close();
                } else {
                  setOpenId(p.rosterPlayerId);
                  resetFlow();
                }
              }}
              className={`rounded border px-2 py-1 text-xs font-bold ${
                selected
                  ? "border-[#12225a] bg-[#12225a] text-white"
                  : "border-[#e2e8f0] bg-white text-[#12225a] hover:bg-[#f8fafc]"
              }`}
            >
              #{dorsalNumber} {shortName(p)}
            </button>
          );
        })}
      </div>
    </section>
  );
}
