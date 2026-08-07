# Apply Progress: Rulebook light web shell (web-shell-rulebook)

**Mode**: Strict TDD (test runner: `pnpm test`, Vitest)
**Branch**: `feat/web-shell-rulebook`
**Delivery**: single PR (400-line budget: Low; no chaining needed)

## Completion Summary

All 14 tasks complete.

- `pnpm test` → 412 tests passing (19 files) — unit
- `pnpm test:e2e` → 14 tests passing — e2e
- `pnpm lint` → clean
- `npx tsc --noEmit` → exit 0

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 `app/layout.tsx` body base | `app/page.test.tsx` | Unit | ✅ 1/1 | ✅ Written (site-wide run) | ✅ Passed | ➖ Single (layout has one body base) | ➖ None needed |
| 1.2 `components/Sidebar.tsx` Teams-only + active | `features/teams/TeamList.test.tsx` | Unit | ✅ 12/12 | ✅ Written | ✅ Passed | ✅ 2 cases (nav present; no create link) | ✅ Constant extraction (`NAV_ITEMS`) |
| 1.3 `components/Topbar.tsx` route-conditional search | `features/teams/TeamList.test.tsx` | Unit | ✅ 12/12 | ✅ Written | ✅ Passed | ✅ 3 cases (home shows; off-home hides; heading always) | ✅ `showSearch` flag extracted |
| 1.4 `next/navigation` mocks added | `app/page.test.tsx`, `features/teams/TeamList.test.tsx` | Unit | ✅ 12/12 | ✅ Written | ✅ Passed | ➖ Single (repo standard mock) | ✅ `nav.pathname` holder for overrides |
| 2.1–2.3 `TeamList.tsx` CTA + cards + empty states | `features/teams/TeamList.test.tsx` | Unit | ✅ 12/12 | ✅ Written | ✅ Passed | ✅ 2 cases (heading CTA href; empty/no-match strings) | ✅ Reused `Link` CTA classes |
| 2.4 `not-found.tsx` light panel | `app/teams/[teamId]/not-found.test.tsx` | Unit | ✅ 2/2 | ✅ Written (approval from existing) | ✅ Passed | ✅ 2 existing cases preserved | ➖ None needed |
| 2.5 New assertions (search hidden, Teams-only nav, CTA) | `features/teams/TeamList.test.tsx` | Unit | ✅ 9/9 | ✅ Written | ✅ Passed | ✅ complementary home/off-home | ✅ shared `nav.pathname` |

### Test Summary
- **Total tests written in this change**: 4 (3 new TeamList suites + 1 CTA) — plus 2 mock lines added to existing files (0 assertion edits).
- **Total tests passing**: 412 unit + 14 e2e.
- **Layers used**: Unit (412), Integration (0), E2E (14).
- **Approval tests** (refactoring): 0 — the restyle preserved existing behavior; no behavior change to existing assertions, so existing tests acted as the approval net (12/12 safety net confirmed across all modified surfaces).
- **Pure functions created**: 0 — changes are presentation-only.

## Work Unit Evidence

| Unit | Focused test command + result | Runtime harness + result | Rollback boundary |
|------|-------------------------------|--------------------------|-------------------|
| 1 Shell (layout/Sidebar/Topbar + tests) | `pnpm vitest run app/page.test.tsx features/teams/TeamList.test.tsx` → 14 passed | `pnpm dev` → `/` rendered light shell + search visible; `pnpm test:e2e` 14 passed (home assertions green) | `app/layout.tsx`, `components/Sidebar.tsx`, `components/Topbar.tsx`, their tests — revert without touching home cards |
| 2 Home + not-found (TeamList/not-found + tests) | `pnpm vitest run features/teams/TeamList.test.tsx "app/teams/[teamId]/not-found.test.tsx"` → 15 passed | `pnpm dev` → `/teams/create` loads error-free without search; home CTA navigates | `features/teams/TeamList.tsx`, `app/teams/[teamId]/not-found.tsx`, their tests — revert without touching shell |
| 3 Docs | `pnpm test` → 412 passed | N/A — docs-only unit | `openspec/changes/web-shell-rulebook/*` artifacts |

## Deviations from Design

None — implementation matches design.md and the locked user spec exactly. Token usage restricted to `#12225a`, `#d11938`, `#f8fafc`, `#e2e8f0`, slate scale; no new shadow/zebra variants introduced.

## Issues Found

- The `act(...)` React warnings in `TeamList.test.tsx` are **pre-existing** (from the original test file's direct render + hydration flow) and were present before this change; they are warnings, not failures, and all tests pass.
- `not-found.tsx` uses `<h2>` text "Team not found" (matches the locked spec's "h2 navy 'Team not found'") — the existing test `/team not found/i` still resolves it via heading role, so the contract holds.
