# Apply Progress — Live Match View (PR 1: API)

## Status

PR 1 (tasks 1.1–1.7) **complete** — 7/7 tasks. Auth-gated fixture GET route created and the result snapshot extended with `winnings` + `mvp` (D4), cover MV-1/MV-2 for this slice. Strict TDD followed throughout (RED → GREEN → REFACTOR).

## PR 2 — Client fetch + pure mapping (tasks 2.1–2.5)

**Status: complete** — 5/5 tasks (merged into this cumulative progress; PR 1 section preserved below). Added `getMatchDetail` + match payload types (2.1) and the pure `buildMatchSummary` snapshot→section mapper with Spanish MVP/weather/casualty labels and omit-if-empty/walkover handling (2.2–2.5). Strict TDD RED→GREEN→REFACTOR.

## Scope (chained PR 1 of 4, stacked-to-main)

Branch: `feat/live-match-api` (from `main` @ `f5d0387`). Implements PR 1 ONLY:
- `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` (new GET)
- `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` (POST/PUT scoreboard D4)
- Their route tests + `tasks.md` marks.

PR 2 (client/mapping), PR 3 (page/MatchView), PR 4 (MatchCard/e2e) are NOT in scope.

## Completed Tasks

- [x] 1.1 RED `features/leagues` payload: 401 anonymous, AUTH_MODE parity via mock, payload `{fixture,result,homeTeam,awayTeam}` nullable result, no nested teams
- [x] 1.2 RED: 404 fixture-not-found / not-in-league (`findFirst({id,leagueId})`) / STARTED foreign non-member (no existence leak)
- [x] 1.3 RED: 200 league-owner / member-team-owner / OPEN any-authenticated (defensive)
- [x] 1.4 GET route: `enrichFixture` import (D7, structural cast), D3 normalized payload (strip nested teams), walkover `result:null` keeps 200
- [x] 1.5 RED (refactor guard): result test asserts POST persists `scores.mvp`/`winnings`; PUT recomputes mvp, preserves prior winnings (D4)
- [x] 1.6 result POST `scoreboard` += `winnings:{home,away}` + `mvp:{home,away}` (rosterPlayerIds)
- [x] 1.7 result PUT `scoreboard`: recompute `mvp`, preserve prior `winnings`; legacy rows unaffected (forward-only, MV-6 no migration)

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1–1.3 | `app/api/leagues/[id]/fixtures/[fixtureId]/route.test.ts` | Unit (route, mocked) | N/A (new) | ✅ Written (import unresolved) | ✅ 8/8 | ✅ 3+ cases/behavior | ✅ Deps/ESLint unused-var guards |
| 1.4 | same route.test.ts | Unit (route) | ✅ detail-route suite intact | ✅ (0.1 RED) | ✅ 8/8 | ✅ 401/404/200/open/walkover | ✅ NO_SCHEMA_CHANGE verified |
| 1.5 | `result/route.test.ts` | Unit (route) | ✅ 21/21 baseline | ✅ 3 new RED | ✅ 24/24 | ✅ POST+PUT+legacy | ✅ Added `stubMvpRolls` (reset queue) |
| 1.6 | result POST | Unit (route) | ✅ 21/21 | ✅ (from 1.5) | ✅ | ✅ 45k/35k + p1/p5 exact | ➖ Clean |
| 1.7 | result PUT | Unit (route) | ✅ 21/21 | ✅ (from 1.5) | ✅ | ✅ recompute + preserve + legacy | ➖ Clean |

**Safety Net note**: `result/route.test.ts` baseline was 21/21 before edits; after all changes 24/24 (Safety Net preserved — no existing test changed behavior).

### Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/route.test.ts"` → 8/8 passed; `pnpm vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/result"` → 24/24 passed |
| Runtime harness command/scenario and exact result | `GET /api/leagues/ID/fixtures/FID` via real app — intentional `N/A`: this slice is route-level with mocked `auth`/`prisma` (both store modes asserted via the mock, route never reads env); the real-DB GET is exercised in PR 4's `e2e/match-view.spec.ts`. Full unit suite `pnpm test` → 937/937 green. Local e2e `AUTH_MODE=local playwright test` → 21/21 green (after killing a stale reused dev server). |
| Rollback boundary | Revert the two route files + two test files + `tasks.md` marks; leaves all other feature branches (client/page/MatchCard) untouched. Commits `4bbd898`, `4b4ccfa` are the exact work-unit boundaries. |

