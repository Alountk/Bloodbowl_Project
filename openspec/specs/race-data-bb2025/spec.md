# race-data-bb2025 Specification

## Purpose

Define the data and structure requirements for the Blood Bowl 2025 races (30 team lists, ~150 positionals), their positionals, stats, skills, skill-access, and reroll costs. The verified machine-readable primary reference is the **TourPlay BB2025 team catalog** (scraped snapshot produced by `scripts/scrape-tourplay-teams.mjs`, `https://tourplay.net/en/blood-bowl/teams`); the **rulebook PDF** (`external-assets/`) is the final authority for skill texts and access semantics, and its OCR pages are used only as fallback where TourPlay is silent or unclear.

## Requirements

### Requirement: REQ-RACE-01: BB2025 Verified Data Precondition

The system MUST use a verified BB2025 reference as the source of truth for all data updates before any code modification begins. The verified references, in order of authority, are:

1. **TourPlay BB2025 team catalog** — the machine-readable primary reference for roster composition, positional stats/costs/skills, and access letters (letters G/A/S/P/M/D, where S=Strength and D=Devious).
2. **Rulebook PDF (BB2025, Spanish 3rd Season)** — final authority for skill TEXTS (descriptions) and access-letter semantics.
3. **OCR pages of the rulebook PDF** — fallback only; never authoritative on its own.

#### Scenario: Verify Reference Data Availability
- GIVEN a developer is about to begin data migration
- WHEN the TourPlay BB2025 snapshot and the rulebook PDF skill pages are available and cross-checked
- THEN the implementation phase can proceed

### Requirement: REQ-RACE-02: Controlled Identifier Delta for BB2025

The system MUST treat the verified TourPlay BB2025 roster composition as authoritative over prior key inventory.

The migration MUST allow only this explicit and finite identifier delta:

- remove race `high-elf`
- add race `bretonnian`
- remove positionals: `chaos-chosen.beastman-runner`, `chaos-renegade.renegade-beastman`, `tomb-kings.bone-giant`, `vampire.vampire`, `bretonnian.blitzer`, `bretonnian.blocker`, `bretonnian.ogre`, `norse.thrower`
- add positionals: `chaos-renegade.renegade-minotaur`, `chaos-renegade.renegade-rat-ogre`, `vampire.vampire-runner`, `vampire.vampire-thrower`, `vampire.vampire-blitzer`, `vampire.vargheist`, `bretonnian.knight-thrower`, `bretonnian.knight-catcher`, `bretonnian.grail-knight`, `chaos-chosen.ogre`, `chaos-renegade.renegade-human-thrower`, `goblin.ooligan`, `goblin.doom-diver`, `human.halfling-hopeful`, `lizardmen.chameleon-skink`, `norse.beer-boar`, `snotling.fungus-flinga`, `underworld-denizens.snotling-lineman`, `underworld-denizens.gutter-runner`, `underworld-denizens.troll`, `old-world-alliance.human-catcher`, `old-world-alliance.dwarf-runner`, `old-world-alliance.troll-slayer`, `old-world-alliance.dwarf-blitzer`, `old-world-alliance.altern-forest-treeman`

All other pre-existing `race.id` and `positional.key` values MUST remain unchanged.

#### Scenario: Apply Only Approved Identifier Changes
- GIVEN the pre-migration key inventory and the verified TourPlay BB2025 roster
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

The system MUST update all positional stats (MA, ST, AG, PA, AV), player costs, skills, and team reroll costs to match the verified TourPlay BB2025 catalog exactly.

#### Scenario: Validate Updated Stats
- GIVEN a positional player
- WHEN checking its stats and cost
- THEN they MUST exactly match the TourPlay BB2025 catalog

#### Scenario: Validate Reroll Costs
- GIVEN a team roster
- WHEN checking the team reroll cost
- THEN it MUST exactly match the TourPlay BB2025 catalog

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

The system MUST extend the `Positional` data model with:

