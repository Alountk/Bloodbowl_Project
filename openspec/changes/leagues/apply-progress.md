# Apply Progress: Leagues (PR 1 — DB + API)

**Change**: leagues
**Branch**: `feat/leagues-pr1` (stacked-to-main, merged into `feat/leagues`)
**Mode**: Strict TDD (`pnpm test`, vitest)
**Batch**: PR1 (DB + API) — all Phase 1 tasks
**Status**: Complete — 10/10 PR1 tasks done, ready for verify
## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 schema+migration | `prisma/schema.prisma` + migration fixture + regenerated client | Structural | ✅ 522/522 | ✅ Schema change → new migration diff | ✅ `prisma migrate deploy` + `db:generate`; client shows `leagueId` true, `leagueType` false | ➖ Single (structural — one column set) | ✅ Dropped invalid `User.leagueMemberships` relation before validation |
| 1.2 types.ts | `tsc --noEmit` compile gate + store/team tests | Structural | ✅ 522/522 | ✅ Removed `TeamLeagueType`/`LEAGUE_TYPES`/`DEFAULT_LEAGUE_TYPE`, added `leagueId` + `League` → 30 compile errors (RED) | ✅ All consumers updated, `tsc` clean | ✅ `League` interface + `Team.leagueId` triangulated via store tests | ✅ Clean |
| 1.3 store sweep | `ApiTeamStore.test.ts`, `InMemoryTeamStore.test.ts`, `LocalStorageTeamStore.test.ts` | Unit | ✅ 522/522 | ✅ Tests updated to assert `leagueId: null` backfill + `ArchiveGuardError` on 409 | ✅ 28 store tests pass | ✅ 2+ cases per store (backfill + normalized read/upsert) | ✅ `teamFromApi` maps `leagueId`, no default constant |
| 1.4 teams route RED | `app/api/teams/route.test.ts`, `[id]/route.test.ts` | Unit | ✅ 522/522 | ✅ POST asserts `leagueId: null` + no `leagueType` prop; DELETE 409 test written first | ✅ Route changes make them pass | ✅ 409 + 204-null cases; POST non-leagueType assertion | ✅ Clean |
| 1.5 teams route GREEN | `app/api/teams/route.ts`, `[id]/route.ts` | Unit | ✅ 522/522 | ✅ (see 1.4) | ✅ 6+6 route tests pass | ✅ Triangulated via 409/204/404 paths | ✅ Clean |
| 1.6 leagues route RED | `app/api/leagues/route.test.ts` | Unit | N/A (new route) | ✅ Written first (route file absent, 4 files fail to resolve) | ✅ 6 tests pass after route.ts | ✅ GET-owner + POST-201 + dup-409 + 400 | ✅ Clean |
| 1.7 leagues [id] RED | `app/api/leagues/[id]/route.test.ts` | Unit | N/A (new route) | ✅ Written first | ✅ 6 tests pass | ✅ GET detail w/ members + foreign-404 + DELETE SetNull | ✅ Clean |
| 1.8 assign/expel RED | `app/api/leagues/[id]/teams/route.test.ts`, `members/[teamId]/route.test.ts` | Unit | N/A (new route) | ✅ Written first | ✅ 6+4 tests pass | ✅ assign guards (foreign-404/dup-409/archived-409) + expel non-member-404 | ✅ Clean |
| 1.9 leagues routes GREEN | all `app/api/leagues/**/route.ts` | Unit | ✅ 545/545 | ✅ (see 1.6-1.8) | ✅ 22 league-route tests pass | ✅ Triangulated across all guards | ✅ Clean |
| 1.10 sweep + migrate | `rg leagueType/LEAGUE_TYPES/DEFAULT_LEAGUE_TYPE` + `pnpm test` + `pnpm lint` + `tsc` + e2e | E2E/integration | ✅ 545/545 | ✅ 114 initial refs identified | ✅ 110 live/fixture refs removed; only historical migration SQL + absence-assertions remain | ✅ 545 unit + 21 e2e + lint + tsc all green | ✅ Clean |

## Test Summary

- **Total tests written**: 26 new (22 leagues-route + 2 store 409/archive + 2 net teams-route adjustments across original suite)
- **Total tests passing**: 545 unit (baseline 522 → 545) + 21 e2e (local)
- **Layers used**: Unit (store + route tests), E2E (21 via Playwright AUTH_MODE=local), Structural (migration/client regen)
- **Approval tests** (refactoring): 10 store/route backward-compat tests updated to new contract (leagueId null) — all pass
- **Pure functions created**: 0 (routes are async handlers; stores keep existing pure `normalize` shape)

## Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run app/api/leagues app/api/teams features/teams/store` → 15 files, 170 passed (then full suite 545 passed) |
| Runtime harness command/scenario and exact result | `prisma migrate deploy` applied `20260808230000_add_leagues_drop_league_type`; `verify_prisma.mjs` confirmed `Team.leagueId=true`, `Team.leagueType=false`, `League` columns `id,name,description,ownerId,createdAt`; `AUTH_MODE=local pnpm exec playwright test` → 21 passed |
| Rollback boundary | Revert migration `20260808230000_add_leagues_drop_league_type` + `prisma/schema.prisma` + `app/api/leagues/**` + `app/api/teams/[id]/route.ts` 409 guard; teams functionally unaffected (`leagueId` nullable, no data mapping) |

## Commit List

| Commit | Message |
|--------|---------|
| `3fece21` | `feat(leagues): add League model, Team.leagueId FK SetNull, drop leagueType` (schema + migration + design.md) |
| `4f2140f` | `feat(leagues): drop leagueType from types, stores, create/detail UI; teams POST writes leagueId null` (26 files sweep) |
| `0ae6fb6` | `feat(leagues): block archiving league-member teams with 409 guard on DELETE` |
| (commit 4) | `feat(leagues): add user-scoped league API with assign/expel routes` |

## Test Results

- `pnpm test` → **545 passed** (40 files), baseline 522
- `AUTH_MODE=local pnpm exec playwright test` → **21 passed** (chromium + mobile)
- `pnpm lint` → clean
- `npx tsc --noEmit` → clean
- `prisma migrate deploy` → applied 1 migration; `prisma migrate status` up to date; `db:generate` OK

## leagueType Sweep Coverage

- **Total references swept**: 114 (initial `rg` count: `leagueType|LEAGUE_TYPES|DEFAULT_LEAGUE_TYPE|Liga Abierta|Exhibición`).
- **110 removed/updated** across source, tests, and e2e fixtures.
- **Remaining (4, all intentional)**:
  - `prisma/migrations/20260808132125_init/migration.sql` (historical — must not be edited)
  - `prisma/migrations/20260808230000_add_leagues_drop_league_type/migration.sql` (the DROP COLUMN)
  - `app/api/teams/route.test.ts` — 2 assertions intentionally verify `leagueType` is NOT written.
- Files touched by sweep: `types.ts`, 3 stores + 3 store tests, `useCreateTeamForm` + test, `CreateTeamForm` + test, `TeamDetailView` + test, `AppProvider` + test, `SessionAppProvider.test`, `page.test`, migration 2 tests, `roster.test`, `TeamList.test`, 3 e2e specs, `app/api/teams/route.ts` + test.

## Deviations from Design

- None functional. `League` relation uses a named "LeagueMembers" relation between `League.teams` and `Team.league`; `User` gained only the required `leagues` relation (the initially-added `leagueMemberships` was removed — not in the design).
- Migration authored via `prisma migrate diff --script` output applied through `prisma migrate deploy` because `prisma migrate dev` refuses non-interactive TTYs for the drop-column warning. The SQL is byte-identical to Prisma's own diff, keeping future `migrate dev` state consistent.
- `TeamDetailView` in PR1 renders "Sin liga" for all teams via an optional `leagueName` prop (PR2 wires the league store); the create-team "Liga Abierta"/"Exhibición" display labels are fully removed per the sweep.

## Issues Found

- `prisma migrate dev` cannot run non-interactively in this environment; used `migrate diff --script` + `migrate deploy` instead (exact equivalent).
- `.env` `DATABASE_URL` points at `localhost:5432`; the docker postgres was already healthy there — no port change needed.

## Tasks Complete

- [x] 1.1 – 1.10 (all Phase 1 PR1 tasks)

## Next Steps

- Orchestrator: run `sdd-verify`, then create the PR-1 stacked branch (target `feat/leagues`  branch per stacked-to-main) — NOT opened by this batch.
- PR2 scope (next batch): leagues UI pages, sidebar "Ligas", wizard select already removed in PR1, detail league-name resolution via a league store.

---

# Apply Progress: Leagues (PR 2 — Core UI, Pattern 2)

