"use client";

import { useApp } from "@/app/providers/AppProvider";

export function Topbar() {
  const { searchQuery, setSearchQuery } = useApp();

  return (
    <header className="flex items-center justify-between border-b border-blue-600/20 p-4">
      <h1 className="text-xl font-bold">Bloodbowl Teams</h1>
      <form role="search" className="flex items-center gap-2">
        <input
          type="search"
          aria-label="Search teams"
          placeholder="Search teams…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="rounded-md border border-blue-600/20 bg-slate-800 px-3 py-1.5 text-sm text-white outline-none placeholder:text-slate-400 focus:border-blue-500"
        />
      </form>
    </header>
  );
}
