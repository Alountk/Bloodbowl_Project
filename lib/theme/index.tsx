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
import { DEFAULT_THEME, isTheme, type Theme } from "./theme";

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/** The per-browser / anonymous theme cookie key (read server-side in the layout). */
const COOKIE_KEY = "bb-theme";

/** Persists the theme in the `bb-theme` cookie (the anonymous source of truth). */
function writeThemeCookie(theme: Theme) {
  try {
    document.cookie = `${COOKIE_KEY}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // Cookie access can throw in restricted contexts: ignore it.
  }
}

/**
 * Client theme provider (theme-selector, TS-3/TS-5). Seeds from the SSR
 * `initialTheme` so the client agrees with the `data-theme` the root layout
 * painted (anti-FOUC); then, on mount and on every change, applies `data-theme`
 * to `document.documentElement` and persists the `bb-theme` cookie. The cookie
 * is the ONLY persisted source of the anonymous theme (localStorage is not
 * used). When no `initialTheme` is provided (standalone mounts), it defaults to
 * `vintage`.
 */
export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: ReactNode;
  /** The theme resolved server-side in the root layout (SSR `data-theme`). */
  initialTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(() =>
    isTheme(initialTheme) ? initialTheme : DEFAULT_THEME,
  );

  useEffect(() => {
    // Match the SSR-painted attribute and keep the cookie in sync.
    document.documentElement.dataset.theme = theme;
    writeThemeCookie(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
  }, []);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

const noop = () => {};

/**
 * Access the active theme. Works WITHOUT a mounted provider: it falls back to
 * `DEFAULT_THEME` and a no-op setter so components render and tests pass with
 * no wrapping context (mirror of `useI18n`).
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context) return context;
  return { theme: DEFAULT_THEME, setTheme: noop };
}
