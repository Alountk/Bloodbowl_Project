"use client";

import { PE_MVP } from "@/lib/rules";
import { permanentAttribute } from "@/lib/rules/injuries";
import { computeWinnings } from "@/lib/rules/winnings";
import { useI18n } from "@/lib/i18n";
import type { RosterPlayerRef } from "../MatchResolveModal";
import {
  aggregateActions,
  weatherOptionLabel,
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

/** The translator shape pure helpers receive — never the dictionary directly. */
type Translate = (key: string, params?: Record<string, string | number>) => string;

/** A team-specific reason the acta cannot be saved yet, as an i18n key. */
export interface ActaValidationError {
  key: string;
  params?: Record<string, string | number>;
}

/** The result of validating the acta before saving. */
export interface ActaValidation {
  ok: boolean;
  /** Team-specific reasons the acta cannot be saved yet (translated at render). */
  errors: ActaValidationError[];
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
  const errors: ActaValidationError[] = [];

  if (homeTds !== state.home.score) {
    errors.push({
      key: "acta.validate.sumMismatch",
      params: { team: homeName, tds: homeTds, score: state.home.score },
    });
  }
  if (awayTds !== state.away.score) {
    errors.push({
      key: "acta.validate.sumMismatch",
      params: { team: awayName, tds: awayTds, score: state.away.score },
    });
  }
  if (!state.home.mvpGrantee) {
    errors.push({ key: "acta.validate.missingMvp", params: { team: homeName } });
  }
  if (!state.away.mvpGrantee) {
    errors.push({ key: "acta.validate.missingMvp", params: { team: awayName } });
  }

  return { ok: errors.length === 0, errors, homeTds, awayTds };
}

export interface StepRevisarProps {
  state: ActaState;
  homeName: string;
  awayName: string;
  homeRoster: RosterPlayerRef[];
  awayRoster: RosterPlayerRef[];
}

/** Thousands grouping ("65.000") plus the resolved currency unit. */
function formatGold(amount: number, unit: string): string {
  return `${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ${unit}`;
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
  t: Translate,
): string {
  const actor = nameOf(ownRoster, line.rosterPlayerId);
  if (line.kind === "casualty") {
    return t("acta.revisar.lineCasualty", {
      team: teamName,
      actor,
      victim: nameOf(rivalRoster, line.victimRosterPlayerId ?? ""),
    });
  }
  return t("acta.revisar.lineAction", {
    team: teamName,
    actor,
    action: t(`acta.accion.${line.kind}`),
    qty: Math.max(0, line.quantity),
  });
}

function describeCasualty(
  casualty: BajasCasualty,
  victimName: string,
  victimTeamName: string,
  t: Translate,
): string {
  const roll = casualty.injuryRoll == null ? "—" : String(casualty.injuryRoll);
  const band = casualty.band
    ? t(`acta.band.${casualty.band}`)
    : t("acta.revisar.noRoll");
  const attribute =
    casualty.permanentRoll == null ? null : permanentAttribute(casualty.permanentRoll);
  const permanent = attribute
    ? t("acta.revisar.casualtyPermanent", {
        // `attribute` is non-null only when `permanentRoll` is set.
        roll: casualty.permanentRoll ?? "—",
        attr: attribute.toUpperCase(),
      })
    : "";
  return (
    t("acta.revisar.casualtyLine", {
      victim: victimName,
      team: victimTeamName,
      roll,
      band,
    }) + permanent
  );
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
  const { t } = useI18n();
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
    <section aria-label={t("acta.revisar.aria")} className="space-y-4">
      <p className="text-[11px] text-slate">{t("acta.revisar.intro")}</p>

      <dl className="space-y-3">
        <div>
          <dt className={dtClass}>{t("acta.step.contexto")}</dt>
          <dd className={ddClass}>
            {weatherOptionLabel(state.weather, t)}
            {state.duration !== undefined
              ? ` · ${t("acta.revisar.duration", { minutes: state.duration })}`
              : ""}
            {` · ${t("acta.revisar.ff", {
              home: ffText(state.home),
              away: ffText(state.away),
            })}`}
            {` · ${t("acta.revisar.incentives", {
              home: formatGold(state.home.inducements, t("acta.gold")),
              away: formatGold(state.away.inducements, t("acta.gold")),
            })}`}
            {neverHeld.length > 0
              ? ` · ${t("acta.revisar.neverHeldSummary", { teams: neverHeld.join(", ") })}`
              : ""}
          </dd>
        </div>

        <div>
          <dt className={dtClass}>{t("acta.step.marcador")}</dt>
          <dd className={ddClass}>
            <b>
              {homeName} {state.home.score} : {state.away.score} {awayName}
            </b>
          </dd>
        </div>

        <div>
          <dt className={dtClass}>{t("acta.step.acciones")}</dt>
          <dd className={ddClass}>
            {state.home.actions.length === 0 && state.away.actions.length === 0 ? (
              t("acta.revisar.noActions")
            ) : (
              <ul className="space-y-0.5">
                {state.home.actions.map((line) => (
                  <li key={`home-${line.id}`}>
                    {describeLine(line, homeName, homeRoster, awayRoster, t)}
                  </li>
                ))}
                {state.away.actions.map((line) => (
                  <li key={`away-${line.id}`}>
                    {describeLine(line, awayName, awayRoster, homeRoster, t)}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>

        <div>
          <dt className={dtClass}>{t("acta.step.mvp")}</dt>
          <dd className={ddClass}>
            <b>{nameOf(homeRoster, state.home.mvpGrantee)}</b> /{" "}
            <b>{nameOf(awayRoster, state.away.mvpGrantee)}</b>{" "}
            {t("acta.revisar.mvpLine", { pe: PE_MVP })}
          </dd>
        </div>

        <div>
          <dt className={dtClass}>{t("acta.step.bajas")}</dt>
          <dd className={ddClass}>
            {casualties.length === 0 ? (
              t("acta.revisar.noCasualties")
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
                        t,
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </dd>
        </div>

        <div>
          <dt className={dtClass}>{t("acta.step.final")}</dt>
          <dd className={ddClass}>
            {t("acta.final.winnings")}{" "}
            <b>
              {formatWinnings(
                winningsFor(state.home, state.away, validation.homeTds),
                t("acta.gold"),
              )}{" "}
              /{" "}
              {formatWinnings(
                winningsFor(state.away, state.home, validation.awayTds),
                t("acta.gold"),
              )}
            </b>
            {` · ${t("acta.revisar.aficion", {
              home: state.home.fanRoll ?? "—",
              away: state.away.fanRoll ?? "—",
            })}`}
          </dd>
        </div>

        <div>
          <dt className={dtClass}>{t("acta.revisar.validacion")}</dt>
          <dd className={ddClass}>
            {validation.ok ? (
              <span>
                {t("acta.revisar.validationOk", {
                  homeTds: validation.homeTds,
                  homeScore: state.home.score,
                  awayTds: validation.awayTds,
                  awayScore: state.away.score,
                })}
              </span>
            ) : (
              <div role="alert" className="border border-red bg-panel px-3 py-2">
                <p className="font-bold text-red">{t("acta.revisar.validationTitle")}</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-red">
                  {validation.errors.map((error) => (
                    <li key={`${error.key}:${JSON.stringify(error.params ?? {})}`}>
                      {t(error.key, error.params)}
                    </li>
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
function formatWinnings(amount: number | null, unit: string): string {
  return amount == null ? "—" : formatGold(amount, unit);
}
