# Delta for race-data-bb2025

## MODIFIED Requirements

### Requirement: REQ-RACE-07: Positional Qty Minimum and Skill Access Data

The system MUST extend the `Positional` data model with:

- `min?: number` — minimum roster quantity, defaulting to `0` when absent, never exceeding `max`
- `accessPrimary: string[]` — primary skill-access letters, each restricted to the subset `{A, F, G, M, P, T}` (Agilidad, Fuerza, Generales, Mutación, Pase, Triquiñuelas — the user-validated random-table categories)
- `accessSecondary: string[]` — secondary skill-access letters, same subset; missing or empty renders as "—"

The system MUST populate `accessPrimary` and `accessSecondary` (and `min` where it differs from 0) for all positionals across the ~30 races / 144 positionals in `races.ts`. Human, Orc, and Dwarf (OCR pages 180/189/175) MUST be verified first as the high-confidence reference subset. Letters outside `{A, F, G, M, P, T}` (including the previously valid `S`, and any `F` previously read as "Fitness") MUST be normalized to the valid set or flagged for manual review — never silently shipped. Within each array, letters MUST be deduplicated and ordered canonically `A → F → G → M → P → T`. Positionals without verified access data MUST use `[]`.
(Previously: valid set `{G, A, P, S, M, F}` with F read as Fitness; canonical order `G → A → P → S → M → F`.)

#### Scenario: High-confidence subset verified first

- GIVEN OCR reference pages 180 (Human), 189 (Orc), 175 (Dwarf)
- WHEN access data is populated
- THEN those three races' positionals are verified first
- AND remaining races are populated as data tasks afterwards

#### Scenario: Out-of-set OCR letters normalized or flagged

- GIVEN an OCR token containing letters outside `{A, F, G, M, P, T}`, e.g. "EPT" or "A,FT"
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

## ADDED Requirements

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

Affected: slice 1 (catalog data + `elite` flag) · slice 4 (progression élite badge).
