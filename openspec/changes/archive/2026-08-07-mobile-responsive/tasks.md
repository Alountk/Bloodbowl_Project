# Tasks: Mobile-Responsive Views

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300–400 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Drawer shell (AppShell/Sidebar/Topbar) | PR 1 | `npx vitest run app/page.test.tsx components --reporter=dot` | `npx vitest run app/page.test.tsx` (jsdom) — N/A for real-browser QA | Revert AppShell/Sidebar/Topbar edits; no data/store change |
| 2 | Table scroll + home/heroes | PR 1 (same) | `npx vitest run features/teams/roster-table features/teams/create features/teams/detail --reporter=dot` | `npx playwright test e2e/create-team.spec.ts` (Desktop Chrome) | Revert the class/markup files en bloc |

## Phase 1: Shell — Drawer (RED)
- [x] 1.1 RED `app/page.test.tsx`: assert hamburger `aria-label="Open navigation menu"` renders; assert single `getByLabelText("Sidebar")` in closed state
- [x] 1.2 RED new AppShell drawer tests: hamburger click mounts drawer; scrim click + nav-link click unmount it

## Phase 2: Shell — Drawer (GREEN)
- [x] 2.1 `components/Sidebar.tsx`: extract `SidebarContent`; desktop root `aside hidden md:flex` keeps `aria-label="Sidebar"`
- [x] 2.2 `components/Sidebar.tsx`: add `prop variant="drawer"` wrapper (`fixed left-0 top-0 bottom-0 z-50`) + `onNavigate` closes on nav link click
- [x] 2.3 `components/AppShell.tsx`: add `mobileNavOpen` state, `openMenu`/`closeMenu`; render scrim `fixed inset-0 bg-slate-900/45 z-40` + drawer Sidebar only when open; pass `onMenuClick` to Topbar
- [x] 2.4 `components/Topbar.tsx`: render hamburger `md:hidden` with `aria-label="Open navigation menu"`; h1 `truncate`; search input compact on `/`

## Phase 3: Tables — Horizontal Scroll (RED)
- [x] 3.1 RED `features/teams/roster-table/RosterTable.test.tsx`: assert nested `overflow-x-auto` wrapper + panel `min-w-[640px] md:min-w-0`; outer `max-h-[55vh] overflow-auto` assertions unchanged

## Phase 4: Tables — Horizontal Scroll (GREEN)
- [x] 4.1 `features/teams/roster-table/RosterTable.tsx`: nest `overflow-x-auto` wrapper; inner panel `max-w-[900px]` → `min-w-[640px] md:min-w-0`; outer container untouched
- [x] 4.2 `features/teams/create/PlayerAvailabilityTable.tsx`: same nested wrapper + `min-w-[640px] md:min-w-0`
- [x] 4.3 `features/teams/detail/TeamDetailView.tsx`: wrap coaching table in nested `overflow-x-auto` + `min-w-[640px] md:min-w-0` panel

## Phase 5: Home & Heroes (RED + GREEN)
- [x] 5.1 `features/teams/TeamList.tsx`: heading row → `flex flex-wrap items-center justify-between`; CTA add `py-2.5` (assert class in `TeamList.test.tsx`)
- [x] 5.2 `features/teams/create/CreateTeamForm.tsx`: step-2 hero `text-2xl md:text-[28px]`, `px-4 sm:px-6`; form panel `px-4 sm:px-6`
- [x] 5.3 `features/teams/detail/TeamDetailView.tsx`: hero h1 responsive tokens `text-2xl md:text-[28px]`, hero `px-4 sm:px-6`

## Phase 6: Verification
- [x] 6.1 Run full unit suite: `npx vitest run` — all preserved contracts (sidebar aria, RosterTable outer container, headers, totals)
- [x] 6.2 Run e2e: `npx playwright test` — all 14 `create-team.spec.ts` pass unchanged (Desktop Chrome 1280×720)
- [x] 6.3 Manual: verify 375px/390px drawer open/close, 4 table scrolls, hero/home readability — reconciled at archive per orchestrator instruction (manual real-browser item; user reviewed and approved first iteration — see archive-report follow-up note)
