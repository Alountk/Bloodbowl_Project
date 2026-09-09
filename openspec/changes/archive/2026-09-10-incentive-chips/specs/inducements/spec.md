# inducements Specification

## Purpose

Structured, rules-faithful pre-match inducements for Blood Bowl 2025: a catalog of the BB2025 COMMON inducements with per-race effective costs, lower-TV eligibility and budget derivation, cart validation, and a structured chip model. Pure and client-safe — engine effects and Star Players are out of scope (deferred).

## Requirements

### Requirement: IND-1 · Common Inducement Catalog

A pure client-safe module `lib/rules/inducements.ts` MUST expose a structured catalog of the BB2025 COMMON inducements (Star Players are deferred). Every entry MUST carry `id` (stable kebab-case string), `displayName` (Spanish), `costGp` (standard base cost in gold), and `maxPerMatch` (purchase limit); entries with rule gating MUST carry an `eligibility` rule id and MAY carry `costOverrides` keyed by special rule. Lookup by `id` MUST return the entry or `undefined` for an unknown id. The catalog MUST be the single source of truth — no cost duplicated elsewhere — and MUST support computing the EFFECTIVE cost per race.

| id | displayName | costGp | maxPerMatch | eligibility | costOverrides |
|---|---|---|---|---|---|
| `prayers-to-nuffle` | Plegarias a Nuffle | 10_000 | 3 | any | — |
| `temporary-cheerleaders` | Animadoras temporales | 5_000 | 5 | any | — |
| `assistant-coaches` | Ayudantes de Entrenador | 20_000 | 5 | any | — |
| `team-mascot` | Mascota del Equipo | 25_000 | 1 | any | — |
| `weather-mage` | Mago del Clima | 25_000 | 1 | any | — |
| `bloodweiser-kegs` | Barriles de Bloodweiser | 50_000 | 2 | any | — |
| `bribes` | Sobornos | 100_000 | 3 | any | `bribery-and-corruption`: 50_000 |
| `extra-training` | Entrenamiento Adicional | 100_000 | 8 | any | — |
| `wandering-apothecary` | Apotecario Ambulante | 100_000 | 2 | `apothecary-eligible` | — |
| `mortuary-assistant` | Asistente de Morgue | 100_000 | 1 | `masters-of-undeath` | — |
| `plague-doctor` | Médico de la Peste | 100_000 | 1 | `favoured-of-nurgle` | — |
| `fierce-innocents` | Novatos Embravecidos | 150_000 | 1 | `low-cost-linemen` | — |
| `halfling-master-chef` | Chef Master Halfling | 300_000 | 1 | any | `halfling-chef`: 100_000 |
| `wizard` | Mago | 150_000 | 1 | any | type by race (deferred) |
| `biased-referee` | Árbitro Sobornado | 120_000 | 1 | any | `bribery-and-corruption`: 80_000 |
| `mercenaries` | Mercenarios | 30_000 surcharge | 3+ | any | dynamic: base cost + 30k (+50k skill) |

#### Scenario: Catalog lookup

- GIVEN the inducements catalog
- WHEN a valid `id` is looked up
- THEN the entry's `displayName`, `costGp`, and `maxPerMatch` are returned

#### Scenario: Effective cost by race rule

- GIVEN race `goblin` (has `bribery-and-corruption`) and entry `bribes`
- WHEN the effective cost is computed
- THEN it returns 50_000, not the 100_000 base cost

#### Scenario: Unknown id

- GIVEN a lookup for a missing `id`
- WHEN the catalog is queried
- THEN `undefined` is returned and no error is thrown

### Requirement: IND-2 · Lower-TV Eligibility and Budget

The inducement budget MUST equal `|ΔTV|` (the absolute team-value difference) and MUST belong ONLY to the lower-TV team; equal TVs MUST produce a 0 budget for both sides. TV MUST derive server-side from roster cost + coaching cost + value bonuses (`computeTeamTv` over `raceTvParts`), never from client input.

#### Scenario: Lower-TV side gets the budget

