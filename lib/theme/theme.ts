/**
 * The shared theme domain for theme-selector: exactly two visual themes.
 * `vintage` (Reglamento) is the product default; `scoreboard` (Tablón) is the
 * opt-in look. Shared by the server resolver (layout SSR), the client
 * ThemeProvider, and the future ThemeSwitcher UI (Slice B).
 */

/** The visual theme of the app. Only "vintage" and "scoreboard" are valid. */
export type Theme = "vintage" | "scoreboard";

/** The product default: Reglamento vintage (the pre-theme-selector look). */
export const DEFAULT_THEME: Theme = "vintage";

/** Narrower type guard: any value is a valid theme only when vintage|scoreboard. */
export function isTheme(value: unknown): value is Theme {
  return value === "vintage" || value === "scoreboard";
}

/**
 * The selectable themes. `labelKey` is the i18n dot-key that the UI resolves
 * against the active dictionary (added in Slice B); the VALUE is stable and
 * server-side, so it must never depend on the UI language.
 */
export const THEME_OPTIONS = [
  { value: "vintage", labelKey: "theme.vintage" },
  { value: "scoreboard", labelKey: "theme.scoreboard" },
] as const;
