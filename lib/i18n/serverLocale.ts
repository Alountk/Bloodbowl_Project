import { DEFAULT_LOCALE, type Locale } from "./dictionaries";

/** Narrower type guard: any value is a valid UI locale only when es|en. */
export function isLocale(value: unknown): value is Locale {
  return value === "es" || value === "en";
}

export interface ServerLocaleSources {
  /** The raw `bb-locale` cookie value (the anonymous / per-browser fallback). */
  cookieLocale?: string | null;
  /** The locale snapshot carried in the JWT session (sign-in time). */
  sessionLocale?: string | null;
  /** The fresh account locale read from the DB (the current source of truth). */
  dbLocale?: string | null;
}

/**
 * RAU-58 server-side locale precedence for the root layout SSR:
 *
 *   1. the account locale read from the DB (freshest — a profile change applies
 *      on the very next request, no re-login needed);
 *   2. the JWT session snapshot (used when the DB read is unavailable);
 *   3. the `bb-locale` cookie (anonymous visitors / per-browser preference);
 *   4. the Spanish default.
 *
 * The account always wins over the browser cookie whenever the user is signed
 * in, so the language follows the user across devices.
 */
export function resolveServerLocale(sources: ServerLocaleSources = {}): Locale {
  if (isLocale(sources.dbLocale)) return sources.dbLocale;
  if (isLocale(sources.sessionLocale)) return sources.sessionLocale;
  if (isLocale(sources.cookieLocale)) return sources.cookieLocale;
  return DEFAULT_LOCALE;
}
