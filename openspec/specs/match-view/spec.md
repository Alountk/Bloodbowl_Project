# Delta for match-view

## ADDED Requirements

### Requirement: MV-1 · Auth-Gated Match Detail Endpoint

GET `/api/leagues/[id]/fixtures/[fixtureId]` MUST return the fixture, its `MatchResult` snapshot, and both rosters with `Player` rows; unauthenticated → 401. Visibility MUST follow league scoping: OPEN → any authenticated user; STARTED → owner/members only; foreign non-member → 404. Read-only, identical in both auth modes.

#### Scenario: Unauthenticated rejected

- GIVEN no session
- WHEN the endpoint is hit
- THEN it returns 401

#### Scenario: Foreign user hidden

- GIVEN a STARTED-league fixture and an authenticated non-member
- WHEN they request the match
- THEN it returns 404 with no data leak

#### Scenario: Owner and member access

- GIVEN a STARTED-league fixture and a league-owner or member-team-owner session
- WHEN they request the match
- THEN it returns 200 with fixture, snapshot, and both rosters

#### Scenario: Both auth modes served

- GIVEN AUTH_MODE=local or AUTH_MODE=auth
- WHEN an authorized user requests the match
- THEN the same 200 payload shape is returned

### Requirement: MV-2 · Played State Snapshot Summary

A played fixture with a result MUST render from the persisted snapshot: scoreboard (scores, winner), teams (name, race subtype, coach), dedicated fans (`postFf`), winnings, casualties, weather, and MVP — the roster player whose PE entry carries the +4 MJP bonus (absent → omitted, not crashed). Values MUST be persisted, never placeholders; copy Spanish. A played fixture WITHOUT a snapshot (walkover) MUST render fixture scores with a walkover notice, omitting summary sections.

#### Scenario: Full summary rendered

- GIVEN a played fixture with a `MatchResult` snapshot
- WHEN the page renders
- THEN scoreboard, winner, teams, fans, winnings, casualties, weather, and the +4 PE row as MVP show snapshot values

#### Scenario: Walkover without snapshot

- GIVEN a played fixture resolved by forfeit (scores set, no snapshot)
- WHEN the page renders
- THEN it shows fixture scores with a walkover notice, no summary sections, no error

### Requirement: MV-3 · Scheduled and Pending States

A scheduled fixture MUST show the agreed date/time via `formatMatchDate` (es-ES); a pending fixture MUST show a "not scheduled yet" notice.

#### Scenario: Scheduled shows agreed date

- GIVEN a scheduled fixture with `scheduledAt`
- WHEN the page renders
- THEN it shows "Programado:" with the es-ES formatted date

#### Scenario: Pending shows notice

- GIVEN a pending fixture without `scheduledAt`
- WHEN the page renders
- THEN it shows the not-scheduled notice and no date

### Requirement: MV-4 · MatchCard Access Point

A "Ver partido" access point on `MatchCard` MUST link to the match page. The card-body click (negotiation) MUST remain unchanged; Jornadas e2e selectors/labels MUST NOT change.

#### Scenario: Link navigates to match page

- GIVEN a fixture in the Jornadas grid
- WHEN the user activates "Ver partido"
- THEN the browser navigates to the match page

#### Scenario: Card click still negotiates

- GIVEN a pending fixture
- WHEN the user clicks the card body
- THEN the negotiation panel opens and no navigation occurs

### Requirement: MV-5 · Inert Live Shells

Turn-counter, half/clock, and event-feed sections MUST render live match state when the fixture has an active `LiveMatch`, fed by a `useLiveMatch` SSE hook; for played, scheduled, or pending fixtures they MUST remain hidden and MUST NOT render visible placeholders or fake values.
(Previously: the shells were always inert — `live: null` for every fixture state.)

#### Scenario: Live fixture shows live UI

- GIVEN a fixture with an active LiveMatch
- WHEN the page renders
- THEN turn counter, half, clocks, score, and event feed show server state

#### Scenario: No live UI for static states

- GIVEN a played, scheduled, or pending fixture
- WHEN the page renders
- THEN no visible turn, clock, half, or event-feed placeholder appears

### Requirement: MV-6 · Out-of-Scope Lock

