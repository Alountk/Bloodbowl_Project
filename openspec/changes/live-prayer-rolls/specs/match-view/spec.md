# Delta for match-view

## ADDED Requirements

### Requirement: MVT-12 · Ready-Phase Prayer Roll Capture and activePrayers Threading

The ready-phase `InducementPurchasePanel` MUST render a «Plegarias a Nuffle» block ONLY when the side's persisted cart contains `prayers-to-nuffle` with count > 0. The block MUST accept ONE manual 1D16 face per roll (integer input, faces 1-16 — coaches roll physical dice; manual entry is the T29 parity baseline) and commit via «Aceptar» through the live `recordPrayerRolls` command (LM-33). Copy MUST be Spanish, keys under `match.prayers.*` in `lib/i18n/dictionaries.ts`, mobile-first at 390px, rulebook-light tokens only (no new colors/shadows). Validation failures MUST surface inline, never as silent drops: out-of-range/non-integer, duplicate face, rolls beyond the purchased count, and the once-rolled lock each get their own message (server 409 remains authoritative — AGENTS rule 3). On success the block MUST reveal the granted blessings by MIRRORING the demo's reveal (the T30 `actaPreMatchWizard` behaviour, the parity authority): verbatim name + effect for every face `resolvePrayerRoll` models, a «+ SPP» chip on the id-bearing faces (10-13), the «Efecto en mesa» note on modeled non-id faces, and the honest unmodeled-face note when `resolvePrayerRoll` returns null. Then the block MUST switch to a locked state once the purchased count is reached (inputs disabled, «Tirada registrada»); until then each accept records the next face through the LM-33 extension rule.

Every production `eventSpp` / `casualtySpp` / `provisionalCasualtySpp` call site MUST receive the correct side's `ActivePrayers` derived via `matchActivePrayersFromRolls` (LM-34) from the live view: `MatchView`, `WatchMatchView`, `MatchViewV2`, and `liveEventCards` (which resolves the earner side the same way the demo timeline does — `actaTurnTimeline.tsx:500`). No production call may remain single-argument.

#### Scenario: Block appears only with purchased prayers

- GIVEN a ready match whose cart for the side has no `prayers-to-nuffle` (or count 0)
- WHEN the panel renders
- THEN no prayer block is shown; with count > 0 the block shows with the remaining rolls to record

#### Scenario: Valid face commits and reveals

- GIVEN the block with one roll left to record
- WHEN the coach enters 11 and presses «Aceptar»
- THEN `recordPrayerRolls` posts `{side, rolls}`, on 200 the blessing for face 11 renders verbatim (name + effect), and the inputs lock

#### Scenario: Invalid input surfaces an inline error

- GIVEN the same block
- WHEN the coach enters 17 (or a duplicate of an already recorded face)
- THEN an inline Spanish error names the problem, no request commits the invalid state, and the entered value stays editable

#### Scenario: Call sites pass per-side prayers

- GIVEN a recorded prayer roll of 10 (`perfect-pass`) on the home side
- WHEN a home completion event renders in MatchView, WatchMatchView, and MatchViewV2
- THEN the event's SPP shows the `perfect-pass` exception value, proving `activePrayers` reached `eventSpp`
