# Delta for league-season

## MODIFIED Requirements

### Requirement: Matchday Fixture Fields

A `Fixture` SHALL carry nullable `scheduledAt DateTime?`, `winnerId String?`, `homeScore Int?`, `awayScore Int?`, and a link to its persisted result record. Its derived status MUST be `pending` (no scheduledAt, no result), `scheduled` (scheduledAt set, no result), or `played` (result recorded — played overrides scheduled). A fixture SHALL derive `played` from a recorded result (scores present via the result route or a walkover), NOT from `winnerId` alone. A `ScheduleProposal` model MUST exist with id, fixtureId (FK to Fixture, onDelete Cascade), userId (FK to User), date DateTime, acceptedAt DateTime?, closedAt DateTime?, createdAt, and MUST be indexed on `[fixtureId, createdAt]`. Deleting a Fixture MUST cascade-delete its proposals. Owner paths home/away MUST be resolvable to the owning user for proposal gating and result authorization.
(Previously: fixture carried only scheduledAt/winnerId; `played` derived from winnerId alone.)

#### Scenario: Fixture lifecycle fields persisted

- GIVEN a started league generates fixtures
- THEN each fixture stores `scheduledAt: null`, `homeScore: null`, `awayScore: null` and exposes status `pending`

#### Scenario: Proposal cascade on fixture delete

- GIVEN a fixture with stored proposals
- WHEN the fixture row is removed
- THEN its proposals are cascade-deleted

#### Scenario: winnerId alone does not mark played

- GIVEN a fixture with `winnerId` set but no recorded result
- WHEN its status is derived
- THEN it MUST NOT derive `played`

#### Scenario: Recorded result marks played

- GIVEN a fixture whose result was recorded with scores
- WHEN its status is derived
- THEN it derives `played`, overriding `scheduled`

### Requirement: Jornada Round Completion

A round SHALL be considered complete when every fixture in it derives `played` (result recorded with scores via the result route or a walkover). The detail response MUST expose each round with a `complete` boolean. Per-fixture responses MUST expose `status`, `scheduledAt`, `winnerId`, `homeScore`, `awayScore`, the owner user of home and away teams, and the proposals list (for participants/admin).
(Previously: completion derived from winnerId presence; scores not exposed.)

#### Scenario: Round complete when all results recorded

- GIVEN a round whose every fixture has a recorded result
- WHEN the league detail returns grouped fixtures
- THEN each round exposes `complete: true`

#### Scenario: Round incomplete with a pending fixture

- GIVEN a round in which at least one fixture is still pending
- WHEN the league detail returns
- THEN the round exposes `complete: false`

#### Scenario: winnerId only is not complete

- GIVEN a round whose fixtures have `winnerId` but no recorded result
- WHEN the league detail returns
- THEN the round exposes `complete: false`

## ADDED Requirements

### Requirement: Fixture Result Exposure

League detail responses MUST expose final scores and the winner label for result-loaded and walkover fixtures; MatchCard MUST render the score. When both a schedule and a recorded result exist, the fixture MUST derive `played`.

#### Scenario: MatchCard renders score

- GIVEN a fixture with a recorded result
- WHEN league detail renders
- THEN the score homeScore–awayScore and the winner label are displayed

#### Scenario: Result overrides schedule display

- GIVEN a scheduled fixture whose result is later recorded
- WHEN league detail renders
- THEN the fixture shows `played` with scores

Affected: slice 1 (schema) · slices 2–3 (detail + MatchCard) · slice 5 (e2e label updates in `e2e/league-matchday.spec.ts`).
