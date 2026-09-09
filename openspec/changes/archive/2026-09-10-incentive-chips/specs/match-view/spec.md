# Delta for match-view

## MODIFIED Requirements

### Requirement: MVT-4 · Finished-Feed Summary Rows

The finished live feed MUST render snapshot-derived summary rows above the event cards: "Partido reportado" (success style with the report date), "Ganancias" (per-team winnings), "Fanáticos dedicados" (per-team post-match fan factor), and "Incentivos" (per-eligible-team inducements: a budget amount plus chip pills rendered from structured `{name, count}` cards). These rows MUST render ONLY when the `MatchResult` snapshot exists — a walkover MUST omit them (MV-2 guard) — MUST be derived, never new event kinds (MV-6/LM-16), and MUST NOT duplicate the MVP rows, which stay event-derived. A legacy snapshot with top-level `pettyCash` but no per-side `inducements` MUST render the single home-assigned row with no chips (backward-compatible fallback), never a crash.
(Previously: "Incentivos" was a single home-assigned petty-cash row with no per-team split and no chips.)

#### Scenario: Summary rows from snapshot

- GIVEN a finished live match with a `MatchResult` snapshot
- WHEN the feed renders
- THEN "Partido reportado" (green success), "Ganancias", "Fanáticos dedicados", and "Incentivos" show snapshot values above the cards

#### Scenario: Per-team incentive chips render

- GIVEN a snapshot whose lower-TV side carried `{ budget: 150000, cards: [{ name: "Sobornos", count: 2 }] }`
- WHEN the feed renders
- THEN that team's "Incentivos" row shows the budget plus the chip "2× Sobornos"; the other side shows its (zero) budget with no chips

#### Scenario: Legacy single-row fallback

- GIVEN a legacy snapshot with top-level `pettyCash` but no per-side `inducements`
- WHEN the feed renders
- THEN the single home-assigned "Incentivos" row renders with no chips and no error

#### Scenario: Walkover omits summary rows

- GIVEN a finished live match without a snapshot
- WHEN the feed renders
- THEN no summary rows appear and no placeholder is shown

#### Scenario: MVP not duplicated

- GIVEN `mvp` events already persisted by the result route
- WHEN the feed renders
- THEN exactly one MVP row per grantee appears and no snapshot-derived duplicate
