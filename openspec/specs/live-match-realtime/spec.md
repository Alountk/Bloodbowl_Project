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

### Requirement: LM-5 · Unified Match Clock and Per-Side Accumulation

The match clock MUST be unified and server-owned: a persisted `startedAt` marks the first-turn kickoff, and `homeTurnMs`/`awayTurnMs` MUST accumulate server-side only while the active side's turn runs. Values MUST derive from persisted timestamps, never client timers, and recompute correctly after a server restart or reconnect. The clock MUST be informational with no per-turn limit: the turn MUST NOT auto-end at zero (`autoEndTurnOnClockZero`/`onClockExpired` removed). No clock MUST run before the first turn. The deprecated league turn-clock option MUST NOT constrain live matches nor appear in the live DTO.
(Previously: league-configured per-turn clocks with a hard limit that auto-ended the turn at zero.)

> **Rename note** (from RENAMED requirement): `LM-5 · League-Configured Server-Owned Clocks` → `LM-5 · Unified Match Clock and Per-Side Accumulation`. Reason: per-turn league-configured clocks are replaced by a unified server-owned clock with per-side accumulation; the league option is deprecated-not-removed. Migration: references to LM-5 (AC-9/AC-10, unit tests) adopt the unified-clock semantics; the full updated block is this one.

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

### Requirement: LM-6 · Event Persistence and Sequence

