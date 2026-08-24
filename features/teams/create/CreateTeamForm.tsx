"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useApp } from "@/app/providers/AppProvider";
import type { RulesetDto } from "@/lib/rulesets";
import { RACES } from "../data/races";
import { randomTeamName } from "../data/teamNames";
import {
  APOTHECARY_COST,
  ASSISTANT_COACH_MAX,
  CHEERLEADER_MAX,
  DEDICATED_FANS_MAX,
  DEDICATED_FANS_START,
  MAX_PLAYERS,
  MAX_REROLLS,
  STARTING_TREASURY,
  computeCoachingCostItems,
} from "../roster";
import { RosterTable } from "../roster-table/RosterTable";
import { useCreateTeamForm } from "./useCreateTeamForm";
import { PlayerAvailabilityTable } from "./PlayerAvailabilityTable";

function formatGold(value: number): string {
  return `${(value / 1000).toLocaleString("en-US")}k`;
}

/** Parses a count input as a non-negative integer, defaulting to 0. */
function parseCount(value: string): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

const fieldClassName =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500";

/** Native select styling: keeps the browser chevron (appearance-auto) and a 16px font so iOS does not auto-zoom. */
const selectClassName = `${fieldClassName} appearance-auto text-[16px]`;

/**
 * Wraps a native select in a relative container with a separate chevron element
 * (`pointer-events: none`) so the chevron renders on Samsung Android, where
 * default select background-image chevrons are hidden.
 */
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

const COACHING_LABELS: Record<string, string> = {
  rerolls: "coaching.rerolls",
  dedicatedFans: "coaching.dedicatedFans",
  assistantCoaches: "coaching.assistantCoaches",
  cheerleaders: "coaching.cheerleaders",
};

export interface CreateTeamFormProps {
  /** RAU-56: the league ruleset governing this team — filters the race select
   * and overrides the treasury budget / min-max bounds / TV cap. Absent = the
   * rulebook defaults (standalone pickup team). */
  ruleset?: RulesetDto | null;
  /** RAU-56: when set, the team is created already assigned to this league
   * (the server enforces the ruleset) and success navigates to its detail. */
  leagueId?: string;
  /** Optional success hook (e.g. a hosting modal closes + refreshes). Called
   * AFTER the team persisted, before the navigation. */
  onCreated?: () => void;
}

