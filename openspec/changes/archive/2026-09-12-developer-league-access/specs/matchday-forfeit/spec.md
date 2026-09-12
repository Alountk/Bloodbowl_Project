# Delta for matchday-forfeit

## MODIFIED Requirements

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
