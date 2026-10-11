"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { patchMe } from "@/features/profile/api";
import { useI18n } from "@/lib/i18n";
import { can } from "@/lib/permissions";
import { resolveUiFlag, UI_FLAG_COOKIE } from "@/lib/ui-flag/flag";
import { writeUiFlag } from "@/lib/ui-flag/write";
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
 *
 * Developer/admin sessions (can(role, "ui.refresh"), UIR-6/issue #331) also
 * get a second "Vista" group (UiFlagToggle below) that flips the `bb-ui` flag
 * between `next` (V2) and absent (legacy): a cookie-only write plus
 * `router.refresh()` to re-seed the server UiFlagProvider. The flag is NOT a
 * security boundary — the gate only keeps the control out of the way of
 * regular users.
 */
export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const { data: session } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showViewToggle = can(session?.user?.role, "ui.refresh");

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
      <div className="flex items-center gap-1">
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
        {showViewToggle ? <UiFlagToggle t={t} /> : null}
      </div>
      {error ? (
        <p role="alert" className="text-[11px] font-bold text-[#d11938]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The gated "Vista" group (UIR-6): Clásica ↔ Nueva (V2). Owns the `useRouter`
 * dependency and the view state so unprivileged renders (the gate above) never
 * mount it — no session, no router, no cookie read. The active state is read
 * from the `bb-ui` cookie once on mount via the pure `resolveUiFlag` resolver
 * (no provider change); the write is a client-only cookie flip followed by
 * `router.refresh()` so the server re-seeds `UiFlagProvider` (a client cookie
 * write only takes effect after re-SSR).
 */
function UiFlagToggle({ t }: { t: (key: string, params?: Record<string, string | number>) => string }) {
  const router = useRouter();
  const [viewPending, setViewPending] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [viewNext, setViewNext] = useState(false);

  // Read the `bb-ui` cookie once on mount: the pure resolver decides
  // (absent/anything-but-"next" → legacy).
  useEffect(() => {
    try {
      const raw = document.cookie
        .split("; ")
        .find((part) => part.startsWith(`${UI_FLAG_COOKIE}=`))
        ?.split("=")[1];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time cookie read after mount: reading during render would break SSR/hydration (document is server-absent).
      setViewNext(resolveUiFlag(raw));
    } catch {
      // Cookie access can throw in restricted contexts: ignore it.
    }
  }, []);

  const switchView = (next: boolean) => {
    if (viewPending || next === viewNext) return;
    setViewError(null);
    setViewPending(true);
    try {
      writeUiFlag(next);
      setViewNext(next);
      // The provider is seeded server-side: re-SSR to apply the new cookie.
      router.refresh();
    } catch {
      setViewError(t("nav.ui.error"));
    } finally {
      setViewPending(false);
    }
  };

  return (
    <>
      <div
        role="group"
        aria-label={t("nav.ui.title")}
        className="flex items-center gap-1 rounded border border-slate-300 bg-white p-0.5"
      >
        <button
          type="button"
          aria-pressed={!viewNext}
          disabled={viewPending}
          onClick={() => switchView(false)}
          className={`rounded px-2 py-1 text-xs font-bold transition-colors disabled:opacity-50 ${
            !viewNext
              ? "bg-[#12225a] text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-[#12225a]"
          }`}
        >
          {t("nav.ui.classic")}
        </button>
        <button
          type="button"
          aria-pressed={viewNext}
          disabled={viewPending}
          onClick={() => switchView(true)}
          className={`rounded px-2 py-1 text-xs font-bold transition-colors disabled:opacity-50 ${
            viewNext
              ? "bg-[#12225a] text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-[#12225a]"
          }`}
        >
          {t("nav.ui.next")}
        </button>
      </div>
      {viewError ? (
        <p role="alert" className="text-[11px] font-bold text-[#d11938]">
          {viewError}
        </p>
      ) : null}
    </>
  );
}
