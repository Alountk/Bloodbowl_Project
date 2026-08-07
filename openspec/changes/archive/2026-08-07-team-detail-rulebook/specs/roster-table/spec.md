# Delta for roster-table

## MODIFIED Requirements

### Requirement: Rulebook Column Set and Order

The system MUST render mode-appropriate Spanish headers. Read-only mode MUST render exactly 10 `th scope="col"` headers — `POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | PRIMARIAS | SECUNDARIAS` — omitting `CANT.` and the blank remove header, and MUST render the table centered (max-w 860px). Editable mode MUST keep the 12-column set (`CANT. | POSICIÓN | … | SECUNDARIAS` + blank trailing `th`). POSICIÓN and HABILIDADES Y RASGOS cells MUST be left-aligned; all other cells centered.

(Previously: both modes rendered the 11-column set with `CANT.`.)

#### Scenario: Header order (read-only)

- GIVEN a read-only roster with players
- WHEN the header row renders
- THEN the 10 Spanish headers appear in exact rulebook order as `th scope="col"`
- AND no `CANT.` header and no blank header cell appear

#### Scenario: Editable remove column

- GIVEN an editable roster
- WHEN the header row renders
- THEN `CANT.` plus the other headers render, blank `th` last (12 columns)

### Requirement: Qty Derivation

In editable mode the Qty cell MUST show `{min}-{max}` using `positional.min` (default `0`) and `positional.max`. Read-only mode MUST NOT render the Qty cell.

(Previously: the Qty cell rendered in both modes.)

#### Scenario: Explicit minimum

- GIVEN an editable roster with a positional of `min: 2`, `max: 4`
- WHEN the row renders
- THEN the Qty cell displays `2-4`

#### Scenario: Default minimum

- GIVEN an editable roster with a positional of no `min` and `max: 16`
- WHEN the row renders
- THEN the Qty cell displays `0-16`

#### Scenario: Hidden in read-only

- GIVEN a read-only roster with players
- WHEN rows render
- THEN no Qty cell appears in any body row

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

When the `apothecary` prop is provided (including `false`), the system MUST render a navy footer row: `0-8 Segundas oportunidades: {formatRulebookCost(race.rerollCost)} M.O. cada una` and `Apotecario: SÍ|NO`. The footer colSpans MUST sum to the column count of the mode that renders it — 12 editable (5 + 6 + 1 blank), 10 read-only (4 + 6). When the prop is absent, the footer MUST NOT render.

(Previously: read-only colSpans were 5 + 6 = 11.)

#### Scenario: Footer with apothecary status

- GIVEN a roster and an `apothecary` prop
- WHEN the table renders
- THEN both footer texts appear; colSpans sum to 12 (editable) or 10 (read-only)

#### Scenario: Footer absent

- GIVEN no `apothecary` prop
- WHEN the table renders
- THEN no footer appears

### Requirement: Totals Row

The system MUST keep a totals row ABOVE the rulebook footer. Read-only mode MUST render a navy (`#12225a`) bold row "{n} jugadores · Coste total" with the total cost in `50 000` format, colSpans summing to 10 (label 7 + cost 1 + empty 2). Editable mode MUST keep the English "{n} player(s)" label and the compact-format budget, colSpans summing to 12.

(Previously: both modes used "{n} player(s)"; read-only colSpans summed to 11.)

#### Scenario: Read-only totals

- GIVEN a read-only roster with players and `showTotals` true
- WHEN the totals row renders
- THEN it shows "{n} jugadores · Coste total" with the total in rulebook format
- AND the colSpan sum equals the 10-column header count

#### Scenario: Editable totals preserved

- GIVEN an editable roster with players and a remaining budget
- WHEN the totals row renders
- THEN the label stays "{n} player(s)" and the budget stays compact (e.g. "690k left")
- AND the colSpan sum equals the 12-column header count
