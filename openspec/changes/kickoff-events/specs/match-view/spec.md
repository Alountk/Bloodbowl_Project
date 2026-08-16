# Delta for match-view

## MODIFIED Requirements

### Requirement: MV-6 · Out-of-Scope Lock

A schema migration adding `LiveMatch`/`LiveEvent` and a chronological event timeline for live AND played matches MUST be implemented; replay, full event taxonomy (interceptions/skills/weather), filters, and public viewing MUST NOT be implemented; no other schema drift is allowed. Kickoff rows for `expensive_mistake` and `fan_factor` MUST be surfaced as TEXT-kind events generated at begin (LM-14/LM-21 precedent); weather and any other kickoff-table events MUST NOT be surfaced. Post-match summary rows MUST be derived from the `MatchResult` snapshot and MUST NOT be persisted as new event kinds; the 10-kind display surface (LM-16) MUST be preserved.
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

## ADDED Requirements

### Requirement: MVT-6 · Kickoff Event Rows

The feed MUST render `expensive_mistake` as a team card at 68% width with the side gradient (navy home / red away) and the money-bag glyph, showing the outcome label and the treasury before → after line per LM-24; `fan_factor` MUST render centered at 100% width with the dice glyph and the per-team totals. Both kinds MUST appear at 0' before any turn events and MUST preserve the `live-event-row` testid (MVT-1 continuity).

#### Scenario: Expensive mistake team card

- GIVEN a home `expensive_mistake` event
- WHEN the feed renders
- THEN the card is 68% width with the navy gradient and shows "Error costoso" and "234.000 → 214.000 M.O." (liveEventCards.test.tsx)

#### Scenario: Fan factor centered card

- GIVEN a `fan_factor` event
- WHEN the feed renders
- THEN the card spans 100% width centered with "Factor de aficionados" and both team totals (MatchView.test.tsx)

#### Scenario: Kickoff rows at minute zero

- GIVEN a match just begun
- WHEN the live feed renders
- THEN the two "Error costoso" rows and the "Factor de aficionados" row are visible at 0' before any turn events (e2e live-match.spec.ts)
