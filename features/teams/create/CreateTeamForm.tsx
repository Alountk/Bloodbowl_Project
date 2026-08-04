"use client";

import { useRouter } from "next/navigation";
import { useApp } from "@/app/providers/AppProvider";
import { PLAYER_POSITIONS, PLAYER_POSITION_LABELS } from "../constants";
import { useCreateTeamForm } from "./useCreateTeamForm";

export function CreateTeamForm() {
  const { addTeam } = useApp();
  const router = useRouter();
  const form = useCreateTeamForm((values) => {
    addTeam({
      id: Date.now(),
      name: values.name,
      league: values.league,
      positions: values.positions,
    });
    router.push("/");
  });

  return (
    <form onSubmit={form.handleSubmit} noValidate className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Create Team</h1>
        <p className="mt-1 text-sm text-slate-400">
          Build your roster and pick the positionals you want to field.
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
        <label htmlFor="team-league" className="mb-1 block text-sm font-medium text-slate-300">
          League
        </label>
        <input
          id="team-league"
          value={form.league}
          onChange={(event) => form.setLeague(event.target.value)}
          className="w-full rounded-md border border-blue-600/20 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-500"
        />
        {form.errors.league ? (
          <p role="alert" className="mt-1 text-sm text-red-400">
            {form.errors.league}
          </p>
        ) : null}
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-slate-300">Player positions</legend>
        <div className="grid grid-cols-2 gap-2">
          {PLAYER_POSITIONS.map((position) => (
            <label
              key={position}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-blue-600/20 bg-slate-800/60 px-3 py-2 text-sm text-slate-200 has-[:checked]:border-blue-500"
            >
              <input
                type="checkbox"
                checked={form.selectedPositions.includes(position)}
                onChange={() => form.togglePosition(position)}
                className="accent-blue-500"
              />
              {PLAYER_POSITION_LABELS[position]}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        className="w-full rounded-md bg-blue-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-blue-500"
      >
        Create Team
      </button>
    </form>
  );
}
