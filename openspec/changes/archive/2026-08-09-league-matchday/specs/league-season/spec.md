# Delta for league-season

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Jornadas View

A started league detail MUST expose its fixtures. Each fixture has leagueId, round, homeTeamId, awayTeamId as well as derived `status`, nullable `scheduledAt`, nullable `winnerId`, the owners (user) of the home and away teams, and its proposals. Detail responses MUST return fixtures grouped by round (jornada) with home-vs-away labeled teams and a per-round `complete` flag that is true only when every fixture in the round derives `played`.
(Previously: fixtures exposed only leagueId, round, homeTeamId, awayTeamId, with no status, scheduling, winner, owner, or proposals.)

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
