"use client";

import { PE_MVP } from "@/lib/rules";
import { permanentAttribute, type InjuryOutcomeKind } from "@/lib/rules/injuries";
import { computeWinnings } from "@/lib/rules/winnings";
import type { RosterPlayerRef } from "../MatchResolveModal";
import {
  aggregateActions,
  type ActaActionKind,
  type ActaState,
  type ActaTeamDraft,
} from "./actaState";
import { planBajas, type BajasCasualty } from "./bajasPlan";

/**
 * Step 6 · Revisar (MAW-8). Read-only summary of the whole acta plus the
 * validation state. The shell consumes `validateActa` to enable/disable its
 * "Guardar acta" button, so the block is enforced in ONE place and the step
 * shows the SAME errors to the user.
 *
 * Save is blocked unless BOTH hold:
 *   - Σ anotaciones == marcador for each team, and
 *   - both teams have an MVP selected.
 *
 * The MVP block is required by the S1 route contract: the wizard sends
 * `mvp.grantee` with an EMPTY `nominations` array, so a team without an MVP
 * would make the POST receive a 400 (absent grantee → six nominations required).
 */

/** Spanish rulebook labels for the 1D16 injury bands (presentation only). */
const BAND_LABELS: Record<InjuryOutcomeKind, string> = {
  bruise: "Magullado",
  apaleado: "Apaleado",
  grave: "Herida grave",
  permanent: "Permanente",
  dead: "Muerto",
};

/** Spanish labels for the Acciones action kinds (presentation only). */
const ACTION_LABELS: Record<ActaActionKind, string> = {
  td: "Anotación",
  casualty: "Baja causada",
  completion: "Pase completo",
  interception: "Intercepción",
  foul: "Falta",
  throwTeamMate: "Lanzar compañero",
  landedSafe: "Aterrizar sano",
};

/** The result of validating the acta before saving. */
export interface ActaValidation {
  ok: boolean;
  /** Human-readable, team-specific reasons the acta cannot be saved yet. */
  errors: string[];
  /** Home Σ anotaciones as the server validates it (per-player TD credits). */
  homeTds: number;
  /** Away Σ anotaciones as the server validates it. */
  awayTds: number;
}

/**
 * Σ anotaciones for one team, computed from the SAME `aggregateActions` rows the
 * payload emits — mirroring the server's `scoresMatchReportedTotals` (per-player
 * TD credits). A TD line with no player selected is therefore not credited, so
 * the client block matches the server's 400 exactly.
 */
function sumAnotaciones(draft: ActaTeamDraft): number {
  return aggregateActions(draft.actions).reduce((total, row) => total + row.tds, 0);
}

/**
 * Pure: the save-block predicate (MAW-8). Names each failing team so the UI can
 * show a specific, actionable error.
 */
export function validateActa(
  state: ActaState,
  homeName: string,
  awayName: string,
): ActaValidation {
  const homeTds = sumAnotaciones(state.home);
  const awayTds = sumAnotaciones(state.away);
  const errors: string[] = [];

  if (homeTds !== state.home.score) {
    errors.push(
      `Σ anotaciones de ${homeName}: ${homeTds} · marcador: ${state.home.score}. Deben coincidir.`,
    );
  }
  if (awayTds !== state.away.score) {
    errors.push(
      `Σ anotaciones de ${awayName}: ${awayTds} · marcador: ${state.away.score}. Deben coincidir.`,
    );
  }
  if (!state.home.mvpGrantee) errors.push(`Falta el MVP de ${homeName}.`);
  if (!state.away.mvpGrantee) errors.push(`Falta el MVP de ${awayName}.`);

  return { ok: errors.length === 0, errors, homeTds, awayTds };
}

export interface StepRevisarProps {
  state: ActaState;
  homeName: string;
  awayName: string;
  homeRoster: RosterPlayerRef[];
  awayRoster: RosterPlayerRef[];
}

/** Spanish thousands grouping ("65.000"), deterministic across environments. */
function formatGold(amount: number): string {
  return `${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} M.O.`;
}

/** A team's FINAL FF, or a dash while still unset (the server would roll it). */
function ffText(draft: ActaTeamDraft): string {
  return draft.ff === undefined ? "—" : String(draft.ff);
}

function nameOf(roster: RosterPlayerRef[], id: string): string {
  return roster.find((player) => player.id === id)?.name ?? (id || "—");
}

/** The winnings preview for one team, using the SAME pure function as the server. */
function winningsFor(
  draft: ActaTeamDraft,
  rival: ActaTeamDraft,
  ownTds: number,
): number | null {
  if (typeof draft.ff !== "number" || typeof rival.ff !== "number") return null;
  return computeWinnings({
    ffHome: draft.ff,
    ffAway: rival.ff,
    ownTds,
    heldBall: !draft.neverHeld,
  });
}

function describeLine(
  line: { kind: ActaActionKind; rosterPlayerId: string; quantity: number; victimRosterPlayerId?: string },
  teamName: string,
  ownRoster: RosterPlayerRef[],
  rivalRoster: RosterPlayerRef[],
): string {
  const actor = nameOf(ownRoster, line.rosterPlayerId);
  if (line.kind === "casualty") {
    return `${teamName}: ${actor} — baja causada a ${nameOf(rivalRoster, line.victimRosterPlayerId ?? "")}`;
  }
  return `${teamName}: ${actor} — ${ACTION_LABELS[line.kind]} ×${Math.max(0, line.quantity)}`;
}

