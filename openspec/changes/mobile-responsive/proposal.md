# Proposal: Mobile-Responsive Views

## Intent

The app is desktop-first: a fixed 240px sidebar and 9–11 column rulebook tables are unusable below ~860px (at 375px the sidebar leaves ~135px of content). This change makes every route usable on phones with zero data loss, using the user-approved **Config A (drawer hamburger) + horizontal-scroll tables**. Desktop markup stays structurally identical so e2e and unit contracts hold.

## Scope

### In Scope
- Mobile drawer shell: hamburger (`md:hidden`) in Topbar → overlay drawer (scrim `fixed inset-0 bg-slate-900/45 z-40` + the SAME Sidebar in a `fixed left-0 top-0 bottom-0 z-50` drawer); closes on scrim click + nav link click. Desktop sidebar `hidden md:flex`, always in DOM, `aria-label="Sidebar"` kept.
- Horizontal-scroll tables: nested `overflow-x-auto` wrapper + `min-w-[640px] md:min-w-0` inner panel — RosterTable, PlayerAvailabilityTable, detail coaching table. Outer `max-h-[55vh] overflow-auto` + sticky headers untouched.
- Home: heading row `flex-wrap`, CTA tap target ≥40px (`py-2.5`); single-column grid confirmed.
- Responsive heroes/wizard: `text-2xl md:text-[28px]` scale, `px-4 sm:px-6` panels; CoachingStaff grid already stacks.
- Unit tests: drawer open/close (hamburger → open, scrim + nav-link → close), mobile class assertions.

### Out of Scope
- Card-style table rewrites / hidden-column toggles.
- Per-section bespoke mobile designs beyond drawer + scroll.
- Desktop visual changes (md+ pixel-identical).
- not-found padding polish (trivial, deferred).

## Capabilities

> Contract for sdd-spec. Existing capability names from `openspec/specs/`.

### New Capabilities
None

### Modified Capabilities
- `app-shell`: mobile drawer navigation (hamburger, scrim, drawer Sidebar); sidebar hidden below `md`; Topbar h1 truncate + compact search.
- `roster-table`: mobile horizontal scroll added; height-cap/sticky-header contract unchanged.
- `create-team`: responsive step-2 hero + panel padding; PlayerAvailabilityTable horizontal scroll.
- `team-detail-view`: responsive hero text; coaching table horizontal scroll.
- `team-list`: wrapping heading row; ≥40px CTA target.

## Approach

AppShell gains drawer state (`useState`) + scrim; `SidebarContent` partial extracted so desktop `hidden md:flex` and drawer instances share markup. **Drawer Sidebar mounts conditionally** (only when open) — avoids two `aria-label="Sidebar"` matches breaking `getByLabelText`. Tables get a nested `overflow-x-auto` wrapper with `min-w-[640px] md:min-w-0` (the `md:min-w-0` prevents page-level overflow at 768–880px where sidebar 240px + panel 640px > viewport). Tailwind v4 utilities only; no new deps.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `components/AppShell.tsx` | Modified | Drawer state, scrim, drawer Sidebar mount |
| `components/Sidebar.tsx` | Modified | `hidden md:flex` + SidebarContent partial |
| `components/Topbar.tsx` | Modified | Hamburger `md:hidden`, h1 truncate, compact search |
| `features/teams/TeamList.tsx` | Modified | flex-wrap heading, CTA py-2.5 |
| `features/teams/create/CreateTeamForm.tsx` | Modified | Hero text scale, `px-4` panels |
| `features/teams/create/PlayerAvailabilityTable.tsx` | Modified | overflow-x-auto + min-w panel |
| `features/teams/detail/TeamDetailView.tsx` | Modified | Hero scale, coaching scroll |
| `features/teams/roster-table/RosterTable.tsx` | Modified | Inner overflow-x-auto + min-w panel |
| `app/page.test.tsx` (or new AppShell test) | Modified | Drawer open/close tests |
| `features/teams/roster-table/RosterTable.test.tsx` | Modified | Inner-wrapper assertion added |

Estimate: ~250–400 lines, **single PR**.

## Review Workload Forecast

- Decision needed before apply: No
- Chained PRs recommended: No
- 400-line budget risk: Medium

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| RosterTable outer class change breaks test | Med | Nested wrapper; outer untouched |
| Sidebar aria test breaks (two matches) | Med | Drawer Sidebar mounts only when open |
| Duplicate sidebar markup drift | Low | Shared SidebarContent |
| e2e regression at 1280×720 | Low | Desktop structure identical; hamburger `md:hidden` |

## Rollback Plan

Revert the single PR. Additive class/markup + one AppShell state hook; no data migration, no store/schema change (localStorage untouched).

## Dependencies

None — Tailwind v4 present; no new packages.

## Success Criteria

- [ ] Drawer opens via hamburger, closes on scrim + nav click (unit-tested)
- [ ] RosterTable outer-container + sidebar aria tests still pass
- [ ] All 14 e2e tests pass unchanged (Desktop Chrome 1280×720)
- [ ] Tables scroll horizontally at 375px with sticky headers; no data hidden
- [ ] md+ desktop renders identical (manual + e2e)
