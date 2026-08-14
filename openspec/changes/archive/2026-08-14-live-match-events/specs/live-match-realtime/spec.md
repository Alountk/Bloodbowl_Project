# Delta for live-match-realtime

## ADDED Requirements

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

The live UI MUST render a floating "+" button that opens an event-type menu and a mini-form for recording live events. The menu items MUST be derived from the viewer-side DTO (`viewerSide`) against the LM-12 matrix: the ACTIVE coach MUST be able to record TD, Pase completo, Baja/Herida, and Falta via a mini-form with a player select from their own roster and a band select for casualty/injury; the NON-ACTIVE coach MUST be offered ONLY Herida (casualty to their OWN player). A spectator member or an admin without a side MUST NOT see any event controls. The submitted command MUST pass through the server permission matrix — the server remains the authority and any bypass MUST return 409; a recorded event MUST appear in the Design-A feed.

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

## MODIFIED Requirements

### Requirement: LM-6 · Event Persistence and Sequence

Every TD, completion, casualty (with injury band), foul, end-of-half, and end-of-match MUST persist a `LiveEvent` row with monotonic `seq` and a JSON payload; the database MUST be the source of truth and an in-memory hub MUST fan out behind a narrow interface. Catch-up by `seq` MUST never be stale.
(Previously: completion events did not exist — only TD, casualty, foul, and half/match boundary kinds persisted.)

#### Scenario: Event recorded with sequence

- GIVEN a TD or a completion occurs
- WHEN the control POST commits
- THEN a LiveEvent with the next seq, kind, scorer, and payload is persisted

#### Scenario: Catch-up returns missing events only

- GIVEN a subscriber at seq N
- WHEN they request catch-up after N
- THEN exactly the events with seq > N arrive, in seq order

### Requirement: LM-12 · Turn-Phase Event Permissions

Event commands MUST be side-gated against `activeSide`: the ACTIVE coach MUST be allowed to record TDs, fouls, casualties, completions, and pass-turn; the NON-ACTIVE coach MUST be allowed ONLY to record a casualty to one of their OWN players. Any other non-active event command MUST return 409 with no mutation; spectator members 403 and foreign users 404 (per LM-2). The live DTO MUST expose the viewer's side so the client renders the correct controls.
(Previously: the active-coach kind list covered TDs, fouls, casualties, and pass-turn only.)

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
