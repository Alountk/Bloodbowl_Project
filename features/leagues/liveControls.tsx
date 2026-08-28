"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { resolveInjury, permanentAttribute } from "@/lib/rules/injuries";
import { CASUALTY_CAUSES } from "@/lib/livePhase";
import type { CasualtyCause } from "@/lib/livePhase";
import { casualtyKindLabel } from "./matchSummary";
import { causeLabel, casualtyBandLabel, type TFunc } from "./liveEventLabels";
import { getRaceById } from "@/features/teams/data/races";
import type { LiveCommand, MatchPlayer } from "./api";

/**
 * Event recording controls (LM-20, D26): a floating "+" that opens a role-aware
 * event-type menu and a mini-form to record live events. Rendering is gated on
 * `viewerSide != null && status === "live"` (the server matrix stays the
 * authority — a bypass POST returns 409, proven by the route tests). The menu
 * derives from `viewerSide` vs `activeSide`: the ACTIVE coach may record TD /
 * Pase completo / Baja / Falta; the NON-active coach is offered ONLY the
 * casualty action (their own player).
 *
 * RAU-39 two-phase casualty: the ACTIVE coach (the attacker) PROPOSES the
 * injury THEY inflicted — causer (OWN alive roster), victim (OPPONENT roster),
 * a causer-required cause (blitz/foul/block) and the 1D16 roll. The
 * BAND is DERIVED server-side from the roll (NO band select — the client only
 * mirrors `resolveInjury` to show the derived band live and to surface the
 * required 1D6 attribute roll when the band is `permanent`). The NON-active
 * coach CONFIRMS the proposal in the turn zone instead of recording. The only
 * DIRECT casualty left is a SELF-INFLICTED dodge/crowd injury to the viewer's
 * OWN player (recorded with roll16, band derived, NO confirmation).
 *
 * Labels stay DISTINCT from "Jugador" so `getByLabelText(/Jugador/i)` remains
 * unambiguous (D7). Submit passes through the parent's `act`/`sendCommand`/
 * `busyRef`; a server 409 surfaces via the existing error alert.
 */

type EventKindOption = "td" | "completion" | "casualty" | "foul";

/** Causes that require an explicit causer (opposite victim); dodge/crowd are self-inflicted (LM-12). */
const CAUSE_REQUIRES_CAUSER = new Set<CasualtyCause>(["blitz", "foul", "block"]);

/** The ACTIVE coach proposes only causer-required causes (the dodge/crowd path
 * is the direct self-inflicted casualty of the victim's own side, RAU-39). */
const ACTIVE_CAUSES = CASUALTY_CAUSES.filter((c) => CAUSE_REQUIRES_CAUSER.has(c));
/** The NON-active coach records only self-inflicted (dodge/crowd) injuries. */
const SELF_CAUSES = CASUALTY_CAUSES.filter((c) => !CAUSE_REQUIRES_CAUSER.has(c));

/** The raw 1D16 / 1D6 values offered by the roll selects. The select VALUE stays
 * the raw number; the OPTION LABEL shows the derived outcome (RAU-42). */
const ROLL16_VALUES = Array.from({ length: 16 }, (_, i) => i + 1);
const ROLL6_VALUES = Array.from({ length: 6 }, (_, i) => i + 1);

/**
 * RAU-42: the 1D16 option label — "{roll} → {band}" ("8 → Magullado"), with the
 * required-1D6 hint appended to the permanent band ("13 → Permanente (tira
 * 1D6)"). Display-only; the option value stays the raw roll.
 */
function roll16OptionLabel(n: number, t: TFunc): string {
  const kind = resolveInjury(n).kind;
  const suffix = kind === "permanent" ? t("match.controls.roll6Suffix") : "";
  return t("match.controls.roll16Option", { roll: n, band: casualtyBandLabel(kind, t) }) + suffix;
}

/** RAU-42: the 1D6 option label — "{roll} → −{attr}" ("5 → −AG"). Display-only;
 * the option value stays the raw roll. */
