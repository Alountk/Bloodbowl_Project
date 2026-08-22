"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LOCALE, t as translate, type Locale } from "./dictionaries";

export interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

export const I18nContext = createContext<I18nContextValue | null>(null);

const COOKIE_KEY = "bb-locale";

/** Reads the persisted locale from the `bb-locale` cookie (client-side). */
function readLocaleCookie(): Locale | null {
  try {
    const match = document.cookie
      .split("; ")
      .find((part) => part.startsWith(`${COOKIE_KEY}=`));
    const value = match?.split("=")[1];
    if (value === "es" || value === "en") return value;
  } catch {
    // Cookie access can throw in restricted contexts: ignore it.
  }
  return null;
}

/**
 * Resolves the initial locale: the SSR-provided `initialLocale` (from the
 * `bb-locale` cookie read server-side) wins — this is what makes SSR and the
 * client agree and kills the hydration language mix. Standalone client mounts
 * fall back to the cookie, then the browser language. The cookie is the ONLY
 * persisted source of the locale (localStorage is deprecated).
 */
function resolveInitialLocale(initialLocale?: Locale): Locale {
  if (initialLocale === "es" || initialLocale === "en") return initialLocale;
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const cookieLocale = readLocaleCookie();
    if (cookieLocale) return cookieLocale;
  } catch {
    // Cookie access can throw in restricted contexts: ignore it.
  }
  const lang = typeof window.navigator !== "undefined" ? window.navigator.language : "";
  return lang.toLowerCase().startsWith("en") ? "en" : DEFAULT_LOCALE;
}

const noop = () => {};

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  /** The locale resolved server-side from the `bb-locale` cookie. */
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    resolveInitialLocale(initialLocale),
  );

  useEffect(() => {
    try {
      // The cookie is the persisted source of truth (SSR reads it in the layout).
      document.cookie = `${COOKIE_KEY}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {
      // Cookie access can throw in restricted contexts: ignore it.
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Access the active locale and the `t` translator. Works WITHOUT a mounted
 * provider: it falls back to the Spanish dictionary so components render and
 * tests pass with no wrapping context.
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (context) return context;
  return {
    locale: DEFAULT_LOCALE,
    setLocale: noop,
    t: (key, params) => translate(DEFAULT_LOCALE, key, params),
  };
}
