import type { Locale } from "./dictionaries";

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
 *   4. `undefined` when nothing is set — the root layout then falls back to
 *      the English product default (`APP_DEFAULT_LOCALE`).
 *
 * The account always wins over the browser cookie whenever the user is signed
 * in, so the language follows the user across devices.
 */
export function resolveServerLocale(sources: ServerLocaleSources = {}): Locale | undefined {
  if (isLocale(sources.dbLocale)) return sources.dbLocale;
  if (isLocale(sources.sessionLocale)) return sources.sessionLocale;
  if (isLocale(sources.cookieLocale)) return sources.cookieLocale;
  return undefined;
}

/**
 * Maps the browser `Accept-Language` header to a UI locale. Only the FIRST
 * language tag is consulted — it mirrors the pre-RAU-58 client behavior that
 * read `navigator.language` (the browser's single top preference). Unknown
 * languages return `undefined` so the caller falls back to the English
 * product default.
 *
 * Examples: "en-US,en;q=0.9" → "en" · "es-419,es;q=0.9" → "es" ·
 * "fr-FR,fr;q=0.9,en;q=0.8" → undefined (only the first tag is consulted; an
 * unknown browser language lands on the English default).
 */
export function localeFromAcceptLanguage(
  acceptLanguage: string | null | undefined,
): Locale | undefined {
  if (!acceptLanguage) return undefined;
  const firstTag = acceptLanguage.split(",")[0]?.split(";")[0]?.trim().toLowerCase();
  if (!firstTag) return undefined;
  if (firstTag === "es" || firstTag.startsWith("es-")) return "es";
  if (firstTag === "en" || firstTag.startsWith("en-")) return "en";
  return undefined;
}
