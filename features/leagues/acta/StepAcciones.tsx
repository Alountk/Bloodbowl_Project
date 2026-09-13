"use client";

import type { RosterPlayerRef } from "../MatchResolveModal";
import type { ActaActionKind, ActaActionLine, ActaState } from "./actaState";

/** The action-kind choices offered on each Acciones line (MAW-4). */
const ACTION_OPTIONS: { value: ActaActionKind; label: string }[] = [
  { value: "td", label: "Anotación" },
  { value: "casualty", label: "Baja causada" },
  { value: "completion", label: "Pase completo" },
  { value: "interception", label: "Intercepción" },
  { value: "foul", label: "Falta" },
  { value: "throwTeamMate", label: "Lanzar compañero" },
  { value: "landedSafe", label: "Aterrizar sano" },
];

// Stable, deterministic line ids so React keys never collide and the markup
// does not depend on `crypto` (which is absent in some test/SSR contexts).
let lineCounter = 0;
function newLine(): ActaActionLine {
  lineCounter += 1;
  return { id: `acta-line-${lineCounter}`, rosterPlayerId: "", kind: "td", quantity: 1 };
}

export interface StepAccionesProps {
  state: ActaState;
  onChange: (next: ActaState) => void;
  homeName: string;
  awayName: string;
  homeRoster: RosterPlayerRef[];
  awayRoster: RosterPlayerRef[];
}

/**
 * Step 2 · Acciones (MAW-4). Free-form lines of player + action type + quantity
 * per team. A `casualty` line additionally names the victim, so the recorded
 * casualties feed the Bajas step through `deriveCasualtyEntries` with no
 * re-entry (MAW-6).
 */
export function StepAcciones({
  state,
  onChange,
  homeName,
  awayName,
  homeRoster,
  awayRoster,
}: StepAccionesProps) {
  return (
    <div className="space-y-4">
      <TeamActions
        side="home"
        name={homeName}
        draft={state.home}
        roster={homeRoster}
        rivalRoster={awayRoster}
        onChange={(actions) =>
          onChange({ ...state, home: { ...state.home, actions } })
        }
      />
      <TeamActions
        side="away"
        name={awayName}
        draft={state.away}
        roster={awayRoster}
        rivalRoster={homeRoster}
        onChange={(actions) =>
          onChange({ ...state, away: { ...state.away, actions } })
        }
      />
    </div>
  );
}

function TeamActions({
  side,
  name,
  draft,
  roster,
  rivalRoster,
  onChange,
}: {
  side: "home" | "away";
  name: string;
  draft: ActaState["home"];
  roster: RosterPlayerRef[];
  rivalRoster: RosterPlayerRef[];
  onChange: (actions: ActaActionLine[]) => void;
}) {
  const rivalSide: "home" | "away" = side === "home" ? "away" : "home";

  const updateLine = (index: number, patch: Partial<ActaActionLine>) => {
    onChange(draft.actions.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  const tds = draft.actions
    .filter((line) => line.kind === "td")
    .reduce((total, line) => total + Math.max(0, line.quantity), 0);
  const casualties = draft.actions.filter(
    (line) => line.kind === "casualty" && line.victimRosterPlayerId,
  ).length;

  const fieldClass = "mt-1 w-full border border-border bg-background px-2 py-1 text-sm text-ink";
  const labelClass = "block text-[10px] font-bold uppercase tracking-[0.06em] text-slate";

  return (
    <section aria-label={name} className="border border-border p-3">
      <h3 className="font-display text-sm font-bold text-navy">{name}</h3>

      <div className="mt-2 space-y-3">
        {draft.actions.map((action, index) => {
          const slot = index + 1;
          const victimValue =
            action.victimTeam && action.victimRosterPlayerId
              ? `${action.victimTeam}:${action.victimRosterPlayerId}`
              : "";
          return (
            <div
              key={action.id}
              className="grid gap-2 border-b border-dashed border-border pb-3 sm:grid-cols-[1fr_1fr_5rem_1fr_auto] sm:items-end"
            >
              <label className={labelClass}>
                Jugador {slot} · {name}
                <select
                  value={action.rosterPlayerId}
                  onChange={(event) =>
                    updateLine(index, { rosterPlayerId: event.target.value })
                  }
                  className={fieldClass}
                >
                  <option value="">—</option>
                  {roster.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelClass}>
                Acción {slot} · {name}
                <select
                  value={action.kind}
                  onChange={(event) =>
                    updateLine(index, { kind: event.target.value as ActaActionKind })
                  }
                  className={fieldClass}
                >
                  {ACTION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {action.kind === "casualty" ? (
                // One casualty line == one casualty, so `quantity` is
                // meaningless here and is not offered (placeholder keeps the grid).
                <span />
              ) : (
                <label className={labelClass}>
                  Cantidad {slot} · {name}
                  <input
                    type="number"
                    min={0}
                    value={action.quantity}
                    onChange={(event) =>
                      updateLine(index, { quantity: Number(event.target.value) || 0 })
                    }
                    className={`${fieldClass} text-center`}
                  />
                </label>
              )}

              {action.kind === "casualty" ? (
                <label className={labelClass}>
                  Víctima {slot} · {name}
                  <select
                    value={victimValue}
                    onChange={(event) => {
                      const [team, rosterPlayerId] = event.target.value.split(":");
                      updateLine(index, {
                        victimTeam: team === "home" || team === "away" ? team : undefined,
                        victimRosterPlayerId: rosterPlayerId || undefined,
                      });
                    }}
                    className={fieldClass}
                  >
                    <option value="">—</option>
                    {rivalRoster.map((player) => (
                      <option key={player.id} value={`${rivalSide}:${player.id}`}>
                        {player.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span />
              )}

              <button
                type="button"
                aria-label={`Eliminar acción ${slot} · ${name}`}
                onClick={() =>
                  onChange(draft.actions.filter((_, i) => i !== index))
                }
                className="justify-self-start px-2 py-1 text-sm font-bold text-red"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        aria-label={`Añadir acción · ${name}`}
        onClick={() => onChange([...draft.actions, newLine()])}
        className="mt-3 border border-border bg-panel px-3 py-1.5 text-xs font-bold text-navy"
      >
        + Añadir acción
      </button>

      <p className="mt-2 text-[11px] text-slate">
        Σ anotaciones <b className="text-ink">{tds}</b> · bajas causadas{" "}
        <b className="text-ink">{casualties}</b> → paso 4
      </p>
    </section>
  );
}
