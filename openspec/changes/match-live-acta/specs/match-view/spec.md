# Delta for match-view

## ADDED Requirements

### Requirement: MVA-1 · Acta en Vivo Sheet on the V2 Flag

The V2 match view (feature flags `useUiFlag` / `bb-ui`) MUST render the Acta en Vivo sheet (design `design/match-report-redesign/08-acta-en-vivo.html`, motion from `09-acta-en-vivo-animada.html`) as the single live-capture and derived-report surface. The V1 view MUST remain unchanged. League, round, team names and score MUST come from data (`league.name`, e.g. "LIGA NUFFLE CRUAB") — never hardcoded in components.

#### Scenario: V2 renders the sheet, V1 unchanged

- GIVEN the `bb-ui` flag set to v2
- WHEN the match detail renders
- THEN the Acta en Vivo sheet renders and the v1 surface is untouched

#### Scenario: League name from data

- GIVEN a league named "Liga Nuffle CRUAB"
- WHEN the sheet renders
- THEN its status line shows "LIGA NUFFLE CRUAB"

### Requirement: MVA-2 · Scoreboard Header and Match Status

The sheet MUST show a fixed top bar with the running score, and a subheader with per-team RR/bribes/score, weather + referee line and a status chip; the live indicator MUST reflect match state.

#### Scenario: Score reflects live state

- GIVEN a live match at 2-1 in turn 6
- WHEN the sheet renders
- THEN the top bar shows the 2-1 score and the turn badge shows "TURNO 6 EN JUEGO"

### Requirement: MVA-3 · Turn Stepper and Turn Timeline

The sheet MUST show a horizontal turn stepper (T1-T8) with done, casualty-marked, active and upcoming states, and a timeline of per-turn cards (EN JUEGO / COMPLETADO / CERRADO) whose event rows show player, kind badge, description and SPP marker.

#### Scenario: Turn cards ordered with states

- GIVEN turns 1-4 closed, turn 5 completed with a casualty and turn 6 active
- WHEN the timeline renders
- THEN cards render in order with their state chips and the active turn card highlights its events

### Requirement: MVA-4 · Pending Injury-Roll Callout (BB2025 D16)

A casualty awaiting its injury roll MUST render a callout with the BB2025 D16 severity bands (1-8 Magullado, 9-10 Apaleado, 11-12 Grave, 13-14 Permanente, 15-16 Muerto) and a single roll action; rolling MUST resolve the pending roll through the existing pending-roll model.

#### Scenario: Pending casualty shows the callout

- GIVEN a casualty whose armor broke and the injury roll is pending
- WHEN the turn card renders
- THEN the callout shows the severity band table and the roll action

#### Scenario: Roll action only where the command is accepted

- GIVEN a pending injury roll and a viewer
- WHEN the turn card renders
- THEN the roll action renders only when the server's turn-phase permissions (LM-12) would accept that viewer's command in the current turn window — never a button whose command would 409 (e.g. a caused casualty hides the action from the victim's coach, who may only record self-inflicted dodge/crowd casualties)

### Requirement: MVA-5 · Quick-Capture Dock

A fixed bottom dock MUST expose +TD, +Pase, +Baja, +Evento and Fin Turno (high-contrast red); each action MUST record a live event for the recording coach's team on the active turn, and the server MUST keep enforcing turn-phase event permissions (LM-12).

#### Scenario: Capture records an event

- GIVEN an active turn for the recording coach's team
- WHEN the coach taps "+ TD"
- THEN a touchdown event is recorded on the active turn and appears in the timeline

### Requirement: MVA-6 · Motion Layer with Reduced-Motion Fallback

The animada design's animations (fadeInUp, pulseGlow, badgePulse, diceShake, rowHighlightFlash, floatUpFade) MUST apply to sheet elements, and MUST all be disabled under `prefers-reduced-motion: reduce`.

#### Scenario: Reduced motion disables animations

- GIVEN a user agent requesting reduced motion
- WHEN the sheet renders
- THEN no entrance/glow/shake/flash animation runs

## REMOVED Requirements

### Requirement: MVT-1 · rulebook Event Cards

(Superseded by MVA-3 · Turn Stepper and Turn Timeline.)

### Requirement: MVT-2 · Timeline Bar in the Sticky Header

(Superseded by MVA-2 / MVA-3.)

### Requirement: MVT-3 · rulebook Sticky Header (Concept B)

(Superseded by MVA-2 · Scoreboard Header and Match Status.)

### Requirement: MVT-4 · Finished-Feed Summary Rows

(Superseded by MVA-3 · Turn Timeline.)

### Requirement: MVT-6 · Kickoff Event Rows

(Superseded by MVA-2 status line and MVA-3 event rows.)

### Requirement: MVT-7 · Footer Pass-Turn Control and Reason Sheet

(Superseded by MVA-5 · Quick-Capture Dock, "Fin Turno" action.)
