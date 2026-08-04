"use client";

import Link from "next/link";

const NAV_ITEMS = [
  { href: "/", label: "Teams" },
  { href: "/teams/create", label: "Create Team" },
];

export function Sidebar() {
  return (
    <aside aria-label="Sidebar" className="w-60 shrink-0 border-r border-blue-600/20 bg-slate-950 p-4">
      <p className="mb-6 text-lg font-bold tracking-tight text-blue-400">Bloodbowl</p>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
