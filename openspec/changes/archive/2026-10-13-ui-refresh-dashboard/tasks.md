# Tasks: ui-refresh — Dashboard V2 Seam

## Review Workload Forecast

Decision needed before apply: No (chain strategy decided: stacked-to-main)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main (PR 2 base = PR 1 branch)
400-line budget risk: Medium

Estimated changed lines: ~530 (Slice 1 ~180 · Slice 2 ~350; each <400). Delivery strategy: ask-on-risk; chain decided by precedent #326→#328, #335.

**LEGACY = VERIFY-ONLY**: no legacy test/heading/testid edits; new tests in NEW files; Landing branch in `app/page.tsx` untouched.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Seam + skeleton + flag-ON baseline | PR 1 (base = main) | `pnpm exec vitest run features/dashboard` | Playwright local: cookie before goto (`e2e/ui-refresh-roster.spec.ts`) | Revert `HomeDashboard` branch, `DashboardV2.tsx`, e2e additions |
| 2 | Full V2 + component/mobile tests | PR 2 (base = PR 1 branch) | `pnpm exec vitest run features/dashboard/DashboardV2.test.tsx` | Playwright desktop + inline 390×844 | Revert V2 content + tests/e2e; seam falls back to skeleton |

## Slice 1 — Seam + V2 skeleton + flag-ON baseline (~180 lines)

- [x] 1.1 RED: Create `features/dashboard/DashboardV2.test.tsx`: `UiFlagProvider initialUiFlag` → `HomeDashboard` seam mounts `ui-v2-dashboard-*`; absent → `Dashboard` legacy. — UIR-2. Verify: `pnpm exec vitest run features/dashboard` (fails).
- [x] 1.2 GREEN: Modify `features/dashboard/HomeDashboard.tsx`: `uiV2 = useUiFlag()`; `uiV2 ? <DashboardV2 authenticated userName/> : <Dashboard authenticated userName/>`; zero legacy edits, never both. — UIR-2. Verify: `npx tsc --noEmit`; `pnpm lint`.
- [x] 1.3 Create `features/dashboard/DashboardV2.tsx` skeleton: welcome header, `ui-v2-dashboard-*` landmarks, AND the "Your teams" link containing "ready to improve" (flag-ON helper `createTeamAndOpenList` clicks it); legacy hooks only. — UIR-2. Verify: `pnpm exec vitest run features/dashboard`.
- [x] 1.4 Extend `e2e/ui-refresh-roster.spec.ts`: flag-ON `/` desktop (`ui-v2-dashboard-*` visible, `#dashboard-teams-heading` count 0); triangulate `bb-ui=legacy` + absent cookie → legacy markers, V2 count 0. — UIR-2, UIR-4. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [x] 1.5 VERIFY-ONLY: `pnpm test` + `AUTH_MODE=local pnpm exec playwright test` flag-OFF, zero legacy edits. — UIR-3.

**Close-out**: `feat(ui-refresh): add dashboard V2 seam (refs #339)`.

## Slice 2 — Full V2 + tests + mobile (~350 lines)

- [x] 2.1 RED: Extend `DashboardV2.test.tsx`: attention zone (proposals, LIVE badge, pending results), next-match card, stat cards (Teams/Leagues/Matches/W-D-L/Squad PE), your teams, my leagues; English chrome; no legacy markers; no fetch beyond the two legacy endpoints. — UIR-2. Verify: `pnpm exec vitest run features/dashboard` (fails).
- [x] 2.2 GREEN: Finish `DashboardV2.tsx` per Stitch `04 dashboard` / `M 04`: same hooks as legacy, responsive CSS (mobile stacked, stats 2×2), reuse `PendingAttention`/`LeagueCard` where markup fits. — UIR-2. Verify: `pnpm exec vitest run features/dashboard`; `npx tsc --noEmit`; `pnpm lint`.
- [x] 2.3 Add mobile e2e case (390×844, flag ON → `ui-v2-dashboard-*` visible, legacy count 0). — UIR-4. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [x] 2.4 VERIFY-ONLY: rerun `pnpm test` + local Playwright; grep `useUiFlag()` at exactly three seams; NO flip; Landing branch flag-free. — UIR-3, UIR-5.

**Close-out**: `feat(ui-refresh): translate dashboard V2 desktop and mobile (refs #339)`.

## Out of scope (do not touch)

Legacy tests/headings/labels, default flips, theme tokens, other screens, cookie writer.
