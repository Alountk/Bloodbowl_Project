# app-shell Specification

## Purpose

Canonical light "rulebook" web shell. This spec defines the design-token layer (Tailwind v4 `@theme`), the root layout body base and its server-side theme painting, and the unified navigation (`AppNav`) shared by the public landing and the authenticated app shell (`AppShell`) — including the mobile drawer, the auth/user chrome, and the theme + locale switchers.

(Previously: this spec described the retired `Sidebar`/`Topbar` components and a topbar search. Those components no longer exist in the codebase — the shell is the unified `AppNav` and the search lives in the teams section, not the shell. The spec was rewritten against the shipped `components/AppNav.tsx`, `components/AppShell.tsx`, `features/landing/Landing.tsx`, `app/layout.tsx`, `app/providers/SessionAppProvider.tsx`, and the `@theme` block of `app/globals.css`.)

## Requirements

### Requirement: Design Tokens

The shell MUST define canonical rulebook tokens in `app/globals.css` via Tailwind v4 `@theme` (source of truth: `stories/design-tokens.stories.tsx`), and shell components MUST consume the token utilities (`bg-navy`, `text-slate`, `border-border`, `shadow-sheet`, …) instead of raw hex values; new values outside the token set are not allowed.

The DEFAULT theme is the Reglamento vintage: navy `#1d2a4d`, red `#b3282d`, background `#f6f1e6` (cream paper), panel `#fdfaf2`, ink `#2b2618`, border `#ddd3bf`, display font Fraunces, sans font Space Grotesk. Adding `data-theme="scoreboard"` on `<html>` MUST restore the "Tablón americano" palette — navy `#12225a`, red `#d11938`, background `#f8fafc`, panel `#ffffff`, ink `#0f172a`, border `#e2e8f0`, display font Anton — and MUST NOT touch the semantic tokens (severity bands, ack badges, functional states), because semantics transcend the theme.

#### Scenario: Vintage is the default token set

- GIVEN no `data-theme` override on `<html>`
- WHEN any rulebook surface is styled
- THEN it resolves navy `#1d2a4d`, red `#b3282d`, background `#f6f1e6`, and border `#ddd3bf`

#### Scenario: Scoreboard overrides brand tokens only

- GIVEN `data-theme="scoreboard"` is set on `<html>`
- WHEN a surface consuming `bg-navy`, `bg-background`, or `border-border` renders
- THEN it resolves the scoreboard palette (`#12225a`, `#f8fafc`, `#e2e8f0`)
- AND the semantic severity/ack/status tokens are unchanged

#### Scenario: Components consume tokens, not hex

- GIVEN a shell component is styled
- WHEN its classes are inspected
- THEN it uses token utilities (e.g. `bg-navy`, `text-red`) rather than hardcoded hex colors

### Requirement: Light Body Layout

The root layout MUST render a light base: `<body className="min-h-screen bg-background text-ink antialiased">`. No page content MUST depend on a dark body for legibility.

#### Scenario: Light base across routes

- GIVEN a route renders (`/`, `/teams`, `/leagues`, `/teams/[id]`)
- WHEN the root layout renders
- THEN the body shows the light base and content remains legible

### Requirement: SSR Theme Painting

`app/layout.tsx` MUST resolve the theme server-side and paint it as `data-theme` on `<html>` so the first paint is themed (anti-FOUC), and MUST pass the same resolved value to the client `ThemeProvider` as `initialTheme` so server and client agree. The precedence MUST be: account theme (fresh DB read, only when a session exists) → `bb-theme` cookie → `vintage`. Invalid or drifted values MUST be ignored so the painted attribute is ALWAYS a concrete theme.

#### Scenario: Default vintage with nothing set

- GIVEN no session and no `bb-theme` cookie
- WHEN the root layout renders
- THEN `<html>` carries `data-theme="vintage"`

#### Scenario: Cookie paints the anonymous theme

- GIVEN no session and `bb-theme=scoreboard`
- WHEN the root layout renders
- THEN `<html>` carries `data-theme="scoreboard"`

#### Scenario: Account theme beats the cookie

- GIVEN a signed-in account whose stored theme is `scoreboard`
- AND a `bb-theme=vintage` cookie
- WHEN the root layout renders
- THEN `<html>` carries `data-theme="scoreboard"`

#### Scenario: Invalid cookie ignored

- GIVEN no session and `bb-theme=grimdark`
- WHEN the root layout renders
- THEN `<html>` carries `data-theme="vintage"`

### Requirement: Root Layout Providers

The root layout MUST nest the client providers in this order: `SessionProvider` (Auth.js) → `I18nProvider` → `ThemeProvider` → `SessionAppProvider`, wrapping every route's children.

#### Scenario: Providers wrap the tree

- GIVEN any route renders
- WHEN the root layout mounts
- THEN children render inside SessionProvider, I18nProvider, ThemeProvider, and SessionAppProvider

### Requirement: Unified App Navigation

