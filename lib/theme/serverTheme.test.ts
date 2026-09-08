import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, isTheme, THEME_OPTIONS } from "./theme";
import { resolveServerTheme } from "./serverTheme";

/**
 * theme-selector SSR/domain tests (TS-1 + TS-2), mirroring the RAU-58
 * `lib/i18n/serverLocale.test.ts` shape: the theme set is exactly
 * {vintage, scoreboard}, and the SSR precedence is account (fresh DB read) →
 * `bb-theme` cookie → `vintage` default. Invalid values (drift/typos, e.g. a
 * "grimdark" that was dropped in exploration) are ignored at every boundary.
 */

describe("theme domain (TS-1)", () => {
  it("defaults to vintage, the pre-theme-selector Reglamento look", () => {
    expect(DEFAULT_THEME).toBe("vintage");
  });

  it("accepts only the two stable themes: vintage | scoreboard", () => {
    expect(isTheme("vintage")).toBe(true);
    expect(isTheme("scoreboard")).toBe(true);
    for (const bad of ["grimdark", "VINTAGE", "Tablón", 42, null, undefined, ""]) {
      expect(isTheme(bad)).toBe(false);
    }
  });

  it("exports the two stable theme options with their future i18n label keys", () => {
    expect(THEME_OPTIONS.map((o) => o.value)).toEqual(["vintage", "scoreboard"]);
    for (const option of THEME_OPTIONS) {
      expect(option.labelKey).toMatch(/^theme\./);
    }
    const vintage = THEME_OPTIONS.find((o) => o.value === "vintage");
    expect(vintage?.labelKey).toBe("theme.vintage");
  });
});

describe("resolveServerTheme (SSR precedence, TS-2)", () => {
  it("prefers the fresh DB account theme over the bb-theme cookie", () => {
    expect(resolveServerTheme({ dbTheme: "vintage", cookieTheme: "scoreboard" })).toBe("vintage");
    expect(resolveServerTheme({ dbTheme: "scoreboard", cookieTheme: "vintage" })).toBe("scoreboard");
  });

  it("falls back to the cookie when no DB read is available", () => {
    expect(resolveServerTheme({ dbTheme: null, cookieTheme: "scoreboard" })).toBe("scoreboard");
    expect(resolveServerTheme({ cookieTheme: "vintage" })).toBe("vintage");
  });

  it("always returns a concrete theme: vintage when nothing is set", () => {
    expect(resolveServerTheme()).toBe("vintage");
    expect(resolveServerTheme({ cookieTheme: null, dbTheme: null })).toBe("vintage");
  });

  it("ignores invalid theme values (drift/typos) and keeps the precedence", () => {
    // An invalid DB value must not block the valid cookie fallback.
    expect(resolveServerTheme({ dbTheme: "grimdark", cookieTheme: "scoreboard" })).toBe("scoreboard");
    // Invalid cookie alone → vintage default.
    expect(resolveServerTheme({ cookieTheme: "SCOREBOARD" })).toBe("vintage");
    expect(resolveServerTheme({ dbTheme: "Tablón" })).toBe("vintage");
    expect(resolveServerTheme({ dbTheme: "scoreboard", cookieTheme: "dark" })).toBe("scoreboard");
  });
});