## Files Changed (PR 1)

| File | Action | Notes |
|------|--------|-------|
| `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` | Created | GET, D1/D3/D6/D7 |
| `app/api/leagues/[id]/fixtures/[fixtureId]/route.test.ts` | Created | 8 tests |
| `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` | Modified | POST/PUT scoreboard += mvp/winnings (D4) |
| `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` | Modified | +3 snapshot assertions, `stubMvpRolls` helper |
| `openspec/changes/live-match/tasks.md` | Modified | Marked 1.1–1.7 `[x]` |

## Deviations from Design

None — implementation matches design.md (D1/D3/D4/D6/D7). One refinement: the PUT test needed a dedicated `stubMvpRolls()` helper that calls `mockReset()` before queueing the two MJP rolls, because the pre-existing test suite's `stubFixedRolls()` (tuned for POST's 4-roll consumption) leaves unconsumed `mockReturnValueOnce` values that would otherwise leak across tests (FIFO queue). This makes the PUT path deterministic without changing route behavior.

## Issues Found

- **WARNING (environment, not code)**: the initial `AUTH_MODE=local playwright test` run failed 20/21 because a stale `next dev` server (started in `auth` mode) was still listening on :3000 and Playwright's `webServer.reuseExistingServer` reused it, so the app served the login page. After killing the stale server, the same suite passes 21/21. Not caused by this PR; flagged so the orchestrator knows the earlier red was environmental.

## Verification

- `pnpm test` → 82 files / **937 tests passed** (baseline 934 + 3 new)
- `pnpm lint` → 0 errors (pre-commit + standalone)
- `npx tsc --noEmit` → clean
- `AUTH_MODE=local pnpm exec playwright test` → **21/21 passed** (after stale-server cleanup)
- Auth e2e (`test:e2e:auth`) → NOT run (needs Docker; PR 4 owns new match-view e2e)

## PR Boundary

- Mode: **stacked PR slice 1 of 4** (stacked-to-main)
- Commits: `4bbd898`, `4b4ccfa` (field feat/live-match-api)
- Boundary: from `main` @ `f5d0387`; ends after the result snapshot D4 change. Start of PR 2: client `getMatchDetail` + pure `matchSummary` mapping.
- Review budget impact: ~430 authored code lines in this slice (matching PR 1 forecast ~355–430; planning docs are baseline context, not reviewable logic).

## Remaining (other PRs)

- PR 3: page + `MatchView.tsx` + tests (3.1–3.5)
- PR 4: MatchCard "Ver partido" link + auth e2e (4.1–4.4)

---

# Apply Progress — Live Match View (PR 2: Client fetch + pure mapping)

## Status

PR 2 (tasks 2.1–2.5) **complete** — 5/5. `getMatchDetail` + match payload types (2.1) and the pure `buildMatchSummary` snapshot→section mapper (2.2–2.5). Strict TDD RED→GREEN→REFACTOR throughout.

## Scope (chained PR 2 of 4, stacked-to-main)

