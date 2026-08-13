# Delta for live-match-realtime

## ADDED Requirements

### Requirement: LM-11 · Consent and Ready Phase

`LiveMatchStatus` MUST add `ready`. A live match MUST NOT become `live` until BOTH coaches have consented; each consent MUST persist as a separate boolean on the LiveMatch row. The match SHALL wait indefinitely for the second consent. A coach SHALL retract their consent, clearing their boolean and returning the match to `pending`. Only a fixture coach MAY consent: a spectator member or league admin MUST receive 403, a foreign user 404. `ready → live` MUST occur ONLY via the first turn (begin).

#### Scenario: Second consent reaches ready

- GIVEN a scheduled fixture with home's consent already persisted
- WHEN away consents
- THEN the LiveMatch status becomes `ready` and subscribers receive it

#### Scenario: Consent waits indefinitely

- GIVEN exactly one coach consented
- WHEN the other coach never consents
- THEN the match awaits consent indefinitely with no timeout and no clock

#### Scenario: Consent retracted back to pending

- GIVEN a consented coach
- WHEN they retract
- THEN their consent boolean clears and the match returns to `pending`

#### Scenario: Spectator or admin cannot consent for a coach

- GIVEN a member who is not a coach, or the league admin
- WHEN they POST a consent command
- THEN it returns 403 and no consent boolean changes

#### Scenario: Foreign user consent hidden

- GIVEN an authenticated non-member
- WHEN they POST a consent command
- THEN it returns 404 with no existence leak

#### Scenario: E2E begin step

- GIVEN the auth-suite live-match e2e
- WHEN it drives a live match
- THEN it consents as both coaches and begins via the first turn before asserting "Dar el turno"

### Requirement: LM-12 · Turn-Phase Event Permissions

Event commands MUST be side-gated against `activeSide`: the ACTIVE coach MUST be allowed to record TDs, fouls, casualties, and pass-turn; the NON-ACTIVE coach MUST be allowed ONLY to record a casualty to one of their OWN players. Any other non-active event command MUST return 409 with no mutation; spectator members 403 and foreign users 404 (per LM-2). The live DTO MUST expose the viewer's side so the client renders the correct controls.

#### Scenario: Active coach records events

- GIVEN home's turn active and the home coach
- WHEN they record a TD, foul, casualty, or pass-turn
- THEN it returns 200 and the event persists

#### Scenario: Non-active TD or foul rejected

- GIVEN away's turn active
- WHEN the home coach records a TD or foul
- THEN it returns 409 and no state changes

#### Scenario: Own-injury exception

- GIVEN away's turn active
- WHEN the home coach records a casualty to a home player
- THEN it returns 200 and the casualty persists

#### Scenario: Opponent injury denied

- GIVEN away's turn active
- WHEN the home coach records a casualty to an away player
- THEN it returns 409 and no state changes

#### Scenario: Spectator and foreign actors denied

- GIVEN a spectator member, or a foreign user
- WHEN they record an event
- THEN the member gets 403 and the foreign user 404, with no mutation

#### Scenario: Viewer-side DTO

- GIVEN a viewer whose side matches `activeSide`
- WHEN the DTO is received
- THEN it carries the viewer's side so the UI renders "Tu turno"

### Requirement: LM-13 · Turn Start Notification and Request Turn Nudge

The system MUST emit an explicit, persisted, labeled `turnStart` event whenever a turn begins, notifying the other coach. A `requestTurn` command from the NON-active coach MUST persist a labeled `requestTurn` event and notify the ACTIVE coach ("te piden el turno"); it MUST NOT flip the turn nor change any turn/clock state. The nudge SHOULD be rate-limited (cooldown) when cheap to implement.

#### Scenario: Turn-start notice

- GIVEN a turn begins
- WHEN the transition commits
- THEN a labeled `turnStart` event persists and the other coach's client shows "Tu turno"

#### Scenario: Nudge persists and notifies

- GIVEN away's turn active
- WHEN the home coach POSTs requestTurn
- THEN a labeled `requestTurn` event persists, the active coach's UI shows "te piden el turno", and `activeSide` stays away

