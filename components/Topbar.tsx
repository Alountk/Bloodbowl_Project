"use client";

import { usePathname } from "next/navigation";
import { useApp } from "@/app/providers/AppProvider";
import { useI18n } from "@/lib/i18n";

interface TopbarProps {
  /** Opens the mobile drawer via the hamburger button (visible below `md`). */
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { searchQuery, setSearchQuery, authenticated, logout } = useApp();
  const { t } = useI18n();
  const pathname = usePathname();
  const showSearch = pathname === "/";

  return (
    <header className="flex items-center justify-between gap-2 border-b border-slate-200 p-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          aria-label={t("nav.openMenu")}
          onClick={onMenuClick}
          className="text-[#12225a] md:hidden"
        >
          ☰
        </button>
        <h1 className="truncate text-[18px] font-extrabold text-[#12225a]">Bloodbowl Teams</h1>
      </div>
      <div className="flex items-center gap-2">
        {showSearch ? (
          <form role="search" className="flex items-center gap-2">
            <input
              type="search"
              aria-label={t("topbar.searchLabel")}
              placeholder={t("topbar.searchPlaceholder")}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full max-w-[140px] rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#12225a] sm:max-w-none sm:px-3"
            />
          </form>
        ) : null}
        {authenticated ? (
          <button
            type="button"
            onClick={logout}
            className="shrink-0 rounded border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-[#12225a] hover:border-slate-400"
          >
            {t("topbar.logout")}
          </button>
        ) : null}
      </div>
    </header>
  );
}
