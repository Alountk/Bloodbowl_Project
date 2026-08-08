# Tasks: Mobile Tables Refinement

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 320–400 (RosterTable +80, Availability +70, hook +20, selects +30, tests +100) |
| 400-line budget risk | Low–Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Full mobile row-card + select change | Single PR | `npx vitest run features/teams/hooks features/teams/roster-table features/teams/create` | N/A — jsdom-only unit tests; desktop e2e 1280 already green and untouched | Revert PR: tables return to horizontal scroll, selects to prior styling |

## Phase 1: useIsDesktop Hook (RED → GREEN)

- [x] 1.1 RED `useIsDesktop.test.ts`: assert initial render returns `true` (default desktop)
- [x] 1.2 RED `useIsDesktop.test.ts`: mock `matchMedia` false → flips to `false`; true → stays `true`; undefined guard keeps `true`; listener removed on unmount
- [x] 1.3 GREEN `features/teams/hooks/useIsDesktop.ts`: `useState(true)` + effect with guard, add/removeEventListener + legacy fallback, cleanup

## Phase 2: matchMedia Test Util

- [x] 2.1 Create `features/teams/test/matchMedia.ts`: `mockMatchMedia(matches)` stubs `window.matchMedia`, exposes `setMatches()` that dispatches `change`
- [x] 2.2 Use helper in `useIsDesktop.test.ts` Phase 1 mocks; assert re-render updates

## Phase 3: RosterTable Mobile Cards (RED → GREEN)

- [x] 3.1 RED (`matchMedia` false): readOnly card asserts name line, subtitle `{name} · (Race, Rol)`, cost line, stats chips, SKILLS "Ninguna", PRIMARIAS/SECUNDARIAS rows
- [x] 3.2 RED: editable card — rename input `aria-label="Player name for {name}"` + remove btn `aria-label="Remove {name}"` still work; SKILLS fallback "Ninguna"; desktop branch has no stacked nodes
- [x] 3.3 GREEN `RosterTable.tsx`: extract shared cellData; `isDesktop ? book table : mobile cards`
- [x] 3.4 Run desktop suite: existing `RosterTable.test.tsx` green unchanged (jsdom → `isDesktop` true)

## Phase 4: PlayerAvailabilityTable Mobile Rows (RED → GREEN)

- [x] 4.1 RED (`matchMedia` false): row asserts name + subtitle `({race.name}, {rol})` + cost, counter `{n}/{max}`, "+ Add" always visible `aria-label="Add {name}"`
- [x] 4.2 RED: row hidden at max; "+ Add" disabled over budget; stats chips + labeled rows present
- [x] 4.3 GREEN `PlayerAvailabilityTable.tsx`: shared rowData; desktop table vs mobile stacked rows
- [x] 4.4 Run desktop suite: existing `PlayerAvailabilityTable.test.tsx` green unchanged

## Phase 5: Select Wrappers (RED → GREEN)

- [x] 5.1 RED `CreateTeamForm.test.tsx`: Race select wrapper div + chevron child (`pointer-events:none`); select `font-size:16px`
- [x] 5.2 RED: League type select wrapper + chevron present; `aria-label="League type"` and change handler intact
- [x] 5.3 GREEN `CreateTeamForm.tsx`: wrap both selects in `relative` div, chevron span `pointer-events:none`, `text-[16px]`

## Phase 6: Verification

- [x] 6.1 Run `npx vitest run` — full unit suite green (new mobile + existing desktop)
- [x] 6.2 Run `npm run test:e2e` — Desktop 1280 e2e untouched and green
- [x] 6.3 Confirm spec scenarios covered: mobile cards/rows, single-branch, select chevron, a11y labels
