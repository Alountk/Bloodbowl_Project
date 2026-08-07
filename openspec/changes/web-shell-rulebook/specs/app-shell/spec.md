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

### Requirement: Sidebar Structure

The Sidebar MUST be a white `<aside aria-label="Sidebar">` with right border `border-slate-200`. It MUST show the wordmark "BLOODBOWL" in navy `#12225a` beside a small "Teams" tag in red `#d11938`, and a nav containing ONLY a "Teams" link to `/`. The active item MUST use navy `#12225a` background with white text; hover MUST use `bg-slate-100`. (Previously: dark sidebar with two nav items, "Teams" and "Create Team".)

#### Scenario: Sidebar landmark and wordmark

- GIVEN the shell renders
- WHEN the Sidebar renders
- THEN it exposes `aria-label="Sidebar"` and shows "BLOODBOWL" with a red "Teams" tag

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

The Topbar MUST be a white header showing the h1 "Bloodbowl Teams" in navy `#12225a`. It MUST render a search form with `role="search"` and an input with `aria-label="Search teams"` styled light (`bg-white border-slate-300 text-slate-900`). The search form MUST render only when the pathname is `/` (via `usePathname`); on other routes it MUST NOT render. Search behavior (filtering team name and race name) MUST remain unchanged.

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

## Test Coverage

| Requirement | Automated coverage |
|---|---|
| Design Tokens | Review/manual (visual); no automated assertion |
| Light Body Layout | Manual on `/`, `/teams/create`, `/teams/[id]`, 404 |
| Sidebar Structure | `app/page.test.tsx` (`getByLabelText("Sidebar")`) |
| Topbar + search | `app/page.test.tsx` (h1); `TeamList.test.tsx` (search label, filtering); route-conditional hiding needs a new unit/e2e assertion; e2e `create-team.spec.ts` loads `/teams/create` error-free without search |
