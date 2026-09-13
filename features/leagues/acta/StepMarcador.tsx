"use client";

import type { ActaState } from "./actaState";

export interface StepMarcadorProps {
  state: ActaState;
  onChange: (next: ActaState) => void;
  homeName: string;
  awayName: string;
}

/**
 * Step 1 · Marcador (MAW-3). Captures the final score per team — the only
 * input on this step.
 */
export function StepMarcador({
  state,
  onChange,
  homeName,
  awayName,
}: StepMarcadorProps) {
  const goalClass =
    "w-20 border border-border bg-background px-2 py-1 text-center font-display text-3xl font-bold text-navy";
  const labelClass =
    "flex flex-col items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em] text-slate";

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 text-center">
      <label className={labelClass}>
        {homeName}
        <input
          type="number"
          min={0}
          value={state.home.score}
          onChange={(event) =>
            onChange({
              ...state,
              home: { ...state.home, score: Number(event.target.value) || 0 },
            })
          }
          className={goalClass}
        />
      </label>
      <span className="font-display text-2xl text-slate">vs</span>
      <label className={labelClass}>
        {awayName}
        <input
          type="number"
          min={0}
          value={state.away.score}
          onChange={(event) =>
            onChange({
              ...state,
              away: { ...state.away, score: Number(event.target.value) || 0 },
            })
          }
          className={goalClass}
        />
      </label>
    </div>
  );
}