export function CreateTeamForm({ ruleset = null, leagueId, onCreated }: CreateTeamFormProps = {}) {
  const { addTeam } = useApp();
  const router = useRouter();
  const { t } = useI18n();
  const [saveError, setSaveError] = useState<string | null>(null);

  const form = useCreateTeamForm(
    async (values) => {
      try {
        await addTeam({ ...values, leagueId });
        setSaveError(null);
        onCreated?.();
        router.push(leagueId ? `/leagues/${leagueId}` : "/");
        router.refresh();
      } catch {
        // Persistence failed (e.g. API down / 401): stay on the form so the user
        // can retry instead of silently losing the team.
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

  const treasury = ruleset?.startingTreasury ?? STARTING_TREASURY;
  const maxPlayers = ruleset?.maxPlayers ?? MAX_PLAYERS;
  const allowedRaces = ruleset ? RACES.filter((r) => ruleset.races.includes(r.id)) : RACES;
  const race = RACES.find((candidate) => candidate.id === form.raceId);
  const budgetPercent = Math.min(100, (form.totalCost / treasury) * 100);
  const isOverBudget = form.totalCost > treasury;

  return (
    <form
      onSubmit={form.handleSubmit}
      noValidate
      className="mx-auto max-w-[900px] space-y-6 bg-white px-4 py-6 text-[#1a1a1a] shadow-[0_4px_8px_rgba(0,0,0,0.35)] sm:px-6"
    >
      {race && form.step === 2 ? (
        // Step 2 — rulebook hero + builder + availability + coaching.
        <>
          <header className="bg-[#12225a] px-4 py-[22px] text-white sm:px-6">
            <h1 className="text-2xl font-black tracking-[0.02em] md:text-[28px]">{form.name}</h1>
            <p className="mt-2 text-[13px] text-[#cbd5e1]">
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
          <section aria-label={t("create.plantilla")}>
            <h2 className="mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]">
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
            {/* Budget bar */}
            <div className="mb-3 mt-3 flex items-center justify-between text-sm">
              <span className="text-[#334155]">
                {t(form.playerCount === 1 ? "create.playerOne" : "create.playerMany", {
                  count: form.playerCount,
                  spent: formatGold(form.totalCost),
                  treasury: formatGold(treasury),
                })}
              </span>
              <span className={isOverBudget ? "font-semibold text-[#d11938]" : "text-[#64748b]"}>
                {isOverBudget
                  ? t("create.overBudget", {
                      amount: formatGold(form.totalCost - treasury),
                    })
                  : t("create.remaining", { amount: formatGold(form.remainingBudget) })}
              </span>
            </div>
            <div className="mb-4 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
              <div
                className={`h-full rounded-full transition-all ${
                  isOverBudget ? "bg-[#d11938]" : "bg-[#12225a]"
                }`}
                style={{ width: `${budgetPercent}%` }}
              />
            </div>
            {form.tvCap !== null ? (
              <p className="mb-2 text-[11px] text-[#64748b]">
                {t("create.tvCapLine", {
                  cap: formatGold(form.tvCap),
                  value: formatGold(form.totalCost),
                })}
              </p>
            ) : null}
          </section>

          {/* Jugadores disponibles */}
          <section aria-label={t("create.availablePlayers")}>
            <h2 className="mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]">
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

          <CoachingStaffSection raceId={form.raceId} form={form} />
        </>
      ) : form.step === 1 ? (
        // Step 1 — light book panel "Paso 1 · Datos del equipo".
        <section aria-label={t("create.step1Title")}>
          <h1 className="mb-4 border-b-[3px] border-[#d11938] pb-1.5 text-[26px] font-black text-[#12225a]">
            {t("create.step1Title")}
          </h1>

          {ruleset ? (
            <p className="mb-4 rounded-md border border-[#e2e8f0] bg-[#f1f5f9] px-3 py-2 text-[12px] text-[#334155]">
              {t("create.rulesetApplied", { name: ruleset.name })}
            </p>
          ) : null}

          <div className="space-y-4">
            <div>
              <label htmlFor="team-name" className="mb-1 block text-sm font-medium text-slate-700">
                {t("create.teamName")}
              </label>
              <div className="flex gap-1.5">
                <input
                  id="team-name"
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
                  className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 text-sm hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-300"
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
              <label htmlFor="team-race" className="mb-1 block text-sm font-medium text-slate-700">
                {t("create.race")}
              </label>
              <SelectWithChevron>
                <select
                  id="team-race"
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
              className="w-full rounded-md bg-[#12225a] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#0f1d48]"
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
          aria-label={t("create.confirmRaceDialog")}
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
        >
          <p className="text-sm">
            {t("create.raceChangeWarning")}
          </p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={form.confirmRaceChange}
              className="rounded-md bg-[#12225a] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#0f1d48]"
            >
              {t("create.confirm")}
            </button>
            <button
              type="button"
              onClick={form.cancelRaceChange}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:border-slate-400"
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
            className="w-full rounded-md bg-[#12225a] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#0f1d48]"
          >
            {t("create.createTeam")}
          </button>
        </>
      ) : null}
    </form>
  );
}

type CreateTeamFormState = ReturnType<typeof useCreateTeamForm>;

interface CoachingStaffSectionProps {
  raceId: string;
  form: CreateTeamFormState;
}

function CoachingStaffSection({ raceId, form }: CoachingStaffSectionProps) {
  const { t } = useI18n();
  const race = RACES.find((candidate) => candidate.id === raceId);
  if (!race) return null;

  const items = computeCoachingCostItems(race, form.coaching);
  const staffSubtotal = items.reduce((acc, item) => acc + item.total, 0);
  const apothecaryTotal = form.coaching.apothecary ? APOTHECARY_COST : 0;
  const coachingTotal = staffSubtotal + apothecaryTotal;

  return (
    <section
      aria-label={t("create.coachingStaff")}
      className="rounded-md border border-[#e2e8f0] bg-[#f1f5f9] p-4"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]">
          {t("create.coachingStaff")}
        </h2>
        <span className="text-sm text-[#64748b]">{formatGold(coachingTotal)} gc</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => {
          const max =
            item.key === "rerolls"
              ? MAX_REROLLS
              : item.key === "dedicatedFans"
                ? DEDICATED_FANS_MAX
                : item.key === "assistantCoaches"
                  ? ASSISTANT_COACH_MAX
                  : CHEERLEADER_MAX;
          const min = item.key === "dedicatedFans" ? DEDICATED_FANS_START : 0;
          return (
            <div key={item.key}>
              <label
                htmlFor={`coaching-${item.key}`}
                className="mb-1 flex items-baseline justify-between text-sm font-medium text-slate-700"
              >
                <span>{t(COACHING_LABELS[item.key])}</span>
                <span className="text-xs text-[#64748b]">
                  {item.key === "dedicatedFans"
                    ? t("coaching.startsWith", {
                        min: DEDICATED_FANS_START,
                        cost: formatGold(item.unitCost),
                      })
                    : `${formatGold(item.unitCost)} gc`}
                  {item.quantity > min ? ` · ${formatGold(item.total)}` : ""}
                </span>
              </label>
              <input
                id={`coaching-${item.key}`}
                aria-label={t(COACHING_LABELS[item.key])}
                type="number"
                min={min}
                max={max}
                step={1}
                value={item.quantity}
                onChange={(event) =>
                  form.setCoaching({ [item.key]: parseCount(event.target.value) })
                }
                className={fieldClassName}
              />
            </div>
          );
        })}

        <label className="flex items-center gap-3 self-end rounded-md border border-[#e2e8f0] bg-white px-3 py-2 text-sm text-slate-700">
          <input
            id="coaching-apothecary"
            aria-label={t("coaching.apothecary")}
            type="checkbox"
            checked={form.coaching.apothecary}
            onChange={(event) => form.setCoaching({ apothecary: event.target.checked })}
            className="h-4 w-4 accent-[#12225a]"
          />
          <span className="flex items-baseline gap-1">
            {t("coaching.apothecary")}
            <span className="text-xs text-[#64748b]">
              {formatGold(APOTHECARY_COST)} gc{apothecaryTotal > 0 ? ` · ${formatGold(apothecaryTotal)}` : ""}
            </span>
          </span>
        </label>
      </div>
    </section>
  );
}
