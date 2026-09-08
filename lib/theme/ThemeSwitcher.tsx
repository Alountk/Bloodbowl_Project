"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { patchMe } from "@/features/profile/api";
import { useI18n } from "@/lib/i18n";
import { THEME_OPTIONS, type Theme } from "./theme";
import { useTheme } from "./index";

/**
 * Vintage / scoreboard toggle with rulebook-light navy/white styling, used in
 * the shell (AS-8), mirroring `LocaleSwitcher`.
 *
 * When a session is present the switch PATCHes the ACCOUNT theme
 * (`PATCH /api/me`) so the preference follows the user across devices, then
 * flips the provider (which also writes the `bb-theme` cookie, keeping the
 * browser in sync with the account). Anonymous visitors keep the cookie-only
 * behavior. The active state follows the provider theme, which the SSR
 * resolves to the account theme whenever the user is signed in. A failed
 * PATCH keeps the current theme and surfaces a small inline error.
 */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const { data: session } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchTo = async (next: Theme) => {
    if (pending || next === theme) return;
    setError(null);
    if (session?.user) {
      setPending(true);
      try {
        const updated = await patchMe({ theme: next });
        setTheme(updated.theme ?? next);
      } catch {
        setError(t("nav.themeError"));
      } finally {
        setPending(false);
      }
      return;
    }
    setTheme(next);
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div
        role="group"
        aria-label={t("nav.theme")}
        className="flex items-center gap-1 rounded border border-slate-300 bg-white p-0.5"
      >
        {THEME_OPTIONS.map((option) => {
          const active = theme === option.value;
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
              {t(option.labelKey)}
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
