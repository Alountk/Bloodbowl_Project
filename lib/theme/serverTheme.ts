import { DEFAULT_THEME, isTheme, type Theme } from "./theme";

/**
 * theme-selector server-side resolution for the root layout SSR (anti-FOUC).
 *
 * Precedence (mirror of RAU-58 `resolveServerLocale`, minus the JWT snapshot
 * and the accept-language fallback — both themes are light and `vintage` is the
 * uniform default):
 *   1. the account theme read fresh from the DB (a /api/me change applies on
 *      the next request without re-login);
 *   2. the `bb-theme` cookie (anonymous visitors / per-browser preference);
 *   3. `vintage` (the product default).
 * Invalid/drifted values (e.g. a dropped "grimdark") are ignored, so the
 * resolver ALWAYS returns a concrete Theme.
 */

export interface ServerThemeSources {
  /** The raw `bb-theme` cookie value (the anonymous / per-browser fallback). */
  cookieTheme?: string | null;
  /** The fresh account theme read from the DB (the current source of truth). */
  dbTheme?: string | null;
}

export function resolveServerTheme(sources: ServerThemeSources = {}): Theme {
  if (isTheme(sources.dbTheme)) return sources.dbTheme;
  if (isTheme(sources.cookieTheme)) return sources.cookieTheme;
  return DEFAULT_THEME;
}
