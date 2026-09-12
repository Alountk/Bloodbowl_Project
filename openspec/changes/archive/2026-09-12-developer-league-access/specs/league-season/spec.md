# Delta for league-season

## MODIFIED Requirements

### Requirement: League Status Lifecycle

The League MUST carry `status` ("open"|"started"|"finished", default "open"), `seasonLength Int?`, `startedAt DateTime?`, and `championTeamId String?`. Creating persists `status:"open"` with both nulls. Start sets `status:"started"`, `seasonLength`, `startedAt: now()` and MUST be owner-only or a `leagues.manage` holder (developer/admin); a foreign OPEN league id returns 404 to a plain `user`. A STARTED league MUST return 409 to a repeated start and to DELETE. A FINISHED league MUST also return 409 to start, join, leave, expel and DELETE — a closed season is as immutable as a started one.
(Previously: status was only "open"|"started"; no champion column.)
(Previously: start was owner-only with no privileged override.)

#### Scenario: New league is open

- GIVEN an authenticated user creates a league
- WHEN the League row is stored
- THEN `status` is "open", `seasonLength`, `startedAt` and `championTeamId` are null

#### Scenario: Repeat start rejected

- GIVEN a STARTED league
- WHEN the owner calls start again
- THEN it returns 409 and the fixture set is unchanged

#### Scenario: Started league delete blocked

- GIVEN a STARTED league owned by the session user
- WHEN they DELETE it
- THEN it returns 409 and the league row and fixtures remain

#### Scenario: Finished league is immutable too

- GIVEN a FINISHED league owned by the session user
- WHEN they DELETE it, restart it, join a team, or leave/expel a member
- THEN each attempt returns 409 with no mutation

#### Scenario: Privileged starts a foreign open league

- GIVEN a `developer`/`admin` session and a foreign OPEN league with at least 2 member teams
- WHEN they POST `/api/leagues/[id]/start`
- THEN it returns 200 and the league flips to `started` with fixtures

#### Scenario: Plain user foreign start denied

- GIVEN a plain `user` session and a foreign OPEN league
- WHEN they POST start
- THEN it returns 404 and no mutation occurs

### Requirement: Started League Detail Visibility

GET detail MUST return the league to the owner, any current member, or a `leagues.manage` holder (developer/admin) when status is STARTED or FINISHED; a non-member who is not the owner MUST receive 404. An OPEN league MUST be readable by any authenticated user.
(Previously: detail was owner/member-only for STARTED leagues with no privileged override.)

#### Scenario: Foreign non-member on started league hidden

- GIVEN a STARTED league owned by another user
- WHEN a genuine non-member user requests its detail by id
- THEN it returns 404 and no fixture data leaks

#### Scenario: Privileged reads a foreign started league

- GIVEN a `developer`/`admin` session and a foreign STARTED league
- WHEN they GET `/api/leagues/[id]`
- THEN it returns 200 with fixtures, rounds, and members

#### Scenario: Privileged reads a foreign finished league

- GIVEN a `developer`/`admin` session and a foreign FINISHED league
- WHEN they GET `/api/leagues/[id]`
- THEN it returns 200 with fixtures, rounds, and the champion

#### Scenario: Plain user foreign started league still hidden

- GIVEN a plain `user` session and a foreign STARTED league
- WHEN they GET `/api/leagues/[id]`
- THEN it returns 404 and no fixture data leaks
