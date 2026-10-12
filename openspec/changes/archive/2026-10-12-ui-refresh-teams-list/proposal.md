# Proposal: ui-refresh — Teams List V2 Seam (Screen 2)

## Intent

Seam 2 of `bb-ui=next` (issue #335): team detail is V2, so its back button lands users on legacy `/teams` — continuity breaks with the flag ON. Adds the second declared seam (`TeamsPage` vs `TeamsListViewV2`), proving the archived pattern scales beyond screen 1.

## Scope

### In Scope
- Seam in `app/teams/page.tsx`: flag ON → V2, flag OFF → `TeamsPage`, never both; no props; zero legacy edits.
- `TeamsListViewV2` from Stitch `05 teams` / `M 05` 1:1: cards, sections "Sin liga"/"En liga" with league badge, search, "Crear equipo" CTA, empty states; hamburger stays `AppNav` chrome.
- Testids `ui-v2-teams-*` (no collision with detail's `ui-v2-*`).
- Component tests (RED→GREEN) + flag-ON e2e extension in `e2e/ui-refresh-roster.spec.ts` (desktop + mobile).
- Delta: MODIFIED UIR-2 → declared seams (detail + list entries).

### Out of Scope
- Default flip (UIR-5); other screens; theme tokens; cookie writer/dev toggle; legacy testid/heading/behavior edits (VERIFY-ONLY).

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `ui-refresh`: UIR-2 restated from single detail seam to declared seams (detail + teams list), each rendering exactly one of legacy/V2 with identical props; scenarios updated. UIR-1/3/4/5 unchanged.

## Approach

- Reuse the archived design (in main): `useUiFlag()` resolved once, one branch, one props object — both surfaces take zero props.
- V2 shares legacy's providers (`useApp`, `useLeagueNameMap`, `useI18n`, `TeamSearch`); no `features/teams/api`; responsive CSS.
- Flag-ON e2e extends the roster spec: cookie before `goto`, reuse the local-mode wizard helper.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/teams/page.tsx` | Modified | `"use client"` + seam branch |
| `features/teams/list/TeamsListViewV2.tsx` (+ test) | New | redesigned list, `ui-v2-teams-*` |
| `e2e/ui-refresh-roster.spec.ts` | Modified | flag-ON `/teams` cases |
| `.../specs/ui-refresh/spec.md` (delta) | New | MODIFIED UIR-2 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Legacy `/teams` contract broken | Med | flag OFF default; VERIFY-ONLY |
| V2/legacy behavior drift (delete) | Med | no new data paths; parity gap = open question |
| Slice exceeds 400 lines | Med | 2 chained slices, each <400 |

## Rollback Plan

Revert the 2 chained PRs in reverse (V2 → seam); the flag-OFF default restores `/teams` immediately.

## Dependencies

- Archived `ui-refresh` slices 1–3 in main (`lib/ui-flag/`, layout provider, detail seam).

## Success Criteria

- [ ] Flag OFF: `/teams` suites pass unmodified (zero legacy edits).
- [ ] Flag ON: e2e asserts `ui-v2-teams-*` desktop + mobile; legacy absent.
- [ ] `pnpm test`, local Playwright, `pnpm lint`, `npx tsc --noEmit` green.

## Forecast (400-line budget)

2 chained PRs: (1) seam + skeleton + flag-ON baseline; (2) full V2 + tests. Each <400 lines.
