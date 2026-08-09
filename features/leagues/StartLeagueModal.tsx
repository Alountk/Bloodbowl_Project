"use client";

import { useState } from "react";
import { startLeague } from "./api";

interface StartLeagueModalProps {
  open: boolean;
  leagueId: string;
  /** Number of member teams; bounds the allowed jornadas to 1..teams-1. */
  teamCount: number;
  onClose: () => void;
  /** Called after a successful start so the detail can refresh and show jornadas. */
  onStarted: () => Promise<void>;
}

/**
 * Rulebook start-season modal: the owner picks how many jornadas (rounds) to
 * play. The server accepts `1..teams-1` (each round is "todos contra todos"),
 * shown here as a "Máximo {n-1} jornadas" hint and enforced in-window so invalid
 * values never POST. On success it refreshes the detail, which now shows the
 * schedule grouped by round.
 */
export function StartLeagueModal({ open, leagueId, teamCount, onClose, onStarted }: StartLeagueModalProps) {
  const [seasonLength, setSeasonLength] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const max = Math.max(teamCount - 1, 1);
  const parsed = Number(seasonLength);
  const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= max;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) {
      setError(`Indica un número de jornadas entre 1 y ${max}.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await startLeague(leagueId, parsed);
      setSeasonLength("");
      onClose();
      await onStarted();
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo iniciar la liga.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close start league"
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Iniciar liga"
        className="relative z-10 w-full max-w-[480px] border border-slate-200 bg-white shadow-[0_4px_8px_rgba(0,0,0,0.1)]"
      >
        <header className="border-b-[3px] border-[#d11938] bg-[#12225a] px-5 py-4 text-white">
          <h2 className="text-lg font-black tracking-[0.02em]">Iniciar liga</h2>
        </header>
        <form onSubmit={submit} noValidate className="space-y-4 p-5">
          <div>
            <label htmlFor="season-length" className="mb-1 block text-sm font-medium text-slate-700">
              ¿Cuántas jornadas?
            </label>
            <input
              id="season-length"
              type="number"
              min={1}
              max={max}
              value={seasonLength}
              onChange={(event) => setSeasonLength(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Máximo {max} {max === 1 ? "jornada" : "jornadas"}: todos contra todos.
            </p>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-[#12225a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f1d48]"
            >
              Iniciar liga
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
