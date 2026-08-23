# Delta for match-view

## MODIFIED Requirements

### Requirement: MV-6 · Out-of-Scope Lock

A schema migration adding `LiveMatch`/`LiveEvent` and a chronological event timeline for live AND played matches MUST be implemented; replay, full event taxonomy (interceptions/skills/weather), filters, and public viewing MUST NOT be implemented; no other schema drift is allowed. Kickoff rows (expensive mistake, fan-factor roll, weather) MUST NOT be surfaced in this version — a follow-up slice MAY add them as TEXT-kind events (LM-14 precedent). Post-match summary rows MUST be derived from the `MatchResult` snapshot and MUST NOT be persisted as new event kinds; the 8-kind display surface (LM-16) MUST be preserved.
(Previously: the lock covered replay, taxonomy, filters, public viewing, and schema drift only.)

#### Scenario: Timeline shown for live and played

- GIVEN a live fixture or a played fixture with persisted events
- WHEN the page renders
- THEN the chronological event timeline is shown from persisted events

#### Scenario: Replay and public viewing stay out

- GIVEN any fixture state
- WHEN the page renders
- THEN no replay controls, no anonymous/public access, and no out-of-taxonomy events appear

#### Scenario: Kickoff and summary rows stay out of the taxonomy

- GIVEN a finished live feed
- WHEN event kinds are inspected
- THEN no kickoff kinds exist and the summary rows carry no persisted event kind (snapshot-derived only)

### Requirement: MV-7 · Design System and Copy

MatchView MUST use only rulebook-light tokens (navy `#12225a`, red `#d11938`, background `#f8fafc`, white square panels) and MUST NOT add a dark theme, dependencies, or an icon library (inline glyphs/SVG only). The rulebook card box, the 68% internal gradients, and the "Partido reportado" success style MUST be composed exclusively from existing token values: navy/red at reduced opacity for the team gradients, the neutral background token for the gray box, and the green semantic family already in use (green-50/600/700) for success; no new color values. League-section copy MUST be Spanish.
(Previously: no color/shadow variants at all — the gradients and the success style did not exist.)

#### Scenario: Token and copy audit

- GIVEN the rendered match page
- WHEN classes and visible text are audited
- THEN only existing tokens appear and all copy is Spanish

#### Scenario: Success and gradient tokens

- GIVEN the rendered rulebook cards and the "Partido reportado" row
- WHEN classes are audited
- THEN the gradients use only navy/red at reduced opacity, the box uses the neutral background token, and success uses the existing green family — no new hex values

## ADDED Requirements

### Requirement: MVT-1 · rulebook Event Cards

The event feed MUST render display events (LM-16) as cards inside a gray box with 4px radius and 2px gap. Team events (`td|completion|casualty|foul|mvp`) MUST render at 68% width with an internal side-to-side gradient of the team color (navy home / red away), the turn tag on the team's side and the minute on the opposite side; generic events (`start|endHalf|endMatch`) MUST render centered at 100% width. A TD card MUST show the partial score "(H - A)" derived by accumulating TD events per side across the display feed up to that event. The `live-event-row` testid and existing feed labels MUST be preserved where the design keeps them; deliberate label/testid changes MUST ship with the behavior change, never silently.

#### Scenario: Team card layout

- GIVEN a home TD event at minute 54 in turn T4
- WHEN the feed renders
- THEN the card is 68% width with the navy gradient, "T4" on the home side, "54'" on the opposite side, and the full row data

#### Scenario: Generic event centered

- GIVEN an `endMatch` event
- WHEN the feed renders
- THEN the card spans 100% width and is centered

#### Scenario: Per-TD partial score

- GIVEN a home TD followed chronologically by an away TD
- WHEN the TD cards render
- THEN the home card shows "(1 - 0)" and the away card shows "(1 - 1)", and a reload reproduces both

#### Scenario: Testid and label continuity

- GIVEN the redesigned feed
- WHEN tests assert feed rows
- THEN `live-event-row` and kept labels still match; changed labels/testids were updated deliberately with the behavior

### Requirement: MVT-2 · Timeline Bar in the Sticky Header

The sticky header MUST render a horizontal timeline bar: a full-bleed light track with the `0′` and final-minute labels at the extremes and one icon per display event positioned at `round((at - startedAt) / elapsed × 100)`% — home events on the top half, away events on the bottom half, and start/end markers anchored at 0% and 100% when the match is finished. The bar MUST derive from the LM-16 display kinds only, so a reload renders the identical bar.

#### Scenario: Position by elapsed percent

- GIVEN a TD at minute 99 of a 199-minute match
- WHEN the bar renders
- THEN the icon sits at 50% of the track

#### Scenario: Side placement and boundary markers

- GIVEN home and away events plus start and end markers
- WHEN the bar renders
- THEN home icons sit on the top half, away icons on the bottom half, and the start/end markers anchor 0% and 100%

### Requirement: MVT-3 · rulebook Sticky Header

The sticky header MUST render: an integrated back arrow (to the jornada), the league·round label, two turn tracks flanking the "Dar el turno" CTA (each covering the active half's turns — T1–T8 in half 1, T9–T16 in half 2 — with the current turn highlighted), per-coach clocks (home and away accumulated turn time), and a half indicator ("2ª Parte" badge with "Mitad N · Turno M"). This MUST be UI-only: the header MUST derive every value from the existing live DTO and MUST NOT add fields or change the turn/clock model.

#### Scenario: Header anatomy

- GIVEN a live match in half 2, turn 16
- WHEN the header renders
- THEN the back arrow, league·round label, T9–T16 tracks flanking "Dar el turno", both coach clocks, and the "2ª Parte · Mitad 2 · Turno 16" indicator appear

#### Scenario: UI-only constraint

- GIVEN the unchanged live DTO
- WHEN the header renders
- THEN every shown value comes from existing fields and no model or DTO change is required

### Requirement: MVT-4 · Finished-Feed Summary Rows

The finished live feed MUST render snapshot-derived summary rows above the event cards: "Partido reportado" (success style with the report date), "Ganancias" (per-team winnings), "Fanáticos dedicados" (per-team post-match fan factor), and "Incentivos" (per-team petty cash, team-assigned card). These rows MUST render ONLY when the `MatchResult` snapshot exists — a walkover MUST omit them (MV-2 guard) — MUST be derived, never new event kinds (MV-6/LM-16), and MUST NOT duplicate the MVP rows, which stay event-derived.

#### Scenario: Summary rows from snapshot

- GIVEN a finished live match with a `MatchResult` snapshot
- WHEN the feed renders
- THEN "Partido reportado" (green success), "Ganancias", "Fanáticos dedicados", and "Incentivos" show snapshot values above the cards

#### Scenario: Walkover omits summary rows

- GIVEN a finished live match without a snapshot
- WHEN the feed renders
- THEN no summary rows appear and no placeholder is shown

#### Scenario: MVP not duplicated

- GIVEN `mvp` events already persisted by the result route
- WHEN the feed renders
- THEN exactly one MVP row per grantee appears and no snapshot-derived duplicate
