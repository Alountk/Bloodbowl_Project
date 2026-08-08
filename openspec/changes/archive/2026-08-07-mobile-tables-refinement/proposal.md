# Proposal: Mobile Tables Refinement — Stacked Row-Cards + Native Select Fix

## Intent

On mobile (<768px) the wide rulebook tables force horizontal scrolling; native selects hide their chevron on Samsung Android. Replace mobile table rendering with stacked row-cards (ALL info visible, no chevron/expand); fix selects; desktop unchanged. Design locked per approved prototype.

## Scope

### In Scope
- `RosterTable` mobile row-cards (readOnly + editable): name line (+input `aria-label="Player name for {name}"`, remove btn in editable), subtitle `{positional.name} · ({race.name}, RolEs)`, stats chips MV FU AG PS AR, labeled SKILLS ("Ninguna" fallback) / PRIMARIAS / SECUNDARIAS rows.
- `PlayerAvailabilityTable` mobile rows: name + subtitle `({race}, {rol}) · cost "50 000"`, `{n}/{max}` + "+ Add" always visible (row hides at max; disabled over budget), stats chips, labeled rows.
- Native selects (Race step 1, League type): wrapper + separate chevron element (NOT background-image), 16px font.
- `useIsDesktop()` hook + tests. Coaching staff 2-col grid: unchanged.

### Out of Scope
Coaching table in detail view (keeps horizontal scroll); TeamList; hero; desktop visuals; mobile Playwright project.

## Capabilities

### New Capabilities
- `use-is-desktop`: SSR-safe hook — `useState(true)` + `useEffect` `matchMedia("(min-width: 768px)")`; jsdom → desktop path (existing unit tests unchanged).

### Modified Capabilities
- `roster-table`: mobile renders stacked row-cards (both modes); desktop unchanged. Replaces "Horizontal scroll on mobile".
- `create-team`: availability table mobile row-cards; Race + League type selects get wrapper+chevron.
- `team-detail-view`: readOnly roster inherits row-cards; coaching table keeps horizontal scroll.

## Approach

`useIsDesktop` gates one branch — table OR mobile rows, never both (no duplicate DOM; locators stay valid). jsdom → desktop path; new tests mock `matchMedia` false. e2e (1280) untouched.

## Affected Areas

| Area | Impact |
|------|--------|
| `features/teams/hooks/useIsDesktop.ts` | New |
| `features/teams/roster-table/RosterTable.tsx` | Modified |
| `features/teams/create/PlayerAvailabilityTable.tsx` | Modified |
| `features/teams/create/CreateTeamForm.tsx` | Modified |
| 3 `*.test.tsx` files | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Duplicate DOM breaks locators | Med | Single render branch |
| jsdom `matchMedia` divergence | Low | Default `true` → desktop path |
| Select chevron regression | Med | Chevron element, not background-image |
| Mobile a11y label drift | Med | Reuse `aria-label`s; tests assert |

## Rollback Plan

Revert the single PR: tables return to horizontal-scroll rendering, selects to prior styling. No data/schema changes.

## Dependencies

None (vanilla `matchMedia`).

## Success Criteria

- [ ] Mobile row-cards show all info; no chevron/expand
- [ ] Desktop identical (existing unit + e2e green)
- [ ] Selects 16px with visible chevron on Android
- [ ] Existing tests unmodified; new mocked-`matchMedia` tests pass

## Review Workload Forecast

Estimate 260–360 authored lines (RosterTable ~+80, Availability ~+70, hook ~+20, selects ~+30, tests ~+60). Single PR.

- Decision needed before apply: No
- Chained PRs recommended: No
- 400-line budget risk: Low

Overall risk: Medium.