The shell chrome MUST be the unified `AppNav`: a navy `<header>` (`bg-navy text-white`) containing the 🏈 "Blood Bowl Teams" home link to `/`, a desktop `<nav aria-label="Main navigation">` (`hidden md:flex`), and a right slot. `AppNav` MUST own the mobile drawer state and the auth modal state, and MUST mount the `AuthModal`.

#### Scenario: Unified navy header

- GIVEN the shell or the public landing renders
- WHEN `AppNav` renders
- THEN a navy header with the "Blood Bowl Teams" home link and a `Main navigation` landmark is present

#### Scenario: No topbar search in the shell

- GIVEN the app shell renders on any route
- WHEN `AppNav` renders
- THEN no `role="search"` form is mounted (team search lives in the teams section)

### Requirement: Section Nav Links and Role-Gated Dev Links

`NAV_LINKS` MUST be Teams `/teams`, Leagues `/leagues`, and Matches `/matches`, shared by the desktop bar and the mobile drawer. A session whose role has the `rulesets.dev` permission MUST additionally see `/dev/rulesets`; one with `users.manage` MUST additionally see `/dev/users`. Profile and Log out MUST NOT be top-level nav links — they live in the user menu and the drawer bottom.

#### Scenario: Section links present

- GIVEN the shell renders
- WHEN the nav renders
- THEN it contains Teams → `/teams`, Leagues → `/leagues`, and Matches → `/matches`

#### Scenario: Developer links appended by permission

- GIVEN a session whose role grants `rulesets.dev` and `users.manage`
- WHEN the nav renders
- THEN it additionally contains `/dev/rulesets` and `/dev/users`

#### Scenario: No dev links for a regular session

- GIVEN a session without dev permissions
- WHEN the nav renders
- THEN neither `/dev/rulesets` nor `/dev/users` is present

### Requirement: Auth and User Chrome

When `authenticated`, the nav MUST render an avatar pill showing the coach display name — falling back to the account email when the name is empty, and to `"?"` when both are absent — plus a dropdown with Perfil and Cerrar sesión. When NOT authenticated and `showSignIn` is set (the public/landing variant), the nav MUST render a "Sign in" button that opens the auth modal instead of navigating to `/login`. When neither is true (anonymous/local shell mode), the nav MUST render neither control.

#### Scenario: Authenticated user menu

- GIVEN an authenticated session
- WHEN the nav renders
- THEN an avatar pill with the display name and a Perfil / Cerrar sesión menu is present
- AND no Sign in button renders

#### Scenario: Public Sign in opens the auth modal

- GIVEN the public landing variant (`showSignIn`)
- WHEN the Sign in button is activated
- THEN the auth modal opens and the user is not navigated to `/login`

#### Scenario: Anonymous shell renders neither

- GIVEN a local/anonymous shell with no session and no `showSignIn`
- WHEN the nav renders
- THEN neither the Sign in button nor the user menu is present

### Requirement: Mobile Drawer Navigation

Below the `md` breakpoint the nav MUST offer a drawer: a hamburger button (visible only `< md`) with an open-menu `aria-label` and `aria-expanded`, which opens an overlay. When open, a scrim button (`data-testid="drawer-scrim"`, mobile-only) MUST render behind an `<aside aria-label="Mobile navigation">`; the drawer MUST close on scrim click, on a nav-link click, and on the auth/logout actions. The drawer and scrim MUST NOT render while closed, so at most one drawer exists in the DOM. Desktop (md+) MUST NOT render the hamburger, the scrim, or the drawer.

#### Scenario: Drawer opens and closes via hamburger

- GIVEN a viewport below `md` with the drawer closed
- WHEN the hamburger is activated
- THEN the drawer and the scrim mount
- AND activating the scrim unmounts both

#### Scenario: Nav link click closes the drawer

- GIVEN the drawer is open
- WHEN a navigation link inside it is activated
- THEN the drawer unmounts and the new route renders

#### Scenario: No drawer when closed

- GIVEN a default (closed) drawer
- WHEN the shell renders
- THEN no scrim is present and no `Mobile navigation` landmark exists

#### Scenario: Logged-in drawer shortcuts

- GIVEN an authenticated shell with the drawer open
- WHEN the drawer bottom renders
- THEN it lists Perfil and Cerrar sesión directly (in addition to the shared links)

### Requirement: Theme and Locale Switchers in Nav Chrome (AS-8)

The desktop right slot (`hidden md:flex`) and the mobile drawer MUST each mount a `ThemeSwitcher` and a `LocaleSwitcher`. The `ThemeSwitcher` MUST present the two `THEME_OPTIONS` (`vintage`, `scoreboard`) with their i18n labels, expose `role="group"` with an `aria-label`, and mark each option with `aria-pressed`. With a session, selecting a theme MUST `patchMe({ theme })` and then apply it via the provider (which also writes the `bb-theme` cookie); anonymous visitors MUST apply cookie-only with no PATCH. A failed PATCH MUST keep the current theme and surface the `nav.themeError` copy.

#### Scenario: Desktop switchers present

- GIVEN the shell renders at `md+`
- WHEN the nav right slot renders
- THEN both the theme toggle and the locale switcher are present

