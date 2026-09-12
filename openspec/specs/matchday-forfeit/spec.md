# matchday-forfeit Specification

## Purpose

Provides the single match-resolution mechanism this iteration: the league owner (admin) awards a walkover victory to one of the two fixture teams, setting the fixture's `winnerId` and deriving `played` status. This unblocks a round when participants cannot schedule a date.

## Requirements

### Requirement: Admin-Only Forfeit

Only the league owner or a `leagues.manage` holder (developer/admin) SHALL award a forfeit. Participants, other members, and foreign users MUST NOT forfeit. A non-admin, non-privileged request MUST return 403 (authenticated but unauthorized). An absent session MUST return 401.
(Previously: forfeit was league-owner only with no privileged override.)

#### Scenario: Admin awards forfeit

- GIVEN a started league owned by the session user
- WHEN they POST a `winnerTeamId` (home or away) to the forfeit route
- THEN the fixture's `winnerId` is set and derives `played` status

#### Scenario: Non-admin forfeit forbidden

- GIVEN a started league owned by another user
- WHEN a participant or member POSTs a forfeit
- THEN it returns 403 and no mutation occurs

#### Scenario: Unauthenticated forfeit rejected

- GIVEN no session
- WHEN a forfeit request hits the route
- THEN it returns 401 and performs no DB write

#### Scenario: Privileged awards a forfeit

- GIVEN a `developer`/`admin` session and a fixture in a foreign STARTED league
- WHEN they POST a `winnerTeamId` (home or away)
- THEN the fixture's `winnerId` is set and it derives `played`

#### Scenario: Plain user forfeit still forbidden

- GIVEN a plain `user` who is neither the league owner nor privileged
- WHEN they POST a forfeit
- THEN it returns 403 and no mutation occurs

### Requirement: Forfeit Sets winnerId

A forfeit MUST set the fixture's `winnerId` to the supplied `winnerTeamId`, which MUST be one of the fixture's `homeTeamId` or `awayTeamId`, and MUST record the walkover scores in `homeScore`/`awayScore`. The forfeit MUST close any open proposal on the fixture, and MUST delete the fixture's LiveMatch (events cascade) in the same transaction so a played walkover never shows a live badge (`live-match-recovery` LMR-6). The fixture then derives `played` from the recorded scores. A forfeit MUST NOT be allowed on a fixture already `played` (409) — including one with a recorded result — and the result route MUST return 409 on a forfeited fixture (mutual exclusion). A walkover MUST NOT award PE. A forfeit MAY be allowed on a `scheduled` or `pending` fixture.
(Previously: forfeit set only winnerId; no scores were recorded and the result route did not exist.)

#### Scenario: Winner must be home or away

- GIVEN an admin forfeits a fixture with a `winnerTeamId` that is neither home nor away
- THEN it returns 400 and no mutation occurs

#### Scenario: Forfeit on scheduled fixture allowed

- GIVEN a `scheduled` fixture
- WHEN the admin forfeits it
- THEN `winnerId` and walkover scores are set and it derives `played`

#### Scenario: Repeat forfeit rejected

- GIVEN a fixture already `played`
- WHEN the admin forfeits again
- THEN it returns 409 and `winnerId` and scores are unchanged

#### Scenario: Forfeit closes open proposals

- GIVEN a fixture with an active proposal
- WHEN the admin forfeits it
- THEN the active proposal is closed and the fixture is `played`

#### Scenario: Forfeit deletes the orphan LiveMatch

- GIVEN a fixture with a stale LiveMatch row and an admin forfeit
- WHEN the walkover commits
- THEN the LiveMatch and its events are deleted and no live badge renders

#### Scenario: Walkover skips PE

- GIVEN a walkover forfeit is awarded
- WHEN PE are computed for the fixture
- THEN neither team receives PE

#### Scenario: Result blocked on forfeited fixture

- GIVEN a fixture resolved by forfeit
- WHEN the result route POSTs a result
- THEN it returns 409 and no mutation occurs

#### Scenario: Forfeit blocked on result-loaded fixture

- GIVEN a fixture with a recorded result
- WHEN the admin forfeits it
- THEN it returns 409 and no mutation occurs

### Requirement: Round Completion Rule

A round (jornada) SHALL be considered complete when every fixture in that round derives `played`. Any fixture in the round that is `pending` (no `scheduledAt`, no `winnerId`) means the round is NOT complete. The derived detail responses SHALL expose a per-round `complete` flag; a round with zero fixtures that any fixture is still pending MUST be false.

#### Scenario: Round complete when all played

- GIVEN a round whose every fixture has a `winnerId`
- WHEN the league detail is fetched
- THEN the round is marked `complete`

#### Scenario: Round incomplete with a pending fixture

- GIVEN a round in which at least one fixture is still `pending`
- WHEN the league detail is fetched
- THEN the round is NOT marked `complete`
