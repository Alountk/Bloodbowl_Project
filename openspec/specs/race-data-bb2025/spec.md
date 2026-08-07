# race-data-bb2025 Specification

## Purpose

Define the data and structure requirements for the Blood Bowl 2025 races (30 team lists discovered from the rulebook, ~144 positionals), their positionals, stats, skills, skill-access, and reroll costs.

## Requirements

### Requirement: REQ-RACE-01: BB2025 Verified Data Precondition

The system MUST use a verified BB2025 stat reference table as the source of truth for all data updates before any code modification begins.

#### Scenario: Verify Reference Data Availability
- GIVEN a developer is about to begin data migration
- WHEN the BB2025 stat reference table is provided and verified
- THEN the implementation phase can proceed

### Requirement: REQ-RACE-02: Controlled Identifier Delta for BB2025

The system MUST treat the verified BB2025 roster composition as authoritative over prior key inventory.

The migration MUST allow only this explicit and finite identifier delta:

- remove race `high-elf`
- add race `bretonnian`
- remove positionals: `chaos-chosen.beastman-runner`, `chaos-renegade.renegade-beastman`, `tomb-kings.bone-giant`, `vampire.vampire`
- add positionals: `chaos-renegade.renegade-minotaur`, `chaos-renegade.renegade-rat-ogre`, `vampire.vampire-runner`, `vampire.vampire-thrower`, `vampire.vampire-blitzer`, `vampire.vargheist`

All other pre-existing `race.id` and `positional.key` values MUST remain unchanged.

#### Scenario: Apply Only Approved Identifier Changes
- GIVEN the pre-migration key inventory and the verified BB2025 source
- WHEN the migration updates roster composition
- THEN only the listed removals and additions are permitted
- AND no other `race.id` or `positional.key` change is allowed

#### Scenario: Preserve Unlisted Keys
- GIVEN any race or positional key not listed in the approved delta
- WHEN migration is complete
- THEN that key MUST be unchanged from pre-migration values

### Requirement: REQ-RACE-03: Rule Version Metadata

The system MUST expose the current ruleset version as "BB2025".

#### Scenario: Rule Version Check
- GIVEN the application metadata
- WHEN the `RULES_METADATA.version` is queried
- THEN it MUST return "BB2025"

### Requirement: REQ-RACE-04: Accurate Positional Stats and Costs

The system MUST update all positional stats (MA, ST, AG, PA, AV), player costs, skills, and team reroll costs to match the verified BB2025 reference table exactly.

#### Scenario: Validate Updated Stats
- GIVEN a positional player
- WHEN checking its stats and cost
- THEN they MUST exactly match the BB2025 reference table

#### Scenario: Validate Reroll Costs
- GIVEN a team roster
- WHEN checking the team reroll cost
- THEN it MUST exactly match the BB2025 reference table

### Requirement: REQ-RACE-05: Test Fixture Synchronization

The system MUST update all test fixtures involving team/player stats, costs, and version metadata to match the new BB2025 data, ensuring all tests pass.

#### Scenario: Successful Test Suite Run
- GIVEN the updated data and fixtures
- WHEN `pnpm test` is executed
- THEN all tests in `races.test.ts` and `roster.test.ts` MUST pass successfully

### Requirement: REQ-RACE-06: Approved Compatibility Break Tracking

The system MUST record this migration as a deliberate, user-approved compatibility break in roster identifiers and race composition.

#### Scenario: Compatibility Break Is Explicitly Documented
- GIVEN the BB2025 migration artifacts
- WHEN implementation and docs are reviewed
- THEN they MUST explicitly state the approved key-composition break
- AND they MUST include a follow-up note to define data migration strategy for persisted teams if required

### Requirement: REQ-RACE-07: Positional Qty Minimum and Skill Access Data

The system MUST extend the `Positional` data model with two optional/required fields:

- `min?: number` — minimum roster quantity, defaulting to `0` when absent, never exceeding `max`
- `accessPrimary: string[]` — primary skill-access letters, each restricted to the subset `{G, A, P, S, M, F}` (F = Fitness is a valid rulebook category); missing or empty renders as "—"
- `accessSecondary: string[]` — secondary skill-access letters, each restricted to the subset `{G, A, P, S, M, F}`; missing or empty renders as "—"

The system MUST populate `accessPrimary` and `accessSecondary` (and `min` where it differs from 0) for all positionals across the ~30 races / 144 positionals in `races.ts`. Human, Orc, and Dwarf (OCR pages 180/189/175) MUST be verified first as the high-confidence reference subset. Letters outside `{G, A, P, S, M, F}` observed in OCR (e.g., `T`, `E`, `6`, `EPT`, `A,FT`) MUST be normalized to the valid set or flagged for manual review — never silently shipped. Within each array, letters MUST be deduplicated and ordered canonically `G → A → P → S → M → F`. Positionals without verified access data MUST use `[]`.

#### Scenario: High-confidence subset verified first

- GIVEN OCR reference pages 180 (Human), 189 (Orc), 175 (Dwarf)
- WHEN access data is populated
- THEN those three races' positionals are verified first
- AND remaining races are populated as data tasks afterwards

#### Scenario: Out-of-set OCR letters normalized or flagged

- GIVEN an OCR token containing letters outside `{G, A, P, S, M, F}`, e.g. "EPT" or "A,FT"
- WHEN the access value is normalized
- THEN letters outside the valid set are removed or the value is flagged for manual review
- AND no unverified value is shipped

#### Scenario: Missing access data

- GIVEN a positional with no reliable OCR evidence for access
- WHEN its data is committed
- THEN `accessPrimary` is `[]` AND `accessSecondary` is `[]`
- AND the PRIMARIAS/SECUNDARIAS columns render "—"

#### Scenario: Canonical order per column

- GIVEN a positional with access letters observed out of canonical order
- WHEN its data is committed
- THEN each array is deduplicated and reordered to `G → A → P → S → M → F`

#### Scenario: Min defaults to zero

- GIVEN a positional without `min`
- WHEN the Qty cell renders
- THEN it shows `0-{max}`
- AND `min` never exceeds `max`

#### Scenario: Min defined explicitly

- GIVEN a positional with `min` defined
- WHEN the Qty cell renders
- THEN it shows `{min}-{max}`