function describeCasualty(
  casualty: BajasCasualty,
  victimName: string,
  victimTeamName: string,
): string {
  const roll = casualty.injuryRoll == null ? "—" : String(casualty.injuryRoll);
  const band = casualty.band ? BAND_LABELS[casualty.band] : "sin tirada";
  const attribute =
    casualty.permanentRoll == null ? null : permanentAttribute(casualty.permanentRoll);
  const permanent = attribute
    ? ` · 1D6 ${casualty.permanentRoll} · atributo −${attribute.toUpperCase()}`
    : "";
  return `Baja sobre ${victimName} (${victimTeamName}) — 1D16 ${roll} · ${band}${permanent}`;
}

/**
 * Step 6 · Revisar (MAW-8). A readable summary of context, score, actions, MVP,
 * derived casualties with their rolls, and the winnings preview, followed by the
 * validation state. Read-only: the only action lives in the shell footer.
 */
export function StepRevisar({
  state,
  homeName,
  awayName,
  homeRoster,
  awayRoster,
}: StepRevisarProps) {
  const validation = validateActa(state, homeName, awayName);
  const plan = planBajas(state);
  const casualties = [...plan.home, ...plan.away];
  const neverHeld = [
    state.home.neverHeld ? homeName : null,
    state.away.neverHeld ? awayName : null,
  ].filter((name): name is string => name !== null);

  const dtClass = "text-[10px] font-bold uppercase tracking-[0.06em] text-slate";
  const ddClass = "mt-0.5 text-sm text-ink";

  return (
    <section aria-label="Resumen del acta" className="space-y-4">
      <p className="text-[11px] text-slate">
        Revisa el acta completa. El guardado se bloquea si las anotaciones no
        cuadran con el marcador o si falta el MVP de algún equipo.
      </p>

      <dl className="space-y-3">
        <div>
          <dt className={dtClass}>Contexto</dt>
          <dd className={ddClass}>
            {state.weather}
            {state.duration !== undefined ? ` · ${state.duration} min` : ""}
            {` · FF ${ffText(state.home)} / ${ffText(state.away)}`}
            {` · incentivos ${formatGold(state.home.inducements)} / ${formatGold(state.away.inducements)}`}
            {neverHeld.length > 0
              ? ` · ${neverHeld.join(", ")} NUNCA tuvo el balón (+1)`
              : ""}
          </dd>
        </div>

        <div>
          <dt className={dtClass}>Marcador</dt>
          <dd className={ddClass}>
            <b>
              {homeName} {state.home.score} : {state.away.score} {awayName}
            </b>
          </dd>
        </div>

        <div>
          <dt className={dtClass}>Acciones</dt>
          <dd className={ddClass}>
            {state.home.actions.length === 0 && state.away.actions.length === 0 ? (
              "Sin acciones registradas."
            ) : (
              <ul className="space-y-0.5">
                {state.home.actions.map((line) => (
                  <li key={`home-${line.id}`}>
                    {describeLine(line, homeName, homeRoster, awayRoster)}
                  </li>
                ))}
                {state.away.actions.map((line) => (
                  <li key={`away-${line.id}`}>
                    {describeLine(line, awayName, awayRoster, homeRoster)}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>

        <div>
          <dt className={dtClass}>MVP</dt>
          <dd className={ddClass}>
            <b>{nameOf(homeRoster, state.home.mvpGrantee)}</b> /{" "}
            <b>{nameOf(awayRoster, state.away.mvpGrantee)}</b> (★{PE_MVP} PE cada uno)
          </dd>
        </div>

        <div>
          <dt className={dtClass}>Bajas</dt>
          <dd className={ddClass}>
            {casualties.length === 0 ? (
              "Sin bajas causadas."
            ) : (
              <ul className="space-y-0.5">
                {casualties.map((casualty) => {
                  const victimRoster =
                    casualty.victimTeam === "home" ? homeRoster : awayRoster;
                  const victimTeamName =
                    casualty.victimTeam === "home" ? homeName : awayName;
                  return (
                    <li key={`${casualty.causingTeam}-${casualty.index}`}>
                      {describeCasualty(
                        casualty,
                        nameOf(victimRoster, casualty.victimRosterPlayerId),
                        victimTeamName,
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </dd>
        </div>

        <div>
          <dt className={dtClass}>Final</dt>
          <dd className={ddClass}>
            Ganancias{" "}
            <b>
              {formatWinnings(winningsFor(state.home, state.away, validation.homeTds))} /{" "}
              {formatWinnings(winningsFor(state.away, state.home, validation.awayTds))}
            </b>
            {` · Afición 1D6 ${state.home.fanRoll ?? "—"} / ${state.away.fanRoll ?? "—"}`}
          </dd>
        </div>

        <div>
          <dt className={dtClass}>Validación</dt>
          <dd className={ddClass}>
            {validation.ok ? (
              <span>
                ✓ Σ anotaciones = marcador ({validation.homeTds} = {state.home.score} ·{" "}
                {validation.awayTds} = {state.away.score}) · MVP completo
              </span>
            ) : (
              <div role="alert" className="border border-red bg-panel px-3 py-2">
                <p className="font-bold text-red">No se puede guardar el acta:</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red">
                  {validation.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Renders a winnings preview amount, or a dash while an FF is still unset. */
function formatWinnings(amount: number | null): string {
  return amount == null ? "—" : formatGold(amount);
}
