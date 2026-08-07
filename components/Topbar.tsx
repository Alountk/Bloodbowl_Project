"use client";

import { usePathname } from "next/navigation";
import { useApp } from "@/app/providers/AppProvider";

export function Topbar() {
  const { searchQuery, setSearchQuery } = useApp();
  const pathname = usePathname();
  const showSearch = pathname === "/";

  return (
    <header className="flex items-center justify-between border-b border-slate-200 p-4">
      <h1 className="text-[18px] font-extrabold text-[#12225a]">Bloodbowl Teams</h1>
      {showSearch ? (
        <form role="search" className="flex items-center gap-2">
          <input
            type="search"
            aria-label="Search teams"
            placeholder="Search teams…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#12225a]"
          />
        </form>
      ) : null}
    </header>
  );
}
