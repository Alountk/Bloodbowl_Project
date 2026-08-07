# Delta for team-detail-view

## MODIFIED Requirements

### Requirement: Identity Display

The system MUST display the team identity in a navy (`#12225a`) hero: team name as primary heading (white, 26px, weight 900), meta line `<b>{race name}</b> · {Spanish league label}`, and two tags — plain "Equipo listo" and gold (`#d11938`) "Tesorería: {formatRulebookCost(treasury)}". The `leagueType` (`open`/`exhibition`) MUST map to a Spanish display label; the raw enum token MUST NOT render.

(Previously: an unstyled header with name, race name, and raw league type.)

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

### Requirement: Roster Display

The system MUST display the roster via `RosterTable` as read-only: the 10-column rulebook set (`POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | PRIMARIAS | SECUNDARIAS`, no `CANT.`), light theme, Spanish skills per the `roster-table` spec, centered (max-w 860px). The view MUST NOT pass `bannerText`/`apothecary` (hero replaces banner; coaching table covers apotecario). The section heading MUST be "Plantilla" (16px `#12225a`, 3px bottom border `#d11938`).

(Previously: passed `bannerText`/`apothecary`, rendered the 11-column set with `CANT.`, English "Roster" heading.)

#### Scenario: Valid roster display

- GIVEN a valid team is found
- WHEN the detail view renders
- THEN `RosterTable` renders `readOnly` with `players` and `race`
- AND receives neither `bannerText` nor `apothecary`
- AND the empty-roster fallback shows when no players exist

#### Scenario: Read-only rulebook presentation

- GIVEN a valid team with players is found
- WHEN the detail view renders
- THEN the table shows the 10 Spanish headers without `CANT.`
- AND no banner, footer, rename inputs, or remove buttons appear

#### Scenario: Read-only totals preserved

- GIVEN a valid team with players is found
- WHEN the detail view renders
- THEN the totals row shows "{n} jugadores · Coste total" with cost in `50 000` format
- AND no budget text appears

### Requirement: Coaching Staff Display

The system MUST render a coaching table headed "Cuerpo técnico" with navy (`#12225a`) headers `Concepto | Cantidad | Coste unitario | Total`, zebra rows (`#f1f5f9`), right-aligned numerics in `50 000` format, rows labeled Segundas oportunidades, Fanáticos dedicados, Entrenadores asistentes, Animadoras. An Apotecario row MUST ALWAYS render (Cantidad "SÍ" green / "NO", unit `50 000`, total `50 000`/`0`) — `computeCoachingCostItems` excludes it. A bold total row (bg `#e2e8f0`) MUST show the coaching total including the apothecary.

(Previously: an English `<ul>` from `computeCoachingCostItems` with an optional Apothecary line, compact `k` values.)

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

### Requirement: Derived Treasury Display

The system MUST derive the treasury as `STARTING_TREASURY - rosterCost - coachingCost` (coachingCost includes the apothecary) and display it under the "Tesorería" book heading in three cards: "Coste plantilla", "Cuerpo técnico", "Tesorería restante" (gold `#d11938`), all values in `50 000` format.

(Previously: an English "Treasury" paragraph with a compact `k` value.)

#### Scenario: Treasury calculation

- GIVEN a team with a roster and coaching staff
- WHEN the detail view renders
- THEN the cards show roster cost, coaching cost, and remaining treasury
- AND values use rulebook format (e.g. "750 000")

#### Scenario: Apothecary included

- GIVEN a team with `coaching.apothecary: true`
- WHEN the treasury cards render
- THEN the "Cuerpo técnico" card includes the `50 000` apothecary cost
- AND "Tesorería restante" drops by that amount
