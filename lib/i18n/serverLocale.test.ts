import { describe, expect, it } from "vitest";
import { resolveServerLocale, localeFromAcceptLanguage } from "./serverLocale";

/**
 * RAU-58 SSR locale precedence (app/layout.tsx): the account locale (fresh DB
 * read) wins over the JWT session snapshot, which wins over the `bb-locale`
 * cookie, which wins over the English default. The account beats the cookie
 * whenever the user is signed in — the language follows the user, not the
 * browser.
 */
describe("resolveServerLocale (SSR precedence)", () => {
  it("prefers the fresh DB account locale over the session snapshot and the cookie", () => {
    expect(
      resolveServerLocale({ cookieLocale: "en", sessionLocale: "en", dbLocale: "es" }),
    ).toBe("es");
  });

  it("prefers the session locale over the cookie when no DB read is available", () => {
    expect(
      resolveServerLocale({ cookieLocale: "es", sessionLocale: "en", dbLocale: null }),
    ).toBe("en");
  });

  it("uses the cookie for anonymous visitors (no session, no DB)", () => {
    expect(resolveServerLocale({ cookieLocale: "en" })).toBe("en");
  });

  it("falls back to the browser language on the client when nothing is set", () => {
    expect(resolveServerLocale({})).toBeUndefined();
    expect(resolveServerLocale({ cookieLocale: null, sessionLocale: null, dbLocale: null })).toBeUndefined();
  });

  it("ignores invalid locale values (drift/typos) and keeps the precedence", () => {
    expect(resolveServerLocale({ cookieLocale: "fr", sessionLocale: "de", dbLocale: "es" })).toBe("es");
    expect(resolveServerLocale({ cookieLocale: "fr" })).toBeUndefined();
    expect(resolveServerLocale({ cookieLocale: "ES" })).toBeUndefined();
    expect(resolveServerLocale({ dbLocale: "EN" })).toBeUndefined();
  });
});

describe("localeFromAcceptLanguage (SSR browser fallback)", () => {
  it("maps an English browser to en", () => {
    expect(localeFromAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("en")).toBe("en");
  });

  it("maps a Spanish browser to es (region variants included)", () => {
    expect(localeFromAcceptLanguage("es-ES,es;q=0.9")).toBe("es");
    expect(localeFromAcceptLanguage("es-419,es;q=0.9,en;q=0.8")).toBe("es");
  });

  it("is case-insensitive", () => {
    expect(localeFromAcceptLanguage("EN-US,en;q=0.9")).toBe("en");
    expect(localeFromAcceptLanguage("Es")).toBe("es");
  });

  it("uses ONLY the first tag — an unknown top preference never leaks to en", () => {
    expect(localeFromAcceptLanguage("fr-FR,fr;q=0.9,en-US;q=0.8")).toBeUndefined();
    expect(localeFromAcceptLanguage("de-DE,en;q=0.9")).toBeUndefined();
  });

  it("returns undefined for missing or empty headers", () => {
    expect(localeFromAcceptLanguage(null)).toBeUndefined();
    expect(localeFromAcceptLanguage(undefined)).toBeUndefined();
    expect(localeFromAcceptLanguage("")).toBeUndefined();
  });
});
