# Delta for app-shell

> Reconciliation: the consolidated `app-shell` spec still describes the legacy Sidebar/Topbar shell; the live shell chrome is `components/AppNav.tsx` (nav bar + mobile drawer). This delta is written against the REAL AppNav contract and adds the theme toggle. Full reconciliation of the legacy Sidebar/Topbar requirements to AppNav is out of scope for `theme-selector`.

## ADDED Requirements

### Requirement: Theme Toggle in Shell Chrome (AS-8)

The AppNav right slot (desktop, `hidden md:block`) and the mobile drawer MUST each mount a theme toggle — a `ThemeSwitcher` mirroring `LocaleSwitcher` — presenting `vintage` ("Vintage") and `scoreboard` ("Tablón"). The toggle MUST expose `role="group"` with an `aria-label` and each option `aria-pressed`. With a session, selecting a theme MUST `patchMe({ theme })` then apply it via the provider; anonymous MUST apply cookie-only. A failed PATCH MUST keep the current theme and surface `nav.themeError`.

#### Scenario: Desktop toggle present

- GIVEN the shell renders at `md+`
- WHEN the AppNav renders
- THEN a theme toggle is present in the right slot beside the locale switcher

#### Scenario: Drawer toggle present

- GIVEN a viewport below `md` with the drawer open
- WHEN the drawer renders
- THEN a theme toggle is present alongside the locale switcher

#### Scenario: Signed-in selection persists account

- GIVEN an authenticated session
- WHEN the user selects `scoreboard`
- THEN `PATCH /api/me` is called with `{ "theme": "scoreboard" }` and the provider applies it

#### Scenario: Anonymous selection persists cookie

- GIVEN no session
- WHEN the user selects `scoreboard`
- THEN no PATCH is sent and the `bb-theme` cookie is set to `scoreboard`

#### Scenario: Failed save surfaces error

- GIVEN a PATCH that fails
- WHEN the user selects a theme
- THEN the current theme is kept and `nav.themeError` is shown
