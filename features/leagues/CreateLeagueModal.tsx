"use client";

import { useState } from "react";
import { createLeague } from "./api";

interface CreateLeagueModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after a league is created so the list can refresh. */
  onCreate: () => Promise<void>;
}

/** Valid per-turn clock durations (seconds), rulebook-bounded (AC-10). */
const CLOCK_DURATIONS = [120, 240, 360] as const;

/**
 * Rulebook create-league modal: name (unique globally) + optional description +
 * the turn-clock option (enabled toggle defaulting ON, per-turn duration
 * select defaulting to 240s). The option is captured at creation and immutable
 * afterwards. On POST the API returns 409 for a duplicate name, surfaced as an
 * inline error without closing the modal so the user can pick another name.
 */
export function CreateLeagueModal({ open, onClose, onCreate }: CreateLeagueModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [turnClockEnabled, setTurnClockEnabled] = useState(true);
  const [turnClockSeconds, setTurnClockSeconds] = useState<(typeof CLOCK_DURATIONS)[number]>(240);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("El nombre de la liga es obligatorio.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createLeague(trimmed, description.trim() === "" ? null : description.trim(), {
        turnClockEnabled,
        turnClockSeconds,
      });
      setName("");
      setDescription("");
      setTurnClockEnabled(true);
      setTurnClockSeconds(240);
      onClose();
      await onCreate();
    } catch (e) {
      // Duplicate league name (unique global) → 409; stay open so the user retries.
      const message = e instanceof Error ? e.message : "No se pudo crear la liga.";
      setError(message === "League name already exists" ? "Ya existe una liga con ese nombre." : message);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClassName =
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Rulebook scrim; click closes. */}
      <button
        type="button"
        aria-label="Close create league"
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nueva liga"
        className="relative z-10 w-full max-w-[480px] border border-slate-200 bg-white shadow-[0_4px_8px_rgba(0,0,0,0.1)]"
      >
        <header className="border-b-[3px] border-[#d11938] bg-[#12225a] px-5 py-4 text-white">
          <h2 className="text-lg font-black tracking-[0.02em]">Nueva liga</h2>
        </header>
        <form onSubmit={submit} noValidate className="space-y-4 p-5">
          <div>
            <label htmlFor="league-name" className="mb-1 block text-sm font-medium text-slate-700">
              Nombre
            </label>
            <input
              id="league-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ej. Liga de la Costa"
              className={fieldClassName}
            />
          </div>
          <div>
            <label htmlFor="league-description" className="mb-1 block text-sm font-medium text-slate-700">
              Descripción
            </label>
            <textarea
              id="league-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Opcional"
              className={fieldClassName}
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={turnClockEnabled}
                onChange={(event) => setTurnClockEnabled(event.target.checked)}
                className="h-4 w-4 accent-[#12225a]"
              />
              Reloj de turno
            </label>
            <div className="flex items-center gap-2">
              <label htmlFor="league-clock" className="text-sm font-medium text-slate-700">
                Duración por turno
              </label>
              <select
                id="league-clock"
                value={turnClockSeconds}
                onChange={(event) =>
                  setTurnClockSeconds(Number(event.target.value) as (typeof CLOCK_DURATIONS)[number])
                }
                className={fieldClassName}
              >
                {CLOCK_DURATIONS.map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds / 60} min
                  </option>
                ))}
              </select>
            </div>
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
              Crear liga
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
