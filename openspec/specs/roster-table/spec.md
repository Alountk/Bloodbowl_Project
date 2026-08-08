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

The system MUST render mode-appropriate Spanish headers. Read-only mode MUST render exactly 10 `th scope="col"` headers — `POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | PRIMARIAS | SECUNDARIAS` — omitting `CANT.` and the blank remove header, and MUST render the table centered (max-w 860px). Editable mode MUST render exactly 11 columns — the 10 rulebook headers plus a blank trailing `th` — omitting `CANT.` entirely. POSICIÓN and HABILIDADES Y RASGOS cells MUST be left-aligned; all other cells centered.

#### Scenario: Header order (read-only)

- GIVEN a read-only roster with players
- WHEN the header row renders
- THEN the 10 Spanish headers appear in exact rulebook order as `th scope="col"`
- AND no `CANT.` header and no blank header cell appear

#### Scenario: Editable header set without CANT.

- GIVEN an editable roster
- WHEN the header row renders
- THEN the 10 rulebook headers appear in order, followed by a blank `th` (11 columns)
- AND no `CANT.` header renders

### Requirement: Qty Derivation

The system MUST NOT render a Qty column in either mode. The `min`/`max` data MAY remain on positionals and continue driving the availability-table "Add X" counters, but no qty cell MUST render in any table mode.

#### Scenario: No qty cell in editable

- GIVEN an editable roster
- WHEN a body row renders
- THEN the first cell is the POSICIÓN cell
- AND no cell displays a `{min}-{max}` string

#### Scenario: Hidden in read-only

- GIVEN a read-only roster
- WHEN rows render
- THEN no Qty cell appears in any body row

### Requirement: Editable POSICIÓN Subtext

In editable mode the POSICIÓN cell MUST render the player's name as an `<input>` with `aria-label="Player name for {name}"` and a subtext of `{positional.name} · ({race.name}, {roleEs})` (e.g. "Hobgoblin Lineman · (Chaos Dwarf, Línea)"). Read-only mode MUST retain its existing subtext of `({race.name}, {roleEs})` (no positional-name prefix) and MUST NOT change the read-only static name rendering.

(Previously: editable mode displayed only the `({race.name}, {roleEs})` subtext.)

#### Scenario: Editable subtext includes positional name

- GIVEN an editable roster
- WHEN a row's POSICIÓN cell renders
- THEN the input keeps `aria-label="Player name for {name}"`
- AND the subtext shows "{positional.name} · ({race.name}, {roleEs})"

#### Scenario: Read-only subtext unchanged

- GIVEN a read-only roster
- WHEN a row's POSICIÓN cell renders
- THEN the subtext shows only "({race.name}, {roleEs})"

### Requirement: Mobile Stacked Row-Cards

Below the `md` breakpoint (`useIsDesktop` false) RosterTable MUST render stacked row-cards instead of the book table — ONE card per player, no horizontal scroll, no chevron/expand. Each card MUST show: name line (read-only static span, or editable `<input aria-label="Player name for {name}">` with a remove button `aria-label="Remove {name}"`), subtitle `{positional.name} · ({race.name}, {roleEs})`, stats chips MV FU AG PS AR, labeled rows SKILLS (Spanish, "Ninguna" fallback) / PRIMARIAS / SECUNDARIAS, and a cost line. Editable mode MUST keep rename and remove working.

#### Scenario: Read-only mobile card

- GIVEN a readOnly roster below `md`
- WHEN a player card renders
- THEN it shows the player name as static text with subtitle `{name} · (Race, Rol)`
- AND cost, stats chips, and labeled SKILLS/PRIMARIAS/SECUNDARIAS rows are all visible without horizontal scroll

#### Scenario: Editable mobile card keeps controls

- GIVEN an editable roster below `md`
- WHEN a player card renders
- THEN the name input keeps `aria-label="Player name for {name}"`
- AND a remove button `aria-label="Remove {name}"` is present and renames/removes still work

#### Scenario: No skills fallback

- GIVEN a positional with an empty `skills` array below `md`
- WHEN the SKILLS row renders
- THEN it displays "Ninguna"

#### Scenario: Desktop untouched

- GIVEN a viewport at or above `md`
- WHEN the table renders
- THEN the book table renders with no stacked row-cards present

