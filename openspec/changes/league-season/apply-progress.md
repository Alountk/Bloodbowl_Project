# Apply Progress — league-season — PR1 (DB + API + round-robin)

> **Phase**: apply · **Artifact store**: openspec · **Mode**: STRICT TDD
> **Delivery**: chained stacked-to-main, **this batch = PR1** (DB + API + algorithm)
> The UI (PR2) and e2e polish (PR3) are out of scope for this batch.

## Delivery decision resolution

`tasks.md` forensics: `Review Workload Forecast` lists `400-line budget risk: High`,
`Chained PRs recommended: Yes`, `Chain strategy: pending`. The orchestrator resolved the
`ask-on-risk` delivery path in the apply prompt: **PR1 ONLY of the chained stacked-to-main
delivery**. Chain strategy is therefore **stacked-to-main**; PR1 targets `main`, later PRs
rebased/stacked on top. Authored change lines ≈ 1137 (excluding generated Prisma client +
migration SQL), consistent with the forecast and the need for chaining.

## Completed Tasks (all PR1)

| Task | Description | Status |
|------|-------------|--------|
| 1.1 | Prisma schema: League `status` enum (default `open`), `seasonLength Int?`, `startedAt DateTime?`; `Fixture` model (leagueId cascade, round, homeTeamId FK Team, awayTeamId FK Team, `@@index([leagueId,round])`) | ✅ |
| 1.2 | RED `lib/roundRobin.test.ts`: n=4 & n=6 perfect, n=4 len 2 no repeats, <2 teams / out-of-range RangeError | ✅ |
| 1.3 | GREEN `lib/roundRobin.ts`: Fisher-Yates `shuffle` + `generateRoundRobin` circle method | ✅ |
| 1.4 | Migration `add_league_season` + `add_league_season_fixture_team_fks`; `db:generate` | ✅ |
| 1.5 | Route tests RED→GREEN: GET `/api/leagues` open+own union with ownerName + `_count` | ✅ |
| 1.6 | `app/api/leagues/route.ts` GET: open(all) + own(any), owner name + `_count` (kills N+1) | ✅ |
| 1.7 | Route tests: `[id]` visibility open→any, started→owner/member, foreign non-member 404, delete-started 409 | ✅ |
| 1.8 | `app/api/leagues/[id]/route.ts`: visibility gate, delete-409 started, fixtures grouped by round when started | ✅ |
| 1.9 | Route tests: `teams` join started→409; `members/[teamId]` admin OR team-owner, started→409 | ✅ |
| 1.10 | `teams` + `members` routes: open-only guard, admin/team-owner leave | ✅ |
| 1.11 | RED `start` route tests: owner-only, ≥2 teams, len 1..n−1, re-start 409, transaction | ✅ |
| 1.12 | GREEN `app/api/leagues/[id]/start/route.ts`: validate then `$transaction` | ✅ |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1–1.4 | `prisma/migrations/…_add_league_season` (+SQL) | Migration | ⚠️ schema task has no unit test binary | ✅ `migrate dev` diff = intended SQL (verified manually) | ✅ applied + `db:generate` | ➖ Single (additive, no branching) | ✅ added Team FKs when validation flagged missing opposite relation |
| 1.2–1.3 | `lib/roundRobin.test.ts` | Unit | N/A (new) | ✅ written first referencing missing module; ran → Failed to resolve `./roundRobin` | ✅ 10/10 passed | ✅ n=4, n=6, len 2, len 1, odd n=5 bye | ✅ removed redundant `.map`; re-ran 10/10 |
| 1.5–1.6 | `app/api/leagues/route.test.ts` | Route (unit w/ mocks) | ✅ 571 baseline | ✅ new GET test failed (`ownerName` undefined) | ✅ 6/6 passed | ✅ union query + ownerName fallback + `_count` asserted | ➖ None needed |
| 1.7–1.8 | `app/api/leagues/[id]/route.test.ts` | Route | ✅ 571 baseline | ✅ 4 new tests failed (ownerName/404/409) | ✅ 10/10 passed | ✅ open/started/owner/member/foreign-404 | ➖ None needed |
| 1.9–1.10 | `…/teams/route.test.ts`, `…/members/[teamId]/route.test.ts` | Route | ✅ 571 baseline | ✅ public-join & started-409 failed; admin/expel 3 failed | ✅ 7/7 + 7/7 | ✅ public join, self-leave, admin expel, foreign team 404 | ➖ None needed |
| 1.11–1.12 | `…/start/route.test.ts` | Route | ✅ 571 baseline | ✅ RED (module missing) | ✅ 8/8 passed | ✅ default n−1, explicit len, guards, transaction atomicity | ✅ fixed $transaction mock TDZ via hoisted holder |

**Safety Net note**: tasks 1.1–1.4 are schema/migration (structural) — no pre-existing unit test exists for the schema itself, hence the ⚠️ marker; triangulation skipped with reason "additive structural".

## Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run lib/roundRobin.test.ts` → **10 passed**; `pnpm exec vitest run app/api/leagues/…` (all 5 route specs) → **6/6, 10/10, 7/7, 7/7, 8/8** |
| Runtime harness command/scenario and exact result | `pnpm test` → **597 passed (47 files)**; `AUTH_MODE=local pnpm exec playwright test` → **21 passed**; `pnpm exec playwright test --config playwright.config.auth.ts` → **7 passed** — incl. real-Postgres public open-league join/assign/expel journey |
| Rollback boundary | `git revert` the 3 PR1 commits: `prisma/migrations/20…_add_league_season*`, `prisma/schema.prisma`, `lib/roundRobin.{ts,test.ts}`, `app/api/leagues/{route.ts,[id]/*}`, `features/leagues/api.ts`; behavior reverts without touching PR2/PR3 files |

