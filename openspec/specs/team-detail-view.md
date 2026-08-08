# team-detail-view Specification

## Purpose

A read-only detail view for a stored team, accessible by ID, displaying roster and coaching staff summaries.

## Requirements

### Requirement: Route Resolution
The system MUST resolve the team ID from the route parameters by unwrapping the `params` Promise via `use(params)`.

#### Scenario: Navigating to detail page
- GIVEN the user navigates to `/teams/[teamId]`
- WHEN the page renders
- THEN the system resolves the `teamId` correctly
- AND the detail UI is shown for that team

### Requirement: Hydration Gating
The system MUST render a loading skeleton until the application state is hydrated (`isHydrated === true`) before checking for team existence.

#### Scenario: Store hydrating
- GIVEN the page renders for `/teams/[teamId]`
- WHEN `isHydrated` is false
- THEN the system renders a loading skeleton
- AND does not attempt to find the team or render the `notFound` UI

### Requirement: Team Lookup
The system MUST look up the team by ID (`teams.find(t => t.id === teamId)`) once hydrated, and if not found, trigger the not found UI.

#### Scenario: Unknown team ID
- GIVEN the store is hydrated
- WHEN the provided `teamId` is not found in the `teams` array
- THEN the system triggers the `notFound()` function

### Requirement: Identity Display
The system MUST display the team identity in a navy (`#12225a`) hero: team name as primary heading (white, 26px, weight 900), meta line `<b>{race name}</b> · {Spanish league label}`, and two tags — plain "Equipo listo" and gold (`#d11938`) "Tesorería: {formatRulebookCost(treasury)}". The `leagueType` (`open`/`exhibition`) MUST map to a Spanish display label; the raw enum token MUST NOT render. Below `md` the hero heading MUST use responsive text tokens (e.g. `text-2xl md:text-[28px]`) and the hero padding MUST tighten so the name and tags stay legible at 375px.

(Previously: an unstyled header with name, race name, and raw league type — later a fixed `text-[26px]` hero heading token with fixed `px-6` padding at all widths.)

#### Scenario: Displaying a valid team
- GIVEN a valid team is found
- WHEN the detail view renders
- THEN the hero shows the team name, bold race, and Spanish league label
- AND tags "Equipo listo" and "Tesorería: 750 000" appear

#### Scenario: League type display labels
- GIVEN a team with `leagueType` "open" or "exhibition"
- WHEN the hero renders
- THEN a Spanish display label appears
- AND raw "open"/"exhibition" never shows

#### Scenario: Hero heading responsive
- GIVEN a viewport below `md`
- WHEN the hero heading renders
- THEN it uses the smaller base token that steps up at `md`

### Requirement: Roster Display
The system MUST display the roster via `RosterTable` as read-only: the 10-column rulebook set (`POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | PRIMARIAS | SECUNDARIAS`, no `CANT.`), light theme, Spanish skills per the `roster-table` spec, centered (max-w 860px). The view MUST NOT pass `bannerText`/`apothecary` (hero replaces banner; coaching table covers apotecario). The section heading MUST be "Plantilla" (16px `#12225a`, 3px bottom border `#d11938`).

(Previously: passed `bannerText`/`apothecary`, rendered the 11-column set with `CANT.`, English "Roster" heading.)

#### Scenario: Valid roster display
- GIVEN a valid team is found
- WHEN the detail view renders
- THEN `RosterTable` renders `readOnly` with `players` and `race`
- AND receives neither `bannerText` nor `apothecary`
- AND the empty-roster fallback shows when no players exist

#### Scenario: Read-only rulebook presentation
- GIVEN a valid team with players is found
- WHEN the detail view renders
- THEN the table shows the 10 Spanish headers without `CANT.`
- AND no banner, footer, rename inputs, or remove buttons appear

#### Scenario: Read-only totals preserved
- GIVEN a valid team with players is found
- WHEN the detail view renders
- THEN the totals row shows "{n} jugadores · Coste total" with cost in `50 000` format
- AND no budget text appears
### Requirement: Mobile ReadOnly Roster Inherits Row-Cards

