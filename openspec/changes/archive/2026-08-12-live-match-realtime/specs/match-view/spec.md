# Delta for match-view

## MODIFIED Requirements

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

A schema migration adding `LiveMatch`/`LiveEvent` and a chronological event timeline for live AND played matches MUST be implemented; replay, full event taxonomy (interceptions/skills/weather), filters, and public viewing MUST NOT be implemented; no other schema drift is allowed.
(Previously: realtime, live state, the timeline, and ANY migration were prohibited.)

#### Scenario: Timeline shown for live and played

- GIVEN a live fixture or a played fixture with persisted events
- WHEN the page renders
- THEN the chronological event timeline is shown from persisted events

#### Scenario: Replay and public viewing stay out

- GIVEN any fixture state
- WHEN the page renders
- THEN no replay controls, no anonymous/public access, and no out-of-taxonomy events appear

## Acceptance Criteria Update

Supersedes the AC-4/AC-5 rows of the main spec:

| # | Criterion | Test |
|---|-----------|------|
| AC-4 | Live UI and timeline only for live/played fixtures; none for static states | unit + e2e |
| AC-5 | Migration additive (LiveMatch/LiveEvent only); no deps/icons; tokens and Spanish copy respected | lint/tsc/e2e |

Affected: slice 4 (MatchView wiring) · slice 5 (timeline + prefill) · slice 6 (e2e).
