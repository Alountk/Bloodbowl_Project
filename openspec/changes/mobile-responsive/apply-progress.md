# Apply Progress — Mobile-Responsive Views

Status: **Ready for verify**
Mode: Strict TDD (`pnpm test`, vitest)
Branch: `feat/mobile-responsive` (from `main`)

## Work Unit Evidence

| Unit | Evidence | Required value |
|------|----------|----------------|
| 1 — Shell drawer | Focused test | `npx vitest run app/AppShell.test.tsx app/page.test.tsx` → 6 passed (2 existing + 4 new) |
| | Runtime harness | `npx vitest run` full suite → 417 passed (drawer re-render under jsdom is the runtime boundary; no real-browser QA) |
| | Rollback boundary | Revert `components/AppShell.tsx`, `components/Sidebar.tsx`, `components/Topbar.tsx`, `app/AppShell.test.tsx`, `app/page.test.tsx` — no data/store change |
| 2 — Table scroll | Focused test | `npx vitest run features/teams/roster-table/RosterTable.test.tsx features/teams/create/PlayerAvailabilityTable.test.tsx features/teams/detail/TeamDetailView.test.tsx` → 55 passed |
| | Runtime harness | `npx playwright test e2e/create-team.spec.ts` → 14/14 passed (Desktop Chrome 1280×720) |
| | Rollback boundary | Revert the three table component + test files en bloc; outer `max-h-[55vh]` contracts preserved |
| 3 — Home/heroes | Focused test | `npx vitest run features/teams/TeamList.test.tsx` → 14 passed |
| | Runtime harness | `npx vitest run` full suite → 421 passed; e2e 14/14 |
| | Rollback boundary | Revert `TeamList.tsx`, `CreateTeamForm.tsx`, `TeamDetailView.tsx`, `TeamList.test.tsx` — additive classes only |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `app/page.test.tsx` | Integration | ✅ 412 | ✅ Written | ✅ Passed | ➖ Single (drawer presence) | ➖ None needed |
| 1.2 | `app/AppShell.test.tsx` | Integration | N/A (new file) | ✅ Written | ✅ Passed | ✅ 4 cases (landmark, open, scrim, link) | ✅ Clean |
| 2.1 | `components/Sidebar.tsx` | Unit | ✅ 412 | ✅ (via 1.2) | ✅ Passed | ✅ (drawer vs desktop) | ✅ Clean |
| 2.2 | `components/Sidebar.tsx` | Unit | ✅ 412 | ✅ (via 1.2) | ✅ Passed | ✅ (variant wrapper) | ✅ Clean |
| 2.3 | `components/AppShell.tsx` | Unit | ✅ 412 | ✅ (via 1.2) | ✅ Passed | ✅ (scrim + link close) | ✅ Clean |
| 2.4 | `components/Topbar.tsx` | Unit | ✅ 412 | ✅ (via 1.1) | ✅ Passed | ✅ (h1 truncate + compact search) | ✅ Clean |
| 3.1 | `RosterTable.test.tsx` | Unit | ✅ 412 | ✅ Written | ✅ Passed | ✅ 2 cases (outer + nested) | ✅ Clean |
| 4.1 | `RosterTable.tsx` | Unit | ✅ 413 | ✅ (via 3.1) | ✅ Passed | ✅ | ✅ Clean |
| 4.2 | `PlayerAvailabilityTable` | Unit | ✅ 413 | ✅ Written | ✅ Passed | ✅ (wrapper + outer preserved) | ✅ Clean |
| 4.3 | `TeamDetailView.tsx` | Unit | ✅ 413 | ✅ Written | ✅ Passed | ✅ (coaching wrap) | ✅ Clean |
| 5.1 | `TeamList.test.tsx` | Unit | ✅ 420 | ✅ Written | ✅ Passed | ✅ (flex-wrap + CTA py-2.5) | ✅ Clean |
| 5.2 | `CreateTeamForm.tsx` | Unit | ✅ | (structural — see note) | ✅ Passed | ➖ Structural | ➖ None needed |
| 5.3 | `TeamDetailView.tsx` | Unit | ✅ | (structural — see note) | ✅ Passed | ➖ Structural | ➖ None needed |

> **Note on 5.2 / 5.3**: pure additive responsive class escalations (`text-2xl md:text-[28px]`, `px-4 sm:px-6`) with no behavioral DOM change; triangulation skipped per module rule for structural tasks ("purely structural… explicitly note"). Covered by existing CreateTeamForm / TeamDetailView behavior suites (17 + 12 tests).

## Test Summary

- **Total tests written**: 9 (4 AppShell + 1 page hamburger + 1 RosterTable + 1 PlayerAvailabilityTable + 1 TeamDetailView coaching + 1 TeamList heading)
- **Total tests passing**: 421 (unit full suite) + 14 e2e
- **Layers used**: Unit (RosterTable/PlayerAvailabilityTable/TeamDetailView/TeamList), Integration (AppShell/page)
- **Approval tests** (refactoring): 0 — RosterTable outer-container test re-traversed one additional nesting level and retained the same `max-h-[55vh] overflow-auto` contract
- **Pure functions created**: 0 (component/class-focused change; no new logic)

## Verification Results

- `npx vitest run` → **21 passed (421 tests)** — sidebar aria, RosterTable outer container, headers, totals all preserved
- `npx playwright test` → **14/14 passed** (create-team.spec.ts, Desktop Chrome 1280×720)
- `pnpm lint` → clean
- `npx tsc --noEmit` → clean (exit 0)
- Task 6.3 (manual 375px/390px visual QA) → **pending for verify phase** (requires a real browser at a mobile viewport)

## Note on aria-label naming

`tasks.md`/`design.md`/`spec.md` consistently use **`aria-label="Open navigation menu"`** for the hamburger; the orchestrator prompt mentioned `"Open menu"`. Implemented per the persisted artifacts (`"Open navigation menu"`), which are the verify-phase contract. The drawer aside uses **`aria-label="Mobile navigation"`** per the locked design, so the desktop `getByLabelText("Sidebar")` stays unique even when the drawer is open.

## Commits

1. `feat(shell): add mobile drawer navigation with hamburger, scrim, and overlay sidebar`
2. `feat(tables): add nested horizontal scroll to rulebook tables`
3. `feat(mobile): wrap home heading and scale heroes for small screens`
4. (docs — this artifact + tasks)
