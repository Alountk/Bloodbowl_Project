# Delta for team-scouting

## MODIFIED Requirements

### Requirement: Get Team Scouting Endpoint

The system MUST expose `GET /api/teams/[id]` that returns a team's `id`, `name`, `raceId`, `roster`, `coaching`, `leagueId`, and nullable `emblem` for an authorized caller. The route MUST require a session (401 unauthenticated). Archived teams (`archivedAt != null`) MUST NOT be returned (404). The response MUST contain no mutation affordances.
(Previously: the response carried no `emblem` field.)

#### Scenario: Owner fetches own team

- GIVEN the session user owns the team
- WHEN they GET `/api/teams/[id]`
- THEN it returns 200 with name, raceId, roster, coaching, leagueId, and emblem (null or set)

#### Scenario: Unauthenticated scouting rejected

- GIVEN no session
- WHEN any GET hits `/api/teams/[id]`
- THEN it returns 401 and no data is returned

#### Scenario: Archived team hidden

- GIVEN a team whose `archivedAt` is set
- WHEN any authorized caller GETs it
- THEN it returns 404

#### Scenario: Emblem present in scouted payload

- GIVEN a team with a stored `emblem`
- WHEN an authorized caller GETs it
- THEN the response `emblem` equals the stored adapter value (null when unset)
