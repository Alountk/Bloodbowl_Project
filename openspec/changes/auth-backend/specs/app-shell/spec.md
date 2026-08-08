# Delta for app-shell

## ADDED Requirements

### Requirement: Authenticated Shell Gate

The shell MUST render only inside a `SessionProvider` (Auth.js `useSession`). When the session status is `unauthenticated`, the shell MUST redirect the user to `/login` and MUST NOT show application content. While status is `loading`, the shell SHOULD render a lightweight loading state to avoid a flash of gated content.

#### Scenario: Unauthenticated redirect

- GIVEN no session
- WHEN the shell renders
- THEN the user is redirected to `/login` and app content is not displayed

#### Scenario: Loading state

- GIVEN the session status is initializing
- WHEN the shell renders
- THEN a loading state renders instead of app content

### Requirement: Logout Control

The Topbar MUST surface a logout control (e.g. a "Log out" button) when the session is `authenticated`. Activating it MUST sign the user out and redirect to `/login`.

#### Scenario: Logout from shell

- GIVEN an authenticated session on any route
- WHEN the user activates the logout control
- THEN the session is cleared and the user lands on `/login`

## MODIFIED Requirements

### Requirement: Topbar with Route-Conditional Search

The Topbar MUST be a white header showing the h1 "Bloodbowl Teams" in navy `#12225a`. It MUST render a search form with `role="search"` and an input with `aria-label="Search teams"` styled light (`bg-white border-slate-300 text-slate-900`). The search form MUST render only when the pathname is `/` (via `usePathname`); on other routes it MUST NOT render. Search behavior (filtering team name and race name) MUST remain unchanged. Below `md` the Topbar MUST render a hamburger button (`md:hidden`, with `aria-label="Open navigation menu"`) on the left, the h1 MUST truncate to fit, and the search input MUST size compactly on `/`. When authenticated, the Topbar MUST additionally render a logout control per the "Logout Control" requirement; the h1 MUST remain truncated so the row never overflows when the logout control is present.
(Previously: no logout control; the h1 truncation applied without a trailing account control.)

#### Scenario: Search rendered on home

- GIVEN the pathname is `/`
- WHEN the Topbar renders
- THEN the h1 and the search form (`role="search"`, `aria-label="Search teams"`) are visible

#### Scenario: Search hidden off home

- GIVEN the pathname is `/teams/create` or any non-home route
- WHEN the Topbar renders
- THEN the h1 still renders
- AND no search form is present

#### Scenario: Filtering unchanged

- GIVEN a query is typed into the search field on `/`
- WHEN the query matches a team name or race name
- THEN the team list filters as before

#### Scenario: Hamburger and h1 on mobile

- GIVEN a viewport below `md`
- WHEN the Topbar renders
- THEN the hamburger `aria-label="Open navigation menu"` is present
- AND the h1 truncates so the row never overflows
