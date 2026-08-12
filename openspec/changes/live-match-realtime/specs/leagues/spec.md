# Delta for leagues

## MODIFIED Requirements

### Requirement: League Model

The system MUST persist leagues via Prisma on PostgreSQL. The League model MUST have id (cuid), name (unique global), description (String?, optional free text), ownerId (FK to User), createdAt, `status` (enum "open"|"started", default "open"), `seasonLength Int?`, `startedAt DateTime?`, `turnClockEnabled Boolean` (default true), and `turnClockSeconds Int` (default 240, meaningful only when enabled). A `Fixture` model MUST exist with id (cuid), leagueId (cascade), round Int, homeTeamId, awayTeamId and MUST be indexed on `[leagueId, round]`. Deleting a User MUST cascade-delete their Leagues. Deleting an OPEN League MUST set each member team's `leagueId` to null (onDelete SetNull) and MUST fail with 409 when the league is STARTED; deleting a started league MUST NOT run the SetNull-clearing and MUST leave teams and fixtures intact.
(Previously: the League model carried no turn-clock fields.)

#### Scenario: League persisted (unchanged)

- GIVEN an authenticated user
- WHEN a league is created with a name and optional description
- THEN a League row with the user's ownerId, name, description, createdAt, and `status: "open"` is stored

#### Scenario: Duplicate league name rejected (unchanged)

- GIVEN a league name already exists globally
- WHEN any user creates a league with the same name
- THEN creation fails with 409 and no league row is created

#### Scenario: Turn-clock option persisted

- GIVEN a league created with the turn-clock option
- WHEN the League row is stored
- THEN `turnClockEnabled` and `turnClockSeconds` carry the creation values

#### Scenario: Open league delete clears members (unchanged)

- GIVEN an OPEN league with member teams owned by other users
- WHEN the owner deletes the league
- THEN each member team's `leagueId` is set to null and the league row is removed

#### Scenario: Started league delete blocked

- GIVEN a STARTED league with fixtures and members
- WHEN the owner deletes the league
- THEN it returns 409 and the league row, fixtures, and memberships remain

### Requirement: League User-Scoped API

The system MUST expose `/api/leagues` (GET list, POST create) and `/api/leagues/[id]` (GET detail, DELETE) that require a valid session (401 unauthenticated). GET list returns open leagues of all users plus the session user's own leagues (all status), each with owner name and member count. GET detail returns the league to any authenticated user when OPEN, or to the owner/members when STARTED (foreign non-member started id → 404). POST create is owner-injected and MUST accept the turn-clock option (enabled toggle + per-turn duration); when enabled, the duration MUST be exactly 120, 240, or 360 seconds (any other value → 400, no league created) and 240 MUST be the default when omitted. The option MUST be immutable after creation: no update path exists for it. DELETE MUST be owner-only and MUST return 409 when the league is STARTED.
(Previously: POST create accepted no turn-clock option.)

#### Scenario: Unauthenticated API call (unchanged)

- GIVEN no session
- WHEN any `/api/leagues` route is hit
- THEN it returns 401 and performs no DB mutation

#### Scenario: List own plus open leagues

- GIVEN a user owns leagues and other users own OPEN leagues
- WHEN the user calls GET `/api/leagues`
- THEN the response is the union of their own leagues and all open leagues, each with ownerName and memberCount

#### Scenario: Creation accepts the clock option

- GIVEN a user creating a league with clocks enabled at 240 seconds
- WHEN POST `/api/leagues` validates the payload
- THEN the league is created with the option persisted on the League row

#### Scenario: Invalid duration rejected

- GIVEN the clock toggle enabled
- WHEN the creation payload carries a duration outside 120/240/360
- THEN it returns 400 and no league row is created

#### Scenario: Option immutable after creation

- GIVEN a league created with the turn-clock option
- WHEN any later request attempts to alter it
- THEN the League row keeps the creation values (no update path exists)

#### Scenario: Foreign member started detail allowed

- GIVEN a STARTED league owned by another user
- WHEN a current member of that league requests its detail
- THEN it returns 200 with the league, member teams, and fixtures

#### Scenario: League detail with members

- GIVEN an authenticated owner requests their OPEN league detail
- WHEN GET `/api/leagues/[id]` returns
- THEN it includes the league fields and its list of member (non-archived) teams

Affected: slice 1 (migration — `League` columns) · league creation API + form.
