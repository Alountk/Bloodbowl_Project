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
