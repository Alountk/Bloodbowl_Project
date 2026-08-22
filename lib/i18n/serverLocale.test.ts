import { describe, expect, it } from "vitest";
import { resolveServerLocale } from "./serverLocale";

/**
 * RAU-58 SSR locale precedence (app/layout.tsx): the account locale (fresh DB
 * read) wins over the JWT session snapshot, which wins over the `bb-locale`
 * cookie, which wins over the Spanish default. The account beats the cookie
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

  it("falls back to the Spanish default when nothing is set", () => {
    expect(resolveServerLocale({})).toBe("es");
    expect(resolveServerLocale({ cookieLocale: null, sessionLocale: null, dbLocale: null })).toBe("es");
  });

  it("ignores invalid locale values (drift/typos) and keeps the precedence", () => {
    expect(resolveServerLocale({ cookieLocale: "fr", sessionLocale: "de", dbLocale: "es" })).toBe("es");
    expect(resolveServerLocale({ cookieLocale: "fr" })).toBe("es");
    expect(resolveServerLocale({ cookieLocale: "ES" })).toBe("es");
    expect(resolveServerLocale({ dbLocale: "EN" })).toBe("es");
  });
});
