"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { patchMe } from "@/features/profile/api";
import type { Locale } from "./dictionaries";
import { useI18n } from "./index";

const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: "es", label: "ES" },
  { value: "en", label: "EN" },
];

/**
 * ES | EN toggle with rulebook-light navy/white styling, used in the shell.
 *
 * RAU-59: when a session is present the switch PATCHes the ACCOUNT locale
 * (`PATCH /api/me`) so the preference follows the user across devices, then
 * flips the provider (which also writes the per-browser cookie, keeping the
 * browser in sync with the account). Anonymous visitors keep the cookie-only
 * behavior. The active state follows the provider locale, which the SSR
 * resolves to the account locale whenever the user is signed in. A failed
 * PATCH keeps the current locale and surfaces a small inline error.
 */
export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const { data: session } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchTo = async (next: Locale) => {
    if (pending || next === locale) return;
    setError(null);
    if (session?.user) {
      setPending(true);
      try {
        const updated = await patchMe({ locale: next });
        setLocale(updated.locale);
      } catch {
        setError(t("nav.localeError"));
      } finally {
        setPending(false);
      }
      return;
    }
    setLocale(next);
  };

  return (
    <div className="flex flex-col items-end gap-1">
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
              disabled={pending}
              onClick={() => switchTo(option.value)}
              className={`rounded px-2 py-1 text-xs font-bold transition-colors disabled:opacity-50 ${
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
      {error ? (
        <p role="alert" className="text-[11px] font-bold text-[#d11938]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
