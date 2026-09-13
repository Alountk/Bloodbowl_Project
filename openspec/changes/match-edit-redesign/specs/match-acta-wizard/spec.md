# match-acta-wizard Specification

## Purpose

The 7-step "Acta del partido" wizard capturing a match result through Contexto → Marcador → Acciones → MVP → Bajas → Final → Revisar, with a single entry point on `MatchCard`, server-computed winnings, and correct-mode prefill.

## Requirements

### Requirement: MAW-1 · Single Entry Point with Preserved Guards

`MatchCard` MUST expose ONE primary action "Acta del partido". The secondary/destructive actions (Otorgar victoria por incomparecencia, Corregir resultado, Reset) MUST move into a `···` overflow menu. EVERY existing visibility guard MUST be preserved: result load only for participant/admin on a scheduled, non-live, non-finished-league fixture; correct only when played and league not finished; forfeit admin-only; reset owner/`live.manage` with the live match not finished; `leagueFinished` hides everything; live-active hides result load.

#### Scenario: Primary action only on scheduled fixture

- GIVEN a scheduled, non-live, non-finished fixture and a participant/admin viewer
- WHEN the card renders
- THEN exactly one primary "Acta del partido" action is visible

#### Scenario: Destructive actions gated in overflow

- GIVEN a played fixture in an unfinished league for a participant viewer
- WHEN the `···` overflow opens
- THEN "Corregir resultado" is visible but "Otorgar victoria" (admin-only) and "Reset" (owner/live.manage) are hidden

### Requirement: MAW-2 · Step 0 Contexto

The wizard MUST capture: editable weather, match duration/end, per-team Factor Fan (the FINAL FF value entered directly by the user), inducements spent per team, and a per-team "NUNCA tuvo el balón" checkbox (mapped `heldBall = !neverHeld`).

#### Scenario: Contexto captured

- GIVEN the wizard is on Step 0
- WHEN the user fills weather, duration, both FFs, inducements, and the never-held checkbox
- THEN all values are captured into the payload

### Requirement: MAW-3 · Step 1 Marcador

The wizard MUST capture the final score per team.

#### Scenario: Score captured

- GIVEN the wizard is on Step 1
- WHEN the user enters home and away scores
- THEN both scores are captured

### Requirement: MAW-4 · Step 2 Acciones

The wizard MUST capture free-form lines of player + action type + quantity. Casualties caused here MUST automatically feed Step 4 (Bajas).

#### Scenario: Casualties derived from actions

- GIVEN the user enters two casualty actions for a player in Step 2
- WHEN the wizard advances to Step 4
- THEN those casualties appear in the derived list

### Requirement: MAW-5 · Step 3 MVP

The wizard MUST provide DIRECT selection of exactly one MVP per team. The random-MVP mode is OUT of scope. An MVP MUST receive ★4 PE.

#### Scenario: One MVP per team

- GIVEN the wizard is on Step 3
- WHEN the user selects one MVP per team
- THEN the selection is captured and the MVP is due ★4 PE

### Requirement: MAW-6 · Step 4 Bajas

Casualties MUST be derived automatically from Step 2 and displayed as a list. The ONLY manual inputs are the injury roll (1D16) and, when the injury band is "Permanente", an additional 1D6 roll.

#### Scenario: Permanent roll shown only for Permanente

- GIVEN a casualty whose 1D16 band is Permanente
- WHEN the user rolls the injury
- THEN an additional 1D6 permanent-attribute roll is required

### Requirement: MAW-7 · Step 5 Final

Winnings MUST be computed server-side and rendered READ-ONLY with the breakdown visible. The ONLY input is the fan-factor 1D6 roll per team, from which the fan delta (fans won/lost) MUST be derived server-side.

#### Scenario: Read-only winnings

- GIVEN the wizard is on Step 5
- WHEN winnings are shown
- THEN they are read-only with a visible breakdown and no client amount input

### Requirement: MAW-8 · Step 6 Revisar

The wizard MUST render a summary and validations. Saving MUST be blocked unless Σ anotaciones == marcador and both MVPs are selected.

#### Scenario: Save blocked on invalid state

- GIVEN Σ anotaciones ≠ marcador or an MVP is missing
- WHEN the user attempts to save
- THEN saving is blocked with a visible error

#### Scenario: Save allowed on valid state

- GIVEN Σ anotaciones == marcador and both MVPs are selected
- WHEN the user saves
- THEN the result is submitted

### Requirement: MAW-9 · Correct-Mode Prefill

Correcting an existing result MUST open the wizard FULLY PREFILLED from the persisted snapshot. Legacy rows without the extended snapshot MAY open partially prefilled.

#### Scenario: Full prefill

- GIVEN a played result with the extended snapshot
- WHEN the wizard opens in correct mode
- THEN every step is prefilled from the snapshot
