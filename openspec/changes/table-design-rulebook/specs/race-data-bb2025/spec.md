# Delta for race-data-bb2025

## ADDED Requirements

### Requirement: REQ-RACE-07: Positional Qty Minimum and Skill Access Data

The system MUST extend the `Positional` data model with two optional fields:

- `min?: number` — minimum roster quantity, defaulting to `0` when absent, never exceeding `max`
- `access: string[]` — skill-access letters, each restricted to the subset `{G, A, P, S, M, T}`; missing or empty renders as "—"

The system MUST populate `access` (and `min` where it differs from 0) for all positionals across the ~30 races / 144 positionals in `races.ts`. Human, Orc, and Dwarf (OCR pages 180/189/175) MUST be verified first as the high-confidence reference subset. Letters outside `{G, A, P, S, M, T}` observed in OCR (e.g., `EPT`, `FG`, `A,FT`) MUST be normalized to the valid set or flagged for manual review — never silently shipped. Positionals without verified access data MUST use `[]`.

#### Scenario: High-confidence subset verified first

- GIVEN OCR reference pages 180 (Human), 189 (Orc), 175 (Dwarf)
- WHEN access data is populated
- THEN those three races' positionals are verified first
- AND remaining races are populated as data tasks afterwards

#### Scenario: Out-of-set OCR letters normalized or flagged

- GIVEN an OCR token containing letters outside `{G, A, P, S, M, T}`, e.g. "EPT" or "A,FT"
- WHEN the access value is normalized
- THEN letters outside the valid set are removed or the value is flagged for manual review
- AND no unverified value is shipped

#### Scenario: Missing access data

- GIVEN a positional with no reliable OCR evidence for access
- WHEN its data is committed
- THEN `access` is `[]`
- AND the Access column renders "—"

#### Scenario: Min defaults to zero

- GIVEN a positional without `min`
- WHEN the Qty cell renders
- THEN it shows `0-{max}`
- AND `min` never exceeds `max`

#### Scenario: Min defined explicitly

- GIVEN a positional with `min` defined
- WHEN the Qty cell renders
- THEN it shows `{min}-{max}`