A schema migration adding `LiveMatch`/`LiveEvent` and a chronological event timeline for live AND played matches MUST be implemented; replay, full event taxonomy (interceptions/skills/weather), filters, and public viewing MUST NOT be implemented; no other schema drift is allowed. Kickoff rows for `expensive_mistake` and `fan_factor` MUST be surfaced as TEXT-kind events generated at begin (LM-14/LM-21 precedent); weather and any other kickoff-table events MUST NOT be surfaced. Post-match summary rows MUST be derived from the `MatchResult` snapshot and MUST NOT be persisted as new event kinds; the 11-kind display surface (LM-16) MUST be preserved.
(Previously: all kickoff rows were excluded from this version.)

#### Scenario: Timeline shown for live and played

- GIVEN a live fixture or a played fixture with persisted events
- WHEN the page renders
- THEN the chronological event timeline is shown from persisted events

#### Scenario: Replay and public viewing stay out

- GIVEN any fixture state
- WHEN the page renders
- THEN no replay controls, no anonymous/public access, and no out-of-taxonomy events appear

#### Scenario: Kickoff kinds in, weather and summary out

- GIVEN a finished live feed of a match begun after ship
- WHEN event kinds are inspected
- THEN `expensive_mistake` and `fan_factor` rows exist, no weather or other kickoff kinds exist, and the summary rows carry no persisted event kind (snapshot-derived only)

### Requirement: MV-7 · Design System and Copy

MatchView MUST use only rulebook-light tokens (navy `#12225a`, red `#d11938`, background `#f8fafc`, white square panels) and MUST NOT add a dark theme, dependencies, or an icon library (inline glyphs/SVG only). The compact feed panel, the rulebook card surfaces, and the "Partido reportado" success style MUST be composed from existing token values: navy/red at reduced opacity for the team-row side accents, the neutral background token for gray surfaces, and the green semantic family already in use (green-50/600/700) for success. The 68%-width rulebook grid and its internal side-to-side gradients are removed with the card redesign (MVT-1). The ONLY new color values permitted are the five-band 1D16 severity ramp (grey, yellow, amber, orange, red) introduced by LM-27, used solely for the severity chips and their WCAG-contrast text; no other new color values. League-section copy MUST be Spanish.

#### Scenario: Token and copy audit

- GIVEN the rendered match page
- WHEN classes and visible text are audited
- THEN only existing tokens plus the five severity-ramp colors on the 1D16 chips appear, and all copy is Spanish

#### Scenario: Success tokens and severity ramp

- GIVEN the rendered compact feed, the "Partido reportado" row, and the severity stepper
- WHEN classes are audited
- THEN team rows use navy/red token accents, gray surfaces use the neutral background token, success uses the existing green family, and the only non-token colors are the five severity band values on the 1D16 chips

### Requirement: MVT-1 · rulebook Event Cards

The event feed MUST render display events (LM-16) as compact cards in a single full-width column at EVERY viewport width, following the mini-card layout of the compact study (`bloodbowl_designs/timeline-action-entry-designs.html`). The 68%-width rulebook grid, its internal side-to-side navy/red gradients, the corner turn-tag/minute placement, and the ≤430px mobile override MUST be removed: one layout for all resolutions, no width media split. Team events (`td|completion|casualty|foul|mvp` and the other team-row variants, e.g. `expensive_mistake` and journeyman rows) MUST render as compact team rows carrying the SAME information as before — minute, turn tag, token/dorsal, name and position, icon, label, ★ stars — with side identity via the existing navy/red token accents only (no gradient). Generic events (`start|endHalf|endMatch`), `fan_factor`, and `concede` MUST render centered rows without a side accent. Per-kind detail lines MUST be preserved byte-for-byte: a TD card MUST show the partial score "(H - A)" derived by accumulating TD events per side across the display feed up to that event; a casualty event (side = the VICTIM's side, payload `{victimRosterId, causerRosterId?, cause, roll16, band, bothDown?}`) MUST render an INJURY card on the VICTIM's side AND a DERIVED ACTION card on the CAUSER's side; a self-inflicted (`dodge|crowd`) casualty MUST render ONLY the injury card. The injury card MUST keep the victim line, the band sub-line, the cause line "por {causer} (#{dorsal}) · {cause}", and the roll line "Tirada 1D16: {roll16}"; the action card MUST keep the cause label, the causer token/dorsal/name, and its roll sub-line "Tirada 1D16: {n} · {band}". A casualty with `bothDown: true` MUST render its derived action card WITH ★2 — DEC-1 keeps the award symmetric — and the defender record of the same both-down (a plain `block`) MUST keep ★2 on its action card too; the two symmetric both-down records MUST render as separate events (four cards total), never merged. ✓/✗ ack controls MUST render per LM-26 (only to the fallen player's coach, never the recorder). The `live-event-row` testid and all existing visible copy, star counts, score strings and treasury strings MUST be preserved byte-identically; layout/CSS and lock tests (designLock A/B) are rewritten INTENTIONALLY with the behavior, never silently. Card styles MUST stay in the plain CSS module — arbitrary Tailwind grid/area/gradient utilities MUST NOT be introduced.

