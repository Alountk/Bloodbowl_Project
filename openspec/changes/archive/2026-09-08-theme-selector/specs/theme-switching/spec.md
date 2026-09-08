# theme-switching Specification

## Purpose

Per-account and per-browser UI theme selection with `vintage` (default) and `scoreboard`, mirroring the RAU-58 `locale` pattern: DB-backed for signed-in users, `bb-theme` cookie for anonymous visitors, and SSR `data-theme` on `<html>` so the correct theme paints before hydration (no flash).

## Requirements

### Requirement: Theme Set (TS-1)

The system MUST support exactly two themes: `vintage` (default) and `scoreboard`. Any other value MUST be treated as invalid at every boundary (API, resolver, cookie).

#### Scenario: Default theme

- GIVEN no theme is stored anywhere
- WHEN the app renders
- THEN `vintage` is applied

#### Scenario: Unknown theme rejected

- GIVEN an API payload or cookie holding a value other than `vintage`/`scoreboard`
- WHEN it is validated
- THEN the API returns 400, and a cookie/resolver value is ignored (never applied)

### Requirement: Server Theme Resolution (TS-2)

SSR MUST resolve the theme with precedence db → cookie → `vintage`. There is NO `Accept-Language` step (both themes are light; `vintage` is the uniform default).

#### Scenario: Account theme wins

- GIVEN a signed-in user with `User.theme = "scoreboard"`
- WHEN the root layout resolves the theme
- THEN the DB value `scoreboard` wins over any cookie

#### Scenario: Anonymous cookie fallback

- GIVEN no session and a `bb-theme=scoreboard` cookie
- WHEN the layout resolves the theme
- THEN `scoreboard` is used

#### Scenario: Nothing set

- GIVEN no session and no `bb-theme` cookie
- WHEN the layout resolves the theme
- THEN `vintage` is used

### Requirement: Theme Cookie (TS-3)

The client provider MUST persist the anonymous theme in a `bb-theme` cookie (`path=/`, long max-age, `SameSite=Lax`). localStorage MUST NOT be used for theme persistence.

#### Scenario: Cookie written on change

- GIVEN an anonymous visitor toggles to `scoreboard`
- WHEN the provider applies the theme
- THEN `bb-theme=scoreboard` is written and survives a reload

### Requirement: Anti-FOUC SSR Attribute (TS-4)

The root layout MUST render `data-theme={resolvedTheme}` on `<html>` server-side, so the correct theme paints before hydration.

#### Scenario: Initial HTML themed

- GIVEN a resolved theme of `scoreboard`
- WHEN the layout SSR renders
- THEN the `<html>` element carries `data-theme="scoreboard"` with no client-side flash

### Requirement: Client Theme Sync (TS-5)

A client `ThemeProvider` MUST seed from the SSR `initialTheme`, apply the active theme to `document.documentElement` (`data-theme`), and keep the cookie and attribute in sync on later changes.

#### Scenario: Mount applies SSR theme

- GIVEN the provider mounts with `initialTheme="scoreboard"`
- WHEN hydration completes
- THEN `document.documentElement` carries `data-theme="scoreboard"`

#### Scenario: Later change syncs attribute

- GIVEN a user switches to `vintage`
- WHEN the provider updates state
- THEN `data-theme` becomes `vintage` and the cookie is refreshed
