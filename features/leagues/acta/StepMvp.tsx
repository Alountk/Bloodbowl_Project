"use client";

import { PE_MVP } from "@/lib/rules";
import type { RosterPlayerRef } from "../MatchResolveModal";
import type { ActaState, ActaTeamDraft } from "./actaState";

export interface StepMvpProps {
  state: ActaState;
  onChange: (next: ActaState) => void;
  homeName: string;
  awayName: string;
  homeRoster: RosterPlayerRef[];
  awayRoster: RosterPlayerRef[];
}

/**
 * Step 3 · MVP (MAW-5). DIRECT selection of exactly ONE MVP per team — a native
 * radio group per team, so the browser enforces the single choice (selecting a
 * second player replaces the first) and the control is fully keyboard operable.
 * The random-MVP mode and the six-nomination list are OUT of scope; the chosen
 * grantee is written to `ActaTeamDraft.mvpGrantee`, which `buildActaPayload`
 * emits as `mvp.grantee`. Each MVP is due ★4 PE (`PE_MVP`).
 */
export function StepMvp({
  state,
  onChange,
  homeName,
  awayName,
  homeRoster,
  awayRoster,
}: StepMvpProps) {
  return (
    <div className="space-y-4">
      <TeamMvp
        side="home"
        name={homeName}
        draft={state.home}
        roster={homeRoster}
        onChange={(mvpGrantee) =>
          onChange({ ...state, home: { ...state.home, mvpGrantee } })
        }
      />
      <TeamMvp
        side="away"
        name={awayName}
        draft={state.away}
        roster={awayRoster}
        onChange={(mvpGrantee) =>
          onChange({ ...state, away: { ...state.away, mvpGrantee } })
        }
      />
      <p className="text-[11px] text-slate">
        El MVP elegido recibe sus <b className="text-ink">★{PE_MVP} PE</b>.
      </p>
    </div>
  );
}

function TeamMvp({
  side,
  name,
  draft,
  roster,
  onChange,
}: {
  side: "home" | "away";
  name: string;
  draft: ActaTeamDraft;
  roster: RosterPlayerRef[];
  onChange: (rosterPlayerId: string) => void;
}) {
  // One radio group per side: a different `name` per team keeps the two
  // selections independent while still enforcing exactly one per team.
  const groupName = `acta-mvp-${side}`;
  const optionClass =
    "flex items-center gap-2 border border-border px-2 py-1.5 text-sm text-ink";
  const labelClass =
    "px-1 text-[10px] font-bold uppercase tracking-[0.06em] text-slate";

  return (
    <fieldset className="border border-border p-3">
      <legend className={labelClass}>{name}</legend>
      <div className="flex flex-col gap-1">
        <label className={optionClass}>
          <input
            type="radio"
            name={groupName}
            value=""
            checked={draft.mvpGrantee === ""}
            onChange={() => onChange("")}
            aria-label={`Sin MVP · ${name}`}
            className="accent-navy"
          />
          <span className="text-slate">— Sin MVP</span>
        </label>
        {roster.map((player) => (
          <label key={player.id} className={optionClass}>
            <input
              type="radio"
              name={groupName}
              value={player.id}
              checked={draft.mvpGrantee === player.id}
              onChange={() => onChange(player.id)}
              aria-label={`MVP · ${name} · ${player.name}`}
              className="accent-navy"
            />
            <span className="truncate">{player.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