**Change**: leagues
**Branch**: `feat/leagues-pr2` (stacked off `feat/leagues-pr1`, target `feat/leagues-pr1`)
**Mode**: Strict TDD (`pnpm test`, vitest + Playwright)
**Batch**: PR2 (Core UI — Pattern 2 cards) — all Phase 2 tasks
**Status**: Complete — 10/10 PR2 tasks done, ready for verify

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 Sidebar Ligas | `app/AppShell.test.tsx` | Unit | ✅ 548/548 | ✅ NAV_ITEMS lacked Ligas → getByRole("link", Ligas) failed | ✅ Added `{ href: "/leagues", label: "Ligas" }` → 5 tests pass | ✅ Desktop Teams+Ligas only, drawer shares NAV_ITEMS | ➖ None needed |
| 2.2 create no league-type | `features/teams/create/CreateTeamForm.test.tsx` | Unit | ✅ done in PR1 | ✅ Already complete — test asserts `queryByLabelText("League type")` null (PR1 sweep) | ➖ Already green in PR1 | ➖ Single (removed feature) | ➖ None needed |
| 2.3 CreateTeamForm no select | `CreateTeamForm.tsx` | Unit | ✅ done in PR1 | ✅ Already complete in PR1 (no league-type select/state) | ➖ Already green in PR1 | ➖ Single | ➖ None needed |
| 2.4 TeamDetailView league badge | `features/teams/detail/TeamDetailView.test.tsx` | Unit | ✅ 548/548 | ✅ Already present (Sin liga + league name scenarios) | ➖ Already green | ✅ 2 cases (leagueName prop + null) | ➖ None needed |
| 2.5 resolve league name | `app/teams/[teamId]/page.test.tsx` | Integration | ✅ 548/548 | ✅ Wrote test: assigned team → fetches `/api/leagues/league-1` → hero shows league name | ✅ Wired `useLeagueName` into page + `leagueName` prop → 5 tests pass | ✅ leagueId set vs null/unset paths | ✅ Hook effect refactored to satisfy `set-state-in-effect` lint |
| 2.6 LeagueList + page | `features/leagues/LeagueList.test.tsx`, `app/leagues/page.test.tsx` | Integration | ✅ 548/548 | ✅ Wrote 4 tests first (hero, cards+counts+Ver href, empty+CTA, modal opens) | ✅ `LeagueList` + `useLeagues` + `app/leagues/page` → 5 tests pass | ✅ 2 card paths (1 equipo / 0 equipos), empty state, modal | ✅ Singular/plural "equipo(s)"; N+1 count resolved via detail fetch |
| 2.7 CreateLeagueModal | `features/leagues/CreateLeagueModal.test.tsx` | Integration | ✅ 548/548 | ✅ Wrote 4 tests first (name required, POST, dup-409, closed null) | ✅ `CreateLeagueModal` → 4 tests pass | ✅ success-201 / dup-409 / validation / closed | ✅ Matchers aligned to codebase style (textContent, firstChild null) |
| 2.8 LeagueDetail assign/expel | `features/leagues/LeagueDetail.test.tsx` | Integration | ✅ 548/548 | ✅ Wrote 5 tests first (hero, member rows, assign-select filter, assign POST, expel DELETE) | ✅ `LeagueDetail` + `useLeagueDetail` → 5 tests pass | ✅ member rows, unassigned filter, assign+expel actions | ✅ Race/players meta line asserted via combined text |
| 2.9 app/leagues UI | `app/leagues/[id]/page.test.tsx` | Integration | ✅ 548/548 | ✅ Wrote 2 tests first (detail renders, foreign 404 message) | ✅ `app/leagues/[id]/page` → 2 tests pass | ✅ known league vs foreign 404 | ✅ Route + component split |
| 2.10 sweep + tsc | `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `AUTH_MODE=local playwright` | Integration | ✅ 548/548 | N/A (verification batch) | ✅ 564 unit + 21 local e2e + lint + tsc green | ✅ e2e local stays green (leagues excluded); auth suite 4 pass incl. leagues flow | ✅ Clean |

## Test Summary

- **Total tests written (PR2)**: 22 new (1 AppShell nav, 1 team-detail league wiring, 4 LeagueList, 1 leagues page, 4 CreateLeagueModal, 5 LeagueDetail, 2 leagues detail page, plus e2e leagues spec).
- **Total tests passing**: 564 unit (baseline 548 → 564) + 21 local e2e + 4 auth e2e (incl. new leagues flow).
- **Layers used**: Unit (component tests), Integration (page + modal tests), E2E (Playwright auth suite).
- **Approval tests** (refactoring): None — no behavior-preserving refactor of existing logic beyond the `useLeagueName` effect (already covered by its new test).
- **Pure functions created**: 0 (React hooks/components; the `api.ts` wrapper keeps thin async reads).

## Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues app/leagues app/AppShell.test.tsx app/teams/[teamId]/page.test.tsx` → 5 files, 19 passed (per-unit; final full suite 564 passed) |
| Runtime harness command/scenario and exact result | `AUTH_MODE=local pnpm exec playwright test` → 21 passed (leagues excluded from local config); `pnpm exec playwright test --config playwright.config.auth.ts` → 4 passed incl. `leagues.spec.ts` (create league → card → detail → assign → member listed → expel) against real Postgres |
| Rollback boundary | Revert `features/leagues/**`, `app/leagues/**`, `e2e/leagues.spec.ts`, `components/Sidebar.tsx` Ligas item, `app/teams/[teamId]/page.tsx` league wiring, and the two Playwright config testMatch/testIgnore additions; teams/API unchanged and functional |

