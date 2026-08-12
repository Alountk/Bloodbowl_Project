# matchday-negotiation Specification

## Purpose

Lets the two owners of a scheduled fixture agree a match date (`scheduledAt`). Only home and away team participants propose/accept dates; at most one proposal is active; accepting closes the negotiation and sets `scheduledAt`. History remains visible to both participants.

## Requirements

### Requirement: Participant-Only Negotiation

Only the owner of the fixture's home or away team SHALL propose or accept a date (participant rule); a league owner who is NOT a participant, non-member users, and other members MUST NOT negotiate. A non-participant request MUST return 404 (no existence leak); absent session MUST return 401.

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

### Requirement: One Active Proposal Invariant

At most one proposal SHALL be active per fixture. Proposing a new date MUST atomically close the current active proposal and store the new one in the same transaction. Concurrent proposals MUST still yield exactly one active proposal.

#### Scenario: Counter-propose closes the prior
- GIVEN an active proposal from the other participant
- WHEN a participant proposes a new date
- THEN the prior proposal is closed and the new one is the single active proposal

#### Scenario: Concurrent propose keeps one active
- GIVEN a pending fixture
- WHEN both participants propose simultaneously
- THEN exactly one active proposal exists (transaction re-checks active state)

#### Scenario: Propose on scheduled fixture rejected
- GIVEN a fixture already `scheduled`
- WHEN a participant POSTs a new proposal
- THEN it returns 409 and no proposal is stored

### Requirement: Propose Date

A proposal SHALL carry a required `date` (ISO timestamp, UTC default) supplied by the participant. A missing or invalid date MUST return 400. The proposer MUST be recorded as `userId`.

#### Scenario: Missing date rejected
- GIVEN a participant POSTs without a `date`
- THEN it returns 400 and no proposal is stored

### Requirement: Accept Sets scheduledAt

Accepting SHALL be allowed only by the OTHER participant (not the proposer). Accept MUST set `acceptedAt`, close the fixture negotiation, and set the fixture's `scheduledAt` to the proposed date. Further propose/accept MUST return 409.

#### Scenario: Other participant accepts
- GIVEN an active proposal created by the other participant
- WHEN the session user accepts it
- THEN the fixture's `scheduledAt` equals the proposed date and the proposal is accepted

#### Scenario: Creator cannot self-accept
- GIVEN a proposal created by the session user
- WHEN they accept it
- THEN it returns 409 and nothing changes

#### Scenario: Accept on scheduled or closed proposal rejected
- GIVEN a fixture already `scheduled`, or a closed/accepted proposal
- WHEN a participant accepts
- THEN it returns 409 and no mutation occurs

### Requirement: Status Transition pending->scheduled

A fixture SHALL derive `pending` (no `scheduledAt`, no `winnerId`), `scheduled` (`scheduledAt` set, no `winnerId`), or `played` (`winnerId` set, overrides). Setting `scheduledAt` moves `pending` to `scheduled`.

#### Scenario: Accept schedules; played overrides
- GIVEN a `pending` fixture accepted, or a fixture with both `scheduledAt` and `winnerId`
- WHEN status is derived
- THEN accepts derive `scheduled`; a fixture with both derives `played`

### Requirement: Negotiation History Visible

Both participants SHALL see the full proposal history (date, `userId`, `acceptedAt?`, `closedAt?`). Only the two participants and the league owner SHALL see history; everyone else 404.

#### Scenario: History shown to participants
- GIVEN a fixture with several open and closed proposals
- WHEN a participant requests history
- THEN the full ordered history returns date, author, acceptedAt, closedAt

#### Scenario: Foreign user cannot see history
- GIVEN a started-league fixture
- WHEN a non-participant, non-admin user requests its proposals
- THEN it returns 404