- `min?: number` — minimum roster quantity, defaulting to `0` when absent, never exceeding `max`
- `accessPrimary: string[]` — primary skill-access letters, each restricted to the subset `{A, F, G, M, P, T}` (Agilidad, Fuerza, Generales, Mutación, Pase, Triquiñuelas — the user-validated random-table categories)
- `accessSecondary: string[]` — secondary skill-access letters, same subset; missing or empty renders as "—"

The system MUST populate `accessPrimary` and `accessSecondary` (and `min` where it differs from 0) for all positionals across the ~30 races / ~150 positionals in `races.catalog.json`, sourced from the TourPlay access columns (letters G/A/S/P/M/D). TourPlay's `S` (Strength) and `D` (Devious) MUST be normalized onto the valid set as `F` and `T` respectively. Letters outside `{A, F, G, M, P, T}` (including the previously valid `S`) MUST be normalized to the valid set or flagged for manual review — never silently shipped. Within each array, letters MUST be deduplicated and ordered canonically `A → F → G → M → P → T`. Positionals without verified access data MUST use `[]`.
(Previously: valid set `{G, A, P, S, M, F}` with F read as Fitness; canonical order `G → A → P → S → M → F`.)

#### Scenario: High-confidence subset verified first

- GIVEN the TourPlay access columns for the reference races (Human, Orc, Dwarf)
- WHEN access data is populated
- THEN those three races' positionals are verified first
- AND remaining races are populated as data tasks afterwards

#### Scenario: Out-of-set letters normalized or flagged

- GIVEN an access token containing letters outside `{A, F, G, M, P, T}`, e.g. TourPlay `GS` (Strength) or `AD` (Devious)
- WHEN the access value is normalized
- THEN letters outside the valid set are mapped to the valid set (`S`→`F`, `D`→`T`) or the value is flagged for manual review
- AND no unverified value is shipped

#### Scenario: Missing access data

- GIVEN a positional with no reliable access evidence
- WHEN its data is committed
- THEN `accessPrimary` is `[]` AND `accessSecondary` is `[]`
- AND the PRIMARIAS/SECUNDARIAS columns render "—"

#### Scenario: Canonical order per column

- GIVEN a positional with access letters observed out of canonical order
- WHEN its data is committed
- THEN each array is deduplicated and reordered to `A → F → G → M → P → T`

#### Scenario: Random-table category mapping

- GIVEN the random-skill table categories
- WHEN access letters are validated
- THEN each category maps one-to-one to its access letter (Agilidad→A, Fuerza→F, Generales→G, Mutación→M, Pase→P, Triquiñuelas→T)

#### Scenario: Min defaults to zero

- GIVEN a positional without `min`
- WHEN the Qty cell renders
- THEN it shows `0-{max}`
- AND `min` never exceeds `max`

#### Scenario: Min defined explicitly

- GIVEN a positional with `min` defined
- WHEN the Qty cell renders
- THEN it shows `{min}-{max}`

### Requirement: REQ-RACE-08: Skill Catalog Élite Flag

The skill catalog MUST mark each skill with `elite: boolean` (default false). User-confirmed élite skills are: Placar (Block), Esquivar (Dodge), Defensa (Guard), Golpe Mortífero (Mighty Blow). NOTE: skills marked with an asterisk in the rulebook (Apariencia asquerosa, Furia) are MANDATORY skills (must be used whenever applicable), NOT élite — they carry `mandatory: true` and `elite: false`. Élite skills MUST render with a `$` badge and an "Élite" tooltip; a skill adds +10.000 to player value, an élite skill +20.000.

#### Scenario: Confirmed élite skills marked

- GIVEN the skills Placar, Esquivar, Defensa, Golpe Mortífero
- WHEN the catalog is committed
- THEN all four carry `elite: true`

#### Scenario: Mandatory skills are not élite

- GIVEN the skills Apariencia asquerosa and Furia (asterisk-marked in the rulebook)
- WHEN the catalog is committed
- THEN both carry `mandatory: true` and `elite: false`

#### Scenario: Unlisted skills default to non-élite

- GIVEN the skill Patada
- WHEN the catalog is committed
- THEN it carries `elite: false` and `mandatory: false`
