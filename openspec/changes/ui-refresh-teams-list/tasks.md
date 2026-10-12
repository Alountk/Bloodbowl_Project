# Tasks: ui-refresh — Teams List V2 Seam

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~530 (Slice 1 ~180 · Slice 2 ~350) |
| 400-line budget risk | Medium (total; each slice <400) |
| Chained PRs recommended | Yes (2 slices) |
| Suggested split | PR 1 seam+skeleton+e2e → PR 2 full V2+tests |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (2 PRs) — decided (precedent #326→#328) |

Decision needed before apply: No (chain strategy decided: stacked-to-main)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main (PR 2 base = PR 1 branch)
400-line budget risk: Medium

**LEGACY = VERIFY-ONLY**: no legacy test/heading/testid edits; new tests in NEW files.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Seam + V2 skeleton + flag-ON baseline | PR 1 (base = main) | `pnpm exec vitest run features/teams/list` | Playwright local: cookie before `goto`, wizard team → `/teams` (`e2e/ui-refresh-roster.spec.ts`) | Revert page branch, `features/teams/list/`, e2e additions |
| 2 | Full V2 + component/mobile tests | PR 2 (base = PR 1 branch) | `pnpm exec vitest run features/teams/list/TeamsListViewV2.test.tsx` | Playwright desktop + inline 390×844 | Revert V2 content + tests/e2e; seam falls back to skeleton |

## Slice 1 — Seam + V2 skeleton + flag-ON baseline (~180 lines)

- [x] 1.1 RED: Create `features/teams/list/TeamsListViewV2.test.tsx`: page under `UiFlagProvider initialUiFlag` → `ui-v2-teams-grid`; no provider → legacy. — UIR-2. Verify: `pnpm exec vitest run features/teams/list` (fails).
- [x] 1.2 GREEN: Modify `app/teams/page.tsx`: `"use client"`; `const uiV2 = useUiFlag()`; `uiV2 ? <TeamsListViewV2 /> : <TeamsPage />`; zero legacy edits, never both. — UIR-2. Verify: `npx tsc --noEmit`; `pnpm lint`.
- [x] 1.3 Create `features/teams/list/TeamsListViewV2.tsx` skeleton with `ui-v2-teams-*`; no `features/teams/api`. — UIR-2. Verify: `pnpm exec vitest run features/teams/list`.
- [x] 1.4 Extend `e2e/ui-refresh-roster.spec.ts`: `/teams` desktop (`ui-v2-teams-grid` visible, `#teams-unassigned-heading` absent); triangulate `bb-ui=legacy` + absent cookie → legacy headings, `ui-v2-teams-*` count 0. — UIR-2, UIR-4. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [x] 1.5 VERIFY-ONLY: `pnpm test` + `AUTH_MODE=local pnpm exec playwright test` flag-OFF, zero legacy edits. — UIR-3.

**Close-out**: `feat(ui-refresh): add teams list V2 seam (refs #335)`.

## Slice 2 — Full V2 translation + tests (~350 lines)

- [ ] 2.1 RED: Extend `TeamsListViewV2.test.tsx`: sections by `leagueId`, league badge, search filters, CTA → `/teams/create`, empty states, no legacy markers. — UIR-2. Verify: `pnpm exec vitest run features/teams/list` (fails).
- [ ] 2.2 GREEN: Finish `TeamsListViewV2.tsx` per Stitch `05 teams` / `M 05`: cards (emblem, name, race, TV, treasury), responsive CSS, i18n `teams.*`; NO hamburger (`AppNav` owns it); no `features/teams/api`. — UIR-2. Verify: `pnpm exec vitest run features/teams/list`; `npx tsc --noEmit`; `pnpm lint`.
- [ ] 2.3 Add mobile e2e case (390×844, flag ON → `ui-v2-teams-card-*` visible, legacy count 0). — UIR-4. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [ ] 2.4 VERIFY-ONLY: rerun `pnpm test` + local Playwright; grep: `useUiFlag()` only at the two seams; NO flip. — UIR-3, UIR-5.
- [ ] 2.5 RED/GREEN: delete parity — card delete control in V2 wired through the SAME handler channel legacy `TeamsPage` uses (store handlers; `TeamDeleteModal` reusable as-is), Spanish guard copy, zero legacy file edits. — UIR-2. Verify: `pnpm exec vitest run features/teams/list` (fails before) + flag-ON e2e deletes-and-persists case if it fits the existing spec harness.

**Close-out**: `feat(ui-refresh): translate teams list V2 desktop and mobile (refs #335)`.

## Out of scope (do not touch)

Legacy tests/headings/testids, default flips, theme tokens, other screens.
