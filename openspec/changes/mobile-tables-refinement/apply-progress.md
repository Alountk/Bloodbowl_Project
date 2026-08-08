# Apply Progress: Mobile Tables Refinement

- **Change**: `mobile-tables-refinement`
- **Mode**: Strict TDD
- **Artifact store**: openspec
- **Branch**: `feat/mobile-tables-refinement`
- **Delivery strategy**: single-pr (forecast Low; no chain needed)
- **Status**: ALL tasks complete — ready for verify

## Completed Tasks (cumulative)

### Phase 1: useIsDesktop Hook
- [x] 1.1 RED `useIsDesktop.test.ts`: initial render returns `true`
- [x] 1.2 RED: flip false / stay true / guard / listener cleanup
- [x] 1.3 GREEN `features/teams/hooks/useIsDesktop.ts`

### Phase 2: matchMedia Test Util
- [x] 2.1 Created `features/teams/test/matchMedia.ts`
- [x] 2.2 Used helper in hook tests; re-render updates verified

### Phase 3: RosterTable Mobile Cards
- [x] 3.1 RED readOnly card: name, subtitle, cost, chips, Ninguna, PRIMARIAS/SECUNDARIAS
- [x] 3.2 RED editable card: rename/remove a11y labels; desktop no stacked nodes
- [x] 3.3 GREEN: shared cellData; `isDesktop ? book table : mobile cards`
- [x] 3.4 Desktop suite green unchanged (jsdom → isDesktop true)

### Phase 4: PlayerAvailabilityTable Mobile Rows
- [x] 4.1 RED row: name+subtitle+cost, counter, "+ Add" visible
- [x] 4.2 RED: hide-at-max, disabled-over-budget, chips+labeled rows
- [x] 4.3 GREEN: shared rowData; desktop table vs mobile stacked rows
- [x] 4.4 Desktop suite green unchanged

### Phase 5: Select Wrappers
- [x] 5.1 RED Race select wrapper + chevron + 16px font
- [x] 5.2 RED League type wrapper + chevron + preserved aria-label/handler
- [x] 5.3 GREEN wrap both selects (relative div, chevron, text-[16px])

### Phase 6: Verification
- [x] 6.1 `pnpm test` full unit suite green — **446 tests / 21 files**
- [x] 6.2 `playwright test` Desktop 1280 e2e untouched — **14 passed**
- [x] 6.3 Spec scenarios covered (mapping below)

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1–1.3 (hook) | `features/teams/hooks/useIsDesktop.test.tsx` | Unit | N/A (new) | ✅ Written | ✅ 6/6 | ✅ 6 cases (default, true, false, up, down, cleanup) | ➖ None needed |
| 2.1–2.2 (util) | `features/teams/test/matchMedia.ts` | Unit (helper) | N/A (new) | ✅ Written via hook test | ✅ 6/6 | ✅ setMatches up+down | ➖ None needed |
| 3.1–3.4 (RosterTable) | `features/teams/roster-table/RosterTable.test.tsx` | Unit | ✅ 35/35 | ✅ 10 written, 3 RED | ✅ 45/45 | ✅ 10 cases | ✅ StatsChips/SkillAccessRows/buildPlayerData |
| 4.1–4.4 (Availability) | `features/teams/create/PlayerAvailabilityTable.test.tsx` | Unit | ✅ 8/8 | ✅ 7 written, 3 RED | ✅ 15/15 | ✅ 7 cases | ✅ shared rowData filter |
| 5.1–5.3 (Selects) | `features/teams/create/CreateTeamForm.test.tsx` | Unit | ✅ 17/17 | ✅ 2 written, 2 RED | ✅ 19/19 | ✅ 2 cases | ✅ SelectWithChevron extracted |
| 6.1–6.3 (Verify) | — (full suite + e2e) | E2E | — | — | — | 14 e2e green | — |

**RED notes**: 3 RosterTable + 3 Availability + 2 Select tests failed against the old desktop path before the `isDesktop` branch / chevron landed. The remaining new tests passed trivially pre-GREEN (text already present in the desktop table) and assert against the real mobile path post-GREEN.

**Font-size assertion deviation (documented)**: `text-[16px]` is asserted via the element's className because jsdom cannot compute resolved Tailwind styles, so `getComputedStyle` cannot prove the CSS contract. This is the only class-level assertion; all other mobile assertions are behavioral (roles, aria-labels, text content).

## Work Unit Evidence

| Evidence | Value |
|----------|-------|
| Focused test command + result | `npx vitest run features/teams/hooks features/teams/roster-table features/teams/create` → **45+15+19+6 tests passed** (focused files) |
| Full unit command + result | `pnpm test` → **446 passed (21 files, 0 failed)** |
| Runtime harness command + result | `npx playwright test` (Desktop Chrome 1280, e2e/create-team.spec.ts) → **14 passed** — real browser path confirms desktop markup/single-branch |
| Rollback boundary | Revert `feat/mobile-tables-refinement` branch: tables return to horizontal-scroll book rendering, selects to prior styling. No data/schema/migration affected. |

