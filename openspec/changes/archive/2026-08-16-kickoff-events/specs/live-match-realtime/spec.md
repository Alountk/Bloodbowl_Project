# Delta for live-match-realtime

## MODIFIED Requirements

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

### Requirement: LM-16 · Server-Side Feed Filtering

The history feed DTOs (`toEventDtos` and `serializeLive`) MUST include only `start|td|completion|casualty|foul|endHalf|endMatch|mvp|expensive_mistake|fan_factor`. `turn`, `turnStart`, and `requestTurn` MUST remain persisted in the DB for audit/replay and MUST stay live-only (nudge banner); they MUST NOT appear in any feed DTO.
(Previously: the display surface was the 8 kinds `start|td|completion|casualty|foul|endHalf|endMatch|mvp`.)

#### Scenario: Feed carries display kinds only

- GIVEN a persisted history containing all 13 kinds
- WHEN a snapshot or fixture DTO is produced
- THEN exactly the 10 display kinds appear and no turn rows do

#### Scenario: Turn rows stay for audit

- GIVEN the same history
- WHEN the DB rows are inspected
- THEN the `turn`, `turnStart`, and `requestTurn` rows remain unchanged

#### Scenario: Nudge banner stays live-only

- GIVEN an active match
- WHEN a `turnStart` or `requestTurn` arrives
- THEN the live nudge shows it while the history feed does not

## ADDED Requirements

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
