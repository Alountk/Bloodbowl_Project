# ui-refresh Specification

## Purpose

Runtime UI-refresh flag so approved V2 redesigns ship while others keep the current UI: cookie `bb-ui=next` read server-side in `app/layout.tsx` (beside `bb-locale`/`bb-theme`) and client-side via `useUiFlag()`, consulted only at declared seams. Legacy stays default until each screen's flag-ON e2e is green. Out of scope: other screens, token/theme changes (owned by `theme-switching`), a visible dev toggle (undecided per proposal).

## Requirements

### Requirement: UIR-1 · Flag Resolution Server and Client

The system MUST recognize cookie `bb-ui=next` as ON. The server MUST read it in `app/layout.tsx` beside `bb-locale`/`bb-theme`; the client MUST expose `useUiFlag()` mirroring `useTheme` fallback: absent or any other value MUST resolve OFF (legacy), no error, no flash of the wrong surface.

#### Scenario: Cookie `next` resolves ON

- GIVEN a request carrying `bb-ui=next`
- WHEN the root layout resolves the flag
- THEN the server-side flag resolves ON

#### Scenario: Absent cookie defaults OFF

- GIVEN no `bb-ui` cookie
- WHEN the layout resolves the flag and a component calls `useUiFlag()`
- THEN both resolve OFF, legacy renders with no flash

#### Scenario: Unknown value treated as OFF

- GIVEN `bb-ui=<any value other than next>`
- WHEN the flag resolves on server or client
- THEN it resolves OFF — no error, no V2

### Requirement: UIR-2 · Declared Seams

The declared seams MUST be: team detail — `app/teams/[teamId]/page.tsx` (`TeamDetailView` vs `TeamDetailViewV2`) — and teams list — `app/teams/page.tsx` (`TeamsPage` vs `TeamsListViewV2`). At each seam flag ON MUST render the V2 surface, flag OFF MUST render the legacy surface, never both. Both surfaces at a seam MUST receive an identical props contract (teams list: both take no props), and V2 MUST be presentation-only — no data-fetching, mutation, or behavior paths beyond those the legacy surface already uses through shared providers.

(Previously: UIR-2 declared only the single team detail seam in `app/teams/[teamId]/page.tsx`, hardwired to `TeamDetailView`/`TeamDetailViewV2`.)

#### Scenario: Flag ON selects V2

- GIVEN `bb-ui=next`
- WHEN a declared seam renders
- THEN exactly one surface mounts: `TeamDetailViewV2` on team detail with the same props `TeamDetailView` gets, or `TeamsListViewV2` on `/teams` with the same (empty) props `TeamsPage` gets

#### Scenario: Flag OFF selects legacy

- GIVEN no `bb-ui` cookie
- WHEN a declared seam renders
- THEN the legacy component (`TeamDetailView` or `TeamsPage`) renders with its current props and behavior

#### Scenario: Never both surfaces at a seam

- GIVEN either flag value
- WHEN one declared seam renders
- THEN only one of its two components is mounted — no `ui-v2-teams-*` marker alongside the legacy `/teams` surface, and no legacy marker alongside V2

#### Scenario: Behavior identical across variants

- GIVEN either surface at the same seam
- WHEN a user runs an action available on that surface (e.g. the hire flow on detail, search or "Crear equipo" on the list)
- THEN requests and results are identical; only markup differs

### Requirement: UIR-3 · Legacy Contract Frozen With Flag OFF

With the flag OFF, legacy MUST keep testids `team-roster-table`, `roster-row-*`, `spp-pe-*`, `open-hire-dialog` and headings "Plantilla", "Cuerpo técnico", "Tesorería" exactly as today, and test suites MUST pass with NO edits to legacy assertions.

#### Scenario: Existing suites pass unmodified

- GIVEN the current unit and e2e suites run with no `bb-ui` cookie
- WHEN they execute
- THEN every assertion passes and no legacy test was edited

#### Scenario: Legacy markers present

- GIVEN flag OFF on team detail
- WHEN the page renders
- THEN the named testids and headings appear verbatim

### Requirement: UIR-4 · Flag-ON e2e for Desktop and Mobile

The new spec `e2e/ui-refresh-roster.spec.ts` MUST set the flag via `page.context().addCookies` and assert the V2 surface at desktop and mobile viewports.

#### Scenario: Desktop V2 asserted

- GIVEN a test sets `bb-ui=next` with `page.context().addCookies`
- WHEN team detail loads at a desktop viewport
- THEN the V2 roster renders without the legacy `team-roster-table` marker

#### Scenario: Mobile V2 asserted

- GIVEN the same cookie setup
- WHEN team detail loads at a mobile viewport
- THEN the V2 mobile layout is asserted

### Requirement: UIR-5 · Per-Screen Flip Discipline

The flag MUST be consulted only at declared seams. A default MAY flip to V2 only after that screen's flag-ON e2e passes, and a flip MUST NOT affect other screens.

#### Scenario: Flip blocked without green e2e

- GIVEN a screen whose flag-ON e2e is missing or failing
- WHEN a change proposes V2 as its default
- THEN the flip is not allowed until that e2e passes

#### Scenario: Other screens unaffected by a flip

- GIVEN team detail's default flips to V2
- WHEN any other route renders with the flag ON
- THEN it is unchanged, because no other seam consults the flag
