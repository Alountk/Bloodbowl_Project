"use client";

import { useState } from "react";
import { INJURY_OUTCOMES } from "@/lib/rules/injuries";
import { casualtyKindLabel } from "./matchSummary";
import type { LiveCommand, MatchPlayer } from "./api";

/**
 * Event recording controls (LM-20, D26): a floating "+" that opens a role-aware
 * event-type menu and a mini-form to record live events. Rendering is gated on
 * `viewerSide != null && status === "live"` (the server matrix stays the
 * authority — a bypass POST returns 409, proven by the route tests). The menu
 * derives from `viewerSide` vs `activeSide`: the ACTIVE coach may record TD /
 * Pase completo / Baja / Herida / Falta via a player select from their own
 * roster (alive only) + a 5-band select for the casualty; the NON-active coach
 * is offered ONLY the casualty action (their own player). Submit passes through
 * the parent's `act`/`sendCommand`/`busyRef`, so a double-action is dropped and
 * a server 409 surfaces via the existing error alert.
 */

type EventKindOption = "td" | "completion" | "casualty" | "foul";

interface EventControlsProps {
  viewerSide: "home" | "away" | null;
  activeSide: "home" | "away";
  /** "live" only renders the FAB; a spectator/admin has `viewerSide` null. */
  status: "pending" | "ready" | "live" | "finished";
  /** The viewer's OWN roster (the side's players) — only alive players are offered. */
  roster: MatchPlayer[];
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
  onSubmit,
}: EventControlsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [kind, setKind] = useState<EventKindOption | null>(null);
  const [playerRosterId, setPlayerRosterId] = useState("");
  const [band, setBand] = useState<string>("bruise");

  // LM-20: no controls for a spectator/admin (no side) or outside a live match.
  if (viewerSide == null || status !== "live") return null;

  const isActive = viewerSide === activeSide;
  const menuItems = isActive ? ACTIVE_MENU : NON_ACTIVE_MENU;
  const alivePlayers = roster.filter((p) => p.alive);

  const reset = () => {
    setMenuOpen(false);
    setKind(null);
    setPlayerRosterId("");
    setBand("bruise");
  };

  // Cancelar returns to the open menu (does not close it); submit closes all.
  const cancel = () => {
    setKind(null);
    setPlayerRosterId("");
    setBand("bruise");
  };

  const submit = () => {
    if (!playerRosterId) return; // must pick a player
    const side = viewerSide;
    if (kind === "casualty") {
      void onSubmit({ type: "casualty", side, victimRosterId: playerRosterId, band });
    } else if (kind === "td") {
      void onSubmit({ type: "td", side, playerRosterId });
    } else if (kind === "completion") {
      void onSubmit({ type: "completion", side, playerRosterId });
    } else if (kind === "foul") {
      void onSubmit({ type: "foul", side, playerRosterId });
    }
    // Close on submit; errors surface via the parent `act` alert (LM-20).
    reset();
  };

  return (
    <div className="fixed bottom-6 right-6 z-20 flex flex-col items-end gap-3">
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
            {alivePlayers.map((p) => (
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
              disabled={!playerRosterId}
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
