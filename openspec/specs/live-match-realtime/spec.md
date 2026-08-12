# live-match-realtime Specification

## Purpose

Interactive 2-coach live match mode for a scheduled fixture: SSE-synced turns, per-team server clocks, score, and a chronological event feed, persisted from day one and visible for live AND played matches. Finished live matches pre-fill the existing result modal; the existing POST validation stays authoritative.

## Requirements

### Requirement: LM-1 · SSE Transport

GET `.../live` MUST stream `text/event-stream` for same-origin `EventSource` (JWT cookie, no separate token); POST `.../live` MUST accept control commands over regular HTTP. WebSockets, custom servers, and new runtime dependencies MUST NOT be used.

#### Scenario: Coach subscribes

- GIVEN an authenticated fixture coach
- WHEN they open GET .../live
- THEN the connection streams `text/event-stream` updates

#### Scenario: Control POST mutates and fans out

- GIVEN an active live match with subscribers
- WHEN a coach POSTs a control command
- THEN the change persists and every subscriber's stream receives the new state

### Requirement: LM-2 · Read and Write Auth Gates

SSE read MUST mirror the fixture-GET matrix: 401 without a session (both auth modes), 404 foreign non-member, 200 owner/any member (STARTED) or any authenticated (OPEN). Control MUST accept only fixture coaches and league admin: spectator members 403, foreign non-members 404 (no existence leak). AUTH_MODE=local realtime routes MUST return 401 (documented parity, not a regression).

#### Scenario: Unauthenticated rejected

- GIVEN no session
- WHEN GET .../live is hit
- THEN it returns 401 in both auth modes

#### Scenario: Owner and member subscribe

- GIVEN a STARTED-league fixture and an owner or member session
- WHEN they open GET .../live
- THEN it returns 200 and streams state

#### Scenario: Foreign user hidden

- GIVEN an authenticated non-member
- WHEN they hit GET or POST .../live
- THEN it returns 404 with no existence leak

#### Scenario: Spectator control denied

- GIVEN a league member who is not a coach
- WHEN they POST a control command
- THEN it returns 403 and no mutation occurs

#### Scenario: Local mode 401 parity

- GIVEN AUTH_MODE=local
- WHEN a realtime route is hit
- THEN it returns 401, identical to the fixture GET

### Requirement: LM-3 · Match Lifecycle and Start Guard

A live match MUST start only from a `scheduled` fixture with no result; start on a played or result-loaded fixture MUST return 409 and create no LiveMatch. Second-half end MUST mark the LiveMatch finished without creating a MatchResult.

#### Scenario: Start from scheduled fixture

- GIVEN a scheduled fixture without a result
- WHEN a coach starts the live match
- THEN a LiveMatch is created and subscribers receive it

#### Scenario: Replay rejected

- GIVEN a played fixture or one with a result
- WHEN start is attempted
- THEN it returns 409 and no LiveMatch is created

### Requirement: LM-4 · Turn Model and Invariants

Pure transition functions MUST enforce: only the active side may act (out-of-turn and double actions rejected 409); turn end flips the active side; each half caps at 8 turns, then the half flips and away starts half 2.

#### Scenario: Turn alternation enforced

- GIVEN home's turn active
- WHEN away submits a turn action
- THEN it returns 409 and no state changes

#### Scenario: Turn end flips side

- GIVEN home's turn active
- WHEN home ends the turn
- THEN activeSide becomes away and a turn event persists

#### Scenario: Eight-turn half flip

- GIVEN turn 8 of half 1 ends
- WHEN the half completes
- THEN half becomes 2, turnNumber resets, away starts, and an endHalf event persists

### Requirement: LM-5 · League-Configured Server-Owned Clocks

Clocks MUST be league-configured: with the league's turn-clock option enabled, the per-turn duration MUST come from the League row (120/240/360 seconds), never a constant; with the option disabled, live matches MUST have no clocks — no ticking and no 10-second grace pause — while the turn and event flow stay unchanged. Where clocks exist they MUST be server-owned: only the active team's clock runs while the other pauses; values MUST derive from persisted timestamps, never client timers, and recompute correctly after a server restart.

#### Scenario: League creation accepts the clock option

- GIVEN a user creates a league with the clock toggle enabled
- WHEN they submit a per-turn duration of 120, 240, or 360 seconds
- THEN the option is persisted on the League row
- AND any other duration is rejected server-side with no league created

#### Scenario: Duration comes from league config

- GIVEN a league with clocks enabled at 360 seconds
- WHEN a live match runs in it
- THEN the per-turn clock uses 360 seconds from the League row, not a constant

#### Scenario: Clocks disabled league

