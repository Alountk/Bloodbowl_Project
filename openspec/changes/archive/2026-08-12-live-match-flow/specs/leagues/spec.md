# Delta for leagues

## MODIFIED Requirements

### Requirement: League Model

The system MUST persist leagues via Prisma on PostgreSQL. The League model MUST have id (cuid), name (unique global), description (String?, optional free text), ownerId (FK to User), createdAt, `status` (enum "open"|"started", default "open"), `seasonLength Int?`, `startedAt DateTime?`, `turnClockEnabled Boolean` (default true), and `turnClockSeconds Int` (default 240) — the two turn-clock columns are DEPRECATED and MUST remain only for backward compatibility (no destructive migration drops them). A `Fixture` model MUST exist with id (cuid), leagueId (cascade), round Int, homeTeamId, awayTeamId and MUST be indexed on `[leagueId, round]`. Deleting a User MUST cascade-delete their Leagues. Deleting an OPEN League MUST set each member team's `leagueId` to null (onDelete SetNull) and MUST fail with 409 when the league is STARTED; deleting a started league MUST NOT run the SetNull-clearing and MUST leave teams and fixtures intact.
(Previously: the turn-clock fields were the active per-turn clock configuration; this delta deprecates them without dropping the columns.)

#### Scenario: League persisted (unchanged)

- GIVEN an authenticated user
- WHEN a league is created with a name and optional description
- THEN a League row with the user's ownerId, name, description, createdAt, and `status: "open"` is stored

#### Scenario: Duplicate league name rejected (unchanged)

- GIVEN a league name already exists globally
- WHEN any user creates a league with the same name
- THEN creation fails with 409 and no league row is created

#### Scenario: Deprecated clock columns retained

- GIVEN a league whose creation predates the deprecation
- WHEN its League row is read
- THEN `turnClockEnabled` and `turnClockSeconds` remain stored unchanged; new leagues persist them at schema defaults

#### Scenario: Open league delete clears members (unchanged)

- GIVEN an OPEN league with member teams owned by other users
- WHEN the owner deletes the league
- THEN each member team's `leagueId` is set to null and the league row is removed

#### Scenario: Started league delete blocked

- GIVEN a STARTED league with fixtures and members
- WHEN the owner deletes the league
- THEN it returns 409 and the league row, fixtures, and memberships remain

### Requirement: League User-Scoped API

The system MUST expose `/api/leagues` (GET list, POST create) and `/api/leagues/[id]` (GET detail, DELETE) that require a valid session (401 unauthenticated). GET list returns open leagues of all users plus the session user's own leagues (all status), each with owner name and member count. GET detail returns the league to any authenticated user when OPEN, or to the owner/members when STARTED (foreign non-member started id → 404). POST create is owner-injected and MUST NOT accept, require, or validate turn-clock fields: the creation UI/API no longer expose the toggle or duration select, and a payload that still carries the fields MUST NOT persist them (columns keep schema defaults). The fields MUST be immutable: no update path exists for them. DELETE MUST be owner-only and MUST return 409 when the league is STARTED.
(Previously: POST create accepted an enabled toggle plus a per-turn duration validated to exactly 120/240/360 seconds.)

#### Scenario: Unauthenticated API call (unchanged)

- GIVEN no session
- WHEN any `/api/leagues` route is hit
- THEN it returns 401 and performs no DB mutation

#### Scenario: List own plus open leagues

- GIVEN a user owns leagues and other users own OPEN leagues
- WHEN the user calls GET `/api/leagues`
- THEN the response is the union of their own leagues and all open leagues, each with ownerName and memberCount

#### Scenario: Creation without the clock option

- GIVEN a user creating a league
- WHEN POST `/api/leagues` carries no turn-clock fields
- THEN the league is created and the deprecated columns persist at schema defaults

#### Scenario: Legacy turn-clock payload ignored

- GIVEN a creation payload that still carries turn-clock fields
- WHEN POST `/api/leagues` validates it
- THEN the fields are ignored (not persisted) and the league is created with schema defaults

#### Scenario: Creation UI drops the clock option

- GIVEN the league creation modal
- WHEN it renders
- THEN no turn-clock toggle or duration select appears

#### Scenario: Deprecated fields immutable after creation

- GIVEN a league created before or after the deprecation
- WHEN any later request attempts to alter the fields
- THEN the League row keeps its values (no update path exists)

#### Scenario: Foreign member started detail allowed (unchanged)

- GIVEN a STARTED league owned by another user
- WHEN a current member of that league requests its detail
- THEN it returns 200 with the league, member teams, and fixtures

#### Scenario: League detail with members

- GIVEN an authenticated owner requests their OPEN league detail
- WHEN GET `/api/leagues/[id]` returns
- THEN it includes the league fields and its list of member (non-archived) teams