Every TD, completion, casualty, foul, end-of-half, and end-of-match MUST persist a `LiveEvent` row with monotonic `seq` and a JSON payload; the database MUST be the source of truth and an in-memory hub MUST fan out behind a narrow interface. Catch-up by `seq` MUST NEVER be stale. A `foul` payload MUST carry `victimRosterId`; a `casualty` payload MUST carry `band`, `cause` (one of `blitz|foul|dodge|crowd|penetration|block`), and `causerRosterId` (absent when the crowd or the player's own dodge caused it). Because payloads are JSON and `LiveEvent.kind` is TEXT, this MUST NOT require a migration (LM-14 precedent); legacy events with `{}`/`{band}` payloads MUST still render as fallback rows without victim/cause detail.
(Previously: the `foul` payload was `{}` and the `casualty` payload carried only `band`.)

#### Scenario: Event recorded with sequence

- GIVEN a TD or a completion occurs
- WHEN the control POST commits
- THEN a LiveEvent with the next seq, kind, scorer, and payload is persisted

#### Scenario: Catch-up returns missing events only

- GIVEN a subscriber at seq N
- WHEN they request catch-up after N
- THEN exactly the events with seq > N arrive, in seq order

#### Scenario: Foul victim and casualty cause persist

- GIVEN a foul POSTed with `victimRosterId` and a casualty POSTed with `cause` and `causerRosterId`
- WHEN both commit
- THEN the foul row stores the victim and the casualty row stores `band`, `cause`, and the causer

#### Scenario: Legacy events keep rendering

- GIVEN persisted events whose payloads lack the new fields
- WHEN the feed renders
- THEN they render as fallback rows without victim/cause detail and no error occurs

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

Event commands MUST be side-gated against `activeSide`: the ACTIVE coach MUST be allowed to record TDs, fouls, casualties, completions, and pass-turn; the NON-ACTIVE coach MUST be allowed ONLY to record a casualty to one of their OWN players. Any other non-active event command MUST return 409 with no mutation; spectator members 403 and foreign users 404 (per LM-2). Foul and casualty commands MUST also satisfy actor side invariants: a foul's `victimRosterId` MUST resolve to a roster player on the side opposite the aggressor (`side`), and a casualty's `causerRosterId`, when present, MUST resolve to a roster player on the side opposite the victim (`side`); a violation MUST return 409 with no mutation. The live DTO MUST expose the viewer's side so the client renders the correct controls.
(Previously: the side gate checked kind and casualty victim-side only — a foul's victim and a casualty's causer were not constrained.)

#### Scenario: Active coach records events

- GIVEN home's turn active and the home coach
- WHEN they record a TD, foul, casualty, completion, or pass-turn
- THEN it returns 200 and the event persists

#### Scenario: Non-active TD, foul, or completion rejected

- GIVEN away's turn active
- WHEN the home coach records a TD, foul, or completion
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

#### Scenario: Foul victim must be an opponent

- GIVEN the home coach POSTs a foul whose `victimRosterId` is a home player
- WHEN the command reaches the route
- THEN it returns 409 and no event persists

#### Scenario: Casualty causer must be on the opposite side

- GIVEN a home-coach casualty on a home player with `causerRosterId` of another home player
- WHEN the command reaches the route
- THEN it returns 409 and no event persists

#### Scenario: Crowd and self-inflicted casualties omit the causer

- GIVEN a casualty with cause `crowd` or `dodge` and no `causerRosterId`
- WHEN the command reaches the route
- THEN it returns 200 and the casualty persists without a causer

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

### Requirement: LM-14 · Event Taxonomy: Completion and MVP

`LiveEventKind` MUST add `completion` and `mvp`. Because `LiveEvent.kind` is TEXT, no DB migration is required. A `completion` event MUST be recorded only via an active-coach live command and MUST carry ★1 SPP. An `mvp` event MUST be written only by the result route; it MUST NOT be a `LiveCommand` and MUST NOT be accepted by `resolveEventPermission`.

#### Scenario: Kinds extend without migration

- GIVEN the TEXT `LiveEvent.kind`
- WHEN the union gains `completion` and `mvp`
- THEN no migration runs and both kinds persist as TEXT

#### Scenario: MVP is not a live command

- GIVEN a control POST with `type: "mvp"`
- WHEN it reaches the live route
- THEN it is rejected with no mutation and no event persists

### Requirement: LM-15 · Completion Command

The live route MUST accept `{ type: "completion"; side; playerRosterId }` from the ACTIVE coach and return 200 with a persisted `completion` event (★1). A NON-active coach MUST receive 409 with no mutation.

#### Scenario: Active coach records a completion

- GIVEN home's turn active and the home coach
- WHEN they POST a completion for a home player
- THEN it returns 200 and the completion event persists with ★1

#### Scenario: Non-active completion rejected

- GIVEN away's turn active
- WHEN the home coach POSTs a completion
- THEN it returns 409 and no event persists

### Requirement: LM-16 · Server-Side Feed Filtering

The history feed DTOs (`toEventDtos` and `serializeLive`) MUST include only `start|td|completion|casualty|foul|endHalf|endMatch|mvp`. `turn`, `turnStart`, and `requestTurn` MUST remain persisted in the DB for audit/replay and MUST stay live-only (nudge banner); they MUST NOT appear in any feed DTO.

#### Scenario: Feed carries display kinds only

- GIVEN a persisted history containing all 11 kinds
- WHEN a snapshot or fixture DTO is produced
- THEN exactly the 8 display kinds appear and no turn rows do

#### Scenario: Turn rows stay for audit

- GIVEN the same history
- WHEN the DB rows are inspected
- THEN the `turn`, `turnStart`, and `requestTurn` rows remain unchanged

#### Scenario: Nudge banner stays live-only

- GIVEN an active match
- WHEN a `turnStart` or `requestTurn` arrives
- THEN the live nudge shows it while the history feed does not

### Requirement: LM-17 · Design-A Feed Rows

The history MUST render one row per display-worthy event showing: match minute (`at - startedAt`), global turn tag (`half === 2 ? turnNumber + 8 : turnNumber`, rendered `T{n}`), dorsal (roster index + 1), player name and position resolved from rosters, icon, label, ★ stars, and a side gradient (local navy / visitor red). A reload or reconnect MUST render the identical persisted history (snapshot-first).

#### Scenario: Row derivation

- GIVEN a `td` event at minute 199, half 2 turn 8, roster index 3
- WHEN the row renders
- THEN it shows `199'`, `T16`, dorsal `#4`, the resolved name/position, icon, label, ★★★, and the scorer's side gradient

#### Scenario: Reload renders persisted history

- GIVEN a persisted history
- WHEN a member reloads or reconnects
- THEN identical rows render from the DB with no duplication

### Requirement: LM-18 · Casualty Band and SPP Mapping

Band→label/★ MUST map: `bruise` → "Herida" ★0; `apaleado|grave|permanent|dead` → "Baja" ★2. Event ★ MUST be: TD ★3, Completion ★1, Casualty ★2, MVP ★4.

#### Scenario: Bruise renders Herida

- GIVEN a casualty event with payload band `bruise`
- WHEN label and stars derive
- THEN it renders "Herida" with no star

#### Scenario: Lasting bands render Baja

- GIVEN a casualty with band `apaleado`, `grave`, `permanent`, or `dead`
- WHEN label and stars derive
- THEN it renders "Baja" with ★★

#### Scenario: Stars per kind

- GIVEN `td`, `completion`, and `mvp` events
- WHEN stars derive
- THEN they render ★3, ★1, and ★4 respectively

### Requirement: LM-19 · Derived Team Stats

A pure derivation over the display-worthy events MUST return, per team: TD count, completions, casualties, fouls, and ★ SPP total.

#### Scenario: Stats from events

- GIVEN home display events: 1 td, 1 completion, 1 lasting casualty, 1 foul
- WHEN `deriveTeamStats` runs
- THEN home shows TD 1, completions 1, casualties 1, fouls 1, and ★6

#### Scenario: Empty history zeroed

- GIVEN no display-worthy events
- WHEN stats derive
- THEN every per-team stat is 0

### Requirement: LM-20 · Event Recording Controls

The live UI MUST render a floating "+" button that opens an event-type menu and a mini-form for recording live events. The menu items MUST be derived from the viewer-side DTO (`viewerSide`) against the LM-12 matrix: the ACTIVE coach MUST be able to record TD, Pase completo, Baja/Herida, and Falta via a mini-form with a player select from their own roster and a band select for casualty/injury. The Falta form MUST additionally capture the victim (select from the OPPONENT roster) and submit `victimRosterId`; the Baja/Herida form MUST additionally capture `cause` (one of the six causes) and, except for `dodge`/`crowd`, the causer (select from the OPPONENT roster, submitted as `causerRosterId`). The NON-ACTIVE coach MUST be offered ONLY Herida (casualty to their OWN player, with cause and optional causer). A spectator member or an admin without a side MUST NOT see any event controls. The submitted command MUST pass through the server permission matrix — the server remains the authority and any bypass MUST return 409; a recorded event MUST appear in the Design-A feed.
(Previously: the foul form captured only the aggressor and the casualty form captured only the band.)

#### Scenario: Active coach opens the menu

- GIVEN a live match and the ACTIVE coach
- WHEN they open the "+" menu
- THEN they can record TD, Pase completo, Baja/Herida, or Falta via the mini-form (player select from their roster, band select for casualty/injury)

#### Scenario: Non-active coach restricted to Herida

- GIVEN a live match and the NON-active coach
- WHEN they open the "+" menu
- THEN only Herida (casualty to their own player) is offered; recording any other kind returns 409 per the LM-12 matrix

#### Scenario: No controls without a side

- GIVEN a spectator member or an admin without a side
- WHEN the live UI renders
- THEN no "+" button or event controls appear

#### Scenario: Submission fires the command

- GIVEN the ACTIVE coach filled the mini-form
- WHEN they submit
- THEN the corresponding command fires and the event appears in the Design-A feed

#### Scenario: Server matrix stays authoritative

- GIVEN a client bypassing the menu, e.g. a NON-active coach POSTing a TD
- WHEN the command reaches the live route
- THEN it returns 409 with no mutation

#### Scenario: Foul form captures the victim

- GIVEN the ACTIVE coach opens the Falta form
- WHEN they pick the aggressor from their roster and the victim from the OPPONENT roster and submit
- THEN the foul command carries `victimRosterId` and the feed card shows the victim line

#### Scenario: Casualty form captures cause and causer

- GIVEN a coach opens the Baja/Herida form
- WHEN they pick the band, the cause, and (unless `dodge`/`crowd`) the causer from the OPPONENT roster
- THEN the casualty command carries `cause` and `causerRosterId` and the card shows the three actors

### Requirement: MVT-5 · Casualty Cause and Actor Rendering Data

Cause→label MUST map: `blitz` → "Blitz", `foul` → "Falta", `dodge` → "Esquivando — se cayó", `crowd` → "El público", `penetration` → "Penetración", `block` → "Bloqueo". A casualty card MUST render three actors: the victim (main row), the cause label, and the causer line — "por {name} (#{dorsal}) · {cause}" when `causerRosterId` resolves to a roster player, "El público" when the causer is absent with cause `crowd`, and the bare cause label when absent otherwise. A foul card MUST render the victim line "a {name} (#{dorsal})" resolved from `victimRosterId`. Unknown causes MUST pass through unchanged and never throw.

#### Scenario: Cause labels

- GIVEN the six valid causes
- WHEN the label derives
- THEN `blitz|foul|dodge|crowd|penetration|block` render "Blitz", "Falta", "Esquivando — se cayó", "El público", "Penetración", "Bloqueo"

#### Scenario: Causer line

- GIVEN a casualty whose `causerRosterId` resolves to dorsal 4 "Arnau" and `cause: "blitz"`
- WHEN the card renders
- THEN it shows "por Arnau (#4) · Blitz"

#### Scenario: Crowd and self-inflicted lines

- GIVEN a casualty with cause `crowd` or `dodge` and no `causerRosterId`
- WHEN the card renders
- THEN it shows "El público" (crowd) or "Esquivando — se cayó" (dodge) with no "por …" line

#### Scenario: Foul victim line

- GIVEN a foul whose `victimRosterId` resolves to dorsal 8 "Trash"
- WHEN the card renders
- THEN it shows "a Trash (#8)" under the aggressor row

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
