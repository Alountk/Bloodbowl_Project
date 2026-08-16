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

Every TD, completion, casualty, foul, end-of-half, and end-of-match MUST persist a `LiveEvent` row with monotonic `seq` and a JSON payload; the database MUST be the source of truth and an in-memory hub MUST fan out behind a narrow interface. Catch-up by `seq` MUST NEVER be stale. A `foul` payload MUST carry `victimRosterId`; a `casualty` payload MUST carry `victimRosterId`, `cause` (one of `blitz|foul|dodge|crowd|penetration|block`), `roll16` (the 1D16 roll the players actually rolled) and the server-DERIVED `band` (resolved from `roll16` via the rulebook table — the client NEVER sends a band); a `permanent` band MUST also carry `roll6` and the derived `permanentAttribute`. A `casualty` payload carries `causerRosterId` (the attacker's own player) when the cause requires one, and ABSENT when the crowd or the player's own dodge caused it. Because payloads are JSON and `LiveEvent.kind` is TEXT, this MUST NOT require a migration (LM-14 precedent); legacy events with `{}`/`{band}` payloads MUST still render as fallback rows without victim/cause detail.
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

- GIVEN a foul POSTed with `victimRosterId` and a casualty confirmed with `victimRosterId`, `cause`, `causerRosterId` and `roll16`
- WHEN both commit
- THEN the foul row stores the victim and the casualty row stores the victim, `cause`, the causer, the `roll16` and the server-derived `band`

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

Event commands MUST be side-gated against `activeSide`: the ACTIVE coach MUST be allowed to record TDs, fouls, completions, and pass-turn; the NON-ACTIVE coach MUST NOT record any of those (409 with no mutation). A casualty follows the RAU-39 TWO-PHASE model: the ACTIVE coach (the attacker) MUST PROPOSE the casualty they inflicted — `proposeCasualty` with the causer (their OWN player), the victim (an OPPONENT), a causer-required cause (`blitz|foul|penetration|block`) and the 1D16 roll — and the NON-active coach (the defender) MUST CONFIRM it (`confirmCasualty`, no reject). The band MUST be DERIVED server-side from the 1D16 roll via the rulebook table at confirm time (never client-chosen); a `permanent` band (13-14) MUST also resolve the 1D6 attribute roll, which is REQUIRED on the proposal. The direct `casualty` command survives ONLY for SELF-INFLICTED injuries (dodge/crowd) to the caller's OWN player — recorded directly with NO confirmation and NO causer. Foul and casualty commands MUST also satisfy actor side invariants: a foul's `victimRosterId` MUST resolve to a roster player on the side opposite the aggressor (`side`); a `proposeCasualty`'s causer MUST resolve to the PROPOSER's own side and its victim to the OPPOSITE side; a violation MUST return 409 with no mutation. The live DTO MUST expose the viewer's side so the client renders the correct controls.
(Previously: the side gate checked kind and casualty victim-side only — a foul's victim and a casualty's causer were not constrained; casualties were recorded directly with a client-chosen band.)

#### Scenario: Active coach records events

- GIVEN home's turn active and the home coach
- WHEN they record a TD, foul, completion, or pass-turn
- THEN it returns 200 and the event persists

#### Scenario: Non-active TD, foul, or completion rejected

- GIVEN away's turn active
- WHEN the home coach records a TD, foul, or completion
- THEN it returns 409 and no state changes

#### Scenario: Active coach proposes a casualty they inflicted (RAU-39)

- GIVEN home's turn active and the home coach
- WHEN they propose a casualty with their OWN player as causer, an OPPONENT as victim, a causer-required cause and a 1D16 roll
- THEN `pendingCasualty` persists, no event persists, and the match keeps running

#### Scenario: Defender confirms the proposal (RAU-39)

- GIVEN a pending casualty proposal
- WHEN the NON-proposer confirms it
- THEN the `casualty` event persists ATOMICALLY with the band DERIVED server-side from the 1D16 roll, `pendingCasualty` clears, and the match continues

#### Scenario: Proposer cannot confirm their own proposal

- GIVEN a pending casualty proposal
- WHEN the PROPOSER tries to confirm it
- THEN it returns 409 and the proposal stays unchanged

#### Scenario: Second casualty proposal rejected

- GIVEN a pending casualty proposal
- WHEN the other (or the same) coach proposes again
- THEN it returns 409 and the proposal stays unchanged

#### Scenario: Direct casualty is self-inflicted only (RAU-39)

- GIVEN away's turn active
- WHEN the home coach records a direct `casualty` on a home player with cause `dodge` or `crowd` and a 1D16 roll
- THEN it returns 200, the band derives server-side, and the casualty persists with NO confirmation and NO causer

#### Scenario: Direct casualty with a caused cause or an opponent victim rejected

- GIVEN any live match
- WHEN a direct `casualty` command uses a causer-required cause (blitz/foul/penetration/block) OR a victim on the OPPONENT's side OR carries a causer
- THEN it returns 409 with no mutation

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

#### Scenario: Proposal causer must be on the proposer's side

- GIVEN a home `proposeCasualty` whose causer resolves to an AWAY player (the victim's side)
- WHEN the command reaches the route
- THEN it returns 409 and no proposal persists

#### Scenario: Proposal victim must be on the opposite side

- GIVEN a home `proposeCasualty` whose victim resolves to a HOME player
- WHEN the command reaches the route
- THEN it returns 409 and no proposal persists

#### Scenario: Invalid rolls rejected

- GIVEN a `proposeCasualty` or direct `casualty` whose 1D16 is outside 1..16 (or a 1D6 outside 1..6 when present)
- WHEN the command reaches the route
- THEN it returns 409 with no mutation

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

`LiveEventKind` MUST add `completion`, `mvp`, `expensive_mistake`, and `fan_factor`. Because `LiveEvent.kind` is TEXT, no DB migration is required. A `completion` event MUST be recorded only via an active-coach live command and MUST carry ★1 SPP. An `mvp` event MUST be written only by the result route; it MUST NOT be a `LiveCommand` and MUST NOT be accepted by `resolveEventPermission`. The kickoff kinds (`expensive_mistake`, `fan_factor`) MUST be written only by the begin transition (LM-21); they MUST NOT be accepted as control commands.
(Previously: the union gained only `completion` and `mvp`.)

#### Scenario: Kinds extend without migration

- GIVEN the TEXT `LiveEvent.kind`
- WHEN the union gains `completion`, `mvp`, `expensive_mistake`, and `fan_factor`
- THEN no migration runs and all four kinds persist as TEXT

#### Scenario: MVP is not a live command

- GIVEN a control POST with `type: "mvp"`
- WHEN it reaches the live route
- THEN it is rejected with no mutation and no event persists

#### Scenario: Kickoff kinds are not live commands

- GIVEN a control POST with `type: "expensive_mistake"` or `type: "fan_factor"`
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

The history feed DTOs (`toEventDtos` and `serializeLive`) MUST include only `start|td|completion|casualty|foul|endHalf|endMatch|mvp|expensive_mistake|fan_factor|concede`. `turn`, `turnStart`, and `requestTurn` MUST remain persisted in the DB for audit/replay and MUST stay live-only (nudge banner); they MUST NOT appear in any feed DTO.
(Previously: the display surface was the 8 kinds `start|td|completion|casualty|foul|endHalf|endMatch|mvp`.)
(Previously: 10 kinds — the concession event (RAU-38) joined the display surface.)

#### Scenario: Feed carries display kinds only

- GIVEN a persisted history containing all 14 kinds
- WHEN a snapshot or fixture DTO is produced
- THEN exactly the 11 display kinds appear and no turn rows do

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

The live UI MUST render a floating "+" button that opens an event-type menu and a mini-form for recording live events. The menu items MUST be derived from the viewer-side DTO (`viewerSide`) against the LM-12 matrix: the ACTIVE coach MUST be able to record TD, Pase completo, Baja/Herida, and Falta via a mini-form with a player select from their own roster. The Falta form MUST additionally capture the victim (select from the OPPONENT roster) and submit `victimRosterId`. The Baja/Herida form follows the RAU-39 TWO-PHASE flow: the ACTIVE coach fills the PROPOSAL — causer (their OWN roster), victim (the OPPONENT roster), a causer-required cause (`blitz|foul|penetration|block`), and the 1D16 roll (with the 1D6 attribute roll shown LIVE when the derived band is permanent) — and submits `proposeCasualty`; there is NO band select, the client only MIRRORS `resolveInjury` to show the derived band (the server is authoritative). The NON-ACTIVE coach's mini-form records ONLY a SELF-INFLICTED (dodge/crowd) casualty to their OWN player (roll16, band derived, no causer, no confirmation), and the pending proposal is CONFIRMED in the match-header turn zone (not in the FAB). A spectator member or an admin without a side MUST NOT see any event controls. The submitted command MUST pass through the server permission matrix — the server remains the authority and any bypass MUST return 409; a recorded event MUST appear in the Design-A feed.
(Previously: the foul form captured only the aggressor and the casualty form captured only the band.)
(Previously: the casualty victim was always the viewer's OWN roster and the causer always the OPPONENT roster, so the ACTIVE coach could not record an injury they inflicted on a rival player.)
(Previously: both coaches recorded casualties directly with a client-chosen band.)

#### Scenario: Active coach opens the menu

- GIVEN a live match and the ACTIVE coach
- WHEN they open the "+" menu
- THEN they can record TD, Pase completo, Baja/Herida, or Falta via the mini-form (player select from their roster)

#### Scenario: Non-active coach restricted to Herida

- GIVEN a live match and the NON-active coach
- WHEN they open the "+" menu
- THEN only Herida (self-inflicted dodge/crowd casualty to their own player) is offered; recording any other kind returns 409 per the LM-12 matrix

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

#### Scenario: Active coach proposes a casualty they inflicted (RAU-39)

- GIVEN the ACTIVE coach opens the Baja/Herida form
- WHEN they pick the causer from their OWN roster, the victim from the OPPONENT roster, a causer-required cause, and the 1D16 roll (plus the 1D6 when the derived band is permanent)
- THEN the `proposeCasualty` command carries `victimRosterId`, `causerRosterId`, `cause`, `roll16` (and `roll6` when permanent) with NO band, and the feed shows the pending confirmation panel

#### Scenario: Defender confirms in the turn zone (RAU-39)

- GIVEN a pending casualty proposal and the NON-active coach
- WHEN the defender's match-header turn zone shows "El rival registra una baja" with the derived details and they click Confirmar
- THEN the `confirmCasualty` command fires and the casualty event (band derived server-side) persists

#### Scenario: Non-active coach records a self-inflicted casualty (RAU-39)

- GIVEN the NON-active coach opens the Baja/Herida form
- WHEN they pick the victim from their OWN roster, cause `dodge` or `crowd`, and the 1D16 roll
- THEN the casualty command carries `side` = their own side plus `victimRosterId`, `cause`, `roll16` (no band, no causer), and the feed card shows the derived band

### Requirement: LM-21 · Kickoff Event Generation

The begin transition MUST generate, BEFORE `start`/`turnStart` and at minute 0' (`at = now`), one `expensive_mistake` per team (side home/away) followed by one centered `fan_factor` (side null), in the seq order: `expensive_mistake(home)`, `expensive_mistake(away)`, `fan_factor`, `start`, `turnStart`. Every kickoff die MUST be rolled server-side (`lib/random.ts`); the begin command MUST NOT accept or trust client-supplied rolls. A retried begin MUST NOT re-roll or re-persist kickoff events: the optimistic `seq` guard MUST return 409, and the treasury MUST NOT be deducted twice.

#### Scenario: Kickoff rows precede start

- GIVEN a `ready` match
- WHEN begin commits
- THEN the persisted events order by seq is expensive_mistake(home), expensive_mistake(away), fan_factor, start, turnStart, all sharing the same `at` (lib/liveMatch.test.ts)

#### Scenario: Server owns the dice

- GIVEN a begin POST that carries fabricated roll values
- WHEN it commits
- THEN the payload rolls derive from the server's `rollD6` and the supplied values are ignored

#### Scenario: Begin retry is idempotent

- GIVEN a live match already begun
- WHEN a second begin POST arrives
- THEN it returns 409, no new kickoff events persist, and the treasury is unchanged (e2e live-match.spec.ts)

### Requirement: LM-22 · Fan Factor Roll

The fan-factor event MUST roll one D6 per team and map 1-2→1, 3-4→2, 5-6→3. The payload MUST be `{home:{base,dice,total}, away:{base,dice,total}}`: `base` is the team's fan-factor stat, which in this codebase is the persisted `coaching.dedicatedFans` characteristic (no separate FF column; `preMatchFanFactor` precedent in `lib/rules/fanFactor.ts`), `dice` the mapped D3, and `total = base + dice`. The event MUST carry `side: null`.

#### Scenario: Totals from FF base plus mapped dice

- GIVEN home dedicated fans 2, away dedicated fans 1, and server rolls 3 and 6
- WHEN the event is generated
- THEN the payload reads home {base:2,dice:2,total:4} and away {base:1,dice:3,total:4} (lib/liveMatch.test.ts)

#### Scenario: D6-to-D3 bounds

- GIVEN rolls 1..6
- WHEN each maps
- THEN 1-2→1, 3-4→2, 5-6→3, never 0 or above 3

### Requirement: LM-23 · Expensive Mistake Resolution

For each team the begin transition MUST roll 1D6 and resolve against the treasury-bracket matrix: 100k–195k | 200k–295k | 300k–395k | 400k–495k | 500k–595k | 600k+; a treasury below 100k MUST NOT generate an expensive_mistake event (no roll, no row, no treasury update, RAU-33). The roll→outcome matrix MUST be exactly (rows 1D6 roll, columns treasury bracket): roll 1 → menor | menor | grave | grave | catástrofe | catástrofe; roll 2 → evitada | menor | menor | grave | grave | catástrofe; roll 3 → evitada | evitada | menor | menor | grave | grave; roll 4 → evitada | evitada | evitada | menor | menor | grave; roll 5 → evitada | evitada | evitada | evitada | menor | menor; roll 6 → evitada | evitada | evitada | evitada | evitada | menor. Outcomes: Crisis evitada (−0 gp), Incidente menor (−1D3×10k), Incidente grave (−half the treasury rounded DOWN to the nearest 5k), Catástrofe (treasury reduced to the kept 2D6×10k). The treasury mutation MUST commit in the SAME transaction as the event rows; a failure MUST roll back both. The payload MUST carry `{side, roll, bracket, outcome, amountLost, treasuryBefore, treasuryAfter}` with `bracket` one of `100k-195k|200k-295k|300k-395k|400k-495k|500k-595k|600k+` and `outcome` one of `crisis-evaded|minor-incident|serious-incident|catastrophe`.

#### Scenario: Minor incident deducts 1D3×10k

- GIVEN treasury 234.000 and a minor-incident roll with D3 2
- WHEN the transition runs
- THEN amountLost is 20.000, the payload reads treasuryBefore 234.000 → treasuryAfter 214.000, and the team row commits in the same transaction (lib/liveMatch.test.ts)

#### Scenario: Serious incident rounds down to 5k

- GIVEN treasury 334.000 (300k–395k bracket, roll 1 → serious) 
- WHEN resolved
- THEN amountLost is 165.000 (half rounded DOWN to the nearest 5k) and treasuryAfter is 169.000

#### Scenario: Catastrophe keeps 2D6×10k

- GIVEN treasury 500.000 (500k–595k bracket, roll 1 → catastrophe) and keep rolls 4 + 6
- WHEN resolved
- THEN amountLost is 400.000 and treasuryAfter is 100.000

#### Scenario: Sub-100k treasury skips the expensive-mistake roll

- GIVEN treasury 80.000 and a minor-incident roll
- WHEN the transition runs
- THEN no expensive_mistake event is emitted, no row persists, no treasury update commits, and the team's treasury stays 80.000 (RAU-33)

#### Scenario: Atomicity with event persistence

- GIVEN a begin whose treasury update fails mid-transaction
- WHEN the store commits
- THEN no kickoff event rows persist and the treasury is unchanged

### Requirement: LM-24 · Kickoff Feed Rendering Data

`isDisplayEvent` and `TEAM_EVENT_KINDS` MUST include `expensive_mistake` (team card). Labels MUST map `expensive_mistake` → "Error costoso" and `fan_factor` → "Factor de aficionados"; glyphs MUST be the money-bag for `expensive_mistake` and dice for `fan_factor` (inline glyphs, rulebook-light MV-7). Outcome labels MUST map `crisis-evaded|minor-incident|serious-incident|catastrophe` → "Crisis evitada" | "Incidente menor" | "Incidente grave" | "Catástrofe". The expensive-mistake card MUST render the treasury before → after ("234.000 → 214.000 M.O.", es-ES dot-thousands plus "M.O."). The fan-factor centered row MUST render per team the compact form with a people glyph before the base and a dice glyph before the roll, e.g. `Local: 👥2 + 🎲2 = 4 · Visitante: 👥1 + 🎲3 = 4`. Events missing treasury fields MUST render the fallback row without the line and never throw.

#### Scenario: Labels and glyphs

- GIVEN one `expensive_mistake` and one `fan_factor` event
- WHEN the label and glyph maps run
- THEN they render "Error costoso"/💰 and "Factor de aficionados"/🎲 (liveEventCards.test.tsx)

#### Scenario: Treasury before to after

- GIVEN payload {treasuryBefore:234000, treasuryAfter:214000}
- WHEN the expensive-mistake row renders
- THEN it shows "234.000 → 214.000 M.O."

#### Scenario: Missing payload falls back

- GIVEN an `expensive_mistake` event without treasury fields
- WHEN the row renders
- THEN it shows the label with no treasury line and no error

### Requirement: LM-25 · Concession

A coach MAY propose to concede while the match is LIVE; the proposal persists on the LiveMatch row (`concedeProposedBy` = the proposing side, additive column). The rival MAY accept or decline: an ACCEPT finishes the match immediately — the ACCEPTOR's team is recorded as the fixture winner with walkover-style 2-0 scores (forfeit precedent), the fixture closes as played (a later result load MUST 409), and a `concede` feed event (`side` = the SURRENDERING side, payload `{ winnerSide }`) persists ATOMICALLY with the victory in the SAME transaction. A concession is NOT a played match: NO winnings, PE, or fan-factor effects are computed (documented choice). A DECLINE clears the proposal and the match continues untouched. Only fixture coaches MAY propose/respond (the control gate 403s a spectator member per LM-2; the side-less league admin is rejected with 409); the PROPOSER MUST NOT respond to their own proposal; a retried propose from the SAME side is an idempotent no-op. The concede event MUST render as a centered 100% card labeled "Concesión" with the "{surrendering team} se rinde · Victoria de {acceptor team}" sub-line (match-view MVT-1).

#### Scenario: Propose only while live

- GIVEN a live match with no pending proposal
- WHEN a coach proposes to concede
- THEN `concedeProposedBy` persists as that side, no event persists, and the match keeps running

#### Scenario: Double-propose by the other side rejected

- GIVEN a pending concession proposal
- WHEN the OTHER coach proposes to concede
- THEN it returns 409 and the proposal stays unchanged

#### Scenario: Proposal retry is idempotent

- GIVEN a pending concession proposal
- WHEN the SAME side retries the propose
- THEN it is a no-op returning the current view with no duplicate state

#### Scenario: Accept finishes with victory to the acceptor

- GIVEN a pending concession proposal
- WHEN the NON-proposer accepts
- THEN the match becomes finished, the fixture records the ACCEPTOR's team as winner (walkover scores, played), the `concede` event (side = the surrendering side) and the victory commit in the SAME transaction, and a later result load returns 409

#### Scenario: Decline clears and the match continues

- GIVEN a pending concession proposal
- WHEN the NON-proposer declines
- THEN `concedeProposedBy` clears, the match stays live, and no event persists

#### Scenario: Non-live or no-proposal commands rejected

- GIVEN a finished match or one with no pending proposal
- WHEN a concede propose or respond command arrives
- THEN it returns 409 with no mutation

#### Scenario: Spectator and admin denied

- GIVEN a spectator member or the league admin (no side)
- WHEN they propose or respond to a concession
- THEN the spectator member is 403'd by the control gate (LM-2) and the side-less admin gets 409, with no state changes

#### Scenario: Proposer cannot respond to their own proposal

- GIVEN a pending concession proposal
- WHEN the PROPOSER tries to accept or decline it
- THEN it returns 409 and the proposal stays unchanged

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
