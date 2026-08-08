# Delta for team-list

## MODIFIED Requirements

### Requirement: Preserved List Behavior

The system MUST preserve existing behaviors such as search filtering and roster summaries on the team cards. The list is fed by the store, and under an authenticated session the store is the user-scoped `ApiTeamStore`; therefore the list MUST display only the signed-in user's teams. The rendering behaviors (search, cards, navigation) MUST remain unchanged.
(Previously: the list presented all locally stored teams; there was no authentication and no user scope.)

#### Scenario: Preserved search filtering

- GIVEN a list of teams with links
- WHEN the user types in the search filter
- THEN the list filters correctly as before

#### Scenario: Only own teams listed

- GIVEN a signed-in user owns teams
- WHEN the home page renders
- THEN only that user's teams appear in the list

### Requirement: Detail Navigation Link

The system MUST render each team card as a navigation link (`<Link>`) pointing to `/teams/${team.id}`.

#### Scenario: Team card navigation

- GIVEN a list of teams is displayed
- WHEN a team card is rendered
- THEN it is wrapped in an accessible `<a href="/teams/${id}">` element
- AND keyboard navigation correctly focuses the link

### Requirement: Empty States

The list MUST render empty states as light book panels with square corners. With no teams, the panel MUST show "No teams yet. Create your first team." and a navy "Create New Team" button to `/teams/create`. When a search query matches nothing, the panel MUST show "No teams match your search." without a CTA.

#### Scenario: No-teams panel with CTA

- GIVEN no teams exist and hydration is complete
- WHEN the list renders
- THEN a light panel shows "No teams yet. Create your first team."
- AND a navy "Create New Team" button links to `/teams/create`

#### Scenario: No-match panel without CTA

- GIVEN teams exist but the search query matches none
- WHEN the list renders
- THEN a light panel shows "No teams match your search."
- AND no create CTA appears inside the panel
