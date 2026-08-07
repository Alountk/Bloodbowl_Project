# Apply Progress: Create Team Rulebook Form

**Status**: Complete (20/20 tasks)
**Mode**: Strict TDD
**Delivery**: single PR — `feat/create-team-rulebook` from main
**Branch**: `feat/create-team-rulebook`

## Completed Tasks

All Phase 1–4 tasks are done. See `tasks.md` for per-task `[x]` marks (20 checked, 0 pending).

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 editable header 11 cols no CANT. | `features/teams/roster-table/RosterTable.test.tsx` | Unit | ✅ 32/32 | ✅ Written | ✅ Passed | ✅ 10 headers + blank th + CANT. null | ✅ Simplified unary header map |
| 1.2 no qty cell | `features/teams/roster-table/RosterTable.test.tsx` | Unit | ✅ (same net) | ✅ Written | ✅ Passed | ✅ min:2/max:4 + default-min (0-16) absent | ➖ None needed |
| 1.3 editable totals colSpan 12→11 | `features/teams/roster-table/RosterTable.test.tsx` | Unit | ✅ 32/32 | ✅ Written | ✅ Passed | ➖ Single numeric | ✅ `colSpan={9}` literals |
| 1.4 footer colSpan 5→4 editable | `features/teams/roster-table/RosterTable.test.tsx` | Unit | ✅ 32/32 | ✅ Written | ✅ Passed | ✅ readOnly(10) + editable(11) both asserted | ✅ Folded `readOnly?4:5` → `4` |
| 2.x CreateTeamForm restyle | `features/teams/create/CreateTeamForm.test.tsx` (+ `page.test.tsx`) | Integration | ✅ 19 existing | ✅ 2 new written first (3.1 order, 3.2 no-CANT.) | ✅ Passed | ✅ 3.1 asserts before-budget AND before-add-heading; 3.2 via full form | ➖ None needed (class-only, no logic) |

**Approval tests (restyle)**: The 19 pre-existing CreateTeamForm text/role/aria assertions + 6 page.test assertions served as approval tests; all passed after the restyle, confirming behavior (regions, labels, `(n/max)`, dialogs, error texts) was preserved byte-for-byte. CSS class changes are validated by unit/E2E integration, not class assertions (banned by strict-tdd assertion rules).

### Test Summary
- Total tests written (new/changed): 3 authored assertions updated in RosterTable + 2 new form tests
- Total suite: 397 unit (18 files) + 14 e2e
- Layers used: Unit (RosterTable), Integration (CreateTeamForm/page), E2E (create-team.spec)
- Pure functions created: 0 (change is CSS + layout reorder only)

## Work Unit Evidence

| Unit | Focused test command & result | Runtime harness & result | Rollback boundary |
|------|-------------------------------|--------------------------|-------------------|
| 1. RosterTable CANT. removal | `npx vitest run features/teams/roster-table/RosterTable.test.tsx` → 31 passed | No standalone runtime boundary (deterministic render component); form-level harness covered in Unit 2. `N/A` with reason: component tested through its own render harness. | `RosterTable.tsx` + `RosterTable.test.tsx`; revert removes CANT. removal without touching form restyle |
| 2. CreateTeamForm restyle + reorder | `npx vitest run features/teams/create/CreateTeamForm.test.tsx app/teams/create/page.test.tsx` → 27 passed | `pnpm test:e2e` → 14 passed (full user journey: create team, budget math, coaching, over-budget) | `CreateTeamForm.tsx` + `CreateTeamForm.test.tsx`; revert removes restyle/reorder without touching table column change |

## Deviations from Design

- **Task 2.5 separator**: design said "add `mb-3` as its separator". The RosterTable root is `<div className="overflow-x-auto">` which has no margin slot, so I wrapped it in `<div className="mb-3">` to carry the separator. `RosterTable` props and output byte-identical; no documented alternative existed for applying a margin directly. Otherwise implementation matches design.md exactly.
- **Design open question — visible h2 "Roster builder"**: design D3 recommends adding it; the orchestrator authorized it ("Add a visible book-style h2 'Roster builder' at the top of that section if the design calls for it"). Added. The section's `aria-label` is unchanged.

## Issues Found

- None. No pre-existing failures; no e2e string diffs; no logic/hook/contract changes.
- Note: suite count was 396 at task planning; it is 397 now because Phase 1 merged the two qty-range unit tests into one (-1) and Phase 3 added two form tests (+2).

## Commits

1. `e066d99` feat(roster-table): drop CANT. column from editable mode (11 cols)
2. `57158cb` feat(teams): restyle CreateTeamForm to rulebook light + table-first roster builder

## Gates (final)

- `pnpm test` → 397 passed (18 files)
- `pnpm test:e2e` → 14 passed (untouched spec, no diffs)
- `pnpm lint` → clean
- `npx tsc --noEmit` → clean
- `useCreateTeamForm.ts`, `formatGold`, contract strings, region names, aria-labels, roles, dialog behavior → all unchanged (git diff empty)
- Authored churn: 183 lines (109 insertions + 74 deletions) — under 400, single-PR maintained
