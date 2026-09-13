"use client";

import { ACTA_WEATHER_OPTIONS, type ActaState, type ActaTeamDraft } from "./actaState";

export interface StepContextoProps {
  state: ActaState;
  onChange: (next: ActaState) => void;
  homeName: string;
  awayName: string;
}

/**
 * Step 0 · Contexto (MAW-2). Editable weather, match duration, per-team FINAL
 * Factor Fan (entered directly — no 1D3 roll and no dedicated-fans derivation),
 * inducements spent per team, and the per-team "NUNCA tuvo el balón" checkbox
 * (the payload maps `heldBall = !neverHeld`).
 */
export function StepContexto({
  state,
  onChange,
  homeName,
  awayName,
}: StepContextoProps) {
  const setTeam = (side: "home" | "away", patch: Partial<ActaTeamDraft>) => {
    if (side === "home") {
      onChange({ ...state, home: { ...state.home, ...patch } });
    } else {
      onChange({ ...state, away: { ...state.away, ...patch } });
    }
  };

  const fieldClass =
    "mt-1 w-full border border-border bg-background px-2 py-1.5 text-sm text-ink";
  const labelClass =
    "block text-[10px] font-bold uppercase tracking-[0.06em] text-slate";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Clima
          <select
            value={state.weather}
            onChange={(event) => onChange({ ...state, weather: event.target.value })}
            className={fieldClass}
          >
            {ACTA_WEATHER_OPTIONS.map((weather) => (
              <option key={weather} value={weather}>
                {weather}
              </option>
            ))}
          </select>
        </label>

        <label className={labelClass}>
          Duración (minutos)
          <input
            type="number"
            min={0}
            value={state.duration ?? ""}
            onChange={(event) => {
              // Empty/0 means "not entered" — omit it rather than persisting a
              // false 0-minute duration.
              const minutes = Number(event.target.value);
              onChange({ ...state, duration: minutes > 0 ? minutes : undefined });
            }}
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          Factor fan · {homeName}
          <input
            type="number"
            min={0}
            value={state.home.ff ?? ""}
            onChange={(event) => {
              // Empty/0 means "not entered" — omit it so the route falls back
              // to its server-rolled FF (BB minimum is 1).
              const ff = Number(event.target.value);
              setTeam("home", { ff: ff > 0 ? ff : undefined });
            }}
            className={fieldClass}
          />
        </label>

        <label className={labelClass}>
          Factor fan · {awayName}
          <input
            type="number"
            min={0}
            value={state.away.ff ?? ""}
            onChange={(event) => {
              const ff = Number(event.target.value);
              setTeam("away", { ff: ff > 0 ? ff : undefined });
            }}
            className={fieldClass}
          />
        </label>
      </div>

      <fieldset className="border border-border p-3">
        <legend className="px-1 text-[10px] font-bold uppercase tracking-[0.06em] text-slate">
          Incentivos
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Incentivos · {homeName}
            <input
              type="number"
              min={0}
              value={state.home.inducements}
              onChange={(event) =>
                setTeam("home", { inducements: Number(event.target.value) || 0 })
              }
              className={fieldClass}
            />
          </label>
          <label className={labelClass}>
            Incentivos · {awayName}
            <input
              type="number"
              min={0}
              value={state.away.inducements}
              onChange={(event) =>
                setTeam("away", { inducements: Number(event.target.value) || 0 })
              }
              className={fieldClass}
            />
          </label>
        </div>
      </fieldset>

      <div className="space-y-1.5 text-sm text-ink">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={state.home.neverHeld}
              onChange={(event) =>
                setTeam("home", { neverHeld: event.target.checked })
              }
            />
            {homeName} NUNCA tuvo el balón
          </label>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase text-slate">
            +1 ganancias
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={state.away.neverHeld}
              onChange={(event) =>
                setTeam("away", { neverHeld: event.target.checked })
              }
            />
            {awayName} NUNCA tuvo el balón
          </label>
          <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase text-slate">
            +1 ganancias
          </span>
        </div>
      </div>
    </div>
  );
}
