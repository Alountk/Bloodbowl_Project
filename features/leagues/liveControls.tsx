"use client";

import { useState } from "react";
import { INJURY_OUTCOMES } from "@/lib/rules/injuries";
import { CASUALTY_CAUSES } from "@/lib/livePhase";
import type { CasualtyCause } from "@/lib/livePhase";
import { casualtyKindLabel } from "./matchSummary";
import type { LiveCommand, MatchPlayer } from "./api";

/**
 * Event recording controls (LM-20, D26): a floating "+" that opens a role-aware
 * event-type menu and a mini-form to record live events. Rendering is gated on
 * `viewerSide != null && status === "live"` (the server matrix stays the
 * authority — a bypass POST returns 409, proven by the route tests). The menu
 * derives from `viewerSide` vs `activeSide`: the ACTIVE coach may record TD /
 * Pase completo / Baja / Herida / Falta; the NON-active coach is offered ONLY
 * the casualty action (their own player). The Falta form additionally captures
 * the VICTIM from `opponentRoster` (LM-20). The Baja/Herida form captures the
 * six-part `cause` plus a CAUSER select that is hidden for `dodge`/`crowd` and
 * never sent with those causes (LM-12 strict). The casualty pools are
 * role-aware (RAU-34): the ACTIVE coach records the injury THEY inflicted, so
 * the victim select draws from the OPPONENT roster, the causer select from
 * their OWN roster, and the command's `side` is the VICTIM's side (the
 * OPPONENT side for the ACTIVE coach); the NON-active coach records the wound
 * done to their OWN player, so the victim draws from their roster, the causer
 * from the rival's, and `side` stays their own side. Labels stay DISTINCT from
 * "Jugador" so `getByLabelText(/Jugador/i)` remains unambiguous (D7). Submit
 * passes through the parent's `act`/`sendCommand`/`busyRef`; a server 409
 * surfaces via the existing error alert.
 */

type EventKindOption = "td" | "completion" | "casualty" | "foul";

/** Causes that require an explicit causer (opposite victim); dodge/crowd are self-inflicted (LM-12). */
const CAUSE_REQUIRES_CAUSER = new Set<CasualtyCause>(["blitz", "foul", "penetration", "block"]);

/** Spanish labels for the six causes (MVT-5). */
const CAUSE_LABELS: Record<CasualtyCause, string> = {
  blitz: "Blitz",
  foul: "Falta",
  dodge: "Esquivando — se cayó",
  crowd: "El público",
  penetration: "Penetración",
  block: "Bloqueo",
};

interface EventControlsProps {
  viewerSide: "home" | "away" | null;
  activeSide: "home" | "away";
  /** "live" only renders the FAB; a spectator/admin has `viewerSide` null. */
  status: "pending" | "ready" | "live" | "finished";
  /** The viewer's OWN roster (the side's players) — only alive players are offered. */
  roster: MatchPlayer[];
  /** The RIVAL roster (opposite the viewer): Falta victim; casualty VICTIM for the ACTIVE coach and casualty CAUSER for the NON-active coach (LM-20, RAU-34). */
  opponentRoster: MatchPlayer[];
  /** Wraps `act`: `/api/.../live` POST command. */
  onSubmit: (cmd: LiveCommand) => Promise<void>;
}

/** The FAB + menu item labels (Spanish, rulebook-light). */
const ACTIVE_MENU: { kind: EventKindOption; label: string }[] = [
  { kind: "td", label: "Touchdown" },
  { kind: "completion", label: "Pase completo" },
  { kind: "casualty", label: "Baja · Herida" },
  { kind: "foul", label: "Falta" },
];

const NON_ACTIVE_MENU: { kind: EventKindOption; label: string }[] = [
  { kind: "casualty", label: "Herida" },
];