## Spec Scenario Coverage

| Spec (delta / main) | Scenario | Covered by |
|---------------------|----------|-----------|
| roster-table — Mobile Stacked Row-Cards | Read-only card | RosterTable.test "readOnly cards" (no table, subtitle, chips, cost, sections) |
| roster-table — Mobile Stacked Row-Cards | Editable keeps controls | RosterTable.test "editable name input and remove button" (onRename/onRemove) |
| roster-table — Mobile Stacked Row-Cards | No skills fallback | RosterTable.test "SKILLS 'Ninguna' fallback" |
| roster-table — Mobile Stacked Row-Cards | Desktop untouched | RosterTable desktop suite (35) + e2e 14 |
| roster-table — Scrollable (MODIFIED) | Mobile uses stacked cards, no scroll wrapper | RosterTable.test "renders stacked card (no book table)" |
| roster-table — Scrollable (MODIFIED) | Height cap + sticky header (desktop) | existing desktop tests (unchanged) |
| create-team — Mobile Availability Stacked Rows | content (name, subtitle, cost, counter, + Add) | Availability.test "stacked rows name subtitle cost" + "counter + Add" |
| create-team — Mobile Availability Stacked Rows | Add always visible | Availability.test "+ Add always visible" |
| create-team — Mobile Availability Stacked Rows | Row disappears at max | Availability.test "hides a row ... at max on mobile" |
| create-team — Mobile Availability Stacked Rows | Over-budget Add disabled, row stays | Availability.test "disabled over budget ... keeps row visible" |
| create-team — Native Select Wrapper | Race wrapper + chevron + 16px + changeRace | CreateTeamForm.test "wraps Race select" |
| create-team — Native Select Wrapper | League wrapper + chevron + aria-label + handler | CreateTeamForm.test "wraps League type select" |
| team-detail-view — Mobile ReadOnly Roster Inherits | mobile stacked / desktop unchanged | inherited by RosterTable branch; readOnly = no banner/footer |
| team-detail-view — Coaching Staff (MODIFIED) | horizontal scroll below md kept | untouched — coaching not converted (out of scope) |
| use-is-desktop (main spec) | SSR default, jsdom default, flip, guard, cleanup, single-branch | useIsDesktop.test 6 + RosterTable/Availability branch guards |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `features/teams/hooks/useIsDesktop.ts` | Created | SSR-safe `useState(true)` + matchMedia effect w/ guard, add/removeEventListener + legacy fallback, cleanup |
| `features/teams/hooks/useIsDesktop.test.tsx` | Created | 6 tests covering default/flip/change/cleanup |
| `features/teams/test/matchMedia.ts` | Created | `mockMatchMedia` stub + `setMatches` change dispatcher |
| `features/teams/roster-table/RosterTable.tsx` | Modified | Shared cellData; `isDesktop ? book table : mobile cards`; StatsChips + SkillAccessRows + SelectWithChevron helpers |
| `features/teams/roster-table/RosterTable.test.tsx` | Modified | +10 mobile-card tests (desktop 35 untouched) |
| `features/teams/create/PlayerAvailabilityTable.tsx` | Modified | Shared rowData (incl. hide-at-max filter); desktop table vs mobile stacked rows |
| `features/teams/create/PlayerAvailabilityTable.test.tsx` | Modified | +7 mobile-row tests (desktop 8 untouched) |
| `features/teams/create/CreateTeamForm.tsx` | Modified | `SelectWithChevron` wrapper around Race + League type selects; `appearance-auto text-[16px]` |
| `features/teams/create/CreateTeamForm.test.tsx` | Modified | +2 select-wrapper tests |

## Deviations from Design

1. **Font-size assertion** uses className (not `getComputedStyle`) because jsdom can't resolve Tailwind — documented above; behavior identical.
2. **Avatar/availability subtitle layout** on mobile: the `({race.name}, role)` and rulebook cost are rendered as siblings within one subtitle line so both are individually queryable (design's combined-string subtitle retained visually via ` · ` separator; the paren and cost are separate text nodes) — no behavioral difference.
3. No other deviations — mobile branches and desktop byte-identical behavior match design.

## Issues Found

- None. No pre-existing failures encountered (all safety nets were green).

## Test Results

- Unit: `pnpm test` → **446 passed, 21 files** (baseline 421 → +25 new mobile/select tests)
- Lint: `pnpm lint` → **0 errors, 0 warnings**
- Typecheck: `npx tsc --noEmit` → clean
- E2E: `npx playwright test` → **14 passed** (Desktop 1280, untouched)

## Remaining

None — all tasks complete. Next phase: **sdd-verify**.
