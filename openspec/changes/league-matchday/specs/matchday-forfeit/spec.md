# matchday-forfeit Specification

## Purpose

Provides the single match-resolution mechanism this iteration: the league owner (admin) awards a walkover victory to one of the two fixture teams, setting the fixture's `winnerId` and deriving `played` status. This unblocks a round when participants cannot schedule a date.

## Requirements

### Requirement: Admin-Only Forfeit

Only the league owner SHALL award a forfeit. Participants, other members, and foreign users MUST NOT forfeit. A non-admin request MUST return 403 (authenticated but unauthorized). An absent session MUST return 401.

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

### Requirement: Forfeit Sets winnerId

A forfeit MUST set the fixture's `winnerId` to the supplied `winnerTeamId`, which MUST be one of the fixture's `homeTeamId` or `awayTeamId`. The forfeit MUST close any open proposal on the fixture. The fixture resumes marked as `played`.

A forfeit MUST NOT be allowed on a fixture already `played` (409); it MAY be allowed on a `scheduled` or `pending` fixture.

#### Scenario: Winner must be home or away

- GIVEN an admin forfeits a fixture with a `winnerTeamId` that is neither home nor away
- THEN it returns 400 and no mutation occurs

#### Scenario: Forfeit on scheduled fixture allowed

- GIVEN a `scheduled` fixture
- WHEN the admin forfeits it
- THEN `winnerId` is set and it derives `played`

#### Scenario: Repeat forfeit rejected

- GIVEN a fixture already `played`
- WHEN the admin forfeits again
- THEN it returns 409 and `winnerId` is unchanged

#### Scenario: Forfeit closes open proposals

- GIVEN a fixture with an active proposal
- WHEN the admin forfeits it
- THEN the active proposal is closed and the fixture is `played`

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