function roll6OptionLabel(n: number, t: TFunc): string {
  return t("match.controls.roll6Option", { roll: n, attr: permanentAttribute(n).toUpperCase() });
}

/** RAU-48: the positional display name for a player line ("blitzer" → "Blitzer"),
 * resolved against the race catalog; unknown keys pass through. Exported so the
 * resolution modal's MJP pickers share the same position label (RAU-13 dorsal). */
export function positionName(raceId: string, positionalKey: string): string {
  const race = getRaceById(raceId);
  return race?.positionals.find((pos) => pos.key === positionalKey)?.name ?? positionalKey;
}

/** RAU-48/RAU-13/RAU-14: the option label for a roster player — "Don Pelayo
 * El Bestia (Bull Centaur · #3)" — so causer/victim/scorer picks are
 * unambiguous and the dorsal (served-array index + 1) is visible. A Journeyman
 * (Novato) is labeled with the journeyman marker in the role slot:
 * "Aldric Martillo (Novato · #12)". RAU-14 appends the player's experience
 * (★PE) when > 0 so the coach sees it at a glance. */
function playerOptionLabel(
  p: MatchPlayer,
  raceId: string,
  journeymanLabel: string,
  dorsal: number,
): string {
  const role = p.journeyman ? journeymanLabel : positionName(raceId, p.positionalKey);
  const peSuffix = p.pe > 0 ? ` · ★${p.pe}` : "";
  return `${p.name} (${role} · #${dorsal})${peSuffix}`;
}

interface EventControlsProps {
  viewerSide: "home" | "away" | null;
  activeSide: "home" | "away";
  /** "live" only renders the FAB; a spectator/admin has `viewerSide` null. */
  status: "pending" | "ready" | "live" | "finished";
  /** The viewer's OWN roster (the side's players) — only alive players are offered. */
  roster: MatchPlayer[];
  /** The RIVAL roster (opposite the viewer): Falta victim; casualty VICTIM for the ACTIVE coach (RAU-34/39). */
  opponentRoster: MatchPlayer[];
  /** RAU-48: the race ids behind each roster, used to show the positional name. */
  rosterRaceId: string;
  opponentRaceId: string;
  /** Wraps `act`: `/api/.../live` POST command. */
  onSubmit: (cmd: LiveCommand) => Promise<void>;
}

/** The FAB + menu item labels, keyed into the i18n dictionaries (rulebook-light). */
const ACTIVE_MENU: { kind: EventKindOption; key: string }[] = [
  { kind: "td", key: "match.menu.td" },
  { kind: "completion", key: "match.menu.completion" },
  { kind: "casualty", key: "match.menu.casualty" },
  { kind: "foul", key: "match.menu.foul" },
];

const NON_ACTIVE_MENU: { kind: EventKindOption; key: string }[] = [
  { kind: "casualty", key: "match.menu.injury" },
];

