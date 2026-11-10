"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { MAX_ATTENDANCE_FAN_FACTOR, MIN_ATTENDANCE_FAN_FACTOR } from "@/lib/rules";
import { permanentAttribute } from "@/lib/rules/injuries";
import { isJourneymanId } from "@/lib/journeymen";
import { isOwnerEquivalent } from "./access";
import {
  submitResult,
  type MatchDetail,
  type MatchTeamDetail,
  type ResultPayload,
} from "./api";
import type { LeagueAccess } from "./useLeagueName";
import { buildResultPrefill } from "./resultPrefill";
import {
  actaPrefill,
  buildActaPayload,
  emptyActaState,
  type ActaState,
} from "./acta/actaState";
import {
  planBajas,
  setInjuryRoll,
  setPermanentRoll,
  type BajasCasualty,
} from "./acta/bajasPlan";
import { StepMvp } from "./acta/StepMvp";
import { StepFinal } from "./acta/StepFinal";
import { StepRevisar, validateActa } from "./acta/StepRevisar";
import { RollStepper, ROLL6_VALUES, roll6OptionLabel } from "./rollStepper";
import { eligiblePlayers } from "./liveActionEntry";
import type { RosterPlayerRef } from "./MatchResolveModal";

/**
 * T5 Slice F (MAW-10 · Single Closure Surface) — the unified match closure that
 * runs from the Acta en Vivo sheet on V2, replacing the
 * `MatchResolveModal`/`MatchActaWizard` duplication ON THAT SURFACE (V1 keeps
 * both legacy modals byte-identical).
 *
 * The acta is DERIVED from the live capture through the Slice E pipeline
 * (`buildResultPrefill` → `actaPrefill`/`planBajas`) and the surface asks ONLY
 * the missing data: pending casualty rolls (1D16 + the permanent-band 1D6 via
 * `RollStepper`/`planBajas`), the direct MVP per team (MAW-5, `StepMvp`) and the
 * fan factor / winnings inputs (FINAL FF + fan 1D6, read-only winnings preview —
 * MAW-2/MAW-7, `StepFinal`). Events captured live are NEVER re-keyed: their
 * rows only ever appear in the read-only review (`StepRevisar`). Submission
 * goes through the EXISTING acta/result path — `buildActaPayload` (the same
 * payload the `MatchActaWizard` assembles) → `submitResult` (POST /result,
 * same request shape and server guards; the server stays authoritative).
 *
 * `canCloseActa` mirrors the MAW-1 guards client-side exactly as the legacy
 * surfaces do (MatchCard's `canLoadResult` actor/lifecycle clauses + the result
 * route's actor gate): result load only for participant/admin on a scheduled,
 * non-reported fixture with a FINISHED live match, `leagueFinished` hides
 * everything, and live-active hides the result load.
 */

/** The viewer facts the MAW-1 actor guard needs (session snapshot). */
export interface ActaClosureViewer {
  id?: string | null;
  role?: string | null;
}

/**
 * Pure: the MAW-1 visibility guards mirrored for the closure request (the
 * server re-validates every clause on POST /result):
 *
 *  - result load only for participant/admin — MatchCard `canLoadResult`'s
 *    `(isParticipant || isLeagueOwner)` with `isParticipant` = the two fixture
 *    captains and `isLeagueOwner` = `isOwnerEquivalent` (league owner or
 *    `leagues.manage` holder, exactly the result route's actor gate);
 *  - on a scheduled fixture (`fixture.status === "scheduled"`), never a
 *    reported one (route 409 "already has a result");
 *  - `leagueFinished` hides everything (RAU-40 / route 409);
 *  - live-active hides result load (MatchCard `!liveActive`) — the closure
 *    exists only for a FINISHED live match.
 */
export function canCloseActa(
  detail: Pick<MatchDetail, "fixture" | "result" | "live">,
  league: LeagueAccess,
  viewer: ActaClosureViewer,
): boolean {
  if (league.status === "finished") return false;
  if (detail.result != null) return false;
  if (detail.fixture.status !== "scheduled") return false;
  if (detail.live == null || detail.live.status !== "finished") return false;
  const userId = viewer.id ?? null;
  const isParticipant =
    userId != null &&
    (detail.fixture.homeOwner?.id === userId || detail.fixture.awayOwner?.id === userId);
  const isAdmin = isOwnerEquivalent(
    { ownerId: league.ownerId ?? "" },
    userId ?? undefined,
    viewer.role,
  );
  return isParticipant || isAdmin;
}

export interface ActaClosureProps {
  detail: MatchDetail;
  league: LeagueAccess;
  viewer: ActaClosureViewer;
  /** Collapses the surface back to the sheet (the acta stays derived). */
  onClose: () => void;
  /** Refreshes the match detail after a successful submission. */
  onSubmitted: () => void | Promise<void>;
}