- GIVEN home TV 1.200.000 and away TV 1.050.000
- WHEN the budget derives
- THEN the away (lower-TV) side budget is 150.000 and the home budget is 0

#### Scenario: Equal TVs give no budget

- GIVEN both teams at 1.050.000
- WHEN the budget derives
- THEN both budgets are 0 and neither side may purchase

### Requirement: IND-3 · Cart Validation

A purchase command MUST validate that every referenced `id` exists in the catalog (IND-1), that no `id` count exceeds its `maxPerMatch`, that rule-gated ids are purchased only by an eligible race (IND-5), and that the cart's Σ effective cost does NOT exceed that side's budget (IND-2); any violation MUST be rejected with no mutation. Purchase semantics MUST be replace-cart: the command's `{id, count}[]` list REPLACES the persisted cart for that side (not additive).

#### Scenario: Within budget accepted

- GIVEN a lower-TV side budget of 150.000 and a cart of eligible cards costing 100.000
- WHEN the purchase commits
- THEN it is accepted and the cart is replaced

#### Scenario: Over budget rejected

- GIVEN a side budget of 150.000 and a cart costing 200.000
- WHEN the purchase is attempted
- THEN it is rejected and the prior cart is unchanged

#### Scenario: Limit exceeded rejected

- GIVEN a cart with 4× `bribes` (max 3) or 6× `temporary-cheerleaders` (max 5)
- WHEN the purchase is attempted
- THEN it is rejected with no mutation

#### Scenario: Ineligible race rejected

- GIVEN race `orc` and a cart containing `plague-doctor` (nurgle-only)
- WHEN the purchase is attempted
- THEN it is rejected with no mutation

#### Scenario: Unknown id rejected

- GIVEN a cart referencing an id absent from the catalog
- WHEN the purchase is attempted
- THEN it is rejected with no mutation

### Requirement: IND-4 · Chip Model

Persisted inducement snapshots MUST use structured `{ name, count }` entries with the Spanish display name RESOLVED from the catalog at snapshot time, and MUST render as `{count}× {name}` (e.g. "2× Sobornos"). The cart and snapshot MUST NOT store pre-parsed display strings.

#### Scenario: Chip renders count and name

- GIVEN snapshot cards `[{ name: "Sobornos", count: 2 }]`
- WHEN the chip renders
- THEN it shows "2× Sobornos"

### Requirement: IND-5 · Race Special Rules

The roster catalog (`features/teams/data/races.catalog.json`) does NOT model inducement special rules today. The special-rule vocabulary MUST live in `lib/rules/inducements.ts` as a `raceId → ruleId[]` map (single source of truth, alongside IND-1), NOT as an extension of the roster catalog; IND-1 eligibility and costOverrides MUST resolve against this map. The initial map MUST cover: `bribery-and-corruption` (`goblin`, `snotling`, `underworld-denizens`), `low-cost-linemen` (`halfling`, `goblin`, `ogre`), `favoured-of-nurgle` (`nurgle`), `masters-of-undeath` (`shambling-undead`, `necromantic-horror`), `halfling-chef` (`halfling`). The `apothecary-eligible` rule MUST be modelled as "eligible unless the race carries `no-apothecary`", and the `wizard` type per race MUST be modelled as a per-race variant; both definitive sets MUST be finalized against BB2025 before the purchase UI ships (verification debt).

#### Scenario: Rule-gated catalog resolves

- GIVEN race `nurgle`
- WHEN eligibility is evaluated for `plague-doctor`
- THEN it is eligible; for race `orc` the same entry is ineligible

#### Scenario: Cost override applies

- GIVEN race `snotling` (has `bribery-and-corruption`)
- WHEN effective cost is computed for `biased-referee`
- THEN it returns 80_000, not 120_000

## Deferred (out of scope for initial catalog)

Star Players (0-2, variable cost, region/palmarés-gated — Old World Classic, Badlands Brawl, …) are DEFERRED to a follow-up change. The initial catalog ships common inducements only; the `id` scheme reserves a `star-player-*` namespace for that follow-up.
