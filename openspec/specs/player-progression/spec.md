# player-progression Specification

## Purpose

Persistent `Player` entity reconciling roster JSON with progression state: PE balance, skills, injuries, deaths, and value recalculation after BB2025 rules.

## Requirements

### Requirement: Player Entity Reconciliation

The system MUST maintain one `Player` record per roster player (teamId, rosterPlayerId, name, positionalKey, pe, skills[], injuries[], alive, valueBonus). On first result load, Players MUST be backfilled from the roster JSON, reconciled by `PlayerEntry.id`; unknown ids MUST be skipped (zero orphan rows). Roster JSON remains the source of truth for name and positional; the Player record owns progression state only.

#### Scenario: Backfill reconciles by roster id

- GIVEN a team roster with 11 `PlayerEntry` ids
- WHEN the first result loads
- THEN 11 Player rows exist, each linked to its `rosterPlayerId`

#### Scenario: Unknown roster ids skipped

- GIVEN a roster entry whose id no longer exists in the roster JSON
- WHEN backfill runs
- THEN no Player row is created for it

### Requirement: PE Spending

A player SHALL spend PE on improvements at the improvement-table costs (bb2025-rules). A dead player MUST NOT spend PE (409, no mutation). Spending more PE than the balance MUST be rejected (400, no mutation).

#### Scenario: Primary skill purchased

- GIVEN a player with 10 PE buying a 2ª primary improvement (cost 8)
- WHEN the spend is submitted
- THEN 2 PE remain and the skill is added

#### Scenario: Spend blocked on dead player

- GIVEN a dead player holding PE
- WHEN a spend is attempted
- THEN it returns 409 and nothing changes

#### Scenario: Insufficient PE rejected

- GIVEN a player with 2 PE attempting a random-skill roll (cost 3)
- WHEN the spend is submitted
- THEN it returns 400 and nothing changes

### Requirement: Random Skill Roll for Progression

A progression skill roll MUST follow the bb2025-rules random table: the player chooses a category, the system rolls twice, the player picks one outcome, duplicates re-roll; the improvement costs the Azar price.

#### Scenario: Roll then choose

- GIVEN a player choosing category Generales
- WHEN the system rolls two skills
- THEN the player picks one and pays the Azar cost

### Requirement: Élite Marking and Value Recalculation

Élite skills MUST render with a `$` badge and an "Élite" tooltip. Adding a skill MUST recalculate player value: base value +10.000 per normal skill, +20.000 per élite skill, tracked as `valueBonus`.

#### Scenario: Normal skill adds ten thousand

- GIVEN a player with base value 70.000
- WHEN they gain Patada (normal)
- THEN value becomes 80.000

#### Scenario: Élite skill adds twenty thousand

- GIVEN a player gaining Placar (élite)
- WHEN value is recalculated
- THEN it increases by 20.000

NOTE: asterisk-marked rulebook skills (Apariencia asquerosa, Furia) are MANDATORY, not élite (see bb2025-rules, race-data-bb2025); they add the normal +10.000 skill value, never +20.000.

### Requirement: Injury Persistence and Alive Guard

Injury outcomes from the result route MUST persist on the Player (injuries[] and `alive: false` on death); players with a permanent injury carry the LMC modifier for future injury rolls (bb2025-rules).

#### Scenario: Death persisted

- GIVEN a player whose injury roll eliminates them
- WHEN the result transaction commits
- THEN `alive` is false and the injury is recorded

Affected: slice 1 (Player schema) · slice 4 (progression UI, Spanish league-section copy; component tests assert via textContent — no jest-dom).