#### Scenario: Nudge never flips the turn

- GIVEN repeated requestTurn commands
- WHEN any are processed
- THEN `activeSide` and the clock state are unchanged

#### Scenario: Cooldown absorbs spam (optional)

- GIVEN a rate limit implemented
- WHEN nudges exceed the cooldown window
- THEN the extras are rejected or ignored until the window elapses

## MODIFIED Requirements

### Requirement: LM-3 · Match Lifecycle and Start Guard

A live match MUST enter the lifecycle only from a `scheduled` fixture with no result; consent on a played or result-loaded fixture MUST return 409 and create no LiveMatch. The match MUST NOT become `live` until the first turn begins. Second-half end MUST mark the LiveMatch finished without creating a MatchResult.
(Previously: a single start command immediately set the match `live` and started the clock.)

#### Scenario: Consent on scheduled fixture

- GIVEN a scheduled fixture without a result
- WHEN a coach consents
- THEN a LiveMatch is created awaiting the second consent and subscribers receive it

#### Scenario: Replay rejected

- GIVEN a played fixture or one with a result
- WHEN consent is attempted
- THEN it returns 409 and no LiveMatch is created

#### Scenario: Live only via the first turn

- GIVEN a `ready` match with both consents
- WHEN the first turn begins
- THEN the status becomes `live`; until then no clock runs

### Requirement: LM-5 · Unified Match Clock and Per-Side Accumulation

The match clock MUST be unified and server-owned: a persisted `startedAt` marks the first-turn kickoff, and `homeTurnMs`/`awayTurnMs` MUST accumulate server-side only while the active side's turn runs. Values MUST derive from persisted timestamps, never client timers, and recompute correctly after a server restart or reconnect. The clock MUST be informational with no per-turn limit: the turn MUST NOT auto-end at zero (`autoEndTurnOnClockZero`/`onClockExpired` removed). No clock MUST run before the first turn. The deprecated league turn-clock option MUST NOT constrain live matches nor appear in the live DTO.
(Previously: league-configured per-turn clocks with a hard limit that auto-ended the turn at zero.)

#### Scenario: Clock starts at first-turn kickoff

- GIVEN a `ready` match with no clock running
- WHEN the first turn begins
- THEN `startedAt` is set and the unified clock starts; before that no clock runs

#### Scenario: Active side accumulates

- GIVEN home's turn active
- WHEN time passes
- THEN `homeTurnMs` increases while `awayTurnMs` is unchanged; on turn flip the accumulator swaps

#### Scenario: Informational, no auto-end

- GIVEN a turn running beyond any former limit
- WHEN the accumulated time passes zero
- THEN the turn continues and no event is emitted

#### Scenario: Restart and reconnect recompute

- GIVEN persisted `startedAt`/`homeTurnMs`/`awayTurnMs`
- WHEN the server restarts or a client reconnects
- THEN elapsed time and per-side accumulators resume from the persisted values, not zero

### Requirement: LM-7 · Disconnect Policy

The unified match clock MUST auto-pause 10 seconds after the ACTIVE coach's SSE connection drops and MUST resume on reconnect; the pause MUST survive server restarts.
(Previously: the grace applied only to league-configured clocks, and leagues with the option off had no grace. The grace now pauses the unified clock via the persisted `paused` flag.)

#### Scenario: Grace pauses the unified clock

- GIVEN the active coach disconnects
- WHEN 10 seconds pass without reconnect
- THEN the unified clock pauses via the persisted `paused` flag and consumes no further time

#### Scenario: Resume on reconnect

- GIVEN a paused unified clock
- WHEN the coach reconnects
- THEN accumulation resumes from the persisted state

## RENAMED Requirements

### Requirement: LM-5 · League-Configured Server-Owned Clocks → LM-5 · Unified Match Clock and Per-Side Accumulation

(Reason: per-turn league-configured clocks are replaced by a unified server-owned clock with per-side accumulation; the league option is deprecated-not-removed.)
(Migration: references to LM-5 (AC-9/AC-10, unit tests) adopt the unified-clock semantics; the full updated block is under MODIFIED Requirements.)