Branch: `feat/live-match-client` (from updated `main` @ merged PR 1 #57). Implements PR 2 ONLY:
- `features/leagues/api.ts` — `getMatchDetail` + `MatchDetail`/`MatchTeamDetail`/`MatchPlayer`/`MatchScoreboard`/`MatchResultRecord` types
- `features/leagues/matchSummary.ts` + `matchSummary.test.ts`
- Their tests + `tasks.md` marks.

PR 3 (page/MatchView), PR 4 (MatchCard/e2e) are NOT in scope.

## Completed Tasks

- [x] 2.1 `getMatchDetail(leagueId, fixtureId)` + types (D2/D3: FixtureDraft reuse, nullable `result`)
- [x] 2.2 MVP persisted `scores.mvp` wins; legacy fallback max-`pe` (floor ≥4, PE_MVP=4, tie→first); unresolved→omit section
- [x] 2.3 weather Spanish labels (unknown as-is); casualty Spanish labels
- [x] 2.4 omit-if-empty sections; fans `postFf` null→omit; winnings null→omit; walkover → zero sections + notice flag
- [x] 2.5 `matchSummary.ts` pure section builders (score/teams/fans/winnings/casualties/weather/pe/mvp)

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1 | `features/leagues/api.test.ts` | Unit (fetch mock) | ✅ 14/14 | ✅ 2 RED | ✅ 16/16 | ✅ normalized + walkover | ✅ tsc type hygiene |
| 2.2 | `features/leagues/matchSummary.test.ts` | Unit (pure) | N/A (new) | ✅ (import unresolved) | ✅ 12/12 | ✅ persisted/fallback/tie/omit | ✅ `mvpOf` null-on-unresolved |
| 2.3 | matchSummary.test.ts | Unit (pure) | N/A | ✅ | ✅ 12/12 | ✅ all 5 weather + 5 casualty labels | ➖ Clean |
| 2.4 | matchSummary.test.ts | Unit (pure) | N/A | ✅ | ✅ 12/12 | ✅ omit-if-empty + walkover + Empate | ➖ Clean |
| 2.5 | `matchSummary.ts` | Pure functions | N/A (new) | ✅ (from 2.2–2.4) | ✅ 12/12 | ✅ section builders | ✅ removed dead code; re-export MatchDetail |

### Work Unit Evidence (PR 2)

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm vitest run features/leagues/api.test.ts` → 16/16; `pnpm vitest run features/leagues/matchSummary.test.ts` → 12/12 |
| Runtime harness command/scenario and exact result | `buildMatchSummary` is pure (no IO) → no runtime boundary in this slice: the real fetch is exercised by the route tests (PR 1) and the UI in PR 3/4. Full unit suite `pnpm test` → 951/951 green. Local e2e `AUTH_MODE=local playwright test` → 21/21 green (killed stale server first). |
| Rollback boundary | Revert `api.ts` additions + `matchSummary.ts` + `matchSummary.test.ts` + `tasks.md` marks; leaves route (PR 1) and page/MatchView (PR 3) untouched. Commits `1a45da0`, `d4363b3` are the exact work-unit boundaries. |

## Files Changed (PR 2)

| File | Action | Notes |
|------|--------|-------|
| `features/leagues/api.ts` | Modified | +`getMatchDetail`, +types (~75) |
| `features/leagues/api.test.ts` | Modified | +2 `getMatchDetail` tests |
| `features/leagues/matchSummary.ts` | Created | pure section builders, labels, MVP |
| `features/leagues/matchSummary.test.ts` | Created | 12 tests |
| `openspec/changes/live-match/tasks.md` | Modified | Marked 2.1–2.5 `[x]` |

## Deviations from Design

None — matches design.md D2/D3/D5 and the snapshot→section mapping. Two refinements:
- `mvpOf` returns `null` when the selected grantee id resolves to no roster Player row (omit that side / section — omit-not-crash), which is the strict reading of D5's "resolved to a Player row; unresolved → omit".
- Casualties resolve the victim name via the casualty's own `team` field (home → homeTeam, away → awayTeam), rather than the section it lives in, matching `ResolvedCasualty.team`'s meaning.

## Issues Found

- None (no test-order coupling issue this slice: `matchSummary` is pure, zero mocks; `api.test.ts` uses the clean `vi.stubGlobal("fetch")` pattern).

## Verification (PR 2)

- Focused: `pnpm vitest run features/leagues/matchSummary.test.ts` → 12/12; `pnpm vitest run features/leagues/api.test.ts` → 16/16
- `pnpm test` → 83 files / **951 tests passed** (baseline 939 + 12 new)
- `pnpm lint` → 0 errors (pre-commit + standalone)
- `npx tsc --noEmit` → clean
- `AUTH_MODE=local pnpm exec playwright test` → **21/21 passed** (killed stale :3000 server first)
- Auth e2e → NOT run (needs Docker; PR 4 owns new match-view e2e)

## PR Boundary (PR 2)

- Mode: **stacked PR slice 2 of 4** (stacked-to-main)
- Commits: `1a45da0` (getMatchDetail), `d4363b3` (matchSummary)
- Boundary: from merged `main` (PR 1 #57); ends after the pure mapper. Start of PR 3: page + `MatchView.tsx` + MatchView tests.
- Review budget impact: ~430 authored code/test lines in this slice (matching PR 2 forecast ~405–465; planning docs are baseline context).