export function EventControls({
  viewerSide,
  activeSide,
  status,
  roster,
  opponentRoster,
  onSubmit,
}: EventControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [kind, setKind] = useState<EventKindOption | null>(null);
  const [playerRosterId, setPlayerRosterId] = useState("");
  const [band, setBand] = useState<string>("bruise");
  const [cause, setCause] = useState<CasualtyCause | "">("");
  const [causerRosterId, setCauserRosterId] = useState("");
  const [victimRosterId, setVictimRosterId] = useState("");

  // LM-20: no controls for a spectator/admin (no side) or outside a live match.
  if (viewerSide == null || status !== "live") return null;

  const isActive = viewerSide === activeSide;
  const menuItems = isActive ? ACTIVE_MENU : NON_ACTIVE_MENU;
  const alivePlayers = roster.filter((p) => p.alive);
  const aliveOpponentPlayers = opponentRoster.filter((p) => p.alive);
  // RAU-34 role-aware casualty pools: the ACTIVE coach records the injury THEY
  // inflicted (victim from the rival, causer from their OWN roster); the
  // NON-active coach records the wound done to their OWN player (victim own,
  // causer rival). Alive-only, matching the "Jugador" select's semantics.
  const victimPool = isActive ? aliveOpponentPlayers : alivePlayers;
  const causerPool = isActive ? alivePlayers : aliveOpponentPlayers;

  const requiresCauser = cause !== "" && CAUSE_REQUIRES_CAUSER.has(cause);

  const reset = () => {
    setMenuOpen(false);
    setKind(null);
    setPlayerRosterId("");
    setBand("bruise");
    setCause("");
    setCauserRosterId("");
    setVictimRosterId("");
  };

  // Cancelar returns to the open menu (does not close it); submit closes all.
  const cancel = () => {
    setKind(null);
    setPlayerRosterId("");
    setBand("bruise");
    setCause("");
    setCauserRosterId("");
    setVictimRosterId("");
  };

  const submit = () => {
    const side = viewerSide;
    if (kind === "casualty") {
      // Strict client rule (LM-12/D7): a cause requiring a causer is mandatory;
      // dodge/crowd NEVER send a causer (the select is hidden for them).
      if (!playerRosterId || cause === "") return;
      if (requiresCauser && !causerRosterId) return;
      // RAU-34: the casualty `side` is the VICTIM's side — the OPPONENT side for
      // the ACTIVE coach (they record the injury they inflicted on a rival), the
      // viewer's OWN side for the NON-active coach.
      const casualtySide: "home" | "away" = isActive ? (viewerSide === "home" ? "away" : "home") : viewerSide;
      const cmd: LiveCommand = {
        type: "casualty",
        side: casualtySide,
        victimRosterId: playerRosterId,
        band,
        cause,
      };
      if (requiresCauser) cmd.causerRosterId = causerRosterId;
      void onSubmit(cmd);
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
    (kind !== "casualty" || (cause !== "" && (!requiresCauser || causerRosterId !== ""))) &&
    (kind !== "foul" || victimRosterId !== "");

  return (
    // z-50 keeps the FAB + its menu ABOVE the sticky Tourplay header (z-40):
    // the match header now stays visible on scroll, so the floating controls
    // must stack on top or the header would cover the open menu.
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Mini-form */}
      {kind != null ? (
        <div className="w-64 rounded-md border border-[#e2e8f0] bg-white p-4 shadow-lg">
          <p className="mb-2 text-sm font-bold text-[#12225a]">
            {menuItems.find((m) => m.kind === kind)?.label ?? "Registrar evento"}
          </p>
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Jugador
          </label>
          <select
            aria-label="Jugador"
            value={playerRosterId}
            onChange={(e) => setPlayerRosterId(e.target.value)}
            className="mb-3 w-full rounded border border-[#e2e8f0] bg-white px-2 py-1.5 text-sm"
          >
            <option value="" disabled>
              Selecciona…
            </option>
            {(kind === "casualty" ? victimPool : alivePlayers).map((p) => (
              <option key={p.rosterPlayerId} value={p.rosterPlayerId}>
                {p.name}
              </option>
            ))}
          </select>
          {kind === "casualty" ? (
            <>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Tipo de lesión
              </label>
              <select
                aria-label="Tipo de lesión"
                value={band}
                onChange={(e) => setBand(e.target.value)}
                className="mb-3 w-full rounded border border-[#e2e8f0] bg-white px-2 py-1.5 text-sm"
              >
                {INJURY_OUTCOMES.map((b) => (
                  <option key={b} value={b}>
                    {casualtyKindLabel(b)}
                  </option>
                ))}
              </select>
              <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Causa de la lesión
              </label>
              <select
                aria-label="Causa de la lesión"
                value={cause}
                onChange={(e) => {
                  setCause(e.target.value as CasualtyCause | "");
                  setCauserRosterId("");
                }}
                className="mb-3 w-full rounded border border-[#e2e8f0] bg-white px-2 py-1.5 text-sm"
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {CASUALTY_CAUSES.map((c) => (
                  <option key={c} value={c}>
                    {CAUSE_LABELS[c]}
                  </option>
                ))}
              </select>
              {/* Causer select: ONLY for causes that require one (blitz/foul/
                  penetration/block). dodge/crowd hide it and never send it
                  (LM-12 strict client rule). */}
              {requiresCauser ? (
                <>
                  <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Autor de la lesión
                  </label>
                  <select
                    aria-label="Autor de la lesión"
                    value={causerRosterId}
                    onChange={(e) => setCauserRosterId(e.target.value)}
                    className="mb-3 w-full rounded border border-[#e2e8f0] bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="" disabled>
                      Selecciona…
                    </option>
                    {causerPool.map((p) => (
                      <option key={p.rosterPlayerId} value={p.rosterPlayerId}>
                        {p.name}
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
                Víctima de la falta
              </label>
              <select
                aria-label="Víctima de la falta"
                value={victimRosterId}
                onChange={(e) => setVictimRosterId(e.target.value)}
                className="mb-3 w-full rounded border border-[#e2e8f0] bg-white px-2 py-1.5 text-sm"
              >
                <option value="" disabled>
                  Selecciona…
                </option>
                {opponentRoster.map((p) => (
                  <option key={p.rosterPlayerId} value={p.rosterPlayerId}>
                    {p.name}
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
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className="rounded bg-[#12225a] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0f1d48] disabled:opacity-40"
            >
              Registrar
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
              {item.label}
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