/** The roster refs for one team: id/name (+ dorsal/positional for pickers). */
function rosterRefsOf(team: MatchTeamDetail, eligibleOnly: boolean): RosterPlayerRef[] {
  const eligible = new Set(eligiblePlayers(team.players).map((p) => p.rosterPlayerId));
  const refs: RosterPlayerRef[] = [];
  team.players.forEach((player, index) => {
    if (eligibleOnly && !eligible.has(player.rosterPlayerId)) return;
    refs.push({
      id: player.rosterPlayerId,
      name: player.name,
      dorsal: index + 1,
      positionalKey: player.positionalKey,
      ...(player.journeyman ? { journeyman: true } : {}),
    });
  });
  return refs;
}

/**
 * The MVP picker roster (MAW-5 / RAU-13): alive + available (RAU-51/RAU-12)
 * AND never a journeyman — `parseTeamResult` REJECTS a `journeyman-` grantee
 * with 400, so offering a Novato would dead-end the save. Filtered with the
 * shared `isJourneymanId` helper (plus the served `journeyman` flag), never a
 * string match.
 */
function mvpRosterOf(team: MatchTeamDetail): RosterPlayerRef[] {
  return rosterRefsOf(team, true).filter(
    (ref) => !ref.journeyman && !isJourneymanId(ref.id),
  );
}

/** The roster name for a victim/actor id (falls back to the id). */
function nameOf(roster: RosterPlayerRef[], id: string): string {
  return roster.find((player) => player.id === id)?.name ?? id;
}

/** Parses a 1..10 attendance FF; anything else (empty, out of range) clears. */
function parseFf(raw: string): number | undefined {
  const value = Number(raw);
  return Number.isInteger(value) &&
    value >= MIN_ATTENDANCE_FAN_FACTOR &&
    value <= MAX_ATTENDANCE_FAN_FACTOR
    ? value
    : undefined;
}

/**
 * The 1D6-only picker for a casualty whose 1D16 was CAPTURED live on the
 * permanent band (13-14) without the attribute roll: only the missing 1D6 is
 * asked — a captured roll is never re-keyed (Slice E). Same chip vocabulary and
 * testids as `RollStepper`'s 1D6 group (`roll-stepper-6` / `roll-option-N`),
 * scoped by the surrounding roll row.
 */