The readOnly `RosterTable` in the detail view MUST inherit the mobile stacked row-card rendering defined by the `roster-table` spec (below `md`), and MUST inherit the desktop book table unchanged (at or above `md`). The detail view MUST NOT pass `bannerText` or `apothecary`, so no banner or footer renders on either branch.

#### Scenario: Mobile detail roster is stacked

- GIVEN a valid team with players below `md`
- WHEN the detail roster renders
- THEN each player appears as a stacked row-card (name, subtitle, cost, stats chips, SKILLS/PRIMARIAS/SECUNDARIAS rows)
- AND no book table and no banner or footer render

#### Scenario: Desktop detail roster unchanged

- GIVEN a valid team with players at or above `md`
- WHEN the detail roster renders
- THEN the read-only 10-column book table renders with no stacked row-cards

### Requirement: Coaching Staff Display

The system MUST render a coaching table headed "Cuerpo técnico" with navy (`#12225a`) headers `Concepto | Cantidad | Coste unitario | Total`, zebra rows (`#f1f5f9`), right-aligned numerics in `50 000` format, rows labeled Segundas oportunidades, Fanáticos dedicados, Entrenadores asistentes, Animadoras. An Apotecario row MUST ALWAYS render (Cantidad "SÍ" green / "NO", unit `50 000`, total `50 000`/`0`) — `computeCoachingCostItems` excludes it. A bold total row (bg `#e2e8f0`) MUST show the coaching total including the apothecary. On the DESKTOP branch the table uses a nested `overflow-x-auto` wrapper and a `min-w-[640px]` panel. Below `md`, the MOBILE branch MUST render stacked rows (each concept: label + quantity × unit cost, total on the right; Apotecario SÍ/NO; bold total row) and MUST NOT render the table, its horizontal-scroll wrapper, or any `min-w-[640px]` panel — no horizontal overflow allowed on mobile.
(Previously: the horizontal-scroll wrapper description was unchanged; now explicitly confirmed coaching scroll coexists with the roster row-card change and must not be converted to stacked rows.)

#### Scenario: Coaching breakdown

- GIVEN a valid team with coaching staff
- WHEN the detail view renders
- THEN the four rows show Spanish labels, quantity, unit cost, and total
- AND an Apotecario row always appears with SÍ or NO

#### Scenario: Apothecary present

- GIVEN a team with `coaching.apothecary: true`
- WHEN the coaching table renders
- THEN the Apotecario row shows "SÍ", unit `50 000`, total `50 000`
- AND the total row is the items sum plus `50 000`

#### Scenario: No apothecary

- GIVEN a team with `coaching.apothecary: false`
- WHEN the coaching table renders
- THEN the Apotecario row shows "NO" with total `0`
- AND the total row equals the items sum

#### Scenario: Horizontal scroll on mobile

- GIVEN a viewport below `md`
- WHEN the coaching table renders
- THEN a nested `overflow-x-auto` wrapper and `min-w-[640px]` panel are present (desktop branch)
- AND below `md` the mobile branch renders stacked rows with no `min-w-[640px]` panel and no page-level horizontal overflow

### Requirement: Derived Treasury Display
The system MUST derive the treasury as `STARTING_TREASURY - rosterCost - coachingCost` (coachingCost includes the apothecary) and display it under the "Tesorería" book heading in three cards: "Coste plantilla", "Cuerpo técnico", "Tesorería restante" (gold `#d11938`), all values in `50 000` format.

(Previously: an English "Treasury" paragraph with a compact `k` value.)

#### Scenario: Treasury calculation
- GIVEN a team with a roster and coaching staff
- WHEN the detail view renders
- THEN the cards show roster cost, coaching cost, and remaining treasury
- AND values use rulebook format (e.g. "750 000")

#### Scenario: Apothecary included
- GIVEN a team with `coaching.apothecary: true`
- WHEN the treasury cards render
- THEN the "Cuerpo técnico" card includes the `50 000` apothecary cost
- AND "Tesorería restante" drops by that amount

### Requirement: Race-not-in-catalog Fallback
The system MUST show `team.raceId` if the race is not found in the race catalog.

#### Scenario: Unknown race ID
- GIVEN a team with a `raceId` that does not exist in the catalog
- WHEN the detail view renders
- THEN the UI displays the raw `raceId` string instead of a missing name
