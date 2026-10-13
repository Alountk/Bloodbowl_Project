"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/app/providers/AppProvider";
import { RACES } from "../data/races";
import { randomTeamName } from "../data/teamNames";
import { MAX_PLAYERS, STARTING_TREASURY } from "../roster";
import { RosterTable } from "../roster-table/RosterTable";
import { PlayerAvailabilityTable } from "./PlayerAvailabilityTable";
import { useCreateTeamForm } from "./useCreateTeamForm";
import type { CreateTeamFormProps } from "./CreateTeamForm";

/**
 * Create wizard V2 (ui-refresh seam #4, UIR-2): presentation-only mirror of
 * `CreateTeamForm` driven by the SAME legacy machinery — `useCreateTeamForm`
 * (state + validation), `useApp().addTeam`, `RosterTable`,
 * `PlayerAvailabilityTable` — so requests, validation and navigation are
 * byte-identical to the legacy surface; only the markup differs.
 *
 * The flag-ON e2e harness (`createTeamAndOpenList`) walks this wizard with
 * `bb-ui=next` already set, so the ACCESSIBLE CONTRACT is frozen to the same
 * `create.*` i18n keys legacy renders: "Team name", "Race", "Next →",
 * `create.addAction` ("Add Human Lineman") and the `create.createTeam` submit.
 * Legacy-only DOM ids (`team-name`, `team-race`) stay out of V2 so the
 * never-both assertion can use them as legacy markers; V2 landmarks are the
 * `ui-v2-create-*` testids.
 *
 * Slice 1: functional core (both steps, budget, errors, race-change dialog,
 * submit). Slice 2: Stitch chrome ("Crear Equipo (Paso 1)" / "(Paso 2:
 * Roster)" / "M 06" / "M 07"), coaching restyle and mobile layout.
 */

function formatGold(value: number): string {
  return `${(value / 1000).toLocaleString("en-US")}k`;
}

const fieldClassName =
  "w-full rounded-md border border-slate-300 bg-panel px-3 py-2 text-slate-900 outline-none focus:border-blue-500";

const selectClassName = `${fieldClassName} appearance-auto text-[16px]`;

/** Keeps the browser chevron out of reach so V2 renders it itself. */
function SelectWithChevron({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      {children}
      <span
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
      >
        ▾
      </span>
    </div>
  );
}

