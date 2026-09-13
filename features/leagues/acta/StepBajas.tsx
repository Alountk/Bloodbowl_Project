"use client";

import {
  permanentAttribute,
  type InjuryOutcomeKind,
} from "@/lib/rules/injuries";
import type { RosterPlayerRef } from "../MatchResolveModal";
import type { ActaState } from "./actaState";
import {
  planBajas,
  setInjuryRoll,
  setPermanentRoll,
  type ActaSide,
  type BajasCasualty,
} from "./bajasPlan";

/** Spanish rulebook labels for the 1D16 injury bands (presentation only — the
 *  band itself is resolved by `resolveInjury`, never re-implemented here). */
const BAND_LABELS: Record<InjuryOutcomeKind, string> = {
  bruise: "Magullado",
  apaleado: "Apaleado",
  grave: "Herida grave",
  permanent: "Permanente",
  dead: "Muerto",
};

export interface StepBajasProps {
  state: ActaState;
  onChange: (next: ActaState) => void;
  homeName: string;
  awayName: string;
  homeRoster: RosterPlayerRef[];
  awayRoster: RosterPlayerRef[];
}

/**
 * Step 4 · Bajas (MAW-6). The casualties are DERIVED from Step 2 and rendered as
 * a READ-ONLY list (no victim or count re-entry). The only manual inputs are the
 * 1D16 injury roll per casualty and, only when the resolved band is Permanente,
 * the additional 1D6 permanent-attribute roll. `planBajas` groups each casualty
 * under the team that CAUSED it, so every roll is written to the correct draft.
 */
export function StepBajas({
  state,
  onChange,
  homeName,
  awayName,
  homeRoster,
  awayRoster,
}: StepBajasProps) {
  const plan = planBajas(state);
  const nameOf = (roster: RosterPlayerRef[], id: string) =>
    roster.find((player) => player.id === id)?.name ?? id;

  const sections: { side: ActaSide; name: string; casualties: BajasCasualty[] }[] = [
    { side: "home", name: homeName, casualties: plan.home },
    { side: "away", name: awayName, casualties: plan.away },
  ];

  return (
    <div className="space-y-4">
      {state.casualtiesUnrecoverable ? (
        <p
          role="alert"
          className="border border-border bg-panel px-3 py-2 text-[11px] font-semibold text-red"
        >
          Este acta no tiene acciones guardadas. Si guardas sin volver a introducir las
          bajas, se borrarán las bajas registradas.
        </p>
      ) : null}
      <p className="text-[11px] text-slate">
        Bajas derivadas del paso 2. Solo se introducen las tiradas.
      </p>
      {sections.map(({ side, name, casualties }) => (
        <section key={side} aria-label={name} className="border border-border p-3">
          <h3 className="font-display text-sm font-bold text-navy">{name}</h3>
          {casualties.length === 0 ? (
            <p className="mt-2 text-[11px] text-slate">Sin bajas causadas.</p>
          ) : (
            <div className="mt-2 space-y-3">
              {casualties.map((casualty) => (
                <CasualtyRow
                  key={`${side}-${casualty.index}`}
                  casualty={casualty}
                  victimName={nameOf(
                    casualty.victimTeam === "home" ? homeRoster : awayRoster,
                    casualty.victimRosterPlayerId,
                  )}
                  victimTeamName={casualty.victimTeam === "home" ? homeName : awayName}
                  onInjuryRoll={(roll) =>
                    onChange(
                      setInjuryRoll(state, casualty.causingTeam, casualty.index, roll),
                    )
                  }
                  onPermanentRoll={(roll) =>
                    onChange(
                      setPermanentRoll(
                        state,
                        casualty.causingTeam,
                        casualty.permanentIndex ?? 0,
                        roll,
                      ),
                    )
                  }
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function CasualtyRow({
  casualty,
  victimName,
  victimTeamName,
  onInjuryRoll,
  onPermanentRoll,
}: {
  casualty: BajasCasualty;
  victimName: string;
  victimTeamName: string;
  onInjuryRoll: (roll: number | null) => void;
  onPermanentRoll: (roll: number | null) => void;
}) {
  const slot = casualty.index + 1;
  const bandLabel = casualty.band ? BAND_LABELS[casualty.band] : null;
  const attribute =
    casualty.permanentRoll == null ? null : permanentAttribute(casualty.permanentRoll);

  const fieldClass =
    "mt-1 w-full border border-border bg-background px-2 py-1 text-sm text-ink";
  const labelClass =
    "block text-[10px] font-bold uppercase tracking-[0.06em] text-slate";

  return (
    <div className="border-b border-dashed border-border pb-3">
      <p className="text-sm text-ink">
        Baja sobre <b>{victimName}</b>{" "}
        <span className="text-slate">({victimTeamName})</span>
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className={labelClass}>
          Tirada 1D16 {slot} · {victimName}
          <input
            type="number"
            min={1}
            max={16}
            inputMode="numeric"
            value={casualty.injuryRoll ?? ""}
            onChange={(event) => onInjuryRoll(parseRoll(event.target.value, 16))}
            className={fieldClass}
          />
        </label>
        {casualty.permanent ? (
          <label className={labelClass}>
            Tirada 1D6 {slot} · {victimName}
            <input
              type="number"
              min={1}
              max={6}
              inputMode="numeric"
              value={casualty.permanentRoll ?? ""}
              onChange={(event) => onPermanentRoll(parseRoll(event.target.value, 6))}
              className={fieldClass}
            />
          </label>
        ) : null}
      </div>
      {bandLabel ? (
        <p className="mt-1 text-[11px] text-slate">
          Banda: <b className="text-ink">{bandLabel}</b>
          {attribute ? (
            <>
              {" · atributo "}
              <b className="text-ink">−{attribute.toUpperCase()}</b>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

/** Parses a 1..`max` integer roll; anything else (empty, out of range) clears. */
function parseRoll(raw: string, max: number): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= max ? value : null;
}
