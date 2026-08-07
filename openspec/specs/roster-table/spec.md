# roster-table Specification

## Purpose

Contract for `RosterTable` (used by `CreateTeamForm` editable and `TeamDetailView` read-only): rulebook light theme, Spanish column set, Spanish skills with English fallback, preserved accessibility.

## Requirements

### Requirement: Light Theme Isolation

The system MUST render the table with an explicit light theme (white/gray backgrounds, dark text) using self-contained classes that do NOT inherit from dark ancestors, in both `readOnly` modes.

#### Scenario: Table on dark page

- GIVEN the table renders inside a dark-themed page
- WHEN displayed
- THEN it shows light background and dark text, never overridden

### Requirement: Rulebook Column Set and Order

The system MUST render columns in rulebook order with Spanish headers: `CANT. | POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | PRIMARIAS | SECUNDARIAS`. Headers MUST be Spanish. The POSICIÓN and HABILIDADES Y RASGOS cells MUST be left-aligned; all other cells centered. In editable mode the remove control MUST remain last (a blank header cell).

#### Scenario: Header order (read-only)

- GIVEN a roster with players
- WHEN the header row renders
- THEN the 11 Spanish headers appear in exact rulebook order, each as `th scope="col"`

#### Scenario: Editable remove column

- GIVEN an editable roster
- WHEN the header row renders
- THEN a blank header `th scope="col"` follows SECUNDARIAS (12 columns) for the remove button

### Requirement: Qty Derivation

The Qty cell MUST show `{min}-{max}`, using `positional.min` (default `0`) and `positional.max`.

#### Scenario: Explicit minimum

- GIVEN a positional with `min: 2` and `max: 4`
- WHEN the Qty cell renders
- THEN it displays `2-4`

#### Scenario: Default minimum

- GIVEN a positional with no `min` and `max: 16`
- WHEN the Qty cell renders
- THEN it displays `0-16`

### Requirement: Position Cell with Spanish Role Subtitle

The POSICIÓN cell MUST show the player name (editable input in editable mode, static span in read-only) plus the subtitle `(Raza, Rol)` in Spanish, e.g. `(Human, Línea)`. The role MUST map via the local translated map: Lineman→Línea, Thrower→Lanzador, Catcher→Receptor, Blitzer→Blitzer, Big Guy→Grandullón, unknown→Otro. In editable mode the rename input MUST keep `aria-label="Player name for X"`.

#### Scenario: Read-only position cell

- GIVEN a read-only roster with a Human Lineman named John
- WHEN the row renders
- THEN it shows the name `John` with the subtitle `(Human, Línea)`

#### Scenario: Editable rename preserved

- GIVEN an editable roster
- WHEN a row renders
- THEN the rename input keeps its `player-name` aria-label

#### Scenario: Unknown role fallback

- GIVEN a positional with a role not in the translated map
- WHEN the row renders
- THEN the subtitle uses `Otro`

### Requirement: Spanish Skill Names with English Fallback

The HABILIDADES Y RASGOS cell MUST render each skill via the `es` translation when present, else the English `skill.name`, and MUST NOT render the category suffix. Empty `skills` MUST render "Ninguna".

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

The PRIMARIAS / SECUNDARIAS cells MUST render the positional's `accessPrimary` / `accessSecondary` letters joined by spaces. Missing or empty arrays MUST render "—".

#### Scenario: Access letters present

- GIVEN a positional with `accessPrimary: ["G","F"]`
- WHEN the PRIMARIAS cell renders
- THEN it shows "G F"

#### Scenario: Access missing

- GIVEN a positional with an empty access array
- WHEN the cell renders
- THEN it displays "—"

### Requirement: Cost Format

The COSTE cell MUST render cost via `formatRulebookCost` (thousands grouped by spaces, e.g. `50 000`), NOT the compact `formatGold` format. The totals-cost cell MUST use the same rulebook format for table-internal consistency.

#### Scenario: Cost formatting

- GIVEN a positional costing 50000
- WHEN the Cost cell renders
- THEN it displays "50 000"

#### Scenario: Editable budget keeps compact format

- GIVEN an editable roster with a remaining budget
- WHEN the totals row renders
- THEN the budget cell keeps the compact `formatGold` format (e.g. "690k left")

### Requirement: Banner

When `bannerText` is provided AND the roster is non-empty, the system MUST render a centered 28px banner (white background, 5px top/bottom borders) with the banner text.

#### Scenario: Banner provided with players

- GIVEN a non-empty roster and a `bannerText`
- WHEN the table renders
- THEN the banner text is shown prominently

#### Scenario: Banner absent or empty roster

- GIVEN no `bannerText` OR an empty roster
- WHEN the table renders
- THEN no banner appears

### Requirement: Rulebook Footer

When the `apothecary` prop is provided, the system MUST render a navy footer row: `0-8 Segundas oportunidades: {formatRulebookCost(race.rerollCost)} M.O. cada una` (colSpan 5) and `Apotecario: SÍ|NO` (colSpan 6), with an extra empty cell in editable mode. When `apothecary` is absent, the footer MUST NOT render.

#### Scenario: Footer with apothecary status

- GIVEN a roster and `apothecary` prop
- WHEN the table renders
- THEN the segundas oportunidades and Apotecario text appear in the footer

#### Scenario: Footer absent

- GIVEN no `apothecary` prop
- WHEN the table renders
- THEN no footer appears

### Requirement: Totals Row

The system MUST keep a totals row (player count, total cost in rulebook format, and editable-mode budget in compact format) ABOVE the rulebook footer, with `colSpan` summing to the header count: 11 read-only, 12 editable.

#### Scenario: Totals with new columns

- GIVEN a roster with players and `showTotals` true
- WHEN the totals row renders
- THEN it shows player count and total cost in `formatRulebookCost`
- AND the totals colSpan sum equals the header count (10 + 1 read-only, + 1 budget editable)

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
