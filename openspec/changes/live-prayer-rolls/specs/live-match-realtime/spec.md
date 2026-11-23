# Delta for live-match-realtime

## ADDED Requirements

### Requirement: LM-33 · Record Prayer Rolls Command

The live route MUST accept `{ type: "recordPrayerRolls"; side: "home" | "away"; rolls: number[] }` from the fixture coach OF THAT SIDE while the match is `ready` (LM-11), and MUST return 409 in any other status. The control gate MUST apply unchanged (LM-2: spectator 403, foreign coach 404). The command MUST be seq-guarded (bump-or-409, LM-6) and MUST apply replace-per-side semantics for that side's rolls only. Server-side validation MUST reject (409, no mutation): any roll that is not an integer 1-16; duplicate rolls (the rulebook re-rolls repeats, so a duplicate never persists); `rolls.length` greater than the side's purchased `prayers-to-nuffle` count in the current cart; an empty `rolls` array; and any record that does not strictly EXTEND the side's already-recorded rolls — `rolls` must begin with the recorded array as an exact prefix and be strictly longer (an already-recorded face is never re-rolled: S7-6 «una vez tirado los dados, ya no se puede volver a tirar» applies per face, while further purchases keep being recordable). An identical resubmission, or any mutation/removal of a recorded face, MUST fail with the lock error. The 409 body MUST distinguish the failure class with these exact `error` strings so the UI can render a specific message: `"Invalid prayer roll"` (non-integer or outside 1-16; also empty array), `"Duplicate prayer roll"`, `"Rolls exceed purchased prayers"` (including count 0), `"Prayer rolls already recorded"`. Rolls MUST persist to the additive `LiveMatch.prayerRolls Json?` column, shaped `{ home: number[], away: number[] } | null` (row-scoped like `inducements`/`winnings`). `purchaseInducements` (LM-30) MUST align rolls on cart replace: when the replaced cart's `prayers-to-nuffle` count for that side is 0, or is below the side's recorded roll count, the side's rolls MUST be cleared (releasing the lock); otherwise the recorded rolls MUST be kept.

#### Scenario: Own-side coach records rolls in ready

- GIVEN a `ready` match and the fixture coach of the side with purchased `prayers-to-nuffle` count ≥ 2
- WHEN they POST `recordPrayerRolls` with two distinct valid faces
- THEN it returns 200, the side's rolls persist on `LiveMatch.prayerRolls`, and every subscriber's stream receives the new state

#### Scenario: Invalid faces and duplicates rejected

- GIVEN a `ready` match with a valid cart
- WHEN the command carries a face outside 1-16, a non-integer, or a duplicate face
- THEN it returns 409 and no roll persists (no seq bump)

#### Scenario: Rolls beyond the purchased count rejected

- GIVEN a side that bought `prayers-to-nuffle` ×1
- WHEN the coach submits two rolls
- THEN it returns 409 and no roll persists

#### Scenario: Recorded faces are never re-rolled (extension-only lock)

- GIVEN a side with purchased count 2 and recorded rolls `[7]`
- WHEN the coach submits `[7]` again, `[9]` (mutating the recorded face), or a shorter array
- THEN it returns 409 (`Prayer rolls already recorded`) and the stored rolls are unchanged; when they submit `[7, 12]` (a strict extension with distinct faces) it returns 200 and both faces persist

#### Scenario: Cart replace clears or keeps rolls

- GIVEN a side with recorded rolls
- WHEN `purchaseInducements` replaces the cart so that `prayers-to-nuffle` becomes 0 or drops below the recorded count
- THEN that side's rolls are cleared (lock released); with an unchanged-or-higher count the rolls are kept

#### Scenario: Role and status gates unchanged

- GIVEN a match in any status other than `ready`, or a spectator/foreign coach submitting the command
- THEN the status gate returns 409, the spectator 403, the foreign coach 404, and no mutation occurs

### Requirement: LM-34 · Prayer Rolls Exposure and Derivation

The live-state DTO served by GET, and the SSE snapshot/hub publish (LM-8), MUST expose `prayerRolls` as `{ home: number[], away: number[] } | null` (`null` when nothing was recorded) — parity with how the `inducements` cart is exposed. A client-safe helper in `lib/rules/inducements.ts` MUST derive `MatchActivePrayers` from stored rolls: `matchActivePrayersFromRolls(rolls)` returns `{ home, away }` where each side is `activePrayersFromRolls` of its faces (id-bearing rows 10-13 only, deduped, table order) — the single derivation every production consumer uses, never inline re-derivations.

#### Scenario: DTO and SSE carry the field

- GIVEN a match with one side's rolls recorded
- WHEN a client reads the live GET view or receives an SSE frame
- THEN `prayerRolls` carries the exact persisted faces for both sides (the untouched side's array empty)

#### Scenario: Helper derives the active sets

- GIVEN rolls `{ home: [12, 3], away: [13, 13] }` (hypothetical input, pre-validation)
- WHEN `matchActivePrayersFromRolls` runs
- THEN `home` is `["crowd-support"]` and `away` is `["foul-and-frenzy"]` (deduped, table order; faces without ids contribute nothing)
