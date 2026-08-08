# Delta for team-detail-view

## MODIFIED Requirements

### Requirement: Identity Display

The system MUST display the team identity in a navy (`#12225a`) hero: team name as primary heading (white, 26px, weight 900), meta line `<b>{race name}</b> · {Spanish league label}`, and two tags — plain "Equipo listo" and gold (`#d11938`) "Tesorería: {formatRulebookCost(treasury)}". The `leagueType` (`open`/`exhibition`) MUST map to a Spanish display label; the raw enum token MUST NOT render. Below `md` the hero heading MUST use responsive text tokens (e.g. `text-2xl md:text-[28px]`) and the hero padding MUST tighten so the name and tags stay legible at 375px.
(Previously: the hero heading used a fixed `text-[26px]` token with fixed `px-6` padding at all widths.)

#### Scenario: Displaying a valid team

- GIVEN a valid team is found
- WHEN the detail view renders
- THEN the hero shows the team name, bold race, and Spanish league label
- AND tags "Equipo listo" and "Tesorería: 750 000" appear

#### Scenario: League type display labels

- GIVEN a team with `leagueType` "open" or "exhibition"
- WHEN the hero renders
- THEN a Spanish display label appears
- AND raw "open"/"exhibition" never shows

#### Scenario: Hero heading responsive

- GIVEN a viewport below `md`
- WHEN the hero heading renders
- THEN it uses the smaller base token that steps up at `md`

### Requirement: Coaching Staff Display

The system MUST render a coaching table headed "Cuerpo técnico" with navy (`#12225a`) headers `Concepto | Cantidad | Coste unitario | Total`, zebra rows (`#f1f5f9`), right-aligned numerics in `50 000` format, rows labeled Segundas oportunidades, Fanáticos dedicados, Entrenadores asistentes, Animadoras. An Apotecario row MUST ALWAYS render (Cantidad "SÍ" green / "NO", unit `50 000`, total `50 000`/`0`) — `computeCoachingCostItems` excludes it. A bold total row (bg `#e2e8f0`) MUST show the coaching total including the apothecary. Below `md` the table MUST be wrapped so it scrolls horizontally (nested `overflow-x-auto` and a `min-w-[640px] md:min-w-0` panel) to fit narrow viewports; the header row MUST remain sticky.
(Previously: the coaching table rendered at fixed `px-[10px]` cell padding with no horizontal-scroll wrapper.)

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