export function CreateTeamFormV2({ ruleset = null, leagueId, onCreated }: CreateTeamFormProps = {}) {
  const { addTeam } = useApp();
  const router = useRouter();
  const { t } = useI18n();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Same submit wiring as the legacy surface: persist through the shared
  // provider, then the identical navigation (home, or the hosting league).
  const form = useCreateTeamForm(
    async (values) => {
      try {
        await addTeam({ ...values, leagueId });
        setSaveError(null);
        onCreated?.();
        router.push(leagueId ? `/leagues/${leagueId}` : "/");
        router.refresh();
      } catch {
        setSaveError(t("create.saveError"));
      }
    },
    {
      startingTreasury: ruleset?.startingTreasury,
      minPlayers: ruleset?.minPlayers,
      maxPlayers: ruleset?.maxPlayers,
      tvCap: ruleset?.tvCap ?? null,
    },
  );

  const race = RACES.find((candidate) => candidate.id === form.raceId);
  const treasury = ruleset?.startingTreasury ?? STARTING_TREASURY;
  const maxPlayers = ruleset?.maxPlayers ?? MAX_PLAYERS;
  const allowedRaces = ruleset ? RACES.filter((r) => ruleset.races.includes(r.id)) : RACES;
  const budgetPercent = Math.min(100, (form.totalCost / treasury) * 100);
  const isOverBudget = form.totalCost > treasury;

  return (
    <form
      onSubmit={form.handleSubmit}
      noValidate
      className="mx-auto max-w-[900px] space-y-6 bg-panel px-4 py-6 text-[#1a1a1a] shadow-[0_4px_8px_rgba(0,0,0,0.35)] sm:px-6"
    >
      {race && form.step === 2 ? (
        <>
          {/* Step 2 — navy hero + roster + availability. */}
          <header
            data-testid="ui-v2-create-step2"
            className="rounded-md bg-navy px-4 py-[22px] text-white sm:px-6"
          >
            <h1 className="text-2xl font-black tracking-[0.02em] md:text-[28px]">{form.name}</h1>
            <p className="mt-2 text-[13px] text-border-subtle">
              {t("create.step2Subline", { race: race.name })}
            </p>
            <button
              type="button"
              onClick={form.backStep}
              className="mt-3 inline-block rounded-md border border-white/40 px-3 py-1 text-sm text-white hover:border-white"
            >
              {t("create.editNameRace")}
            </button>
          </header>

          {/* Plantilla */}
          <section data-testid="ui-v2-create-roster" aria-label={t("create.plantilla")}>
            <h2 className="mb-3 border-b-[3px] border-red pb-1.5 text-[16px] text-navy">
              {t("create.plantilla")}
            </h2>
            <RosterTable
              players={form.players}
              race={race}
              onRename={form.renamePlayer}
              onRemove={form.removePlayer}
              remainingBudget={form.remainingBudget}
              bannerText={form.name.trim() || race.name}
              apothecary={form.coaching.apothecary}
            />
            {/* Budget row + progress bar */}
            <div
              data-testid="ui-v2-create-budget"
              className="mb-3 mt-3 flex items-center justify-between text-sm"
            >
              <span className="text-slate-strong">
                {t(form.playerCount === 1 ? "create.playerOne" : "create.playerMany", {
                  count: form.playerCount,
                  spent: formatGold(form.totalCost),
                  treasury: formatGold(treasury),
                })}
              </span>
              <span className={isOverBudget ? "font-semibold text-red" : "text-slate"}>
                {isOverBudget
                  ? t("create.overBudget", { amount: formatGold(form.totalCost - treasury) })
                  : t("create.remaining", { amount: formatGold(form.remainingBudget) })}
              </span>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-border">
              <div
                className={`h-full rounded-full transition-all ${isOverBudget ? "bg-red" : "bg-navy"}`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
            {form.tvCap !== null ? (
              <p className="mb-2 text-[11px] text-slate">
                {t("create.tvCapLine", {
                  cap: formatGold(form.tvCap),
                  value: formatGold(form.totalCost),
                })}
              </p>
            ) : null}
          </section>

          {/* Jugadores disponibles */}
          <section
            data-testid="ui-v2-create-availability"
            aria-label={t("create.availablePlayers")}
          >
            <h2 className="mb-3 border-b-[3px] border-red pb-1.5 text-[16px] text-navy">
              {t("create.availablePlayers")}
            </h2>
            <PlayerAvailabilityTable
              race={race}
              players={form.players}
              totalCost={form.totalCost}
              onAdd={form.addPlayer}
              maxPlayers={maxPlayers}
            />
          </section>
        </>
      ) : form.step === 1 ? (
        /* Step 1 — team name + race. */
        <section data-testid="ui-v2-create-step1" aria-label={t("create.step1Title")}>
          <h1 className="mb-4 border-b-[3px] border-red pb-1.5 text-[26px] font-black text-navy">
            {t("create.step1Title")}
          </h1>

          {ruleset ? (
            <p className="mb-4 rounded-md border border-border bg-fill-hover px-3 py-2 text-[12px] text-slate-strong">
              {t("create.rulesetApplied", { name: ruleset.name })}
            </p>
          ) : null}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="ui-v2-create-name"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                {t("create.teamName")}
              </label>
              <div className="flex gap-1.5">
                <input
                  id="ui-v2-create-name"
                  value={form.name}
                  onChange={(event) => form.setName(event.target.value)}
                  className={fieldClassName}
                />
                <button
                  type="button"
                  disabled={!form.raceId}
                  title={t("create.rollTeamName")}
                  aria-label={t("create.rollTeamName")}
                  onClick={() => form.setName(randomTeamName(form.raceId))}
                  className="shrink-0 rounded-md border border-slate-300 bg-panel px-2.5 text-sm hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-300"
                >
                  🎲
                </button>
              </div>
              {form.errors.name ? (
                <p role="alert" className="mt-1 text-sm text-red-600">
                  {form.errors.name}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="ui-v2-create-race"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                {t("create.race")}
              </label>
              <SelectWithChevron>
                <select
                  id="ui-v2-create-race"
                  value={form.raceId}
                  onChange={(event) => form.changeRace(event.target.value)}
                  className={selectClassName}
                >
                  <option value="">{t("create.selectRace")}</option>
                  {allowedRaces.map((raceOption) => (
                    <option key={raceOption.id} value={raceOption.id}>
                      {raceOption.name}
                    </option>
                  ))}
                </select>
              </SelectWithChevron>
              {form.errors.race ? (
                <p role="alert" className="mt-1 text-sm text-red-600">
                  {form.errors.race}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={form.nextStep}
              className="w-full rounded-md bg-navy px-4 py-2 font-semibold text-white transition-colors hover:bg-navy-hover"
            >
              {t("create.next")}
            </button>
          </div>
        </section>
      ) : null}

      {/* Race change confirmation dialog — rendered wherever the race edit happens. */}
      {form.pendingRaceId !== null ? (
        <div
          role="alertdialog"
          data-testid="ui-v2-create-race-dialog"
          aria-label={t("create.confirmRaceDialog")}
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
        >
          <p className="text-sm">{t("create.raceChangeWarning")}</p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={form.confirmRaceChange}
              className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-navy-hover"
            >
              {t("create.confirm")}
            </button>
            <button
              type="button"
              onClick={form.cancelRaceChange}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
            >
              {t("create.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {race && form.step === 2 ? (
        <>
          {form.errors.players ? (
            <p role="alert" className="text-sm text-red-600">
              {form.errors.players}
            </p>
          ) : null}
          {form.errors.budget ? (
            <p role="alert" className="text-sm text-red-600">
              {form.errors.budget}
            </p>
          ) : null}
          {form.errors.tvCap ? (
            <p role="alert" className="text-sm text-red-600">
              {form.errors.tvCap}
            </p>
          ) : null}
          {saveError ? (
            <p role="alert" className="text-sm text-red-600">
              {saveError}
            </p>
          ) : null}

          <button
            type="submit"
            data-testid="ui-v2-create-submit"
            className="w-full rounded-md bg-navy px-4 py-2 font-semibold text-white transition-colors hover:bg-navy-hover"
          >
            {t("create.createTeam")}
          </button>
        </>
      ) : null}
    </form>
  );
}
