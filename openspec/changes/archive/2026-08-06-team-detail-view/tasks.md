# Tasks: Team Detail View

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280-340 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR with work-unit commits A → B → C |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Add TeamList card links without search regression | Single PR / Commit A | `pnpm test -- TeamList.test.tsx` | N/A — component link behavior is fully covered in jsdom | Revert `features/teams/TeamList.tsx` and `features/teams/TeamList.test.tsx` |
| 2 | Add presentational TeamDetailView with derived summaries | Single PR / Commit B | `pnpm test -- TeamDetailView.test.tsx` | N/A — pure presenter with mocked props | Revert `features/teams/detail/TeamDetailView.tsx` and `.test.tsx` |
| 3 | Add route page and not-found segment with hydration gate | Single PR / Commit C | `pnpm test -- app/teams/[teamId]/page.test.tsx` | `pnpm build` to prove App Router route compiles | Revert `app/teams/[teamId]/` files |

## Phase 1: Navigation Foundation

- [ ] 1.1 RED `features/teams/TeamList.test.tsx`: add failing `<a href="/teams/{id}">` assertions and keep the existing search-filter scenario green in `pnpm test --watch`.
- [ ] 1.2 GREEN+REFACTOR `features/teams/TeamList.tsx`: wrap each card in `<Link href={`/teams/${team.id}`}>`, preserve semantics, then commit A with test and code.

## Phase 2: Detail Presenter

- [ ] 2.1 RED `features/teams/detail/TeamDetailView.test.tsx`: add six failing acceptance tests for identity, `RosterTable` readOnly, empty roster fallback, coaching breakdown, treasury, and unknown-race fallback.
- [ ] 2.2 GREEN `features/teams/detail/TeamDetailView.tsx`: implement `TeamDetailView({ team, race })` using `RosterTable`, `computeRosterCostFromPlayers`, `computeCoachingCostItems`, and `STARTING_TREASURY`.
- [ ] 2.3 REFACTOR `features/teams/detail/TeamDetailView.tsx`: document the synthetic `FALLBACK_RACE` shape (`id/name=team.raceId`, `rerollCost=0`, `positionals=[]`), keep tests green, then commit B.

## Phase 3: Route Wiring

- [ ] 3.1 Create static `app/teams/[teamId]/not-found.tsx` with a clear missing-team message and `<Link href="/">`; keep it isolated for rollback with route work.
- [ ] 3.2 RED `app/teams/[teamId]/page.test.tsx`: add failing tests for skeleton during hydration, no `notFound()` during hydration, valid team render after hydration, and unknown team `notFound()` after hydration.
- [ ] 3.3 GREEN `app/teams/[teamId]/page.tsx`: add `'use client'`, `use(params)` for Promise params, `useApp()` hydration gate, inline `teams.find()`, `getRaceById`, and `<TeamDetailView>`/`notFound()` branching.
- [ ] 3.4 REFACTOR route test setup with the existing hydration-probe pattern and `InMemoryTeamStore`, keep route tests green, then commit C.

## Phase 4: Final Verification

- [ ] 4.1 Run `pnpm test`, confirm new coverage plus no regression in the existing suite, and fix any red tests before proceeding.
- [ ] 4.2 Run `pnpm lint` and `pnpm build`; if green, record results in the apply report and keep optional Commit D only for post-green polish.
