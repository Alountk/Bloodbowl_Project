# roster-table Specification

## Purpose

Contract for `RosterTable` (used by `CreateTeamForm` editable and `TeamDetailView` read-only): rulebook light theme, column set, Spanish skills with English fallback, preserved accessibility.

## Requirements

### Requirement: Light Theme Isolation

The system MUST render the table with an explicit light theme (white/gray backgrounds, dark text) using self-contained classes that do NOT inherit from dark ancestors, in both `readOnly` modes.

#### Scenario: Table on dark page

- GIVEN the table renders inside a dark-themed page
- WHEN displayed
- THEN it shows light background and dark text, never overridden

### Requirement: Rulebook Column Set and Order

The system MUST render columns in rulebook order: Qty, Name, Cost, MA, ST, AG, PA, AV, Skills, Access. Headers MUST stay English. In editable mode the remove control MUST remain last.

#### Scenario: Header order

- GIVEN a roster with players
- WHEN the header row renders
- THEN headers appear in rulebook order, each as `th scope="col"`
- AND a remove button column follows Access when editable

### Requirement: Qty Derivation

The Qty cell MUST show `{min}-{max}`, using `positional.min` (default `0`) and `positional.max`.

#### Scenario: Explicit minimum

- GIVEN a positional with `min: 0` and `max: 16`
- WHEN the Qty cell renders
- THEN it displays `0-16`

#### Scenario: Default minimum

- GIVEN a positional with no `min` and `max: 2`
- WHEN the Qty cell renders
- THEN it displays `0-2`

### Requirement: Name Cell with Role Subtitle

The Name cell MUST show the race name plus positional name with the role as subtitle. In editable mode the rename input MUST keep `aria-label="Player name for X"`.

#### Scenario: Read-only name cell

- GIVEN a read-only roster with a Human Lineman
- WHEN the row renders
- THEN it shows "Human Lineman" with role subtitle

#### Scenario: Editable rename preserved

- GIVEN an editable roster
- WHEN a row renders
- THEN the rename input keeps its player-name aria-label

### Requirement: Spanish Skill Names with English Fallback

The Skills cell MUST render each skill via the `es` translation when present, else the English `skill.name`, and MUST NOT render the category suffix. Empty `skills` MUST render "Ninguna".

#### Scenario: Translated skill

- GIVEN a skill with an `es` translation
- WHEN the Skills cell renders
- THEN it shows the Spanish name, no category suffix

#### Scenario: Missing translation

- GIVEN a skill with no `es` translation
- WHEN the Skills cell renders
- THEN it shows the English `skill.name`

#### Scenario: No starting skills

- GIVEN a positional with an empty `skills` array
- WHEN the Skills cell renders
- THEN it displays "Ninguna"

### Requirement: Access Column Rendering

The Access cell MUST render the positional's `access` letters (subset of G/A/P/S/M/T). Missing or empty `access` MUST render "—".

#### Scenario: Access letters present

- GIVEN a positional with `access` containing G, S, M
- WHEN the Access cell renders
- THEN it shows the letters

#### Scenario: Access missing

- GIVEN a positional with no `access` or an empty array
- WHEN the Access cell renders
- THEN it displays "—"

### Requirement: Cost Format

The Cost cell MUST render cost via `formatGold` (e.g., "50k"), NOT the rulebook's raw numeric format.

#### Scenario: Cost formatting

- GIVEN a positional costing 50000
- WHEN the Cost cell renders
- THEN it displays "50k"

### Requirement: Accessibility and Consumer Contract Preservation

The restyle MUST NOT regress `th scope="col"`, player-name/remove aria-labels, regions "Roster builder"/"Coaching Staff", `(n/max)` counters, budget texts, or "Add X" labels in `CreateTeamForm`.

#### Scenario: Editable controls labeled

- GIVEN an editable roster
- WHEN rows render
- THEN rename inputs and remove buttons keep their aria-labels

#### Scenario: Consumer contracts intact

- GIVEN `CreateTeamForm` renders the table
- WHEN the restyled table renders
- THEN region names, counters, budget texts, and "Add X" labels remain unchanged

### Requirement: Totals Row Preservation

The system MUST keep the totals row (player count, total cost, editable-mode budget) with `colSpan` adjusted to the new column count.

#### Scenario: Totals with new columns

- GIVEN a roster with players and `showTotals` true
- WHEN the totals row renders
- THEN it shows player count and total cost, plus budget in editable mode; read-only count and cost only