#### Scenario: Team card layout

- GIVEN a home TD event at minute 54 in turn T4
- WHEN the feed renders at any viewport width
- THEN the card is a compact full-width row with navy token accents showing the turn tag, "54'", token/dorsal, name/position, icon, label and stars — no 68% split and no gradient

#### Scenario: Generic event centered

- GIVEN an `endMatch` event
- WHEN the feed renders
- THEN the row spans the feed column, is centered, and has no side accent

#### Scenario: Per-TD partial score

- GIVEN a home TD followed chronologically by an away TD
- WHEN the TD cards render
- THEN the home card shows "(1 - 0)" and the away card shows "(1 - 1)", and a reload reproduces both

#### Scenario: Testid and label continuity

- GIVEN the redesigned feed
- WHEN tests assert feed rows
- THEN `live-event-row` and kept labels still match; changed labels/testids were updated deliberately with the behavior

#### Scenario: Concede card centered (RAU-38)

- GIVEN an accepted concession `concede` event (side = the surrendering team, payload `winnerSide` = the acceptor)
- WHEN the feed renders
- THEN the card is a compact centered row with the white-flag glyph, the "Concesión" label and the "{surrendering team} se rinde · Victoria de {acceptor team}" sub-line; a payload without the winner renders the bare label without throwing

#### Scenario: Casualty injury card + derived action card (direct event)

