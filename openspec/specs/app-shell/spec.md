# app-shell Specification

## Purpose

Canonical light rulebook web shell (Config C, user-approved): design tokens, root layout body base, Sidebar, and Topbar wrapping every route. Search lives in the Topbar but renders only on the home route `/`.

## Requirements

### Requirement: Design Tokens

The shell MUST define canonical rulebook-light tokens: navy `#12225a`, red `#d11938`, body background `#f8fafc`, border `#e2e8f0`, slate text scale, panel shadow `0 4px 8px rgba(0,0,0,0.1)`, and zebra `#e6eef5`. Shell components MUST use these values; other rulebook surfaces SHOULD converge on them.

#### Scenario: Canonical token set

- GIVEN the app-shell spec is the token source of truth
- WHEN any rulebook-light surface is styled
- THEN it uses navy `#12225a`, red `#d11938`, border `#e2e8f0`, shadow alpha 0.1, zebra `#e6eef5`

#### Scenario: Tokens rendered on shell

- GIVEN the shell renders on any route
- WHEN the body, Sidebar, and Topbar render
- THEN their colors match the canonical tokens

### Requirement: Light Body Layout

The root layout MUST render a light base: body `bg-[#f8fafc]` with `text-slate-900`; `main` MUST inherit the light background. No page content MUST depend on a dark body for legibility.

#### Scenario: Light base across routes

- GIVEN a route renders (`/`, `/teams/create`, `/teams/[id]`, team 404)
- WHEN the layout renders
- THEN the body shows the light base and content remains legible

### Requirement: Mobile Drawer Navigation

Below the `md` breakpoint the shell MUST offer a drawer navigation: a hamburger button in the Topbar (visible only `< md`) opens an overlay drawer; a scrim (`fixed inset-0 bg-slate-900/45 z-40`) and the drawer (`fixed left-0 top-0 bottom-0 z-50`) render above it; the drawer MUST close on scrim click, hamburger toggle, and navigation link click. The drawer Sidebar copy MUST mount only while open, so at most one element with `aria-label="Sidebar"` exists in the DOM when the drawer is closed. Desktop (md+) MUST NOT render the scrim, drawer, or hamburger.

#### Scenario: Drawer opens and closes via hamburger

- GIVEN a viewport below `md` with the drawer closed
- WHEN the hamburger is clicked
- THEN the drawer Sidebar mounts and the scrim renders
- AND clicking the hamburger (or scrim) unmounts both

#### Scenario: Nav link click closes drawer

- GIVEN the drawer is open
- WHEN a navigation link inside the drawer is clicked
- THEN the drawer unmounts and the new route renders

#### Scenario: Single Sidebar landmark when closed

- GIVEN a default (closed) drawer
- WHEN the shell renders
- THEN exactly one `aria-label="Sidebar"` element exists

### Requirement: Sidebar Structure

The Sidebar MUST be a white `<aside aria-label="Sidebar">` with right border `border-slate-200`. It MUST show the wordmark "BLOODBOWL" in navy `#12225a` beside a small "Teams" tag in red `#d11938`, and a nav containing ONLY a "Teams" link to `/`. The active item MUST use navy `#12225a` background with white text; hover MUST use `bg-slate-100`. The desktop Sidebar MUST render with `hidden md:flex` so it stays in the DOM (protecting landmark queries) and only becomes visible at `md+`; the desktop and drawer Sidebars MUST share one markup definition (`SidebarContent` partial) so nav state stays identical.
(Previously: dark sidebar with two nav items, "Teams" and "Create Team" — later white, always rendered inline at full width with no breakpoint gating.)

#### Scenario: Sidebar landmark and wordmark

- GIVEN the shell renders
- WHEN the desktop Sidebar renders
- THEN it exposes `aria-label="Sidebar"` and shows "BLOODBOWL" with a red "Teams" tag
- AND its root carries `hidden md:flex`

#### Scenario: Teams-only navigation

- GIVEN the shell renders on any route
- WHEN the nav renders
- THEN it contains only the "Teams" link to `/`
- AND no "Create Team" nav item is present

#### Scenario: Active and hover states

- GIVEN the user is on the home route
- WHEN the "Teams" link renders
- THEN it uses navy background with white text
- AND hover styling uses `bg-slate-100`

### Requirement: Topbar with Route-Conditional Search

The Topbar MUST be a white header showing the h1 "Bloodbowl Teams" in navy `#12225a`. It MUST render a search form with `role="search"` and an input with `aria-label="Search teams"` styled light (`bg-white border-slate-300 text-slate-900`). The search form MUST render only when the pathname is `/` (via `usePathname`); on other routes it MUST NOT render. Search behavior (filtering team name and race name) MUST remain unchanged. Below `md` the Topbar MUST render a hamburger button (`md:hidden`, with `aria-label="Open navigation menu"`) on the left, the h1 MUST truncate to fit, and the search input MUST size compactly on `/`.
(Previously: no hamburger; the h1 always rendered at `text-[18px]` with no truncation and the search input had a fixed padded size.)

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

## Test Coverage

| Requirement | Automated coverage |
|---|---|
| Design Tokens | Review/manual (visual); no automated assertion |
| Light Body Layout | Manual on `/`, `/teams/create`, `/teams/[id]`, 404 |
| Mobile Drawer Navigation | `app/AppShell.test.tsx` (open via hamburger, close via scrim + nav link, single Sidebar landmark); `app/page.test.tsx` (mobile hamburger aria) |
| Sidebar Structure | `app/page.test.tsx` (`getByLabelText("Sidebar")`) |
| Topbar + search | `app/page.test.tsx` (h1); `TeamList.test.tsx` (search label, filtering); route-conditional hiding needs a new unit/e2e assertion; e2e `create-team.spec.ts` loads `/teams/create` error-free without search |