#### Scenario: Drawer switchers present

- GIVEN a viewport below `md` with the drawer open
- WHEN the drawer renders
- THEN both the theme toggle and the locale switcher are present

#### Scenario: Signed-in selection persists the account

- GIVEN an authenticated session
- WHEN the user selects `scoreboard`
- THEN `PATCH /api/me` is called with `{ "theme": "scoreboard" }` and the provider applies it

#### Scenario: Anonymous selection persists the cookie

- GIVEN no session
- WHEN the user selects `scoreboard`
- THEN no PATCH is sent and the `bb-theme` cookie is set to `scoreboard`

#### Scenario: Failed save surfaces the error

- GIVEN a PATCH that fails
- WHEN the user selects a theme
- THEN the current theme is kept and `nav.themeError` is shown

### Requirement: App Shell Wrapper

`AppShell` MUST wrap page content in `AppProvider` and render the unified `AppNav` above `<main className="flex-1 p-4 sm:p-6">` inside a `flex min-h-screen flex-col` column. It MUST accept an optional `store` (an authenticated `ApiTeamStore`), falling back to the shared in-memory local store when absent, and MUST forward `authenticated`, `onLogout`, and `reloadVersion` to `AppProvider`.

#### Scenario: Nav above content

- GIVEN `AppShell` renders with children
- WHEN the layout renders
- THEN the unified nav appears above the page content

#### Scenario: Authenticated store provided

- GIVEN `AppShell` receives an `ApiTeamStore` and `authenticated`
- WHEN it renders
- THEN the store backs the shell and the user menu is shown

### Requirement: Session-Aware Shell Gate

`SessionAppProvider` MUST read the Auth.js session and: while `loading`, render a lightweight status state (no flash of gated content); when `authenticated`, back the shell with a stable `ApiTeamStore`; when `unauthenticated`, fall back to the local store shell. It MUST NOT perform the auth redirect itself — the route proxy owns auth-mode redirects.

#### Scenario: Loading state

- GIVEN the session status is initializing
- WHEN the provider renders
- THEN a `role="status"` loading state renders instead of gated content

#### Scenario: Authenticated uses the API store

- GIVEN an authenticated session
- WHEN the shell mounts
- THEN it hydrates from the API-backed store

#### Scenario: Unauthenticated uses the local store

- GIVEN an unauthenticated session off the exempt routes
- WHEN the shell renders
- THEN it falls back to the local (in-memory) store with no API call

### Requirement: AS-9 · Public Watch Shell Exemption

`SessionAppProvider` MUST render children directly (inside the root layout providers, without mounting the `AppShell` chrome) for the home route `/`, the bare `/watch` path, and every `/watch/*` path. Every other route MUST keep rendering inside `AppShell`. A path that merely starts with `/watch` (e.g. `/watchlist`) MUST NOT be exempt.

#### Scenario: Guest watch page has no chrome

- GIVEN a request for `/watch/[token]`
- WHEN `SessionAppProvider` renders
- THEN no `AppShell` chrome mounts and children render directly

#### Scenario: Home route is exempt

- GIVEN a request for `/`
- WHEN `SessionAppProvider` renders
- THEN children render directly (the page owns its shell)

#### Scenario: Near-miss path keeps the shell

- GIVEN a request for `/watchlist`
- WHEN `SessionAppProvider` renders
- THEN `AppShell` mounts unchanged

## Test Coverage

| Requirement | Automated coverage |
|---|---|
| Design Tokens | Review/manual (visual); `stories/design-tokens.stories.tsx` is the swatch source of truth |
| Light Body Layout | Manual on `/`, `/teams`, `/leagues`, `/teams/[id]` |
| SSR Theme Painting | `app/layout.test.tsx` (renders `RootLayout`, asserts `data-theme` from default/cookie/DB/invalid); `lib/theme/serverTheme.test.ts` (resolver precedence) |
| Root Layout Providers | `app/layout.test.tsx` (provider tree renders without error) |
| Unified App Navigation | `components/AppNav.test.tsx`; `app/AppShell.test.tsx` (unified nav, no topbar search) |
| Section Nav Links + Dev Links | `components/AppNav.test.tsx` (section links; dev links by permission) |
| Auth and User Chrome | `components/AppNav.test.tsx` (public/logged-in/anonymous variants) |
| Mobile Drawer Navigation | `components/AppNav.test.tsx` (open via hamburger, close via scrim + link); `app/AppShell.test.tsx` (drawer open/close) |
| Theme + Locale Switchers (AS-8) | `components/AppNav.test.tsx` (desktop + drawer mounts); `lib/theme/ThemeSwitcher.test.tsx` (PATCH vs cookie, error) |
| App Shell Wrapper | `app/AppShell.test.tsx` |
| Session-Aware Shell Gate | `app/providers/SessionAppProvider.test.tsx` (loading, authenticated API store, local fallback) |
| AS-9 Public Watch Shell Exemption | `app/providers/SessionAppProvider.test.tsx` (`/watch`, `/watch/*`, `/`, `/watchlist`) |