### Requirement: Scrollable Roster Table

The RosterTable container MUST cap its height with internal scrolling and a sticky header so the rest of the form (budget bar, availability section, coaching, submit) remains visible as the roster grows. The outer container MUST keep `max-h-[55vh] overflow-auto`. On the DESKTOP branch (at or above `md`), a nested `overflow-x-auto` wrapper MUST sit inside it with the inner table panel using `min-w-[640px]` and sticky `top-0 z-10` headers. Below `md`, the MOBILE branch MUST render stacked row-cards (see "Mobile Stacked Row-Cards") and MUST NOT render the book table, its horizontal-scroll wrapper, or any `min-w-[640px]` panel.
(Previously: the horizontal-scroll wrapper applied on mobile; mobile now renders stacked row-cards instead.)

#### Scenario: Height cap and sticky header

- GIVEN a growing roster
- WHEN the table renders
- THEN the outer container has `max-h-[55vh] overflow-auto`
- AND the header row sticks to the top (`sticky top-0 z-10`) on the desktop branch

#### Scenario: Desktop horizontal scroll preserved

- GIVEN a desktop viewport (at or above `md`)
- WHEN the book table renders
- THEN the nested `overflow-x-auto` wrapper and `min-w-[640px]` panel are present

#### Scenario: Mobile uses stacked cards, no scroll wrapper

- GIVEN a viewport below `md`
- WHEN the table renders
- THEN no book table, no `overflow-x-auto` wrapper, and no `min-w-[640px]` panel are present
- AND each player renders as a stacked row-card

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

In editable mode, when `bannerText` is provided AND the roster is non-empty, the system MUST render a centered 28px banner (white background, 5px top/bottom borders) with the banner text. Read-only mode MUST NOT render the banner.

(Previously: the banner rendered in both modes when `bannerText` was provided and the roster was non-empty.)

#### Scenario: Banner provided with players (editable)

- GIVEN a non-empty editable roster and a `bannerText`
- WHEN the table renders
- THEN the banner text is shown prominently

#### Scenario: Read-only suppresses banner

- GIVEN a read-only roster with `bannerText` provided
- WHEN the table renders
- THEN no banner appears

#### Scenario: Banner absent or empty roster

- GIVEN no `bannerText` OR an empty roster
- WHEN the table renders
- THEN no banner appears

### Requirement: Rulebook Footer

When the `apothecary` prop is provided (including `false`), the system MUST render a navy footer row: `0-8 Segundas oportunidades: {formatRulebookCost(race.rerollCost)} M.O. cada una` and `Apotecario: SÍ|NO`. The footer colSpans MUST sum to the column count of the mode that renders it — 11 editable (4 + 6 + 1 blank), 10 read-only (4 + 6). When the prop is absent, the footer MUST NOT render.

(Previously: read-only colSpans were 4 + 6 = 10 and editable 5 + 6 + 1 = 12.)

#### Scenario: Footer with apothecary status

- GIVEN a roster and an `apothecary` prop
- WHEN the table renders
- THEN both footer texts appear; colSpans sum to 11 (editable) or 10 (read-only)

#### Scenario: Footer absent

- GIVEN no `apothecary` prop
- WHEN the table renders
- THEN no footer appears

### Requirement: Totals Row

The system MUST keep a totals row ABOVE the rulebook footer. Read-only mode MUST render a navy (`#12225a`) bold row "{n} jugadores · Coste total" with the total cost in `50 000` format, colSpans summing to 10 (label 7 + cost 1 + empty 2). Editable mode MUST keep the English "{n} player(s)" label and the compact-format budget, colSpans summing to 11 (label 9 + cost 1 + budget 1).

(Previously: both modes used "{n} player(s)"; editable colSpans summed to 12.)

#### Scenario: Read-only totals

- GIVEN a read-only roster with players and `showTotals` true
- WHEN the totals row renders
- THEN it shows "{n} jugadores · Coste total" with the total in rulebook format
- AND the colSpan sum equals the 10-column header count

#### Scenario: Editable totals preserved

- GIVEN an editable roster with players and a remaining budget
- WHEN the totals row renders
- THEN the label stays "{n} player(s)" and the budget stays compact (e.g. "690k left")
- AND the colSpan sum equals the 11-column header count

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
