# Proposal: ui-refresh — Leagues V2 Seam (Screen 5)

## Intent

Seam 5 of `bb-ui=next` (#347): detail, list, dashboard and the create wizard are V2, but `/leagues` still renders legacy with the flag ON — the V2 dashboard's "My leagues" link (`href="/leagues"`) lands on an old screen, breaking tester continuity. Fifth declared seam, following the four archived predecessors.

## Scope

### In Scope
- Seam in `app/leagues/page.tsx`: flag ON → `LeaguesListViewV2`, flag OFF → `LeagueList`, identical zero-props contract (the route passes none), never both; zero legacy edits (`features/leagues/LeagueList.tsx` is VERIFY-ONLY).
- `LeaguesListViewV2` from Stitch "Blood Bowl 2025 — Ligas (/leagues)" / "M 09 leagues — Ligas (Móvil)": hero "Mis Ligas" + CTA "+ Nueva liga" (reuses `CreateLeagueModal` unchanged), sections "Mis Ligas" / "Ligas abiertas" reusing `LeagueCard` + `StatusBadge`, empty/error states — i18n via the existing `leagues.*` keys (new keys only where none exists, both locales).
- Presentation-only: V2 reuses the legacy surface's own machinery — `useLeagues()` (`GET /api/leagues`), `useSession`, `isOwnerEquivalent` — no new data paths.
- Testids `ui-v2-leagues-*`; component tests (RED→GREEN) + flag-ON e2e desktop/mobile + triangulation in `e2e/ui-refresh-roster.spec.ts`.
- Delta: MODIFIED UIR-2 → 5 declared seams + flag-free league-detail scenario.

### Out of Scope
- Default flip (UIR-5); the league detail route (`/leagues/[id]`, `LeagueDetail`); create-league as a standalone screen; matchday/season/negotiation screens; cookie writer/dev toggle; legacy edits (VERIFY-ONLY).

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `ui-refresh`: UIR-2 restated with the leagues seam (both surfaces take no props; V2 reuses `useLeagues`/`LeagueCard`/`StatusBadge`/`CreateLeagueModal`; `/leagues/[id]` stays flag-free). UIR-1/3/4/5 unchanged.

## Approach

- One `useUiFlag()` branch in `app/leagues/page.tsx` (route becomes `"use client"`, precedent `app/teams/page.tsx`); `LeagueList` itself never consults the flag, so its OTHER export (`LeagueCard`, imported by both dashboards) is structurally unaffected.
- Slice 1 ships the seam + a functional V2 skeleton (hero, sections with real cards, empty states) so flag-ON desktop e2e + triangulation pass; slice 2 completes the Stitch chrome, mobile case and expanded tests.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/leagues/page.tsx` | Modified | `useUiFlag()` seam branch (the only route file edited) |
| `features/leagues/LeaguesListViewV2.tsx` (+ test) | New | redesigned list, `ui-v2-leagues-*` |
| `e2e/ui-refresh-roster.spec.ts` | Modified | flag-ON `/leagues` cases |
| `.../specs/ui-refresh/spec.md` (delta) | New | MODIFIED UIR-2 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| No flag-ON harness walks `/leagues` today (traced) | Med | New e2e cases `goto("/leagues")` directly; the dashboard V2 link becomes the future walk |
| Legacy contract broken | Med | flag OFF default; VERIFY-ONLY; `app/leagues/page.test.tsx` unmodified (no provider → legacy fallback) |
| `LeagueList`'s dual role (`LeagueCard` export) | Med | seam lives in the ROUTE, never in `LeagueList.tsx` |
| Slice exceeds 400 lines | Med | 2 chained PRs <400 each; `size:exception` standing rule if exceeded |

## Rollback Plan

Revert the 2 chained PRs in reverse (V2 → seam); flag OFF restores the legacy list immediately.

## Dependencies

- Archived `ui-refresh`, `ui-refresh-teams-list`, `ui-refresh-dashboard`, `ui-refresh-create-wizard` in main: `lib/ui-flag/`, layout provider, four seams.

## Success Criteria

- [ ] Flag OFF: `/leagues` suites pass unmodified (component + 19 flag-OFF e2e specs that `goto("/leagues")`).
- [ ] Flag ON: e2e asserts `ui-v2-leagues-*` desktop + mobile; `#leagues-heading` count 0.

## Forecast (400-line budget)

2 chained PRs: (1) seam + V2 skeleton + flag-ON baseline (~350); (2) full V2 + tests + mobile (~330); each <400.
