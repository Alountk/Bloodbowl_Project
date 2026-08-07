"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [{ href: "/", label: "Teams" }];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside aria-label="Sidebar" className="w-60 shrink-0 border-r border-slate-200 bg-white p-4">
      <p className="mb-6 flex items-center gap-2">
        <span className="text-[18px] font-black tracking-tight text-[#12225a]">BLOODBOWL</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#d11938]">Teams</span>
      </p>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-[#12225a] text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-[#12225a]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
