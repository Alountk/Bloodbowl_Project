"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/app/providers/AppProvider";
import { RACES } from "../data/races";
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
import { LEAGUE_TYPES, type TeamLeagueType } from "../types";
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
  rerolls: "Rerolls",
  dedicatedFans: "Dedicated Fans",
  assistantCoaches: "Assistant Coaches",
  cheerleaders: "Cheerleaders",
};

export function CreateTeamForm() {
  const { addTeam } = useApp();
  const router = useRouter();
  const form = useCreateTeamForm(async (values) => {
    await addTeam(values);
    router.push("/");
  });

  const race = RACES.find((candidate) => candidate.id === form.raceId);
  const budgetPercent = Math.min(100, (form.totalCost / STARTING_TREASURY) * 100);
  const isOverBudget = form.totalCost > STARTING_TREASURY;

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
              {race.name} · Paso 2
            </p>
            <button
              type="button"
              onClick={form.backStep}
              className="mt-3 inline-block rounded-md border border-white/40 px-3 py-1 text-sm text-white hover:border-white"
            >
              Editar nombre/raza
            </button>
          </header>

          {/* Plantilla */}
          <section aria-label="Plantilla">
            <h2 className="mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]">
              Plantilla
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
                {form.playerCount} player{form.playerCount === 1 ? "" : "s"} ·{" "}
                {formatGold(form.totalCost)} / {formatGold(STARTING_TREASURY)} gc
              </span>
              <span className={isOverBudget ? "font-semibold text-[#d11938]" : "text-[#64748b]"}>
                {isOverBudget
                  ? `Over budget by ${formatGold(form.totalCost - STARTING_TREASURY)}`
                  : `${formatGold(form.remainingBudget)} remaining`}
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
          </section>

          {/* Jugadores disponibles */}
          <section aria-label="Jugadores disponibles">
            <h2 className="mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]">
              Jugadores disponibles
            </h2>
            <PlayerAvailabilityTable
              race={race}
              players={form.players}
              totalCost={form.totalCost}
              onAdd={form.addPlayer}
              maxPlayers={MAX_PLAYERS}
            />
          </section>

          <CoachingStaffSection raceId={form.raceId} form={form} />
        </>
      ) : form.step === 1 ? (
        // Step 1 — light book panel "Paso 1 · Datos del equipo".
        <section aria-label="Paso 1 · Datos del equipo">
          <h1 className="mb-4 border-b-[3px] border-[#d11938] pb-1.5 text-[26px] font-black text-[#12225a]">
            Paso 1 · Datos del equipo
          </h1>

          <div className="space-y-4">
            <div>
              <label htmlFor="team-name" className="mb-1 block text-sm font-medium text-slate-700">
                Team name
              </label>
              <input
                id="team-name"
                value={form.name}
                onChange={(event) => form.setName(event.target.value)}
                className={fieldClassName}
              />
              {form.errors.name ? (
                <p role="alert" className="mt-1 text-sm text-red-600">
                  {form.errors.name}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor="team-race" className="mb-1 block text-sm font-medium text-slate-700">
                Race
              </label>
              <SelectWithChevron>
                <select
                  id="team-race"
                  value={form.raceId}
                  onChange={(event) => form.changeRace(event.target.value)}
                  className={selectClassName}
                >
                  <option value="">Select a race</option>
                  {RACES.map((raceOption) => (
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
              Siguiente →
            </button>
          </div>
        </section>
      ) : null}

      {/* Race change confirmation dialog — rendered wherever the race edit happens. */}
      {form.pendingRaceId !== null ? (
        <div
          role="alertdialog"
          aria-label="Confirm race change"
          className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
        >
          <p className="text-sm">
            Changing race will clear your current roster. Your roster will be cleared. Are you sure?
          </p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              onClick={form.confirmRaceChange}
              className="rounded-md bg-[#12225a] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#0f1d48]"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={form.cancelRaceChange}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:border-slate-400"
            >
              Cancel
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

          <button
            type="submit"
            className="w-full rounded-md bg-[#12225a] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#0f1d48]"
          >
            Create Team
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
  const race = RACES.find((candidate) => candidate.id === raceId);
  if (!race) return null;

  const items = computeCoachingCostItems(race, form.coaching);
  const staffSubtotal = items.reduce((acc, item) => acc + item.total, 0);
  const apothecaryTotal = form.coaching.apothecary ? APOTHECARY_COST : 0;
  const coachingTotal = staffSubtotal + apothecaryTotal;

  return (
    <section
      aria-label="Coaching Staff"
      className="rounded-md border border-[#e2e8f0] bg-[#f1f5f9] p-4"
    >
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]">
          Coaching Staff
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
                <span>{COACHING_LABELS[item.key]}</span>
                <span className="text-xs text-[#64748b]">
                  {item.key === "dedicatedFans"
                    ? `starts at ${DEDICATED_FANS_START} · ${formatGold(item.unitCost)} gc per upgrade`
                    : `${formatGold(item.unitCost)} gc`}
                  {item.quantity > min ? ` · ${formatGold(item.total)}` : ""}
                </span>
              </label>
              <input
                id={`coaching-${item.key}`}
                aria-label={COACHING_LABELS[item.key]}
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
            aria-label="Apothecary"
            type="checkbox"
            checked={form.coaching.apothecary}
            onChange={(event) => form.setCoaching({ apothecary: event.target.checked })}
            className="h-4 w-4 accent-[#12225a]"
          />
          <span className="flex items-baseline gap-1">
            Apothecary
            <span className="text-xs text-[#64748b]">
              {formatGold(APOTHECARY_COST)} gc{apothecaryTotal > 0 ? ` · ${formatGold(apothecaryTotal)}` : ""}
            </span>
          </span>
        </label>

        <div>
          <label
            htmlFor="team-league-type"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            League type
          </label>
          <SelectWithChevron>
            <select
              id="team-league-type"
              aria-label="League type"
              value={form.leagueType}
              onChange={(event) => form.setLeagueType(event.target.value as TeamLeagueType)}
              className={selectClassName}
            >
              {LEAGUE_TYPES.map((leagueType) => (
                <option key={leagueType} value={leagueType}>
                  {leagueType}
                </option>
              ))}
            </select>
          </SelectWithChevron>
        </div>
      </div>
    </section>
  );
}
