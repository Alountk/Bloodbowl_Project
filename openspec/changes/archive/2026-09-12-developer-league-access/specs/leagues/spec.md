# Delta for leagues

## MODIFIED Requirements

### Requirement: League User-Scoped API

The system MUST expose `/api/leagues` (GET list, POST create) and `/api/leagues/[id]` (GET detail, DELETE) that require a valid session (401 unauthenticated). GET list returns open leagues of all users plus the session user's own leagues (all status), each with owner name and member count; a `leagues.manage` holder (developer/admin) receives EVERY league in every status. GET detail returns the league to any authenticated user when OPEN, or to the owner/members when STARTED, or to a `leagues.manage` holder regardless of status (a foreign non-member started id → 404 for a plain `user`). POST create is owner-injected and MUST NOT accept, require, or validate turn-clock fields: the creation UI/API no longer expose the toggle or duration select, and a payload that still carries the fields MUST NOT persist them (columns keep schema defaults). The fields MUST be immutable: no update path exists for them. DELETE MUST be owner-only (or a `leagues.manage` holder) and MUST return 409 when the league is STARTED.
(Previously: POST create accepted an enabled toggle plus a per-turn duration validated to exactly 120/240/360 seconds.)
(Previously: GET detail was owner/member-only for STARTED leagues and DELETE was owner-only, with no privileged override.)

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

#### Scenario: Privileged detail bypasses the started/finished shield

- GIVEN a `developer`/`admin` session and a foreign STARTED (or FINISHED) league
- WHEN they GET `/api/leagues/[id]`
- THEN it returns 200 with the league, member teams, and fixtures

#### Scenario: Privileged delete on a foreign open league

- GIVEN a `developer`/`admin` session and a foreign OPEN league with member teams
- WHEN they DELETE it
- THEN each member team's `leagueId` is nulled and the league row is removed

#### Scenario: Plain user foreign started detail still hidden

- GIVEN a plain `user` session and a foreign STARTED league
- WHEN they GET `/api/leagues/[id]`
- THEN it returns 404 and no fixture data leaks

#### Scenario: Plain user delete foreign league still denied

- GIVEN a plain `user` session and a foreign league
- WHEN they DELETE it
- THEN it returns 404 and no mutation occurs

### Requirement: Team Membership Assignment

The system MUST support joining and expelling teams to/from a league while it is OPEN. Join (POST `/api/leagues/[id]/teams` with a teamId) MUST allow only teams owned by the session user, non-archived (`archivedAt: null`), currently unassigned (`leagueId: null`), and MAY target any OPEN league (public join). The league MUST be returned/validated by id regardless of owner; assigning to a STARTED league MUST return 409. Assigning a foreign/archived/already-member team MUST return 404 or 409 and make no change. Expel (DELETE `/api/leagues/[id]/members/[teamId]`) MUST clear the member team's `leagueId` for the admin (league owner), a `leagues.manage` holder (developer/admin), or the team owner while OPEN; started → 409.
(Previously: expel was admin (league owner) or team owner only, with no privileged override.)

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

#### Scenario: Privileged expels a member of a foreign open league

- GIVEN a `developer`/`admin` session and a member team in a foreign OPEN league
- WHEN they DELETE `/api/leagues/[id]/members/[teamId]`
- THEN the team's `leagueId` is nulled and it leaves the member list

#### Scenario: Plain user expel still denied

- GIVEN a plain `user` who is neither the league owner nor the team owner
- WHEN they DELETE the membership
- THEN it returns 404 and no change occurs

### Requirement: Public Open League Listing

GET `/api/leagues` MUST require a session (401 unauthenticated) and return ALL leagues with `status: "open"` from any user, PLUS the session user's own leagues in any status. Each list item MUST include the league fields plus `owner` name (or `ownerName`) and `memberCount`; the server MUST compute memberCount in the query (no per-league N+1 detail fetch). The list MUST hide foreign STARTED leagues from a plain `user`; a `leagues.manage` holder (developer/admin) receives EVERY league in every status (the OR filter is dropped).
(Previously: the list returned open + own leagues only, hiding all foreign STARTED leagues with no privileged override.)

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

#### Scenario: Privileged sees every league in every status

- GIVEN a `developer`/`admin` session and leagues across all statuses
- WHEN they call GET `/api/leagues`
- THEN every league appears with owner name and member count

#### Scenario: Plain user still does not see foreign started

- GIVEN a plain `user` session and a foreign STARTED league
- WHEN they call GET `/api/leagues`
- THEN it does not appear in the listing
