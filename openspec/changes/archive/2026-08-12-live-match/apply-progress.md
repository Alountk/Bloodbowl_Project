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

---

# Apply Progress — Live Match View (PR 3: Page + MatchView)

## Status

PR 3 (tasks 3.1–3.5) **complete** — 5/5. Thin server page + client `MatchView` (D2) rendering the three lifecycle states, walkover notice (MV-2), and inert live shells (MV-5/MV-6); Spanish copy + rulebook-light tokens only (MV-7); 404 → not-found view. Strict TDD RED→GREEN→REFACTOR.

## Scope (chained PR 3 of 4, stacked-to-main)

Branch: `feat/live-match-page` (from updated `main` @ merged PR 2 #58). Implements PR 3 ONLY:
- `app/leagues/[id]/fixtures/[fixtureId]/page.tsx` (new, thin)
- `features/leagues/MatchView.tsx` + `MatchView.test.tsx`

PR 4 (MatchCard/e2e) is NOT in scope. `buildMatchSummary` (PR 2) is consumed, not re-implemented.

## Completed Tasks

- [x] 3.1 Thin server page (`app/leagues/[id]/fixtures/[fixtureId]/page.tsx`) rendering `<MatchView>`
- [x] 3.2 3-state render: played full summary / scheduled `Programado:` via `formatMatchDate` es-ES / pending notice
- [x] 3.3 Walkover notice + zero summary sections; no visible live/timeline placeholder any state
- [x] 3.4 Spanish copy + rulebook-light tokens only; 404 → not-found view (client fetch, matches LeagueDetail)
- [x] 3.5 `MatchView.tsx`: internal `useMatchDetail` hook, `buildMatchSummary` rendering, `LiveTurnBar/Clock/EventFeed` shells receive `live:null` → null; notFound panel

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 | `app/leagues/[id]/fixtures/[fixtureId]/page.tsx` | Thin page | N/A (new) | N/A (thin wrapper) | ✅ (via MatchView) | ➖ Single | ✅ mirrors league-detail page |
| 3.2 | `features/leagues/MatchView.test.tsx` | Client component | N/A (new) | ✅ 7 RED (import unresolved) | ✅ 7/7 | ✅ played/scheduled/pending | ✅ multiple-match text → getAllByText |
| 3.3 | MatchView.test.tsx | Client component | N/A | ✅ | ✅ 7/7 | ✅ walkover + 4-state no-live | ➖ Clean |
| 3.4 | MatchView.test.tsx | Client component | N/A | ✅ | ✅ 7/7 | ✅ tokens + 404 | ➖ Clean |
| 3.5 | `MatchView.tsx` | Client component + hook | N/A (new) | ✅ (from 3.2–3.4) | ✅ 7/7 | ✅ 3-state + live shells | ✅ removed dead `mounted`; type fixes |

**Safety Net**: `matchSummary.test.ts` + `api.test.ts` baselines re-ran at start = 28/28 (the seam MatchView consumes). After PR 3, matchSummary/api still 12/12 + 16/16.

### Work Unit Evidence (PR 3)

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm vitest run features/leagues/MatchView.test.tsx` → 7/7; focused set (MatchView + matchSummary + api + league page) → 37/37 |
| Runtime harness command/scenario and exact result | `pnpm dev` → `/leagues/ID/fixtures/FID` in AUTH_MODE=local — exercised in PR 4's auth e2e; component render path verified here via the real `getMatchDetail`→`readJson` wiring (global fetch stub). Full unit suite `pnpm test` → 958/958 green. Local e2e `AUTH_MODE=local playwright test` → 21/21 green (killed stale server first). |
| Rollback boundary | Revert `page.tsx` + `MatchView.tsx` + `MatchView.test.tsx` + `tasks.md` marks; leaves route (PR 1), client/mapper (PR 2), and MatchCard/e2e (PR 4) untouched. Commit `0b72422` is the work-unit boundary. |

## Files Changed (PR 3)

| File | Action | Notes |
|------|--------|-------|
| `app/leagues/[id]/fixtures/[fixtureId]/page.tsx` | Created | thin server page (D2) |
| `features/leagues/MatchView.tsx` | Created | client, `useMatchDetail`, 3-state, live shells, notFound |
| `features/leagues/MatchView.test.tsx` | Created | 7 tests |
| `openspec/changes/live-match/tasks.md` | Modified | Marked 3.1–3.5 `[x]` |

## Deviations from Design

None — matches design D2 (client fetch), D5 (MVP via mapper), and the MatchView design (3-state, inert shells `live:null`, 404→notFound, Spanish copy + rulebook-light tokens). Teams section renders the resolved race label + coach from `buildMatchSummary` (no subtype exists — race name only, as confirmed in PR 2). Render tests use regex/`getAllByText` where a value legitimately appears in multiple sections (winner name in score + teams; coach inside a combined `<p>`; the +4 PE badge on both MVP sides).

## Issues Found

- None. The MVP/score/featured text appears in multiple DOM sections, which is correct behavior — tests assert via `getAllByText`/regex (no false RED from RTL's single-match default).

## Verification (PR 3)

- Focused: `pnpm vitest run features/leagues/MatchView.test.tsx` → 7/7; focused set (7 MatchView + 12 matchSummary + 16 api + 2 page) → 37/37
- `pnpm test` → 84 files / **958 tests passed** (baseline 951 + 7 new)
- `pnpm lint` → 0 errors (pre-commit + standalone)
- `npx tsc --noEmit` → clean
- `AUTH_MODE=local pnpm exec playwright test` → **21/21 passed** (killed stale :3000 server first)
- Auth e2e → NOT run (needs Docker; PR 4 owns new match-view e2e)

## PR Boundary (PR 3)

- Mode: **stacked PR slice 3 of 4** (stacked-to-main)
- Commits: `0b72422` (MatchView + page)
- Boundary: from merged `main` (PR 2 #58); ends after the page + MatchView. Start of PR 4: MatchCard "Ver partido" link + auth e2e.
- Review budget impact: ~549 authored code/test lines in this slice (page 15 + MatchView 299 + test 230), close to the PR 3 forecast (~505–525; planning docs are baseline context).

## Remaining (PR 4 only)

- 4.1–4.4: MatchCard "Ver partido" link (MV-4, byte-identical scheduled/played footer), playwright config split (new match-view spec in auth suite only), and `e2e/match-view.spec.ts` (auth, real-DB).

---

# Apply Progress — Live Match View (PR 4: Navigation + E2E) — FINAL SLICE

## Status

PR 4 (tasks 4.1–4.4) **complete** — the final slice closes the live-match MVP. MatchCard "Ver partido" link (MV-4), playwright config split, and a real-DB `e2e/match-view.spec.ts` (auth). Two in-scope bug fixes surfaced by the real-DB e2e: the result snapshot's `winnings` moved per-side to match the design's `MatchScoreboard` contract (PR 1 latent), and a pre-existing `league-matchday.spec.ts` `adminAsBye` test-harness guard repaired (was failing intermittently). Full unit + lint + tsc + local e2e + auth e2e all green.

## Scope (chained PR 4 of 4, stacked-to-main)

Branch: `feat/live-match-nav` (from updated `main` @ merged PR 3 #59).
- `features/leagues/MatchCard.tsx` — always-rendered footer + "Ver partido" link LAST
- `playwright.config.ts` / `playwright.config.auth.ts` — route match-view.spec into auth-only
- `e2e/match-view.spec.ts` (new, auth suite)
- `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` + test — per-side winnings fix
- `e2e/league-matchday.spec.ts` — `adminAsBye` guard fix (test harness)

## Completed Tasks

- [x] 4.1 RED (refactor guard) MatchCard.test.tsx: byte-identical scheduled/played footer, "Ver partido" LAST DOM link, href `{leagueId}/fixtures/{fixtureId}`, renders in all 3 states, card-body click still negotiates
- [x] 4.2 MatchCard.tsx: always-rendered footer + "Ver partido" link last; scheduled/played lines byte-identical
- [x] 4.3 playwright configs: `match-view.spec.ts` NOT in local testIgnore, IS in auth testMatch
- [x] 4.4 `e2e/match-view.spec.ts`: pending → scheduled date → played summary + Ver partido nav + Jornadas intact; walkover notice (real DB)

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.1 | `features/leagues/MatchCard.test.tsx` | Unit (component) | ✅ 21/21 | ✅ 4 RED | ✅ 25/25 | ✅ 3 states + byte-identical + last-link | ✅ fixed `screen.unmount` misuse |
| 4.2 | `MatchCard.tsx` | Component | ✅ 21/21 | ✅ (from 4.1) | ✅ 25/25 | ✅ last-link + href + pending | ➖ Clean |
| 4.3 | `playwright.config.ts`/`.auth.ts` | Config | N/A | N/A (additive) | ✅ local 21 = excludes match-view | ✅ +1/+1 verified via `--list` | ➖ Minimal |
| 4.4 | `e2e/match-view.spec.ts` | E2E (real DB) | N/A | ✅ (auth run red → green) | ✅ 2/2 in auth suite | ✅ pending/scheduled/played + walkover + Jornadas | ✅ await region; weather omit-if-empty soft-assert |
| 4.2 fix | `result/route.ts` + test | Unit (route) | ✅ 24/24 | ✅ 2 RED (per-side) | ✅ 24/24 | ✅ POST per-side + PUT preserve per-side + legacy | ➖ Clean |
| harness | `e2e/league-matchday.spec.ts` | E2E harness | N/A | ✅ (auth red on flake) | ✅ 3/3 | ✅ admin t1/t2/bye | ➖ guard only |

### Work Unit Evidence (PR 4)

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm vitest run features/leagues/MatchCard.test.tsx` → 25/25; `features/leagues/MatchView.test.tsx` → 7/7; `result/route.test.ts` → 24/24 |
| Runtime harness command/scenario and exact result | `pnpm run test:e2e:auth` (Docker) → **18/18 passed** including the new `e2e/match-view.spec.ts` and the pre-existing Jornadas/match-report specs. Local `AUTH_MODE=local playwright test` → 21/21 (match-view excluded via 4.3). |
| Rollback boundary | Revert `MatchCard.tsx` + `MatchCard.test.tsx` + both playwright configs + `e2e/match-view.spec.ts` + the per-side winnings route change + the matchday guard fix; leaves PRs 1-3 intact. Commits `b03cfe9`, `0b88c5a`, `63d0f71`, `9d39a55`, `66e7e4e`, `b2c03de`. |

## Files Changed (PR 4)

| File | Action | Notes |
|------|--------|-------|
| `features/leagues/MatchCard.tsx` | Modified | always-rendered footer + "Ver partido" last (MV-4) |
| `features/leagues/MatchCard.test.tsx` | Modified | +4 approval/nav tests |
| `playwright.config.ts` | Modified | +`**/match-view.spec.ts` testIgnore |
| `playwright.config.auth.ts` | Modified | +`**/match-view.spec.ts` testMatch |
| `e2e/match-view.spec.ts` | Created | 2 auth journeys |
| `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` | Modified | per-side winnings (POST writer + PUT preserver) |
| `.../result/route.test.ts` | Modified | per-side winnings assertions |
| `e2e/league-matchday.spec.ts` | Modified | `adminAsBye` guard (t1||t2) |
| `openspec/changes/live-match/tasks.md` | Modified | Marked 4.1–4.4 `[x]` |

## Deviations from Design / Bugs Found & Fixed

- **BUG (surfaced by e2e)** — the D4 snapshot stored `winnings` top-level `{home,away}`, but the design `MatchScoreboard` contract (and the PR 2 mapper / PR 3 MatchView) read `winnings` per-side. The result route now writes each side's `winnings` inside `home`/`away` (POST) and preserves prior per-side winnings on PUT (legacy rows omit the key — forward-only). No migration.
- **BUG (pre-existing, test-harness)** — `e2e/league-matchday.spec.ts`'s `adminAsBye` guard only retried when the admin was the round-1 FIRST team (`t1`), so an admin-as-second-team pairing leaked through and the negotiation test's `not.toContain(admin)` failed intermittently (~1/3 runs). Fixed to check both `t1` and `t2`. Requires an orchestrator review: this is a repair of a latent test bug, not product scope.

## Verification (PR 4)

- Focused: `pnpm vitest run features/leagues/MatchCard.test.tsx` → 25/25; `MatchView.test.tsx` → 7/7; `result/route.test.ts` → 24/24
- `pnpm test` → 84 files / **962 tests passed**
- `pnpm lint` → 0 errors; `npx tsc --noEmit` → clean
- `AUTH_MODE=local pnpm exec playwright test` → **21/21** (match-view excluded; confirmed via `--list` = 0)
- `pnpm run test:e2e:auth` (Docker) → **18/18 passed** including `e2e/match-view.spec.ts` (2) and all pre-existing auth suites

## PR Boundary (PR 4 / FINAL)

- Mode: **stacked PR slice 4 of 4** (stacked-to-main)
- Commits: `b03cfe9`, `0b88c5a`, `63d0f71`, `9d39a55`, `66e7e4e`, `b2c03de`
- Boundary: from merged `main` (PR 3 #59); ends the live-match MVP. Change is COMPLETE → next phase `sdd-verify`.
- Review budget impact: ~330 authored code/test/config lines in this slice (matching the PR 4 forecast ~280–330).
