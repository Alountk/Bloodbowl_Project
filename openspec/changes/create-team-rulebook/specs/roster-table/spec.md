# Delta for roster-table

## MODIFIED Requirements

### Requirement: Rulebook Column Set and Order

The system MUST render mode-appropriate Spanish headers. Read-only mode MUST render exactly 10 `th scope="col"` headers — `POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | PRIMARIAS | SECUNDARIAS` — omitting `CANT.` and the blank remove header, and MUST render the table centered (max-w 860px). Editable mode MUST render exactly 11 columns — the 10 rulebook headers plus a blank trailing `th` — omitting `CANT.` entirely. POSICIÓN and HABILIDADES Y RASGOS cells MUST be left-aligned; all other cells centered.

(Previously: editable mode kept the 12-column set `CANT. | POSICIÓN | … | SECUNDARIAS` plus a blank trailing `th`.)

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

The system MUST NOT render a Qty column in either mode. The `min`/`max` data MAY remain on positionals and continue driving the "Add X" `(n/max)` counters, but no qty cell MUST render in any table mode.

(Previously: editable mode rendered a Qty cell showing `{min}-{max}` derived from `positional.min` (default `0`) and `positional.max`.)

#### Scenario: No qty cell in editable

- GIVEN an editable roster with a positional of `min: 2`, `max: 4`
- WHEN a body row renders
- THEN the first cell is the POSICIÓN cell
- AND no cell displays `2-4`

#### Scenario: Hidden in read-only

- GIVEN a read-only roster with players
- WHEN rows render
- THEN no Qty cell appears in any body row

### Requirement: Rulebook Footer

When the `apothecary` prop is provided (including `false`), the system MUST render a navy footer row: `0-8 Segundas oportunidades: {formatRulebookCost(race.rerollCost)} M.O. cada una` and `Apotecario: SÍ|NO`. The footer colSpans MUST sum to the column count of the mode that renders it — 11 editable (4 + 6 + 1 blank), 10 read-only (4 + 6). When the prop is absent, the footer MUST NOT render.

(Previously: editable footer colSpans summed to 12 (5 + 6 + 1 blank).)

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

(Previously: editable totals colSpans summed to 12.)

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