function PermanentRoll6({
  value,
  onRoll,
}: {
  value: number | null;
  onRoll: (n: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div aria-label="1D6" data-testid="roll-stepper-6" className="flex flex-wrap gap-1.5">
      {ROLL6_VALUES.map((n) => (
        <button
          key={n}
          type="button"
          data-testid={`roll-option-${n}`}
          aria-label={roll6OptionLabel(n, t)}
          aria-pressed={value === n}
          onClick={() => onRoll(n)}
          className={`rounded border px-2 py-1 text-xs font-bold ${
            value === n
              ? "border-red bg-red text-white"
              : "border-border bg-panel text-navy hover:bg-background"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

/**
 * ONE pending casualty roll: the full 1D16(+1D6) `RollStepper` while the injury
 * roll is unset, or just the 1D6 chips when only the permanent-attribute roll
 * is missing. The band read-out mirrors StepBajas (`acta.bajas.band` +
 * `acta.band.*`).
 */
function PendingRollRow({
  casualty,
  victimName,
  victimTeamName,
  onInjuryRoll,
  onPermanentRoll,
}: {
  casualty: BajasCasualty;
  victimName: string;
  victimTeamName: string;
  onInjuryRoll: (roll: number) => void;
  onPermanentRoll: (roll: number) => void;
}) {
  const { t } = useI18n();
  const bandLabel = casualty.band ? t(`acta.band.${casualty.band}`) : null;
  const attribute =
    casualty.permanentRoll == null
      ? null
      : permanentAttribute(casualty.permanentRoll).toUpperCase();
  return (
    <div
      data-testid={`acta-closure-roll-${casualty.causingTeam}-${casualty.index}`}
      className="border-b border-dashed border-border pb-3 last:border-b-0"
    >
      <p className="text-sm text-ink">
        {t("acta.bajas.over")} <b>{victimName}</b>{" "}
        <span className="text-slate">({victimTeamName})</span>
      </p>
      <div className="mt-2">
        {casualty.injuryRoll == null ? (
          <RollStepper
            roll16=""
            roll6={casualty.permanentRoll ?? ""}
            onRoll16={onInjuryRoll}
            onRoll6={onPermanentRoll}
            fn={t}
          />
        ) : (
          <PermanentRoll6 value={casualty.permanentRoll} onRoll={onPermanentRoll} />
        )}
      </div>
      {bandLabel ? (
        <p className="mt-1 text-[11px] text-slate">
          {t("acta.bajas.band")} <b className="text-ink">{bandLabel}</b>
          {attribute ? (
            <>
              {" "}
              {t("acta.bajas.attribute")} <b className="text-ink">−{attribute}</b>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

export function ActaClosure({
  detail,
  league,
  viewer,
  onClose,
  onSubmitted,
}: ActaClosureProps) {
  const { t } = useI18n();
  // MAW-10 "Guards preserved": a fixture that is not playable by the current
  // viewer is denied exactly as the MAW-1 guards require — no form, no submit.
  const allowed = canCloseActa(detail, league, viewer);

  // The DERIVED acta (Slice E pipeline), seeded once at mount; everything the
  // capture already carries is read-only from here on.
  const [state, setState] = useState<ActaState>(() =>
    detail.live ? actaPrefill(buildResultPrefill(detail.live)) : emptyActaState(),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const homeName = detail.homeTeam.name;
  const awayName = detail.awayTeam.name;
  const homeRoster = useMemo(() => rosterRefsOf(detail.homeTeam, false), [detail.homeTeam]);
  const awayRoster = useMemo(() => rosterRefsOf(detail.awayTeam, false), [detail.awayTeam]);
  // The MVP pickers follow the live picker eligibility (RAU-51/RAU-12:
  // alive + available) MINUS journeymen (RAU-13: a Novato can never be the
  // grantee — see `mvpRosterOf`).
  const homeMvpRoster = useMemo(() => mvpRosterOf(detail.homeTeam), [detail.homeTeam]);
  const awayMvpRoster = useMemo(() => mvpRosterOf(detail.awayTeam), [detail.awayTeam]);

  const plan = planBajas(state);
  const casualties = [...plan.home, ...plan.away];
  const pendingRolls = casualties.filter(
    (c) => c.injuryRoll == null || (c.permanent && c.permanentRoll == null),
  );
  const rollsComplete = casualties.every(
    (c) => c.injuryRoll != null && (!c.permanent || c.permanentRoll != null),
  );
  // The fan data the surface ASKS for (MAW-2/MAW-7): the FINAL FF and the
  // post-match fan 1D6 per team. Blank values must NOT fall through to the
  // server's `?? preMatchFanFactor()` / `?? rollD6()` defaults — silently
  // resolved data the closure asked for (verifier Minor B).
  const fansComplete =
    state.home.ff !== undefined &&
    state.away.ff !== undefined &&
    state.home.fanRoll != null &&
    state.away.fanRoll != null;

  // MAW-8's save block (`validateActa`: Σ anotaciones == marcador + both MVPs)
  // PLUS the pending rolls and the fan inputs this surface exists to ask — the
  // server's `?? rollD16()` fallback must never silently resolve a roll the
  // closure could have asked for (Slice E "never silently resolved").
  const validation = validateActa(state, homeName, awayName);
  const canSave = validation.ok && rollsComplete && fansComplete && !submitting;

  const setFf = (side: "home" | "away", raw: string) => {
    const ff = parseFf(raw);
    setState((prev) => ({ ...prev, [side]: { ...prev[side], ff } }));
  };

  const submitActa = async () => {
    if (!canSave) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      // The EXISTING acta/result submission path: the wizard's payload builder
      // + `submitResult` (POST /result). Same request shape, same guards.
      const payload: ResultPayload = buildActaPayload(state);
      await submitResult(detail.fixture.leagueId, detail.fixture.id, payload);
      await onSubmitted();
    } catch {
      setSubmitError(t("acta.saveError"));
    } finally {
      setSubmitting(false);
    }
  };

  const ffFieldClass =
    "mt-1 w-full border border-border bg-background px-2 py-1.5 text-sm text-ink";
  const ffLabelClass =
    "block text-[10px] font-bold uppercase tracking-[0.06em] text-slate";

  return (
    <section
      data-testid="acta-closure"
      aria-label="Cierre del acta"
      className="space-y-4 bg-background px-3.5 py-4"
    >
      {!allowed ? (
        <div
          data-testid="acta-closure-denied"
          role="alert"
          className="border border-red bg-panel px-4 py-4"
        >
          <p className="font-display text-sm font-bold text-red">Cierre no disponible</p>
          <p className="mt-1 text-sm text-slate-700">
            Solo los entrenadores participantes o el administrador de la liga
            pueden cerrar el acta de este partido.
          </p>
        </div>
      ) : (
        <>
          <header className="border border-border bg-panel px-4 py-3">
            <h2 className="font-display text-sm font-bold text-navy">Cierre del acta</h2>
            <p className="mt-1 text-xs text-slate-600">
              El acta se deriva de la captura en vivo. Solo faltan los datos
              pendientes: las tiradas de bajas, el MVP y la afición.
            </p>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.06em] text-slate">
              Marcador final · derivado del directo
            </p>
            <p className="font-display text-2xl font-semibold leading-none text-navy">
              {homeName} {state.home.score} <span className="text-endzone">–</span>{" "}
              {state.away.score} {awayName}
            </p>
          </header>

          <section aria-label={t("acta.step.bajas")} className="border border-border bg-panel p-3">
            <h3 className="font-display text-sm font-bold text-navy">{t("acta.step.bajas")}</h3>
            <p className="mt-1 text-[11px] text-slate">
              Bajas derivadas de la captura en vivo. Solo se introducen las
              tiradas pendientes.
            </p>
            {pendingRolls.length === 0 ? (
              <p className="mt-2 text-[11px] text-slate">Sin tiradas pendientes.</p>
            ) : (
              <div className="mt-2 space-y-3">
                {pendingRolls.map((casualty) => (
                  <PendingRollRow
                    key={`${casualty.causingTeam}-${casualty.index}`}
                    casualty={casualty}
                    victimName={nameOf(
                      casualty.victimTeam === "home" ? homeRoster : awayRoster,
                      casualty.victimRosterPlayerId,
                    )}
                    victimTeamName={casualty.victimTeam === "home" ? homeName : awayName}
                    onInjuryRoll={(roll) =>
                      setState((prev) =>
                        setInjuryRoll(prev, casualty.causingTeam, casualty.index, roll),
                      )
                    }
                    onPermanentRoll={(roll) =>
                      setState((prev) =>
                        setPermanentRoll(
                          prev,
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

          <section aria-label={t("acta.step.mvp")} className="border border-border bg-panel p-3">
            <h3 className="font-display text-sm font-bold text-navy">{t("acta.step.mvp")}</h3>
            <div className="mt-2">
              <StepMvp
                state={state}
                onChange={setState}
                homeName={homeName}
                awayName={awayName}
                homeRoster={homeMvpRoster}
                awayRoster={awayMvpRoster}
              />
            </div>
          </section>

          <section
            aria-label="Aficionados y ganancias"
            className="border border-border bg-panel p-3"
          >
            <h3 className="font-display text-sm font-bold text-navy">
              Aficionados y ganancias
            </h3>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              <label className={ffLabelClass}>
                {t("acta.contexto.ff", { team: homeName })}
                <input
                  type="number"
                  min={MIN_ATTENDANCE_FAN_FACTOR}
                  max={MAX_ATTENDANCE_FAN_FACTOR}
                  inputMode="numeric"
                  value={state.home.ff ?? ""}
                  onChange={(event) => setFf("home", event.target.value)}
                  className={ffFieldClass}
                />
              </label>
              <label className={ffLabelClass}>
                {t("acta.contexto.ff", { team: awayName })}
                <input
                  type="number"
                  min={MIN_ATTENDANCE_FAN_FACTOR}
                  max={MAX_ATTENDANCE_FAN_FACTOR}
                  inputMode="numeric"
                  value={state.away.ff ?? ""}
                  onChange={(event) => setFf("away", event.target.value)}
                  className={ffFieldClass}
                />
              </label>
            </div>
            <div className="mt-3">
              <StepFinal
                state={state}
                onChange={setState}
                homeName={homeName}
                awayName={awayName}
              />
            </div>
          </section>

          <section className="border border-border bg-panel p-3">
            <StepRevisar
              state={state}
              homeName={homeName}
              awayName={awayName}
              homeRoster={homeRoster}
              awayRoster={awayRoster}
            />
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-3 border border-border bg-panel px-4 py-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-border px-4 py-2 text-sm font-semibold text-navy hover:bg-background"
            >
              {t("acta.close")}
            </button>
            <div className="flex flex-col items-end gap-1">
              {!rollsComplete ? (
                <p role="status" className="text-[11px] font-semibold text-red">
                  Faltan tiradas de bajas pendientes.
                </p>
              ) : null}
              {!fansComplete ? (
                <p role="status" className="text-[11px] font-semibold text-red">
                  Faltan el Factor fan o la tirada de afición de ambos equipos.
                </p>
              ) : null}
              {submitError ? (
                <p role="alert" className="text-sm font-semibold text-red">
                  {submitError}
                </p>
              ) : null}
              <button
                type="button"
                data-testid="acta-closure-save"
                onClick={() => void submitActa()}
                disabled={!canSave}
                className="rounded-sm bg-red px-4 py-2 text-sm font-bold text-white hover:bg-red-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? t("match.resolve.saving") : t("acta.save")}
              </button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}
