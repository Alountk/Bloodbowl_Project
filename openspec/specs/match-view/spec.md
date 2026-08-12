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

Turn-counter, half/clock, and event-feed sections MUST exist as inert shells (hidden for non-live fixtures) so the future live change only fills data; MUST NOT render visible placeholders or fake values.

#### Scenario: No live UI for static states

- GIVEN a played, scheduled, or pending fixture
- WHEN the page renders
- THEN no visible turn, clock, half, or event-feed placeholder appears

### Requirement: MV-6 · Out-of-Scope Lock

Realtime sync, live state (turns/half/clock/events), and the chronological event timeline MUST NOT be implemented; the schema MUST remain unchanged (no migration).

#### Scenario: Timeline absent

- GIVEN any fixture state
- WHEN the page renders
- THEN no chronological event timeline is shown

### Requirement: MV-7 · Design System and Copy

MatchView MUST use only rulebook-light tokens (navy `#12225a`, red `#d11938`, background `#f8fafc`, white square panels) and MUST NOT add color/shadow variants, a dark theme, dependencies, or an icon library (inline SVG or none); league-section copy MUST be Spanish.

#### Scenario: Token and copy audit

- GIVEN the rendered match page
- WHEN classes and visible text are audited
- THEN only existing tokens appear and all copy is Spanish

## Acceptance Criteria

| # | Criterion | Test |
|---|-----------|------|
| AC-1 | GET honors 401/404; fixture + result + rosters in both auth modes | route |
| AC-2 | Played/scheduled/pending render real data, no placeholders | unit |
| AC-3 | "Ver partido" navigates; card click negotiates; Jornadas unchanged | unit + e2e |
| AC-4 | No visible live UI or timeline on any state | unit |
| AC-5 | No migration/deps/icons; tokens and Spanish copy respected | lint/tsc/e2e |