- GIVEN a league created with the turn-clock option off
- WHEN a live match runs in it
- THEN no clock ticks, no grace pause applies, and the turn/event flow is unchanged

#### Scenario: Active clock runs, other pauses

- GIVEN home's turn active
- WHEN time passes
- THEN home's clock decreases while away's clock is unchanged

#### Scenario: Restart recompute

- GIVEN a LiveMatch with persisted timestamps
- WHEN the server restarts
- THEN clocks resume from the persisted remaining time, not from zero

### Requirement: LM-6 · Event Persistence and Sequence

Every TD, casualty (with injury band), foul, end-of-half, and end-of-match MUST persist a `LiveEvent` row with monotonic `seq` and a JSON payload; the database MUST be the source of truth and an in-memory hub MUST fan out behind a narrow interface. Catch-up by `seq` MUST never be stale.

#### Scenario: Event recorded with sequence

- GIVEN a TD occurs
- WHEN the control POST commits
- THEN a LiveEvent with the next seq, kind, scorer, and payload is persisted

#### Scenario: Catch-up returns missing events only

- GIVEN a subscriber at seq N
- WHEN they request catch-up after N
- THEN exactly the events with seq > N arrive, in seq order

### Requirement: LM-7 · Disconnect Policy

With clocks enabled, the active coach's clock MUST auto-pause 10 seconds after their SSE connection drops and MUST resume on reconnect; the pause MUST survive server restarts. Leagues with clocks disabled MUST NOT apply any grace pause.

#### Scenario: Grace pause after disconnect

- GIVEN the active coach disconnects
- WHEN 10 seconds pass without reconnect
- THEN their clock pauses and consumes no further time

#### Scenario: Resume on reconnect

- GIVEN a paused active clock
- WHEN the coach reconnects
- THEN the clock resumes from the paused remaining time

### Requirement: LM-8 · New-Device Recovery

A coach MUST recover mid-match on a new device: the first SSE message MUST be the full state snapshot; fresh devices catch up with `since=0`, reconnects with Last-Event-ID; control MUST restore because identity is the user cookie, not the device.

#### Scenario: Snapshot-first subscribe

- GIVEN an active live match
- WHEN a coach subscribes from a new device with since=0
- THEN the first SSE message is the full state (turn, half, clocks, score, events)

#### Scenario: Reconnect catch-up by Last-Event-ID

- GIVEN a stream that dropped at seq N
- WHEN EventSource reconnects with Last-Event-ID N
- THEN events after N are replayed and the UI converges

#### Scenario: Control restored on a new device

- GIVEN the same coach on a new device
- WHEN they POST a control action
- THEN it is accepted (identity is the user cookie)

### Requirement: LM-9 · Result Handoff

A finished LiveMatch MUST pre-fill the existing result modal (scores, per-scorer TD credits); MJP nominations, casualty detail, and other action counts MUST stay user input; the existing POST validation MUST remain authoritative — no auto-results, no parallel result path.

#### Scenario: Prefill from live state

- GIVEN a finished live match
- WHEN a coach opens the result modal
- THEN scores and per-scorer TD lists are pre-filled from live state

#### Scenario: POST validation still authoritative

- GIVEN a pre-filled modal
- WHEN the coach submits the full report
- THEN the existing route validates (mismatched TD sums return 400) and persists

### Requirement: LM-10 · Historical Persistence and Non-Functional Constraints

Live events MUST persist from day one so played matches render the historical timeline. The feature MUST stay rulebook-light (existing tokens, Spanish league copy, no icon library, no new runtime dependencies); realtime e2e MUST run in the auth suite only.

#### Scenario: Events persist from day one

- GIVEN events recorded during a live match
- WHEN the match later plays out
- THEN the persisted events are available to render the played timeline

#### Scenario: Rulebook-light audit

- GIVEN the rendered live UI
- WHEN classes, copy, and dependencies are audited
- THEN only existing tokens and Spanish copy appear, with no icon lib or new deps

#### Scenario: E2E runs in the auth suite only

- GIVEN the Playwright configuration
- WHEN live-match specs execute
- THEN they run under the auth suite and are ignored in local mode

## Acceptance Criteria

| # | Requirement(s) |
|---|----------------|
| AC-1 | LM-2 |
| AC-2 | LM-2, LM-4 |
| AC-3 | LM-4 |
| AC-4 | LM-6 |
| AC-5 | match-view MV-5 |
| AC-6 | LM-9 |
| AC-7 | LM-10 |
| AC-8 | LM-8 |
| AC-9 | LM-5, LM-7 |
| AC-10 | LM-5, leagues delta |

Affected: slice 1 (migration) · slice 2 (SSE subscribe) · slice 3 (control + transitions) · slice 5 (timeline + prefill) · slice 6 (e2e).
