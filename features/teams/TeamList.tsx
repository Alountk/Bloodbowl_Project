"use client";

import { useApp } from "@/app/providers/AppProvider";

export function TeamList() {
  const { teams, searchQuery } = useApp();
  const query = searchQuery.trim().toLowerCase();
  const filtered = query
    ? teams.filter(
        (team) =>
          team.name.toLowerCase().includes(query) || team.league.toLowerCase().includes(query),
      )
    : teams;

  return (
    <section aria-labelledby="teams-heading">
      <h2 id="teams-heading" className="mb-4 text-lg font-semibold text-slate-200">
        Teams
      </h2>
      {filtered.length === 0 ? (
        <p className="text-slate-400">
          {teams.length === 0
            ? "No teams yet. Create your first team."
            : "No teams match your search."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((team) => (
            <li
              key={team.id}
              className="rounded-lg border border-blue-600/20 bg-slate-800/60 p-4"
            >
              <h3 className="font-semibold text-white">{team.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{team.league}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
