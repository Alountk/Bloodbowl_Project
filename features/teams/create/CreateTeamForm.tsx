"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/app/providers/AppProvider";
import { RACES } from "../data/races";
import { STARTING_TREASURY, type Quantities } from "../roster";
import { useCreateTeamForm } from "./useCreateTeamForm";

function formatGold(value: number): string {
  return `${(value / 1000).toLocaleString("en-US")}k`;
}

export function CreateTeamForm() {
  const { addTeam } = useApp();
  const router = useRouter();
  const form = useCreateTeamForm((values) => {
    addTeam({
      id: Date.now(),
      name: values.name,
      raceId: values.raceId,
      roster: values.roster,
    });
    router.push("/");
  });

  const race = RACES.find((candidate) => candidate.id === form.raceId);
  const budgetPercent = Math.min(100, (form.cost / STARTING_TREASURY) * 100);
  const isOverBudget = form.cost > STARTING_TREASURY;

  return (
    <form onSubmit={form.handleSubmit} noValidate className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create Team</h1>
        <p className="mt-1 text-sm text-slate-400">
          Pick a race, then build your roster within the 1,000,000 gc starting treasury.
        </p>
      </div>

      <div>
        <label htmlFor="team-name" className="mb-1 block text-sm font-medium text-slate-300">
          Team name
        </label>
        <input
          id="team-name"
          value={form.name}
          onChange={(event) => form.setName(event.target.value)}
          className="w-full rounded-md border border-blue-600/20 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-500"
        />
        {form.errors.name ? (
          <p role="alert" className="mt-1 text-sm text-red-400">
            {form.errors.name}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="team-race" className="mb-1 block text-sm font-medium text-slate-300">
          Race
        </label>
        <select
          id="team-race"
          value={form.raceId}
          onChange={(event) => form.setRaceId(event.target.value)}
          className="w-full rounded-md border border-blue-600/20 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-500"
        >
          <option value="">Select a race</option>
          {RACES.map((raceOption) => (
            <option key={raceOption.id} value={raceOption.id}>
              {raceOption.name}
            </option>
          ))}
        </select>
      </div>

      {race ? (
        <section aria-label="Roster builder">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="text-slate-300">
              {form.playerCount} player{form.playerCount === 1 ? "" : "s"} ·{" "}
              {formatGold(form.cost)} / {formatGold(STARTING_TREASURY)} gc
            </span>
            <span className={isOverBudget ? "font-semibold text-red-400" : "text-slate-400"}>
              {isOverBudget
                ? `Over budget by ${formatGold(form.cost - STARTING_TREASURY)}`
                : `${formatGold(form.remainingBudget)} remaining`}
            </span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-700">
            <div
              className={`h-full rounded-full transition-all ${
                isOverBudget ? "bg-red-500" : "bg-blue-500"
              }`}
              style={{ width: `${budgetPercent}%` }}
            />
          </div>

          <ul className="space-y-2">
            {race.positionals.map((positional) => {
              const quantity = (form.quantities as Quantities)[positional.key] ?? 0;
              const atLimit = quantity >= positional.max;
              const stats = `M${positional.ma} S${positional.st} A${positional.ag} P${positional.pa} A${positional.av}`;
              return (
                <li
                  key={positional.key}
                  className="flex items-center justify-between gap-4 rounded-md border border-blue-600/20 bg-slate-800/60 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-white">
                      {positional.name}
                      <span className="ml-2 text-sm font-normal text-slate-400">
                        {formatGold(positional.cost)} gc
                      </span>
                    </p>
                    <p className="text-xs text-slate-400">{stats}</p>
                    {positional.skills.length > 0 ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        {positional.skills.join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      aria-label={`Remove ${positional.name}`}
                      onClick={() => form.decrement(positional.key)}
                      disabled={quantity === 0}
                      className="h-8 w-8 rounded-md border border-blue-600/20 text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      −
                    </button>
                    <span aria-label={`${positional.name} count`} className="w-6 text-center text-slate-200">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Add ${positional.name}`}
                      onClick={() => form.increment(positional.key)}
                      disabled={atLimit}
                      className="h-8 w-8 rounded-md border border-blue-600/20 text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-slate-400">Select a race to build your roster.</p>
      )}

      {form.errors.players ? (
        <p role="alert" className="text-sm text-red-400">
          {form.errors.players}
        </p>
      ) : null}
      {form.errors.budget ? (
        <p role="alert" className="text-sm text-red-400">
          {form.errors.budget}
        </p>
      ) : null}

      <button
        type="submit"
        className="w-full rounded-md bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-500"
      >
        Create Team
      </button>
    </form>
  );
}
