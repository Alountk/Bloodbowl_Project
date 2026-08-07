# Tasks: Create Team Rulebook Form

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 270–330 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

Single-PR rollback = `git revert` of the change commit (self-contained, no migration).

## Phase 1: RosterTable — Drop CANT. (TDD RED→GREEN)

- [x] 1.1 RED: In `features/teams/roster-table/RosterTable.test.tsx` update editable header test to 11 cols — 10 rulebook headers + blank th, `queryByText("CANT.")` null (replace `ES_EDITABLE_HEADERS` const).
- [x] 1.2 RED: Replace the two qty tests with a no-qty assert: editable `min:2 max:4` positional row first cell is POSICIÓN, no `2-4`/`0-16` text via `queryByText`.
- [x] 1.3 RED: Update editable totals test colSpan sum 12→11 (`remainingBudget={690000}`, label 9+cost 1+budget 1).
- [x] 1.4 RED: Update footer colSpan test "5+6+1 editable"→"4+6+1=11".
- [x] 1.5 GREEN: In `RosterTable.tsx` delete `EDITABLE_HEADERS`, render `RULEBOOK_HEADERS` in both modes; delete the qty `<td>`; editable totals `colSpan={10}`→`{9}`; footer editable `colSpan={5}`→`{4}`. Keep `min`/`max` on positionals for `(n/max)` counters.
- [x] 1.6 Run `pnpm test` — these RosterTable + existing tests green.

## Phase 2: CreateTeamForm — Rulebook Light Restyle

- [x] 2.1 In `features/teams/create/CreateTeamForm.tsx` wrap form: `mx-auto max-w-[900px] space-y-6 bg-white px-6 py-6 text-[#1a1a1a] shadow-[0_4px_8px_rgba(0,0,0,0.35)]`; replace h1 with navy hero `header bg-[#12225a] px-6 py-[22px] text-white`, h1 `text-[26px] font-black tracking-[0.02em]` + subtitle `mt-2 text-[13px] text-[#cbd5e1]` (text unchanged).
- [x] 2.2 Swap `fieldClassName` to `bg-white border-slate-300 text-slate-900 focus:border-blue-500`; apply to name input, race select, coaching inputs, league select. Restyle labels to `text-slate-700`.
- [x] 2.3 Restyle race-change dialog light amber `border-amber-300 bg-amber-50 text-amber-900`; Confirm `bg-[#12225a]`, Cancel slate; keep `role="alertdialog"` + texts.
- [x] 2.4 Add book h2 "Roster builder" `border-b-[3px] border-[#d11938] text-[16px] text-[#12225a]` at top of `<section aria-label="Roster builder">`.
- [x] 2.5 Reorder: move `<RosterTable>` block to FIRST inside builder (before budget bar + role add sections); add `mb-3` as its separator. Keep `RosterTable` props identical.
- [x] 2.6 Restyle budget bar via classes only: left `text-[#334155]`, right `text-[#64748b]` / over `text-[#d11938] font-semibold`, track `bg-[#e2e8f0]`, fill `bg-[#12225a]`/`bg-[#d11938]`. Keep exact strings + `formatGold`.
- [x] 2.7 Restyle role add `<li>` cards `border-[#e2e8f0] bg-[#f1f5f9]`, name `text-[#1a1a1a]`, cost `text-[#64748b]`; keep `aria-label={"Add "+name}`, `(n/max)`, `role+`s` h3s, disabled logic.
- [x] 2.8 Restyle Coaching Staff card `border-[#e2e8f0] bg-[#f1f5f9]`; h2 to book style; keep ENGLISH labels, `getByLabel` targets, `{X}k gc` strings.
- [x] 2.9 Restyle errors `role="alert"` `text-red-600` and submit `bg-[#12225a] hover:bg-[#0f1d48] text-white`; keep texts byte-identical.

## Phase 3: CreateTeamForm Tests — Order & No-CANT.

- [x] 3.1 ADD in `features/teams/create/CreateTeamForm.test.tsx`: table-first — `within(region "Roster builder")` the RosterTable empty-state `<p>` precedes budget bar/add `<h3>`s (assert via `compareDocumentPosition`).
- [x] 3.2 ADD: after adding a player, `getAllByRole("columnheader")` list has no `CANT.` (11 editable cols).
- [x] 3.3 Verify existing CreateTeamForm + `app/teams/create/page.test.tsx` text/role asserts still pass; run `pnpm test` — full suite green.

## Phase 4: E2E + Documentation

- [x] 4.1 Run `e2e/create-team.spec.ts` untouched — all 14 tests green, no string diffs.
- [x] 4.2 Confirm `useCreateTeamForm.ts` unchanged (git diff empty for it).

## Key Learnings

1. The phase skills track the SDD pipeline from proposal through tasks while preserving every byte-identical e2e contract string.
2. Dropping CANT. collapses editable RosterTable colSpans from 12 to 11 across headers, totals, and footer.
3. The table-first reorder keeps the `Roster builder` region and all its add-card texts intact.
4. Restyle touches `CreateTeamForm.tsx` Tailwind classes only, never the state hook.
