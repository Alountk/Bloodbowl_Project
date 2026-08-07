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
The system MUST display the team's identity, including the team name, race name, and league type.

#### Scenario: Displaying a valid team
- GIVEN a valid team is found
- WHEN the detail view renders
- THEN the UI shows the team name, race name, and league type (e.g., "Season")

### Requirement: Roster Display
The system MUST display the team's roster using the `RosterTable` component configured as read-only, rendering the rulebook column set (`CANT. | POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | PRIMARIAS | SECUNDARIAS`) with the light theme and Spanish skill names as specified in the `roster-table` spec. The read-only view MUST pass the team name as the banner (`bannerText`) and the team's apothecary status (`apothecary`).

(Previously: rendered the `RosterTable` read-only without specifying column set, theme, or skill language.)

#### Scenario: Valid roster display
- GIVEN a valid team is found
- WHEN the detail view renders
- THEN the `RosterTable` is rendered with `readOnly={true}`
- AND it receives the correct `players`, `race`, `bannerText={team.name}`, and `apothecary={team.coaching.apothecary}` props
- AND it displays the empty roster fallback if no players exist

#### Scenario: Read-only rulebook presentation
- GIVEN a valid team with players is found
- WHEN the detail view renders
- THEN the roster table shows the Spanish rulebook column set in order
- AND it uses the light theme
- AND skill names render in Spanish with English fallback
- AND no rename inputs or remove buttons are shown

#### Scenario: Read-only totals preserved
- GIVEN a valid team with players is found
- WHEN the detail view renders
- THEN the totals row shows player count and total cost
- AND no budget text appears

### Requirement: Coaching Staff Display
The system MUST display a full per-item breakdown of the coaching staff, including unit costs and total cost.

#### Scenario: Coaching breakdown
- GIVEN a valid team with coaching staff
- WHEN the detail view renders
- THEN it displays a per-item breakdown using `computeCoachingCostItems`
- AND shows the unit cost and total for each configured item

### Requirement: Derived Treasury Display
The system MUST derive and display the remaining treasury calculated as `STARTING_TREASURY - rosterCost - coachingCost`.

#### Scenario: Treasury calculation
- GIVEN a team with a roster and coaching staff
- WHEN the detail view renders
- THEN the displayed treasury equals `STARTING_TREASURY` minus the total cost

### Requirement: Race-not-in-catalog Fallback
The system MUST show `team.raceId` if the race is not found in the race catalog.

#### Scenario: Unknown race ID
- GIVEN a team with a `raceId` that does not exist in the catalog
- WHEN the detail view renders
- THEN the UI displays the raw `raceId` string instead of a missing name
