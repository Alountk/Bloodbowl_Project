# Delta for matchday-negotiation

## ADDED Requirements

### Requirement: Rejornar — Re-Open Negotiation Before Play

EITHER participant MUST be able to re-open negotiation on a scheduled-but-not-played fixture at ANY time before the match is played — including before the scheduled date arrives — and the fixture's league MUST be started (unchanged prereq). A new propose/accept cycle MUST update the fixture's `scheduledAt` to the new date. Propose/accept on a `played` or result-loaded fixture MUST return 409. The negotiation panel MUST be available for `pending` AND `scheduled` (not played) fixtures, and the history MUST keep showing all old proposals.

#### Scenario: Re-open before the scheduled date

- GIVEN a scheduled fixture dated next week
- WHEN either participant proposes a new date today
- THEN it returns 200 and a new active proposal exists

#### Scenario: Played fixture locked

- GIVEN a played or result-loaded fixture
- WHEN a participant proposes or accepts
- THEN it returns 409 and no proposal mutation occurs

#### Scenario: Panel gate widened

- GIVEN a scheduled-not-played fixture
- WHEN the fixture page renders
- THEN the negotiation panel with propose/accept controls is available, but not for played fixtures

#### Scenario: History keeps old proposals

- GIVEN a re-negotiated fixture with prior cycles
- WHEN a participant requests history
- THEN the previous cycles' proposals remain in the ordered history alongside the new one

#### Scenario: Rejornar e2e

- GIVEN the auth-suite league-matchday e2e
- WHEN it re-negotiates a scheduled fixture
- THEN it proposes and accepts a new date and the fixture shows the updated date

## MODIFIED Requirements

### Requirement: One Active Proposal Invariant

At most one proposal SHALL be active per fixture. Proposing a new date MUST atomically close the current active proposal and store the new one in the same transaction. Concurrent proposals MUST still yield exactly one active proposal. Proposing MUST be allowed on `pending` AND `scheduled` (not yet played) fixtures; only a `played`/result fixture MUST return 409.
(Previously: proposing on an already-scheduled fixture returned 409.)

#### Scenario: Counter-propose closes the prior

- GIVEN an active proposal from the other participant
- WHEN a participant proposes a new date
- THEN the prior proposal is closed and the new one is the single active proposal

#### Scenario: Concurrent propose keeps one active

- GIVEN a pending fixture
- WHEN both participants propose simultaneously
- THEN exactly one active proposal exists (transaction re-checks active state)

#### Scenario: Propose re-opens on a scheduled fixture

- GIVEN a scheduled-not-played fixture
- WHEN a participant POSTs a new proposal
- THEN it returns 200, the prior active proposal closes, and the new one is active

### Requirement: Accept Sets scheduledAt

Accepting SHALL be allowed only by the OTHER participant (not the proposer). Accept MUST set `acceptedAt`, close the fixture negotiation, and set the fixture's `scheduledAt` to the proposed date — including when the fixture was already `scheduled`. After an accept, further propose/accept of that cycle MUST return 409; a fixture is re-negotiable again only through a NEW proposal cycle before play.
(Previously: accept on an already-scheduled fixture returned 409.)

#### Scenario: Other participant accepts

- GIVEN an active proposal created by the other participant
- WHEN the session user accepts it
- THEN the fixture's `scheduledAt` equals the proposed date and the proposal is accepted

#### Scenario: Creator cannot self-accept

- GIVEN a proposal created by the session user
- WHEN they accept it
- THEN it returns 409 and nothing changes

#### Scenario: Accept re-schedules an already-scheduled fixture

- GIVEN an active re-negotiation proposal on a scheduled fixture
- WHEN the other participant accepts
- THEN `scheduledAt` updates to the new date and the negotiation closes

#### Scenario: Accept on a closed proposal rejected

- GIVEN a closed or accepted proposal
- WHEN a participant accepts
- THEN it returns 409 and no mutation occurs

### Requirement: Status Transition pending->scheduled

A fixture SHALL derive `pending` (no `scheduledAt`, no `winnerId`), `scheduled` (`scheduledAt` set, no `winnerId`), or `played` (`winnerId` set, overrides). Setting `scheduledAt` moves `pending` to `scheduled`. A `scheduled` fixture MAY be re-negotiated and its `scheduledAt` updated before play; re-negotiation MUST NOT create or clear a result.
(Previously: a fixture left `pending` only once, via the first accept.)

#### Scenario: Accept schedules; played overrides

- GIVEN a `pending` fixture accepted, or a fixture with both `scheduledAt` and `winnerId`
- WHEN status is derived
- THEN accepts derive `scheduled`; a fixture with both derives `played`

#### Scenario: Re-scheduled fixture stays scheduled

- GIVEN a scheduled fixture whose date a rejornar accept updates
- WHEN status is derived
- THEN it derives `scheduled` with the new date and no result is touched
