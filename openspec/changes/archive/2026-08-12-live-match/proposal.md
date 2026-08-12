# Proposal: Live Match View — Match Detail Page (MVP)

## Intent

Fixtures have no dedicated page; results are a Jornadas card line. This page shows the full post-match summary from the persisted `MatchResult` snapshot and anchors future live mode — live sections ship as inert shells.

## Scope

### In Scope
- New page `app/leagues/[id]/fixtures/[fixtureId]/` with rulebook-light `MatchView` for ALL states: played → snapshot summary; scheduled → date/time via `formatMatchDate`; pending → notice.
- New per-fixture GET: fixture + `MatchResult` snapshot + rosters with `Player` rows, reusing league auth/404 scoping.
- "Ver partido" on `MatchCard`; card click (negotiation) unchanged.
- Live-ready shells (turn bar, half/clock, event feed), inert.
- Real data only; no placeholders. Spanish copy; rulebook-light tokens; no migration.

### Out of Scope
- Realtime sync and live state (turns/half/clock/events).
- Chronological event timeline (no event feed exists).
- Live-state schema migration; standings; extra avatars.

## Capabilities

### New Capabilities
- `match-view`: match page + GET endpoint; three-state rendering; snapshot summary; MatchCard access point; inert live shells.

### Modified Capabilities
None — existing specs unchanged (read-only addition).

## User Stories

| State | Story |
|-------|-------|
| played | Score, winner, FF, casualties, per-player PE (MVP = +4 row), winnings, weather — from the snapshot. |
| scheduled | Participant sees the agreed date/time. |
| pending | Member sees a "not scheduled yet" notice. |

## Acceptance Criteria

- [ ] Played renders every persisted snapshot field; scheduled/pending render correctly.
- [ ] No timeline in MVP; live sections inert.
- [ ] "Ver partido" links to the page; card click and Jornadas e2e selectors unchanged.
- [ ] GET honors 401/404 (owner/member scoping, no leak), both auth modes.
- [ ] Vitest, Playwright, lint, tsc green.

## Approach

Static read-only page from existing data (Approach 1). New GET reuses the league auth gate; `enrichFixture` gains the `result` include; `MatchView` maps snapshot → sections; live shells inert.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` | New | GET match detail |
| `app/api/leagues/[id]/route.ts` | Modified | add `result` to fixture include |
| `app/leagues/[id]/fixtures/[fixtureId]/page.tsx` | New | route |
| `features/leagues/MatchView.tsx` | New | page component |
| `features/leagues/api.ts` | Modified | `getMatchDetail` + types |
| `features/leagues/MatchCard.tsx` | Modified | "Ver partido" link |
| e2e + vitest | Modified | MatchView/route tests; e2e additions |

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Live scope creep (turn/clock mockup) | CRITICAL | Inert shells only; live = separate change |
| Dark mockup vs rulebook-light | WARNING | Navy hero + white panels; red accent |
| Data gaps (no timeline/raw actions; MVP inferable; no race logos) | WARNING | Snapshot only; inline SVG or drop icons; GET has `Player` rows |
| Breaking Jornadas e2e | WARNING | Additive link; run local e2e |

## Rollback Plan

Revert route, page, MatchCard link in one PR chain; data untouched (read-only) → zero data risk.

## Dependencies

- `MatchResult.scores` snapshot (versioned).
- Match GET exposes `Player` rows (MVP cards).
- Chained PRs, slices < 400 lines.

## Success Criteria

- [ ] All three fixture states render real persisted data.
- [ ] Zero regression in matchday e2e; new page covered by tests.
- [ ] No schema migration, new deps, or icon library.