## Round-robin proof (n=4 → all 6 pairs exactly once)

Asserted in `lib/roundRobin.test.ts` "n=4, length 3":
- 3 rounds (`[1,1,2,2,3,3]`), 2 matchups/round → 6 fixtures.
- Every team appears exactly once per round (4 slots, `new Set(slots).size === 4`).
- 6 unordered pairs, all distinct (`new Set(pairs).size === 6`).
- Exact pair set `{t1|t2, t1|t3, t1|t4, t2|t3, t2|t4, t3|t4}` all present → **every unordered pair exactly once**.

n=6 length 5 → 5 rounds, 15 distinct pairs = C(6,2) (perfect). n=4 length 2 → 4 distinct pairs, no repeats. Odd n=5 len 4 → 2 matchups/round with per-round bye, 8 distinct pairs.

## Deviations from design

- **Two migrations instead of one** (`add_league_season` then `add_league_season_fixture_team_fks`): the first migration covered League columns + Fixture table + leagueId FK; a second added the two Fixture→Team FKs the PR scope required (`homeTeamId FK Team`, `awayTeamId FK Team`) after validation surfaced the missing opposite relation fields. Net effect equals the single-migration intent; additive and applied.
- **Fixture→Team `onDelete: Restrict`** (not SetNull): a started league is immutable (no post-start leave/expel/delete via 409 gates), so preventing deletion of a fixture-referenced team is the safest integrity choice; matches the spec's "teams and fixtures remain intact."
- **`seasonLength` default** lives in the start route (body omitted → `teams-1`), not in `lib/roundRobin.ts` (which keeps the required `seasonLength` argument per the PR signature). Matches "Default n−1 when the body omits length" spec.

## Issues found

- **Pre-existing TS error in `e2e/leagues.spec.ts:172`** (`texts.push(await …textContent())` can push `null`) — present on `main` before PR1, blocks `npx tsc --noEmit`. Fixed minimally in PR1 (this batch is in-scope for the "adjust e2e minimal" requirement) with `?? ""`. No behavior change.
- The public list now surfaces foreign OPEN leagues, making the existing e2e card-click fragile (first-`Ver` link no longer guaranteed to be the freshly-created league). Adjusted `e2e/leagues.spec.ts` minimally: scoped "Ver" clicks to the card containing the created league name, awaited the detail URL after soft navigation, and looked up the created league by name (not `[0]`) in the API-direct test.
- No deviations from the API spec scenarios discovered during implementation.

## Files changed (this batch)

| File | Action | What Was Done |
|------|--------|---------------|
| `prisma/schema.prisma` | Modified | `status LeagueStatus @default(open)`, `seasonLength Int?`, `startedAt DateTime?`, `Fixture` model + `LeagueStatus` enum |
| `prisma/migrations/20260809004047_add_league_season/migration.sql` | Created | League columns + Fixture table + leagueId FK + index |
| `prisma/migrations/20260809004115_add_league_season_fixture_team_fks/migration.sql` | Created | Fixture home/away Team FKs (Restrict) |
| `lib/roundRobin.ts` | Created | `shuffle`, `generateFullRoundRobin`, `generateRoundRobin`, `buildRoundRobin` |
| `lib/roundRobin.test.ts` | Created | 10 exhaustive unit tests |
| `app/api/leagues/route.ts` | Modified | GET open+own union with ownerName + `_count` |
| `app/api/leagues/route.test.ts` | Modified | GET RED→GREEN tests |
| `app/api/leagues/[id]/route.ts` | Modified | Visibility gate, delete-409 started, fixtures grouped by round |
| `app/api/leagues/[id]/route.test.ts` | Modified | Visibility + delete-409 tests |
| `app/api/leagues/[id]/teams/route.ts` | Modified | Public join, open-only guard |
| `app/api/leagues/[id]/teams/route.test.ts` | Modified | Public join + started-409 tests |
| `app/api/leagues/[id]/members/[teamId]/route.ts` | Modified | Admin expel + self-leave, open-only |
| `app/api/leagues/[id]/members/[teamId]/route.test.ts` | Modified | Admin/self-leave/foreign-404 tests |
| `app/api/leagues/[id]/start/route.ts` | Created | Owner-only transactional start |
| `app/api/leagues/[id]/start/route.test.ts` | Created | Start guards + transaction tests |
| `features/leagues/api.ts` | Modified | `League`/`LeagueDetail` types added `status/seasonLength/startedAt/ownerName/memberCount/fixtures` (+ `LeagueStatus`, `FixtureDraft`) |
| `e2e/leagues.spec.ts` | Modified | e2e adjusted for public list + pre-existing `?? ""` fix |

## Test results

- `pnpm test` → **47 files, 597 tests passed** (baseline 571 + 26 new)
- `AUTH_MODE=local pnpm exec playwright test` → **21 passed**
- `pnpm exec playwright test --config playwright.config.auth.ts` → **7 passed**
- `pnpm lint` → 0 errors (1 pre-existing warning in `app/providers/SessionAppProvider.tsx`)
- `npx tsc --noEmit` → clean (exit 0; after the pre-existing e2e fix)

## Commits

1. `0b6ed1d` `feat(league-season): add League status lifecycle and Fixture model`
2. `59981ac` `feat(league-season): add shuffled round-robin fixture generator`
3. `3cd3f7e` `feat(league-season): public open leagues API + atomic season start`

## Status

**12/12 PR1 tasks complete.** Ready for `sdd-verify`. PR not created (orchestrator after verify). PR2 (UI), PR3 (e2e+polish) are out of scope for this slice.
