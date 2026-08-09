# team-scouting Specification

## Purpose

Adds a read-only GET `/api/teams/[id]` so a participant can scout a rival team before a match. Visibility is gated to the team's owner, the league owner, or a member of the team's league; all others (including a logged-in outsider) receive 404. The returned data is read-only — no mutation endpoints are exposed by this scope.

## Requirements

### Requirement: Get Team Scouting Endpoint

The system MUST expose `GET /api/teams/[id]` that returns a team's `id`, `name`, `raceId`, `roster`, `coaching`, and `leagueId` for an authorized caller. The route MUST require a session (401 unauthenticated). Archived teams (`archivedAt != null`) MUST NOT be returned (404). The response MUST contain no mutation affordances.

#### Scenario: Owner fetches own team

- GIVEN the session user owns the team
- WHEN they GET `/api/teams/[id]`
- THEN it returns 200 with name, raceId, roster, coaching, leagueId

#### Scenario: Unauthenticated scouting rejected

- GIVEN no session
- WHEN any GET hits `/api/teams/[id]`
- THEN it returns 401 and no data is returned

#### Scenario: Archived team hidden

- GIVEN a team whose `archivedAt` is set
- WHEN any authorized caller GETs it
- THEN it returns 404

### Requirement: Scouting Visibility Gate

GET `/api/teams/[id]` MUST return the team only to (a) the team's owner, (b) the owner of the league the team belongs to, or (c) any team that is a current member of that league. Any OTHER authenticated user MUST receive 404 (no existence leak). A team with `leagueId` null is visible only to its owner.

#### Scenario: League owner scouts member team

- GIVEN a team in a league owned by another user
- WHEN that league owner GETs the team
- THEN it returns 200 with the team data

#### Scenario: League member scouts rival

- GIVEN an active league where the session user owns one team
- WHEN they GET another member team's id in the same league
- THEN it returns 200 with read-only data

#### Scenario: Outsider scouting 404

- GIVEN a team in a league the session user neither owns nor belongs to
- WHEN they GET the team by id
- THEN it returns 404 and no roster data leaks

#### Scenario: Unassigned team visible to owner only

- GIVEN a team with `leagueId: null` owned by another user
- WHEN any other authenticated user GETs it
- THEN it returns 404

### Requirement: Read-Only Scouting Data

The scouting GET MUST be strictly read-only. It MUST NOT create, modify, or delete teams, and MUST NOT trigger negotiation, forfeit, or scheduling side effects. The existing `DELETE /api/teams/[id]` (owner-only archive) MUST remain unchanged.

#### Scenario: Scouting has no side effects

- GIVEN an authorized caller performs GET `/api/teams/[id]`
- THEN the team row, roster, and coaching are unchanged and no proposal/fixture state changes
