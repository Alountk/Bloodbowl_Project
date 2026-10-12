# Proposal: ui-refresh — Dashboard V2 Seam (Screen 3)

## Intent

Seam 3 of `bb-ui=next` (#339): detail and list are V2, but the dashboard — the first screen after login — still renders legacy with the flag ON. Third declared seam, following the two archived predecessors.

## Scope

### In Scope
- Seam in `features/dashboard/HomeDashboard.tsx`: flag ON → `DashboardV2`, flag OFF → `Dashboard`, identical `DashboardProps` (`{authenticated, userName}`), never both; zero legacy edits.
- Anonymous Landing untouched: seam sits INSIDE the authenticated render; `app/page.tsx` Landing never consults the flag.
- `DashboardV2` from Stitch `04 dashboard` / `M 04`, English home chrome: "Needs your attention" zone (proposals, LIVE, pending results), "Next match" card, stat cards (Teams, Leagues, Matches W-D-L, Squad PE), "Your teams" cards, "My leagues" links; mobile stacked + 2×2 stats. Data channel mirrors legacy: same props + hooks; endpoints `/api/me/dashboard`, `/api/me/stats` only.
- Testids `ui-v2-dashboard-*`; component tests (RED→GREEN) + flag-ON e2e desktop/mobile + triangulation in `e2e/ui-refresh-roster.spec.ts`.
- Delta: MODIFIED UIR-2 → declared seams (detail + teams list + dashboard).

### Out of Scope
- Default flip (UIR-5); other screens; theme tokens; cookie writer/dev toggle; legacy edits (VERIFY-ONLY).

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `ui-refresh`: UIR-2 restated with the dashboard seam (both surfaces `{authenticated, userName}`; V2 reuses legacy hooks; landing flag-free). UIR-1/3/4/5 unchanged.

## Approach

- One `useUiFlag()` branch in `HomeDashboard` (single caller of `Dashboard`), reusing the archived mechanism in main.
- Slice-1 skeleton must render the "Your teams" link ("ready to improve" copy) — the flag-ON e2e helper clicks it on `/`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `features/dashboard/HomeDashboard.tsx` | Modified | `useUiFlag()` seam branch |
| `features/dashboard/DashboardV2.tsx` (+ test) | New | redesigned dashboard, `ui-v2-dashboard-*` |
| `e2e/ui-refresh-roster.spec.ts` | Modified | flag-ON `/` cases |
| `.../specs/ui-refresh/spec.md` (delta) | New | MODIFIED UIR-2 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Flag-ON e2e navigates through `/` | High | skeleton ships "ready to improve" link (slice 1) |
| Legacy dashboard contract broken | Med | flag OFF default; VERIFY-ONLY |
| Slice exceeds 400 lines | Med | 2 chained slices, each <400 |

## Rollback Plan

Revert the 2 chained PRs in reverse (V2 → seam); flag OFF restores the legacy dashboard immediately.

## Dependencies

- Archived `ui-refresh` + `ui-refresh-teams-list` in main: `lib/ui-flag/`, layout provider, two seams.

## Success Criteria

- [ ] Flag OFF: `/` suites pass unmodified; anon Landing identical for both values.
- [ ] Flag ON: e2e asserts `ui-v2-dashboard-*` desktop + mobile; legacy absent; suites green.

## Forecast (400-line budget)

2 chained PRs: (1) seam + skeleton + baseline; (2) full V2 + tests + mobile; each <400.
