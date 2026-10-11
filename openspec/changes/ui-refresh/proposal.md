# Proposal: ui-refresh

## Intent

Approved Stitch 1:1 designs (`projects/16023060193335379804`) cannot be iterated in-app: suites assert exact legacy testids/headings and the repo has no flag mechanism (issue #325). Add a runtime flag so redesigned V2 screens ship while everyone else keeps the current UI.

## Scope

### In Scope
- Cookie flag `bb-ui=next` + `useUiFlag()` mirroring `bb-theme`/`bb-locale` (server read in `app/layout.tsx`, client fallback-to-default).
- Seam in `app/teams/[teamId]/page.tsx`: `TeamDetailView` vs `TeamDetailViewV2`, same props contract.
- `TeamDetailViewV2` (desktop + mobile) translating approved Stitch designs (designs stay outside the repo).
- Flag-ON e2e for the V2 roster; new openspec capability for the mechanism.

### Out of Scope
- Other screens (live match, dashboard…) — later slices.
- Token/theme changes (`theme-switching` covers them).
- Legacy testid/heading contract changes.
- Flipping defaults (per screen, final step of its slices).

## Capabilities

### New Capabilities
- `ui-refresh`: `bb-ui` cookie resolution (server + client), `useUiFlag()` fallback, per-screen legacy-vs-V2 selection, flag-ON e2e.

### Modified Capabilities
- None — legacy requirements unchanged; V2 additive behind the flag.

## Approach

- Flag: `bb-ui` read in `app/layout.tsx` beside `bb-locale`/`bb-theme`; `useUiFlag()` mirrors `useTheme` (absent/invalid → legacy). Cookie, not env: no `NEXT_PUBLIC_*` exists.
- Seam: page renders `TeamDetailView` or `TeamDetailViewV2` with identical props — one branch, zero legacy edits.
- V2 copies Stitch design intent; design files never imported.
- Existing suites run flag OFF; new `e2e/ui-refresh-roster.spec.ts` sets the cookie.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `lib/ui-flag/` (new) | New | `useUiFlag()` + cookie helper |
| `app/layout.tsx` | Modified | server `bb-ui` read |
| `app/teams/[teamId]/page.tsx` | Modified | seam branch |
| `features/teams/detail/TeamDetailViewV2.tsx` (new) | New | redesigned roster |
| `e2e/ui-refresh-roster.spec.ts` (new) | New | flag-ON e2e |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Dual-surface maintenance drift | Med | shared data/hooks; V2 replaces presentation only |
| Testid contract broken by seam | Med | flag OFF in existing suites; one-branch seam |
| Slice exceeds 400 lines | Med | chained PRs per forecast |

## Rollback Plan

Revert chained PRs in reverse (V2 → seam → flag); legacy stays default so current behavior returns. `bb-ui` is ignored by older builds.

## Dependencies

None external.

## Success Criteria

- [ ] Flag OFF: existing assertions unchanged; flag ON: e2e passes (desktop + mobile).
- [ ] Absent/invalid value falls back to legacy (no crash, no FOUC).
- [ ] `pnpm test`, local Playwright, `pnpm lint`, `npx tsc --noEmit` green.

## Forecast (400-line budget)

3 chained PRs stacked to main: (1) `lib/ui-flag/` + layout wiring + unit tests; (2) seam branch + flag-ON e2e harness; (3) `TeamDetailViewV2` desktop + mobile + flag-ON e2e. Each <400 authored lines.
