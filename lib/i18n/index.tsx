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

const STORAGE_KEY = "bb-locale";

/**
 * Resolves the initial locale: a stored `bb-locale` wins, otherwise the browser
 * language (English browsers get `en`, everything else stays the Spanish
 * default). Never runs on the server, so SSR always renders the default.
 */
function resolveInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "es" || stored === "en") return stored;
  } catch {
    // localStorage can throw in privacy/blocked-storage modes: ignore it.
  }
  const lang = typeof window.navigator !== "undefined" ? window.navigator.language : "";
  return lang.toLowerCase().startsWith("en") ? "en" : DEFAULT_LOCALE;
}

const noop = () => {};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => resolveInitialLocale());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Storage unavailable: the locale still applies for this session.
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
