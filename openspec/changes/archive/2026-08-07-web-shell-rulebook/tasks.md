# Tasks: Rulebook light web shell (web-shell-rulebook)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 150–220 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | single-pr |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low
```

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Layout + shell restyle + tests | PR 1 | `pnpm vitest run app/page.test.tsx features/teams/TeamList.test.tsx` | `pnpm dev` load `/`; assert light shell + search visible | `app/layout.tsx`, `components/Sidebar.tsx`, `components/Topbar.tsx`, their tests |
| 2 | TeamList + not-found + tests | PR 2 | `pnpm vitest run features/teams/TeamList.test.tsx app/teams/[teamId]/not-found.test.tsx` | `pnpm dev` create route `/teams/create` loads error-free; home CTA nav | `features/teams/TeamList.tsx`, `app/teams/[teamId]/not-found.tsx`, tests |
| 3 | Docs (design/tasks/apply-progress) | PR 3 | `pnpm test` full | N/A — docs only | `openspec/changes/web-shell-rulebook/*` |

## Phase 1: Shell restyle

- [x] 1.1 `app/layout.tsx`: body → `min-h-screen bg-[#f8fafc] text-slate-900 antialiased`
- [x] 1.2 `components/Sidebar.tsx`: white `bg-white border-r border-slate-200`; navy "BLOODBOWL" logo + red "Teams" tag; `NAV_ITEMS = [{ href: "/", label: "Teams" }]`; active via `usePathname() === item.href` (`bg-[#12225a] text-white`), inactive `text-slate-600 hover:bg-slate-100 hover:text-[#12225a]`; keep `aria-label="Sidebar"`
- [x] 1.3 `components/Topbar.tsx`: white `border-b border-slate-200`; navy h1 "Bloodbowl Teams"; search `<form role="search">` renders ONLY when `usePathname() === "/"`; light input classes; keep `aria-label="Search teams"`
- [x] 1.4 Tests: add `vi.mock("next/navigation", () => ({ usePathname: () => "/" }))` to `app/page.test.tsx` and `features/teams/TeamList.test.tsx` — zero assertion edits

## Phase 2: Home + not-found

- [x] 2.1 `features/teams/TeamList.tsx`: heading row — h2 "Teams" `text-lg font-bold text-[#12225a] border-b-[3px] border-[#d11938] pb-1.5` + right navy "Create New Team" Link to `/teams/create`
- [x] 2.2 `features/teams/TeamList.tsx`: cards `rounded-none border border-slate-200 bg-white overflow-hidden` + `h-[6px] bg-[#12225a] border-b-2 border-[#d11938]` top band + navy name / slate-500 race / slate-400 summary; grid unchanged; keep Link + focusable block
- [x] 2.3 `features/teams/TeamList.tsx`: empty states — no-teams square panel ("No teams yet. Create your first team." + navy CTA to `/teams/create`); no-match square panel ("No teams match your search." no CTA); keep `/no teams yet/i` + `/no teams match your search/i`
- [x] 2.4 `app/teams/[teamId]/not-found.tsx`: light square panel — navy h2 "Team not found" + red underline, message, navy "Back to teams" Link to `/`; preserve texts/roles for `not-found.test.tsx`
- [x] 2.5 Tests (new assertions): Topbar search hidden when path `/teams/create` (`queryByLabelText("Search teams")` null); sidebar has no "Create Team" link; home CTA link href `/teams/create`

## Phase 3: Verify

- [x] 3.1 `pnpm test` all green (~408+ unit tests)
- [x] 3.2 `pnpm test:e2e` all green (14 e2e tests)
- [x] 3.3 `pnpm lint` green
- [x] 3.4 `npx tsc --noEmit` green

## Phase 4: Docs

- [x] 4.1 Write `openspec/changes/web-shell-rulebook/apply-progress.md` with TDD Cycle Evidence table
