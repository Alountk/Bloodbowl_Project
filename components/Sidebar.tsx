"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import { LocaleSwitcher } from "@/lib/i18n/LocaleSwitcher";

const NAV_ITEMS = [
  { href: "/", key: "nav.teams" },
  { href: "/leagues", key: "nav.leagues" },
  { href: "/profile", key: "nav.profile" },
] as const;

/** Developer-only nav link (RAU-52); the /dev/rulesets page re-gates server-side. */
const DEV_NAV_ITEM = { href: "/dev/rulesets", key: "nav.devRulesets" } as const;

interface SidebarProps {
  /** Every instance shares the same nav markup; the wrapper decides placement. */
  variant?: "desktop" | "drawer";
  /** Closes the mobile drawer when a nav link is activated. */
  onNavigate?: () => void;
}

/**
 * Shared nav partial rendered by both the desktop sidebar and the mobile drawer,
 * so the nav links and active state stay single-sourced.
 */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { t } = useI18n();
  const isDeveloper = session?.user?.role === "developer";
  const items = isDeveloper ? [...NAV_ITEMS, DEV_NAV_ITEM] : NAV_ITEMS;

  return (
    <div className="flex h-full flex-col">
      <p className="mb-6 flex items-center gap-2">
        <span className="text-[18px] font-black tracking-tight text-[#12225a]">BLOODBOWL</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-[#d11938]">Teams</span>
      </p>
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-[#12225a] text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-[#12225a]"
              }`}
            >
              {t(item.key)}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto pt-4">
        <LocaleSwitcher />
      </div>
    </div>
  );
}

export function Sidebar({ variant = "desktop", onNavigate }: SidebarProps) {
  if (variant === "drawer") {
    return (
      <aside
        aria-label="Mobile navigation"
        className="fixed left-0 top-0 bottom-0 z-50 flex w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-xl"
      >
        <SidebarContent onNavigate={onNavigate} />
      </aside>
    );
  }

  return (
    <aside aria-label="Sidebar" className="hidden md:flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4">
      <SidebarContent onNavigate={onNavigate} />
    </aside>
  );
}