- GIVEN a recorded casualty event (side = the VICTIM's side, payload carrying `victimRosterId`, `causerRosterId`, `cause`, `roll16` and the server-derived `band`, with NO marker)
- WHEN the feed renders
- THEN the INJURY card renders on the victim's side as a compact team row with the band sub-line, the cause line "por {causer} · {cause}" and the roll line "Tirada 1D16: {roll16}" AND a DERIVED ACTION card renders on the CAUSER's side as a compact team row with the cause label (e.g. "Blitz"), the causer token/dorsal/name and the roll sub-line "Tirada 1D16: 13 · Permanente (−PS)"
- AND a self-inflicted (dodge/crowd) casualty renders ONLY the injury card, never an action card

#### Scenario: Both-down pair renders four cards with ★2 on both causer action cards (DEC-1)

- GIVEN a both-down block: defender casualty (plain `block`, victim the defender) and blocker casualty (`bothDown: true`, victim the blocker)
- WHEN the feed renders
- THEN four separate compact cards appear, never merged — defender record: injury card on the defender's side + action card on the blocker's side WITH ★2; blocker record: injury card on the blocker's side + action card on the defender's side WITH ★2
- AND the both-down recorder's card shows the "(Ambos derribados)" marker copy once on the both-down injury card

#### Scenario: Acknowledgement row renders per LM-26

- GIVEN a casualty with a causer (author = the causer's side)
- WHEN the card renders
- THEN the ✓/✗ ack row appears only for the fallen player's coach, never for the recorder; a causer-less casualty shows the auto-verified badge and no buttons

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

The sticky header MUST render: an integrated back arrow (to the jornada), the league·round label, two turn tracks (each covering the active half's turns — T1–T8 in half 1, T9–T16 in half 2 — with the current turn highlighted), per-coach clocks (home and away accumulated turn time), and a half indicator ("2ª Parte" badge with "Mitad N · Turno M"). The header MUST NOT render any pass-turn control: the "Dar el turno" action lives ONLY in the bottom control area beside the action dock (MVT-7), gated to the active coach while live. The header MUST derive every value from the existing live DTO, MUST NOT add fields, and MUST NOT depend on `lastTurnReason`; the turn/clock model does not change.

#### Scenario: Header anatomy

- GIVEN a live match in half 2, turn 16, with the home coach active
- WHEN the header renders
- THEN the back arrow, league·round label, T9–T16 tracks, both coach clocks, and the "2ª Parte · Mitad 2 · Turno 16" indicator appear
- AND no "Dar el turno" button appears anywhere in the header (the pass-turn control is at the bottom, MVT-7)

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

### Requirement: MVT-6 · Kickoff Event Rows

The feed MUST render `expensive_mistake` as a compact team row (MVT-1) with the money-bag glyph, showing the outcome label and the treasury before → after line per LM-24; `fan_factor` MUST render as a compact centered row (MVT-1) with the dice glyph and the per-team totals. Both kinds MUST appear at 0' before any turn events and MUST preserve the `live-event-row` testid (MVT-1 continuity).

#### Scenario: Expensive mistake team card

- GIVEN a home `expensive_mistake` event
- WHEN the feed renders
- THEN the card is a compact team row with navy accent showing "Error costoso" and "234.000 → 214.000 M.O." (liveEventCards.test.tsx)

#### Scenario: Fan factor centered card

- GIVEN a `fan_factor` event
- WHEN the feed renders
- THEN the card is a compact centered row showing "Factor de aficionados" and both team totals (MatchView.test.tsx)

#### Scenario: Kickoff rows at minute zero

- GIVEN a match just begun
- WHEN the live feed renders
- THEN the two "Error costoso" rows and the "Factor de aficionados" row are visible at 0' before any turn events (e2e live-match.spec.ts)

### Requirement: MVT-7 · Footer Pass-Turn Control and Reason Sheet

Passing the turn MUST be offered ONLY in the bottom control area, as a "Dar el turno" button beside the action dock — never in the sticky header (MVT-3). The button MUST render only while the match is `live` and the viewer is the ACTIVE coach (`viewerSide === activeSide`). It MUST NOT render for a finished match, a spectator member, a side-less admin, or the NON-active coach (who keeps the existing "Pedir turno" request row). Activating the button MUST open a reason sheet listing Voluntario / Tirada fallida / Baja (`match.turnReason.*`) with Voluntario PRESELECTED; confirming MUST fire the `endTurn` command with the selected reason, and dismissing MUST cancel with no command. Confirming the preselection requires no extra interaction, preserving the current single-flip pass path; a pass already in flight MUST ignore further activation (no double flip). New sheet copy MUST be added to BOTH es/en dictionaries in the same change; the button keeps the existing "Dar el turno" label.

#### Scenario: Bottom control for the active coach

- GIVEN a live match with home active and the home coach viewing
- WHEN the view renders
- THEN "Dar el turno" appears only in the bottom control area beside the dock, and nowhere in the header

#### Scenario: Preselected voluntary confirm

- GIVEN the reason sheet open
- WHEN the coach confirms without changing the preselection
- THEN an endTurn with `voluntary` fires and the turn flips exactly once

#### Scenario: Reason picked and shown

- GIVEN the reason sheet open
- WHEN the coach picks "Tirada fallida" and confirms
- THEN the endTurn carries `turnover` and the next turn-start row renders the reason tag

#### Scenario: Gated for every other viewer

- GIVEN a finished match, a NON-active coach, a spectator member, or a side-less admin
- WHEN the view renders
- THEN no "Dar el turno" button appears anywhere

## Acceptance Criteria

| # | Criterion | Test |
|---|-----------|------|
| AC-1 | GET honors 401/404; fixture + result + rosters in both auth modes | route |
| AC-2 | Played/scheduled/pending render real data, no placeholders | unit |
| AC-3 | "Ver partido" navigates; card click negotiates; Jornadas unchanged | unit + e2e |
| AC-4 | Live UI and timeline only for live/played fixtures; none for static states | unit + e2e |
| AC-5 | Migration additive (LiveMatch/LiveEvent only); no deps/icons; tokens and Spanish copy respected | lint/tsc/e2e |
