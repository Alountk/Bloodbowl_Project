"use client";

import { computeWinnings } from "@/lib/rules/winnings";
import { aggregateActions, type ActaState, type ActaTeamDraft } from "./actaState";

export interface StepFinalProps {
  state: ActaState;
  onChange: (next: ActaState) => void;
  homeName: string;
  awayName: string;
}

/** Spanish thousands grouping ("65.000"), deterministic across environments. */
function formatGold(amount: number): string {
  return `${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} M.O.`;
}

/** The FF term can be a half: (FF_home + FF_away)/2 (e.g. 3,5). */
function formatUnits(units: number): string {
  return Number.isInteger(units) ? String(units) : units.toFixed(1).replace(".", ",");
}

/** Parses a 1..6 fan-factor roll; anything else (empty, out of range) clears. */
function parseFanRoll(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : null;
}

/**
 * Step 5 · Final (MAW-7). The winnings are rendered READ-ONLY with their visible
 * breakdown — the `(FF_home + FF_away)/2` term, the team's own TDs and the
 * "nunca tuvo el balón" bonus — using the SAME pure `computeWinnings` the server
 * runs. This is a PREVIEW only: the acta has not been submitted, so there is no
 * server value to fetch; the server stays authoritative on submit and the client
 * transmits NO amount (the payload carries no winnings field). The ONLY manual
 * input is the fan-factor 1D6 per team, written to `fanRoll`; the fan delta
 * (fans won/lost) is derived server-side and is not invented here.
 */
export function StepFinal({ state, onChange, homeName, awayName }: StepFinalProps) {
  const setFanRoll = (side: "home" | "away", fanRoll: number | null) => {
    onChange({ ...state, [side]: { ...state[side], fanRoll } });
  };

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate">
        Las ganancias se calculan solas y no son editables: se muestran con su
        desglose para poder verificarlas. Solo se introduce la tirada de afición.
      </p>
      <TeamFinal
        name={homeName}
        draft={state.home}
        rivalDraft={state.away}
        onFanRoll={(roll) => setFanRoll("home", roll)}
      />
      <TeamFinal
        name={awayName}
        draft={state.away}
        rivalDraft={state.home}
        onFanRoll={(roll) => setFanRoll("away", roll)}
      />
      <p className="text-[11px] text-slate">
        Las ganancias se calculan solas: ((FF local + FF visitante)/2 +
        anotaciones + 1 si nunca tuvo el balón) × 10.000. Son de solo lectura.
      </p>
    </div>
  );
}

function TeamFinal({
  name,
  draft,
  rivalDraft,
  onFanRoll,
}: {
  name: string;
  draft: ActaTeamDraft;
  rivalDraft: ActaTeamDraft;
  onFanRoll: (roll: number | null) => void;
}) {
  const ownTds = aggregateActions(draft.actions).reduce(
    (total, row) => total + row.tds,
    0,
  );
  const heldBall = !draft.neverHeld;
  const bonus = heldBall ? 0 : 1;
  const ownFf = draft.ff;
  const rivalFf = rivalDraft.ff;
  // The preview needs BOTH FFs; when one is still unset the server will fall
  // back to its own rolled FF, so the client shows a dash instead of inventing it.
  const canCompute = typeof ownFf === "number" && typeof rivalFf === "number";
  const ffTerm = canCompute ? (ownFf + rivalFf) / 2 : null;
  const total = canCompute
    ? computeWinnings({ ffHome: ownFf, ffAway: rivalFf, ownTds, heldBall })
    : null;

  const fieldClass =
    "mt-1 w-full border border-border bg-background px-2 py-1 text-sm text-ink";
  const labelClass =
    "block text-[10px] font-bold uppercase tracking-[0.06em] text-slate";
  const lineClass = "flex items-center justify-between gap-2";
  const autoChip = (
    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase text-slate">
      auto
    </span>
  );

  return (
    <section aria-label={name} className="border border-border p-3">
      <h3 className="font-display text-sm font-bold text-navy">{name}</h3>
      <div className="mt-2 space-y-1 text-sm text-ink">
        <div className={lineClass}>
          <span className="flex items-center gap-1.5">Anotaciones {autoChip}</span>
          <b>{ownTds}</b>
        </div>
        <div className={lineClass}>
          <span>
            · (FF {canCompute ? ownFf : "—"} + {canCompute ? rivalFf : "—"})/2
          </span>
          <span>{ffTerm == null ? "—" : formatUnits(ffTerm)}</span>
        </div>
        <div className={lineClass}>
          <span>· nunca tuvo el balón</span>
          <span>+{bonus}</span>
        </div>
        <div className={`${lineClass} border-t border-border pt-1`}>
          <span className="flex items-center gap-1.5 font-bold">
            Ganancias {autoChip}
          </span>
          <b>{total == null ? "—" : formatGold(total)}</b>
        </div>
      </div>
      {!canCompute ? (
        <p className="mt-2 text-[11px] text-slate">
          Introduce el Factor fan de ambos equipos (paso 0) para ver el desglose.
        </p>
      ) : null}
      <label className={`${labelClass} mt-3`}>
        Afición · tirada 1D6 · {name}
        <input
          type="number"
          min={1}
          max={6}
          inputMode="numeric"
          value={draft.fanRoll ?? ""}
          onChange={(event) => onFanRoll(parseFanRoll(event.target.value))}
          className={fieldClass}
        />
      </label>
    </section>
  );
}
