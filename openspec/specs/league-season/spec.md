# league-season Specification

## Purpose

Gives a League a lifecycle with public-open joinability and an automatic round-robin competition. Any logged-in user joins an open league with their own teams. The owner (admin) starts the league with a chosen season length; the server shuffles teams and generates pairings via the circle method into a `Fixture` set organized as jornadas (rounds). Once started the league locks (no join/leave/expel/delete) and shields its detail from non-members.

## Requirements

### Requirement: League Status Lifecycle

The League MUST carry `status` ("open"|"started", default "open"), `seasonLength Int?`, `startedAt DateTime?`. Creating persists `status:"open"` with both nulls. Start sets `status:"started"`, `seasonLength`, `startedAt: now()`. A STARTED league MUST return 409 to a repeated start and to DELETE.

#### Scenario: New league is open

- GIVEN an authenticated user creates a league
- WHEN the League row is stored
- THEN `status` is "open", `seasonLength` and `startedAt` are null

#### Scenario: Repeat start rejected

- GIVEN a STARTED league
- WHEN the owner calls start again
- THEN it returns 409 and the fixture set is unchanged

#### Scenario: Started league delete blocked

- GIVEN a STARTED league owned by the session user
- WHEN they DELETE it
- THEN it returns 409 and the league row and fixtures remain

### Requirement: Round-Robin Fixture Generation

Starting an open league with n≥2 member teams and `seasonLength s` (1 ≤ s ≤ n−1) MUST, in one transaction, shuffle team ids and apply the circle method to produce `s` rounds of `n/2` pairings such that every unordered pair appears at most once and rounds = `s`. Length `n−1` MUST yield every pair exactly once (perfect round-robin). Default `n−1` when the body omits length.

#### Scenario: Start requires at least two teams

- GIVEN an open league owned by the user with fewer than 2 member teams
- WHEN a start attempt is made
- THEN it returns 409 and no fixture is created

#### Scenario: Season length out of range

- GIVEN an open league with n member teams
- WHEN a start attempt supplies `seasonLength` not in 1..n−1
- THEN it returns 400 (invalid) or 409 (out of range) and no fixture is created

#### Scenario: Perfect round-robin (n=4, length 3)

- GIVEN an open league with 4 teams started with `seasonLength: 3`
- THEN 3 rounds are stored, 6 pairings total, and every unordered pair appears exactly once

#### Scenario: Partial season (n=4, length 2)

- GIVEN an open league with 4 teams started with `seasonLength: 2`
- THEN 2 rounds are stored with no repeated unordered pair across the season

#### Scenario: Round-robin deterministic per seed

- GIVEN two starts of the same team set and shuffle output
- WHEN the circle method runs
- THEN pairings are identical and each round pairs every team exactly once

### Requirement: Jornadas View

A started league detail MUST expose its fixtures. Each fixture has leagueId, round, homeTeamId, awayTeamId as well as derived `status`, nullable `scheduledAt`, nullable `winnerId`, the owners (user) of the home and away teams, and its proposals. Detail responses MUST return fixtures grouped by round (jornada) with home-vs-away labeled teams and a per-round `complete` flag that is true only when every fixture in the round derives `played`.

#### Scenario: Started league returns fixtures

- GIVEN a STARTED league visible to the caller
- WHEN GET detail returns
- THEN fixtures are present grouped by round with labeled home and away teams

#### Scenario: Open league has no fixtures

- GIVEN an OPEN league
- WHEN GET detail returns
- THEN the fixture list is empty

#### Scenario: Fixture with schedule and result

- GIVEN a started league where one fixture has `scheduledAt` and another has `winnerId`
- WHEN the detail returns
- THEN the first derives `scheduled` and the second derives `played`, with the winner team labeled

### Requirement: Started League Locks Membership

Once `status` is "started", join (assign), self-leave, and expel MUST return 409 with no mutation. These actions MUST succeed only while the league is OPEN.

#### Scenario: Start prevents join

- GIVEN a STARTED league
- WHEN any user POSTs a team to join it
- THEN it returns 409 and the team's `leagueId` is unchanged

#### Scenario: Start prevents leave and expel

- GIVEN a STARTED league with members
- WHEN a member self-leaves or the owner expels a member
- THEN it returns 409 and no membership changes

### Requirement: Started League Detail Visibility

GET detail MUST return the league to the owner or any current member when status is STARTED; a non-member who is not the owner MUST receive 404. An OPEN league MUST be readable by any authenticated user.

#### Scenario: Foreign non-member on started league hidden

- GIVEN a STARTED league owned by another user
- WHEN a genuine non-member user requests its detail by id
- THEN it returns 404 and no fixture data leaks

### Requirement: Matchday Fixture Fields

A `Fixture` SHALL carry nullable `scheduledAt DateTime?` and `winnerId String?`. Its derived status MUST be `pending` (no scheduledAt, no winnerId), `scheduled` (scheduledAt set, no winnerId), or `played` (winnerId set, played overrides scheduled). A `ScheduleProposal` model MUST exist with id, fixtureId (FK to Fixture, onDelete Cascade), userId (FK to User), date DateTime, acceptedAt DateTime?, closedAt DateTime?, createdAt, and MUST be indexed on `[fixtureId, createdAt]`. Deleting a Fixture MUST cascade-delete its proposals. Owner paths home/away MUST be resolvable to the owning user for proposal gating.

#### Scenario: Fixture lifecycle fields persisted

- GIVEN a started league generates fixtures
- THEN each fixture stores `scheduledAt: null` and exposed status `pending`

#### Scenario: Proposal cascade on fixture delete

- GIVEN a fixture with stored proposals
- WHEN the fixture row is removed
- THEN its proposals are cascade-deleted

### Requirement: Jornada Round Completion

A round SHALL be considered complete when every fixture in it derives `played`. The detail response MUST expose each round with a `complete` boolean. Per-fixture responses MUST expose `status`, `scheduledAt`, `winnerId`, the owner user of home and away teams, and the proposals list (for participants/admin).

#### Scenario: Round completion exposed

- GIVEN a started league with rounds of fixtures
- WHEN the league detail returns grouped fixtures
- THEN each fixture exposes status/scheduledAt/winnerId/home owner/away owner, and each round exposes `complete` (true only when every fixture is `played`)

#### Scenario: Fixture owners exposed

- GIVEN a fixture with home and away teams owned by two users
- WHEN the detail returns
- THEN the owning user id (and name) of both teams is present for reconciliation gating
