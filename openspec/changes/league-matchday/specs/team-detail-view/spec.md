# Delta for team-detail-view

## MODIFIED Requirements

### Requirement: Route Resolution

The system MUST resolve the team ID from the route parameters by unwrapping the `params` Promise via `use(params)`. For a team the caller does not own (`team.userId != session.user.id`), the page MUST fetch the team via `GET /api/teams/[id]` (server-backed scouting) and render the read-only view only when the scouting gate succeeds; a 404 from the scouting call MUST trigger the not-found UI.
(Previously: the team ID resolved only from the client store; foreign-team data on the page required no server fetch.)

#### Scenario: Navigating to detail page

- GIVEN the user navigates to `/teams/[teamId]`
- WHEN the page renders
- THEN the system resolves the `teamId` correctly
- AND the detail UI is shown for that team

#### Scenario: Foreign team loads via scouting

- GIVEN the session user navigates to a team they do not own but may scout (own league)
- WHEN the page resolves the route
- THEN it fetches `GET /api/teams/[id]` and renders the read-only roster on success

#### Scenario: Unauthorized rival triggers not-found

- GIVEN the session user navigates to a foreign team they cannot scout (outsider)
- WHEN the scouting fetch returns 404
- THEN the page renders the not-found UI and leaks no roster data

### Requirement: Team Lookup

The system MUST look up the team by ID (`teams.find(t => t.id === teamId)`) once hydrated, and if not found, trigger the not found UI. When the store does not contain the team, the page MUST attempt the server scouting fetch before deciding ownership/access: if the team is found server-side and the caller may view it, render read-only; otherwise `notFound()`.
(Previously: the lookup consulted only the client store; an unknown team id immediately triggered notFound.)

#### Scenario: Unknown team ID

- GIVEN the store is hydrated
- WHEN the provided `teamId` is not found in the `teams` array
- THEN the system triggers the `notFound()` function (or renders not-found when scouting also fails)

### Requirement: Read-Only Scouting Detail

When the team is rendered via the rival scouting path (caller is not the owner), the detail view MUST be strictly read-only: roster via `RosterTable` without `bannerText`/`apothecary`, no rename inputs, no remove buttons, no archive/delete affordance. Owner-path editing affordances MUST remain available ONLY on the owner's own team.
(Previously: the detail view was owner-only and assumed read-only rendering for the owner's own team without a foreign path.)

#### Scenario: Rival roster read-only

- GIVEN a foreign team rendered via scouting
- WHEN the detail view renders
- THEN the roster shows the 10 Spanish read-only columns with no rename/remove/archive controls

#### Scenario: Owner path keeps editing

- GIVEN the session user's own team rendered from the store
- WHEN the detail view renders
- THEN the owner's usual affordances (if any) behave as before; scouting path is not used
