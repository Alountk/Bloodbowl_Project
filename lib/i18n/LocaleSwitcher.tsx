"use client";

import type { Locale } from "./dictionaries";
import { useI18n } from "./index";

const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: "es", label: "ES" },
  { value: "en", label: "EN" },
];

/** ES | EN toggle with rulebook-light navy/white styling, used in the shell. */
export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("nav.locale")}
      className="flex items-center gap-1 rounded border border-slate-300 bg-white p-0.5"
    >
      {LOCALE_OPTIONS.map((option) => {
        const active = locale === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => setLocale(option.value)}
            className={`rounded px-2 py-1 text-xs font-bold transition-colors ${
              active
                ? "bg-[#12225a] text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-[#12225a]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
