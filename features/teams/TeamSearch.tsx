"use client";

import { useApp } from "@/app/providers/AppProvider";
import { useI18n } from "@/lib/i18n";

/**
 * Teams search box — lives in the teams section (the dashboard), NOT the
 * topbar. Filters the TeamList via the shared AppProvider query.
 */
export function TeamSearch() {
  const { searchQuery, setSearchQuery } = useApp();
  const { t } = useI18n();
  return (
    <form role="search" className="mb-3">
      <input
        type="search"
        aria-label={t("topbar.searchLabel")}
        placeholder={t("topbar.searchPlaceholder")}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full max-w-sm rounded-none border-[1.5px] border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#12225a]"
      />
    </form>
  );
}