## Commit List (PR2)

| Commit | Message |
|--------|---------|
| `489178d` | `feat(leagues): add Ligas nav item and wire team-detail league name` |
| `075ddd5` | `feat(leagues): add Pattern-2 leagues list with create modal` |
| `026d84d` | `feat(leagues): add league detail with assign and expel` |
| `0256968` | `test(e2e): add real-DB leagues flow spec to the auth suite` |
| `30e7225` | `docs(leagues): mark PR2 tasks complete in tasks.md` |

## Test Results

- `pnpm test` → **564 passed** (45 files), PR2 baseline 548
- `AUTH_MODE=local pnpm exec playwright test` → **21 passed** (chromium + mobile), leagues excluded so the default local config stays green
- `pnpm exec playwright test --config playwright.config.auth.ts` → **4 passed** (auth + migration + isolation + **leagues**)
- `pnpm lint` → clean
- `npx tsc --noEmit` → clean

### How the leagues e2e runs

The leagues flow is API-backed (Postgres) and every endpoint requires a session (401 unauthenticated), so **the leagues e2e runs in the auth suite, not local**:
- `e2e/leagues.spec.ts` is added to `playwright.config.auth.ts` `testMatch`, which runs `prisma migrate deploy && pnpm dev` in `AUTH_MODE=auth` against the real Postgres.
- `playwright.config.ts` (local `test:e2e`) `testIgnore` now includes `**/leagues.spec.ts`, so the default local 21 e2e stay green. In local mode `/api/leagues` returns 401 and the `/leagues` page renders the load-error/empty state without breaking.
- Run it with `pnpm run test:e2e:auth`.

## Deviations from Design

- The `/api/leagues` GET list endpoint returns league rows without member counts. To show "N equipos" per Pattern-2 card, `useLeagues` resolves each league's `teams` length client-side (a small N fetch against `/api/leagues/[id]`). This is the pragmatic approach the design allowed ("client fetch with session"); the alternative — adding `_count` to the list endpoint — would touch PR1's delivered API. API unchanged.
- Task 2.5 "resolve league name from store": the design's stated simplest path was "fetch the league by id from the client and pass leagueName", so PR2 added a lightweight `useLeagueName` hook wired into the team-detail page rather than extending the teams store — matching the already-shipped `leagueName?` prop. No store change required.
- Create-form select removal (2.2/2.3) and TeamDetailView `LEAGUE_LABELS` removal (2.4) were already completed during the PR1 leagueType sweep; PR2 verified them green and did not re-do them.

## Issues Found

- `react-hooks/set-state-in-effect` flags calling a state-setting callback (a `useCallback` calling setState) directly from an effect. Resolved by running the initial load as promise `.then()` continuations in the effect (AppProvider's existing pattern) while a separate `refresh` callback handles manual reloads.
- The project has no jest-dom matchers configured; tests use `textContent`/`firstChild` assertions and regex text matchers per the existing suite style.

## Tasks Complete (PR2)

- [x] 2.1 – 2.10 (all Phase 2 PR2 tasks). Phase 1 already complete in PR1.

## Next Steps (PR3, out of scope for this batch)

- 3.1/3.2: surface the 409 archive-guard message in `TeamDeleteModal`/`TeamList` (PR3).
- 3.3/3.6: sweep remaining leagueType fixtures (mostly historical) and sync delta specs via `sdd-archive`.
- Do NOT open the PR until the orchestrator runs `sdd-verify`.
