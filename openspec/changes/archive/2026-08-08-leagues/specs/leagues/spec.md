# Delta for leagues

## ADDED Requirements

### Requirement: League Model

The system MUST persist leagues via Prisma on PostgreSQL. The League model MUST have id (cuid), name (unique global), description (String?, optional free text), ownerId (FK to User), createdAt. Deleting a User MUST cascade-delete their Leagues. Deleting a League MUST set each member team's `leagueId` to null BEFORE deleting the league (onDelete SetNull).

#### Scenario: League persisted

- GIVEN an authenticated user
- WHEN a league is created with a name and optional description
- THEN a League row with the user's ownerId, name, description, and createdAt is stored

#### Scenario: Duplicate league name rejected

- GIVEN a league name already exists globally
- WHEN any user creates a league with the same name
- THEN creation fails with 409 and no league row is created

#### Scenario: League delete clears members

- GIVEN a league with member teams owned by other users
- WHEN the owner deletes the league
- THEN each member team's `leagueId` is set to null and the league row is removed

### Requirement: League User-Scoped API

The system MUST expose `/api/leagues` (GET list, POST create) and `/api/leagues/[id]` (GET detail, DELETE) that require a valid session (401 unauthenticated) and scope every query to the session user's ownerId via findFirst-by-owner. A user MUST NOT read or delete another user's league (foreign league id → 404 with no mutation). DELETE MUST be owner-only.

#### Scenario: Unauthenticated API call

- GIVEN no session
- WHEN any `/api/leagues` route is hit
- THEN it returns 401 and performs no DB mutation

#### Scenario: List only own leagues

- GIVEN two users each with leagues
- WHEN a user calls GET `/api/leagues`
- THEN only that user's leagues are returned

#### Scenario: Foreign league denied

- GIVEN a league owned by another user
- WHEN a user requests or deletes it by id
- THEN it returns 404 and no mutation occurs

#### Scenario: League detail with members

- GIVEN an authenticated owner requests their league detail
- WHEN GET `/api/leagues/[id]` returns
- THEN it includes the league fields and its list of member (non-archived) teams

### Requirement: Team Membership Assignment

The system MUST support assigning and expelling teams to/from a league. Assign (POST `/api/leagues/[id]/teams` with a teamId) MUST allow only teams owned by the session user, non-archived (`archivedAt: null`), and currently unassigned (`leagueId: null`); assigning a foreign/archived/already-member team MUST return 404 or 409 and make no change. Expel (DELETE `/api/leagues/[id]/members/[teamId]`) MUST clear the member team's `leagueId`; a team not in the league MUST return 404 without mutation.

#### Scenario: Assign own unassigned team

- GIVEN an authenticated user owns an unassigned, non-archived team and a league
- WHEN they POST the teamId to the league
- THEN the team's `leagueId` is set and it appears in the league detail

#### Scenario: Assign already-member team rejected

- GIVEN a team already in a league
- WHEN it is assigned again (to any league, one-team-per-league)
- THEN it returns 409 and its membership is unchanged

#### Scenario: Assign foreign or archived team denied

- GIVEN a team owned by another user, or an archived team
- WHEN it is assigned
- THEN it returns 404 (foreign) / 409 (archived) and no membership change occurs

#### Scenario: Expel member clears membership

- GIVEN a team currently in the league
- WHEN the owner expels it
- THEN the team's `leagueId` is set to null and it leaves the detail member list

#### Scenario: Expel non-member denied

- GIVEN a team not in the league
- WHEN the owner attempts to expel it
- THEN it returns 404 and no change occurs
