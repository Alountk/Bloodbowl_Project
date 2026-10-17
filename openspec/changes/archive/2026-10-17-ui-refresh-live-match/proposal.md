# Proposal: ui-refresh — Live Match V2 Seam (Screen 6)

## Intent

Seam 6 of `bb-ui=next` (#351): detail, list, dashboard, create wizard and leagues are V2, but opening a fixture (`/leagues/[id]/fixtures/[fixtureId]`) still renders the legacy `MatchView` with the flag ON — the V2 dashboard's "Next match" card (`DashboardV2.tsx:78`) lands on an old screen, breaking tester continuity. Sixth and final declared seam of the approved queue.

## Scope

### In Scope
- Seam in `app/leagues/[id]/fixtures/[fixtureId]/page.tsx` (thin server page delegating to `MatchView`): flag ON → `MatchViewV2`, flag OFF → `MatchView`, identical `{leagueId, fixtureId}` props contract (the route passes both), never both; zero legacy edits (`features/leagues/MatchView.tsx` is VERIFY-ONLY — ~1900 lines of tested behavior).
- `MatchViewV2` following the Stitch design "Partido en Directo (Acta en Vivo)" (project `16023060193335379804`), covering the fixture states the legacy surface renders: pending/ready consent, live acta, finished summary.
- Presentation-only: V2 reuses the legacy surface's own machinery — `useLiveMatch` (SSE), `useLiveClock`, `useLeague`, `getMatchDetail`, `sendLiveCommand`, `resetLiveMatch`, `createShareLink`, plus the shared atoms `MatchTimelineBar`, `LiveActionDock`, `LiveEventCardsActa`, `matchSummary` builders and `MatchResolveModal`/`ResetLiveMatchModal` — no new data paths, endpoints, or behavior.
- Testids `ui-v2-match-*`; component tests (RED→GREEN) + flag-ON e2e desktop/mobile + triangulation in `e2e/ui-refresh-roster.spec.ts`.
- Delta: MODIFIED UIR-2 → 6 declared seams + watch-route flag-free scenario.

### Out of Scope
- Default flip (UIR-5); the spectator route `/watch/[token]` (`WatchMatchView`) — stays flag-free like the league detail.
- New data/statistics, new acta behavior, fixture generation/matchmaking, inducement rule changes.
- Legacy edits (VERIFY-ONLY): `MatchView.tsx`, its 9 e2e specs that navigate to the fixture, `useLiveMatch` and friends.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `ui-refresh`: UIR-2 restated with the live-match seam (both surfaces take `{leagueId, fixtureId}`; V2 reuses the live machinery listed above; `/watch/[token]` stays flag-free). UIR-1/3/4/5 unchanged.

## Approach

- One `useUiFlag()` branch in `app/leagues/[id]/fixtures/[fixtureId]/page.tsx` (route-level seam, precedent of all five predecessors); `MatchView.tsx` never consults the flag, so its exports consumed elsewhere are structurally unaffected.
- Slice 1 ships the seam + a functional V2 skeleton (sticky rulebook header, score strip, timeline, acta feed via the shared atoms) so flag-ON desktop e2e + triangulation pass; slice 2 completes the Stitch chrome (dock/consent/finished states), mobile case and expanded tests.
- S7 trace (already resolved): NO flag-ON test navigates to the fixture route today — `createTeamAndOpenList` ends on `/teams`, and the roster spec's dashboard cases never click the "Next match" card; the 9 specs that reach the fixture (`full-league-flow`, `inducement-purchase`, `league-matchday`, `live-match`, `live-resolution`, `match-report`, `match-view`, `roster-table`, `watch`) are ALL flag-OFF (only `ui-refresh-roster.spec.ts` sets `bb-ui`, and it never leaves the list/dashboard surfaces). Slice 1 adds direct flag-ON fixture cases (cookie before first goto).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/leagues/[id]/fixtures/[fixtureId]/page.tsx` | Modified | `useUiFlag()` seam branch (the only route file edited) |
| `features/leagues/MatchViewV2.tsx` (+ test) | New | redesigned live match, `ui-v2-match-*` |
| `e2e/ui-refresh-roster.spec.ts` | Modified | flag-ON fixture cases |
| `.../specs/ui-refresh/spec.md` (delta) | New | MODIFIED UIR-2 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `MatchView` is ~1900 lines with many states (pending/ready/live/finished, inducements, report) | Med | V2 reuses the shared atoms + hooks instead of reimplementing; slice 1 scopes the skeleton to the states the flag-ON e2e asserts; slice 2 grows coverage |
| No flag-ON harness walks to the fixture today (traced) | Med | Slice 1 adds direct `goto` fixture cases with cookie before goto; helper untouched |
| Legacy contract broken | Med | flag OFF default; `MatchView.tsx` + its 9 specs VERIFY-ONLY; seam in the ROUTE page only |
| Flag-ON e2e cannot build a real fixture (roster spec runs only in the local anonymous suite) | Med | Baseline pins the seam through the fixture GET's own 401 answer (seam-5 precedent); component tests cover loaded rendering; the 9 flag-OFF auth-suite specs keep real-fixture coverage (UIR-3) |
| Slice exceeds 400 lines | Med | 2 chained PRs <400 each; `size:exception` standing rule if exceeded |

## Rollback Plan

Revert the 2 chained PRs in reverse (V2 → seam); flag OFF restores the legacy `MatchView` immediately.

## Dependencies

- Archived `ui-refresh`, `ui-refresh-teams-list`, `ui-refresh-dashboard`, `ui-refresh-create-wizard`, `ui-refresh-leagues` in main: `lib/ui-flag/`, layout provider, five seams.

## Success Criteria

- [ ] Flag OFF: fixture suites pass unmodified (component + the 9 flag-OFF specs that navigate to `/leagues/.../fixtures/...`).
- [ ] Flag ON: e2e asserts `ui-v2-match-*` desktop + mobile; legacy markers (`mini-strip`, `rulebook-header`, `summary-row`…) count 0.

## Forecast (400-line budget)

2 chained PRs: (1) seam + V2 skeleton + flag-ON baseline (~350); (2) full V2 chrome + tests + mobile (~330); each <400.
