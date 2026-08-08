# Delta for team-detail-view

## ADDED Requirements

### Requirement: Mobile ReadOnly Roster Inherits Row-Cards

The readOnly `RosterTable` in the detail view MUST inherit the mobile stacked row-card rendering defined by the `roster-table` spec (below `md`), and MUST inherit the desktop book table unchanged (at or above `md`). The detail view MUST NOT pass `bannerText` or `apothecary`, so no banner or footer renders on either branch.

#### Scenario: Mobile detail roster is stacked

- GIVEN a valid team with players below `md`
- WHEN the detail roster renders
- THEN each player appears as a stacked row-card (name, subtitle, cost, stats chips, SKILLS/PRIMARIAS/SECUNDARIAS rows)
- AND no book table and no banner or footer render

#### Scenario: Desktop detail roster unchanged

- GIVEN a valid team with players at or above `md`
- WHEN the detail roster renders
- THEN the read-only 10-column book table renders with no stacked row-cards

## MODIFIED Requirements

### Requirement: Coaching Staff Display

The system MUST render a coaching table headed "Cuerpo técnico" with navy (`#12225a`) headers `Concepto | Cantidad | Coste unitario | Total`, zebra rows (`#f1f5f9`), right-aligned numerics in `50 000` format, rows labeled Segundas oportunidades, Fanáticos dedicados, Entrenadores asistentes, Animadoras. An Apotecario row MUST ALWAYS render (Cantidad "SÍ" green / "NO", unit `50 000`, total `50 000`/`0`) — `computeCoachingCostItems` excludes it. A bold total row (bg `#e2e8f0`) MUST show the coaching total including the apothecary. The coaching table is OUT OF SCOPE for the mobile row-card change: at ALL viewport widths below `md` it MUST remain a horizontally-scrolling table (nested `overflow-x-auto` and a `min-w-[640px] md:min-w-0` panel) to fit narrow viewports; the header row MUST remain sticky.
(Previously: the horizontal-scroll wrapper description was unchanged; now explicitly confirmed coaching scroll coexists with the roster row-card change and must not be converted to stacked rows.)

#### Scenario: Coaching breakdown

- GIVEN a valid team with coaching staff
- WHEN the detail view renders
- THEN the four rows show Spanish labels, quantity, unit cost, and total
- AND an Apotecario row always appears with SÍ or NO

#### Scenario: Apothecary present

- GIVEN a team with `coaching.apothecary: true`
- WHEN the coaching table renders
- THEN the Apotecario row shows "SÍ", unit `50 000`, total `50 000`
- AND the total row is the items sum plus `50 000`

#### Scenario: No apothecary

- GIVEN a team with `coaching.apothecary: false`
- WHEN the coaching table renders
- THEN the Apotecario row shows "NO" with total `0`
- AND the total row equals the items sum

#### Scenario: Horizontal scroll on mobile

- GIVEN a viewport below `md`
- WHEN the coaching table renders
- THEN a nested `overflow-x-auto` wrapper and `min-w-[640px] md:min-w-0` panel are present
