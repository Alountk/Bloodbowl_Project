# leagues Specification

## Purpose

Introduce the League model to group teams into per-user leagues. Leagues are persisted via Prisma on PostgreSQL, scoped to the session owner, and support assigning/expelling member teams. Deleting a league clears each member team's `leagueId` before the league row is removed.

## Requirements

### Requirement: League Model

The system MUST persist leagues via Prisma on PostgreSQL. The League model MUST have id (cuid), name (unique global), description (String?, optional free text), ownerId (FK to User), createdAt, `status` (enum "open"|"started", default "open"), `seasonLength Int?`, and `startedAt DateTime?`. A `Fixture` model MUST exist with id (cuid), leagueId (cascade), round Int, homeTeamId, awayTeamId and MUST be indexed on `[leagueId, round]`. Deleting a User MUST cascade-delete their Leagues. Deleting an OPEN League MUST set each member team's `leagueId` to null (onDelete SetNull) and MUST fail with 409 when the league is STARTED; deleting a started league MUST NOT run the SetNull-clearing and MUST leave teams and fixtures intact.

#### Scenario: League persisted (unchanged)

- GIVEN an authenticated user
- WHEN a league is created with a name and optional description
- THEN a League row with the user's ownerId, name, description, createdAt, and `status: "open"` is stored

#### Scenario: Duplicate league name rejected (unchanged)

- GIVEN a league name already exists globally
- WHEN any user creates a league with the same name
- THEN creation fails with 409 and no league row is created

#### Scenario: Open league delete clears members (unchanged)

- GIVEN an OPEN league with member teams owned by other users
- WHEN the owner deletes the league
- THEN each member team's `leagueId` is set to null and the league row is removed

#### Scenario: Started league delete blocked

- GIVEN a STARTED league with fixtures and members
- WHEN the owner deletes the league
- THEN it returns 409 and the league row, fixtures, and memberships remain

### Requirement: League User-Scoped API

The system MUST expose `/api/leagues` (GET list, POST create) and `/api/leagues/[id]` (GET detail, DELETE) that require a valid session (401 unauthenticated). GET list returns open leagues of all users plus the session user's own leagues (all status), each with owner name and member count. GET detail returns the league to any authenticated user when OPEN, or to the owner/members when STARTED (foreign non-member started id → 404). POST create is owner-injected. DELETE MUST be owner-only and MUST return 409 when the league is STARTED.

#### Scenario: Unauthenticated API call (unchanged)

- GIVEN no session
- WHEN any `/api/leagues` route is hit
- THEN it returns 401 and performs no DB mutation

#### Scenario: List own plus open leagues

- GIVEN a user owns leagues and other users own OPEN leagues
- WHEN the user calls GET `/api/leagues`
- THEN the response is the union of their own leagues and all open leagues, each with ownerName and memberCount

#### Scenario: Foreign member started detail allowed

- GIVEN a STARTED league owned by another user
- WHEN a current member of that league requests its detail
- THEN it returns 200 with the league, member teams, and fixtures

#### Scenario: League detail with members

- GIVEN an authenticated owner requests their OPEN league detail
- WHEN GET `/api/leagues/[id]` returns
- THEN it includes the league fields and its list of member (non-archived) teams

### Requirement: Team Membership Assignment

The system MUST support joining and expelling teams to/from a league while it is OPEN. Join (POST `/api/leagues/[id]/teams` with a teamId) MUST allow only teams owned by the session user, non-archived (`archivedAt: null`), currently unassigned (`leagueId: null`), and MAY target any OPEN league (public join). The league MUST be returned/validated by id regardless of owner; assigning to a STARTED league MUST return 409. Assigning a foreign/archived/already-member team MUST return 404 or 409 and make no change. Expel (DELETE `/api/leagues/[id]/members/[teamId]`) MUST clear the member team's `leagueId` for the admin (league owner) or the team owner while OPEN; started → 409.

#### Scenario: Assign own unassigned team to any open league

- GIVEN a user owns an unassigned, non-archived team and an OPEN league that may be owned by another user
- WHEN they POST the teamId to that league's join route
- THEN the team's `leagueId` is set and it appears in the league detail

#### Scenario: Assign already-member team rejected (unchanged)

- GIVEN a team already in a league
- WHEN it is assigned again (to any league, one-team-per-league)
- THEN it returns 409 and its membership is unchanged

#### Scenario: Assign foreign or archived team denied (unchanged)

- GIVEN a team owned by another user, or an archived team
- WHEN it is assigned
- THEN it returns 404 (foreign) / 409 (archived) and no membership change occurs

#### Scenario: Assign to started league rejected

- GIVEN a STARTED league
- WHEN any user attempts to join a team to it
- THEN it returns 409 and no membership change occurs

#### Scenario: Admin expels member while open (unchanged)

- GIVEN a team currently in an OPEN league
- WHEN the admin expels it
- THEN the team's `leagueId` is set to null and it leaves the detail member list

#### Scenario: Expel non-member denied (unchanged)

- GIVEN a team not in the league
- WHEN the admin attempts to expel it
- THEN it returns 404 and no change occurs

### Requirement: Public Open League Listing

GET `/api/leagues` MUST require a session (401 unauthenticated) and return ALL leagues with `status: "open"` from any user, PLUS the session user's own leagues in any status. Each list item MUST include the league fields plus `owner` name (or `ownerName`) and `memberCount`; the server MUST compute memberCount in the query (no per-league N+1 detail fetch). The list MUST hide foreign STARTED leagues.

#### Scenario: Open leagues visible to any user

- GIVEN two users each with an OPEN league
- WHEN a third user calls GET `/api/leagues`
- THEN both open leagues appear with owner name and member count

#### Scenario: Own started league still listed

- GIVEN a user owns a STARTED league
- WHEN that user calls GET `/api/leagues`
- THEN their started league appears even though it is not open

#### Scenario: Foreign started league hidden

- GIVEN a STARTED league owned by another user
- WHEN any other user calls GET `/api/leagues`
- THEN it does not appear in the listing

### Requirement: Open League Detail Public

GET `/api/leagues/[id]` MUST return an OPEN league to any authenticated user (not only the owner). The response MUST include member (non-archived) teams and, when started, fixtures grouped by round.

#### Scenario: Foreign open league readable

- GIVEN an OPEN league owned by another user
- WHEN a different authenticated user requests its detail
- THEN it returns 200 with the league and member teams

### Requirement: Member Self-Leave

DELETE `/api/leagues/[id]/members/[teamId]` MUST allow the OWNER of a member TEAM (i.e. any member team's user) to remove their own team, and MUST allow the league owner (admin) to expel any member. A team not a member MUST return 404. Both paths MUST work only while the league is OPEN (409 if started).

#### Scenario: Member removes own team while open

- GIVEN a team in an OPEN league owned by a non-admin user
- WHEN that user DELETEs its membership by team id
- THEN the team's `leagueId` is nulled and it leaves the member list
