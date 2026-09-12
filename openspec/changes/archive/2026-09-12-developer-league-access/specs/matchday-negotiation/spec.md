# Delta for matchday-negotiation

## MODIFIED Requirements

### Requirement: Participant-Only Negotiation

Only the owner of the fixture's home or away team, OR a `leagues.manage` holder (developer/admin), SHALL propose or accept a date; a league owner who is NOT a participant, non-member users, and other members MUST NOT negotiate. A non-participant (non-privileged) request MUST return 404 (no existence leak); absent session MUST return 401.
(Previously: propose/accept was participant-only with no privileged override.)

#### Scenario: Participant proposes

- GIVEN a started-league fixture in `pending` and the session user owns home or away team
- WHEN they POST a `date` to the propose route
- THEN a new open `ScheduleProposal` is stored and no other proposal remains active

#### Scenario: Owner participant negotiates

- GIVEN a started-league fixture in `pending` and the session user is the league owner whose team is in the fixture
- WHEN they open the negotiation panel
- THEN the propose/accept controls are available (participant rule)

#### Scenario: Non-participant forbidden

- GIVEN a started-league fixture owned by two other users
- WHEN a non-participant member or the league admin proposes
- THEN it returns 404 and no proposal is stored

#### Scenario: Unauthenticated negotiation rejected

- GIVEN no session
- WHEN any propose/accept request hits the route
- THEN it returns 401 and performs no DB write

#### Scenario: Privileged proposes

- GIVEN a `developer`/`admin` session and a pending fixture in a foreign league
- WHEN they POST a `date` to the propose route
- THEN a new open `ScheduleProposal` is stored

#### Scenario: Plain user non-participant still forbidden

- GIVEN a plain `user` who is neither a participant nor privileged
- WHEN they propose or accept
- THEN it returns 404 and no proposal is stored

### Requirement: Negotiation History Visible

Both participants SHALL see the full proposal history (date, `userId`, `acceptedAt?`, `closedAt?`). Only the two participants, the league owner, and a `leagues.manage` holder (developer/admin) SHALL see history; everyone else 404.
(Previously: history was participant/owner only with no privileged override.)

#### Scenario: History shown to participants

- GIVEN a fixture with several open and closed proposals
- WHEN a participant requests history
- THEN the full ordered history returns date, author, acceptedAt, closedAt

#### Scenario: Foreign user cannot see history

- GIVEN a started-league fixture
- WHEN a non-participant, non-admin user requests its proposals
- THEN it returns 404

#### Scenario: Privileged sees history

- GIVEN a `developer`/`admin` session and a foreign league fixture with proposals
- WHEN they GET the proposals route
- THEN the full ordered history returns
