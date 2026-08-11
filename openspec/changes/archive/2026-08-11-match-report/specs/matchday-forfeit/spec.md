# Delta for matchday-forfeit

## MODIFIED Requirements

### Requirement: Forfeit Sets winnerId

A forfeit MUST set the fixture's `winnerId` to the supplied `winnerTeamId`, which MUST be one of the fixture's `homeTeamId` or `awayTeamId`, and MUST record the walkover scores in `homeScore`/`awayScore`. The forfeit MUST close any open proposal on the fixture. The fixture then derives `played` from the recorded scores. A forfeit MUST NOT be allowed on a fixture already `played` (409) — including one with a recorded result — and the result route MUST return 409 on a forfeited fixture (mutual exclusion). A walkover MUST NOT award PE. A forfeit MAY be allowed on a `scheduled` or `pending` fixture.
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

Affected: slice 1 (walkover score fields) · slice 2 (mutual exclusion with the result route).