export function EventControls({
  viewerSide,
  activeSide,
  status,
  roster,
  opponentRoster,
  rosterRaceId,
  opponentRaceId,
  onSubmit,
}: EventControlsProps) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [kind, setKind] = useState<EventKindOption | null>(null);
  const [playerRosterId, setPlayerRosterId] = useState("");
  const [cause, setCause] = useState<CasualtyCause | "">("");
  const [causerRosterId, setCauserRosterId] = useState("");
  const [victimRosterId, setVictimRosterId] = useState("");
  const [roll16, setRoll16] = useState<number | "">("");
  const [roll6, setRoll6] = useState<number | "">("");

  // LM-20: no controls for a spectator/admin (no side) or outside a live match.
  if (viewerSide == null || status !== "live") return null;

  const isActive = viewerSide === activeSide;
  const menuItems = isActive ? ACTIVE_MENU : NON_ACTIVE_MENU;
  // RAU-12: a lasting-band casualty makes the victim unavailable for THIS match
  // — the pools exclude them (in addition to the dead), so a suspended player
  // can never be a scorer/causer/victim/foul-target until the team plays again.
  // RAU-13: Journeymen are alive && !missNextMatch, so they naturally pass into
  // the pools and become selectable (labeled "Novato" via `playerOptionLabel`).
  const alivePlayers = roster.filter((p) => p.alive && !p.missNextMatch);
  const aliveOpponentPlayers = opponentRoster.filter((p) => p.alive && !p.missNextMatch);
  const journeymanLabel = t("match.journeyman");
  // RAU-13: the dorsal is the served-array index + 1 (D21), so the option
  // label shows the same #n the feed/table use — built per pool source array.
  const rosterDorsal = new Map<string, number>(roster.map((p, i) => [p.rosterPlayerId, i + 1]));
  const opponentDorsal = new Map<string, number>(opponentRoster.map((p, i) => [p.rosterPlayerId, i + 1]));
  // RAU-39 role-aware pools: the ACTIVE coach proposes the injury THEY inflicted
  // (victim from the rival, causer from their OWN roster); the NON-active coach
  // records a SELF-INFLICTED wound on their OWN player (victim own, no causer).
  const victimPool = isActive ? aliveOpponentPlayers : alivePlayers;
  const causerPool = alivePlayers;
  // RAU-48: the victim pool belongs to the RIVAL for the active coach's proposal
  // and to the VIEWER's own roster for a self-inflicted injury — the race id
  // follows the pool so the position label resolves against the right catalog.
  const victimRaceId = isActive ? opponentRaceId : rosterRaceId;

  const causeOptions = isActive ? ACTIVE_CAUSES : SELF_CAUSES;
  const derivedBand = roll16 === "" ? null : resolveInjury(Number(roll16)).kind;
  const needsRoll6 = derivedBand === "permanent";

  const reset = () => {
    setMenuOpen(false);
    setKind(null);
    setPlayerRosterId("");
    setCause("");
    setCauserRosterId("");
    setVictimRosterId("");
    setRoll16("");
    setRoll6("");
  };

  // Cancelar returns to the open menu (does not close it); submit closes all.
  const cancel = () => {
    setKind(null);
    setPlayerRosterId("");
    setCause("");
    setCauserRosterId("");
    setVictimRosterId("");
    setRoll16("");
    setRoll6("");
  };

  const submit = () => {
    const side = viewerSide;
    if (kind === "casualty") {
      if (!playerRosterId || cause === "" || roll16 === "") return;
      if (needsRoll6 && roll6 === "") return;
      if (isActive) {
        // Design B: the ACTIVE coach records the casualty DIRECTLY (one phase,
        // no confirm) — the event's `side` is the VICTIM's side (the opponent,
        // opposite the attacker). The rival's ✓/✗ acknowledgement is
        // informational only and never blocks the match.
        if (!causerRosterId) return;
        const cmd: LiveCommand = {
          type: "casualty",
          side: side === "home" ? "away" : "home",
          victimRosterId: playerRosterId,
          causerRosterId,
          cause,
          roll16: Number(roll16),
        };
        if (needsRoll6) cmd.roll6 = Number(roll6);
        void onSubmit(cmd);
      } else {
        // The NON-active coach records a SELF-INFLICTED (dodge/crowd) casualty
        // to their OWN player directly — band derived server-side, no confirm.
        const cmd: LiveCommand = {
          type: "casualty",
          side,
          victimRosterId: playerRosterId,
          cause,
          roll16: Number(roll16),
        };
        if (needsRoll6) cmd.roll6 = Number(roll6);
        void onSubmit(cmd);
      }
    } else if (kind === "td") {
      if (!playerRosterId) return;
      void onSubmit({ type: "td", side, playerRosterId });
    } else if (kind === "completion") {
      if (!playerRosterId) return;
      void onSubmit({ type: "completion", side, playerRosterId });
    } else if (kind === "foul") {
      // Falta: aggressor + victim (opponent) are both required (LM-20).
      if (!playerRosterId || !victimRosterId) return;
      void onSubmit({ type: "foul", side, playerRosterId, victimRosterId });
    }
    // Close on submit; errors surface via the parent `act` alert (LM-20).
    reset();
  };

  const canSubmit =
    playerRosterId !== "" &&
    (kind !== "casualty" ||
      (cause !== "" &&
        roll16 !== "" &&
        (!isActive || causerRosterId !== "") &&
        (!needsRoll6 || roll6 !== ""))) &&
    (kind !== "foul" || victimRosterId !== "");

  return (
    // z-50 keeps the FAB + its menu ABOVE the sticky rulebook header (z-40):
    // the match header now stays visible on scroll, so the floating controls
    // must stack on top or the header would cover the open menu.
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Mini-form */}
      {kind != null ? (
        <div className="w-64 rounded-md border border-[#e2e8f0] bg-white p-4 shadow-lg">
          <p className="mb-2 text-sm font-bold text-[#12225a]">
            {t(menuItems.find((m) => m.kind === kind)?.key ?? "match.controls.recordEvent")}
          </p>
          {kind !== "casualty" ? (
            <>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("match.controls.player")}
              </label>
              <select
                aria-label={t("match.controls.player")}
                value={playerRosterId}
                onChange={(e) => setPlayerRosterId(e.target.value)}
                className="mb-3 w-full rounded border border-[#e2e8f0] bg-white px-2 py-1.5 text-sm"
              >
                <option value="" disabled>
                  {t("match.controls.select")}
                </option>
                {alivePlayers.map((p) => (
                  <option key={p.rosterPlayerId} value={p.rosterPlayerId}>
                    {playerOptionLabel(p, rosterRaceId, journeymanLabel, rosterDorsal.get(p.rosterPlayerId) ?? 0)}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          {kind === "casualty" ? (
            <>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("match.controls.injuryCause")}
              </label>
              <select
                aria-label={t("match.controls.injuryCause")}
                value={cause}
                onChange={(e) => {
                  setCause(e.target.value as CasualtyCause | "");
                  setCauserRosterId("");
                }}
                className="mb-3 w-full rounded border border-[#e2e8f0] bg-white px-2 py-1.5 text-sm"
              >
                <option value="" disabled>
                  {t("match.controls.select")}
                </option>
                {causeOptions.map((c) => (
                  <option key={c} value={c}>
                    {causeLabel(c, t)}
                  </option>
                ))}
              </select>
              {/* Causer select: ONLY for the ACTIVE coach's proposal (causer
                  required). The NON-active self-inflicted path has no causer. */}
              {isActive ? (
                <>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {t("match.controls.injuryAuthor")}
                  </label>
                  <select
                    aria-label={t("match.controls.injuryAuthor")}
                    value={causerRosterId}
                    onChange={(e) => setCauserRosterId(e.target.value)}
                    className="mb-3 w-full rounded border border-[#e2e8f0] bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="" disabled>
                      {t("match.controls.select")}
                    </option>
                    {causerPool.map((p) => (
                      <option key={p.rosterPlayerId} value={p.rosterPlayerId}>
                        {playerOptionLabel(p, rosterRaceId, journeymanLabel, rosterDorsal.get(p.rosterPlayerId) ?? 0)}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              {/* Víctima: for the ACTIVE coach this lists the RIVAL roster (the
                  player who suffered the injury); for the NON-active path it is
                  their OWN player (self-inflicted). Labeled "Víctima" so it never
                  reads as the attacker's own player. */}
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("match.controls.victim")}
              </label>
              <select
                aria-label={t("match.controls.victim")}
                value={playerRosterId}
                onChange={(e) => setPlayerRosterId(e.target.value)}
                className="mb-3 w-full rounded border border-[#e2e8f0] bg-white px-2 py-1.5 text-sm"
              >
                <option value="" disabled>
                  {t("match.controls.select")}
                </option>
                {victimPool.map((p) => (
                  <option key={p.rosterPlayerId} value={p.rosterPlayerId}>
                    {playerOptionLabel(p, victimRaceId, journeymanLabel, (isActive ? opponentDorsal : rosterDorsal).get(p.rosterPlayerId) ?? 0)}
                  </option>
                ))}
              </select>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("match.controls.roll16")}
              </label>
              <select
                aria-label={t("match.controls.roll16")}
                value={roll16}
                onChange={(e) => {
                  setRoll16(e.target.value === "" ? "" : Number(e.target.value));
                  setRoll6("");
                }}
                className="mb-2 w-full rounded border border-[#e2e8f0] bg-white px-2 py-1.5 text-sm"
              >
                <option value="" disabled>
                  {t("match.controls.select")}
                </option>
                {ROLL16_VALUES.map((n) => (
                  <option key={n} value={n}>
                    {roll16OptionLabel(n, t)}
                  </option>
                ))}
              </select>
              {/* The DERIVED band (client mirrors resolveInjury for UX; the
                  server is authoritative). NO band select — the band comes from
                  the 1D16 table, never from the form. */}
              <p className="mb-2 text-[11px] font-semibold text-[#12225a]">
                {derivedBand ? (
                  <>
                    {t("match.controls.band", { band: casualtyKindLabel(derivedBand, t) })}
                    {needsRoll6 ? t("match.controls.roll6Suffix") : ""}
                  </>
                ) : (
                  t("match.controls.bandDerived")
                )}
              </p>
              {/* The 1D6 attribute roll appears LIVE only when the derived band
                  is permanent (13-14) — it is REQUIRED then. */}
              {needsRoll6 ? (
                <>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {t("match.controls.roll6Attribute")}
                  </label>
                  <select
                    aria-label="Tirada 1D6"
                    value={roll6}
                    onChange={(e) => setRoll6(e.target.value === "" ? "" : Number(e.target.value))}
                    className="mb-3 w-full rounded border border-[#e2e8f0] bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="" disabled>
                      {t("match.controls.select")}
                    </option>
                    {ROLL6_VALUES.map((n) => (
                      <option key={n} value={n}>
                        {roll6OptionLabel(n, t)}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
            </>
          ) : null}
          {kind === "foul" ? (
            <>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {t("match.controls.foulVictim")}
              </label>
              <select
                aria-label={t("match.controls.foulVictim")}
                value={victimRosterId}
                onChange={(e) => setVictimRosterId(e.target.value)}
                className="mb-3 w-full rounded border border-[#e2e8f0] bg-white px-2 py-1.5 text-sm"
              >
                <option value="" disabled>
                  {t("match.controls.select")}
                </option>
                {aliveOpponentPlayers.map((p) => (
                  <option key={p.rosterPlayerId} value={p.rosterPlayerId}>
                    {playerOptionLabel(p, opponentRaceId, journeymanLabel, opponentDorsal.get(p.rosterPlayerId) ?? 0)}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={cancel}
              className="rounded border border-[#e2e8f0] px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-[#f8fafc]"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="rounded bg-[#12225a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1d48] disabled:opacity-40"
            >
              {/* Design B: casualties are recorded DIRECTLY — every submit is "Registrar". */}
              {t("match.controls.record")}
            </button>
          </div>
        </div>
      ) : null}

      {/* Menu */}
      {menuOpen && kind == null ? (
        <div className="flex flex-col gap-1 rounded-md border border-[#e2e8f0] bg-white p-2 shadow-lg">
          {menuItems.map((item) => (
            <button
              key={item.kind}
              type="button"
              onClick={() => setKind(item.kind)}
              className="rounded px-3 py-1.5 text-left text-sm font-semibold text-[#12225a] hover:bg-[#f8fafc]"
            >
              {t(item.key)}
            </button>
          ))}
        </div>
      ) : null}

      {/* FAB "+" */}
      <button
        type="button"
        aria-label="+"
        onClick={() => {
          setMenuOpen((open) => !open);
          setKind(null);
        }}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#12225a] text-3xl font-black text-white shadow-lg hover:bg-[#0f1d48]"
      >
        +
      </button>
    </div>
  );
}
