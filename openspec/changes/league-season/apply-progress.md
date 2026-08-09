# Apply Progress — league-season — PR2 (UI: public list, detail join/leave/start, jornadas)

> **Phase**: apply · **Artifact store**: openspec · **Mode**: STRICT TDD
> **Delivery**: chained stacked-to-main, **this batch = PR2** (UI) — built on PR1 (DB+API+round-robin)
> The e2e+polish slice (PR3) is out of scope for this batch.

## Delivery decision resolution

`tasks.md` `Review Workload Forecast`: `400-line budget risk: High`, `Chained PRs recommended: Yes`,
`Chain strategy: pending`. The orchestrator resolved the `ask-on-risk` path explicitly: **PR2 ONLY (UI)**
of the chained **stacked-to-main** delivery, branched `feat/league-season-pr2` FROM `feat/league-season-pr1`.
Authored change lines ≈ 991 (10 modified + 3 created files), the middle slice of the forecast.

## Prior batch — PR1 completed (DB + API + round-robin) [MERGED from PR1 progress]

All 12 PR1 tasks were completed and verified in the previous apply batch (see the prior `apply-progress.md`
record): Prisma League status/seasonLength/startedAt + Fixture model + two additive migrations; the pure
`lib/roundRobin.ts` generator (Fisher-Yates shuffle + circle method, 10 unit tests); the public GET
`/api/leagues` open+own union with `ownerName` + `_count`; `[id]` visibility gate (open→any, started→
owner/member, foreign non-member 404, delete-started 409) with fixtures grouped by round; `teams` public
join + `members` self-leave/expel (open-only); and the transactional owner-only `start` route (≥2 teams,
seasonLength 1..n−1, re-start 409). PR1 ended at **597 tests passing**.

## Completed Tasks (this batch: PR2)

| Task | Description | Status |
|------|-------------|--------|
| 2.1 | RED `features/leagues/api.test.ts`: status/seasonLength/startedAt/ownerName/memberCount on League/LeagueDetail; `startLeague` + `selfLeave` wire the right routes | ✅ |
| 2.2 | GREEN `api.ts` + `useLeagues.ts`: consume server `memberCount` (single fetch, no N+1); expose `startLeague`/`selfLeave`; simplify hook to return `League[]` | ✅ |
| 2.3 | RED `LeagueList.test.tsx`: "Mis Ligas" + "Ligas abiertas" sections, public/own/started badges, server memberCount, no per-card detail fetches | ✅ |
| 2.4 | GREEN `LeagueList.tsx`: dual sections partitioned by owner id (session), Abierta/Iniciada badges, owner name + member count, Ver links, empty states | ✅ |
| 2.5 | RED `LeagueDetail.test.tsx`: role+status join/leave/expel/start; started hides controls + shows jornadas; foreign started 404 | ✅ |
| 2.6 | GREEN `LeagueDetail.tsx`: open→join (owner & foreign), member→Desapuntarse, owner→expel+Iniciar liga (≥2), started→jornadas + Iniciada badge | ✅ |
| 2.7 | RED `StartLeagueModal.test.tsx`: seasonLength input 1..teams−1, invalid blocked, POST /start | ✅ |
| 2.8 | GREEN `StartLeagueModal.tsx`: number input bound to teams−1, hint "Máximo {n−1} jornadas", calls `startLeague`, closes+refreshes | ✅ |
| 2.9 | GREEN `Jornadas`: rules render `FixtureDraft[]` grouped by round as "Home vs Away" matchups | ✅ |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 2.1–2.2 | `features/leagues/api.test.ts` | Unit | ✅ 597/49 files | ✅ startLeague/selfLeave missing → not-a-function RED | ✅ 6/6 | ✅ types shape + routes + unassigned filter | ✅ extracted shared `okJson` helper, dropped unused `expelTeam` import |
| 2.3–2.4 | `features/leagues/LeagueList.test.tsx` | Component | ✅ 597 baseline | ✅ 3 failed (badges/sections absent) | ✅ 6/6 | ✅ own open + own started + foreign open partition, badges, memberCount, no-N+1 | ✅ split owner/member-count meta into separate spans for locatable text |
| 2.5–2.6 + 2.9 | `features/leagues/LeagueDetail.test.tsx` | Component | ✅ 597 | ✅ 7 failed (role/status UI absent) | ✅ 8/8 | ✅ owner (admin), member leave, foreign join, no-team hint, started jornadas, foreign-404 | ✅ simplified conditional render (unified `!isMember → join` path); added null/loading guard |
| 2.7–2.8 | `features/leagues/StartLeagueModal.test.tsx` | Component | N/A (new) | ✅ module missing → import fails | ✅ 4/4 | ✅ hint, invalid 0/N blocked, valid POST, closed→null | ➖ None needed |

## Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues` → **28 passed (5 files)**; `pnpm exec vitest run app/leagues` → **3 passed (2 files)** |
| Runtime harness command/scenario and exact result | `pnpm test` → **612 passed (49 files)**; `AUTH_MODE=local pnpm exec playwright test` → **21 passed**; `pnpm exec playwright test --config playwright.config.auth.ts` → **7 passed** — incl. real-Postgres owner-joins-own-league → expel journey through the new UI |
| Rollback boundary | `git revert` the PR2 commits: `features/leagues/{api.ts,useLeagues.ts,LeagueList.tsx,LeagueDetail.tsx,useLeagueDetail.ts,StartLeagueModal.tsx}`, their tests, the two page tests, and the e2e selector updates; behavior reverts without touching PR1/PR3 files |

## Deviations from design

- **Owner joins their own open league via the same public "Unirse" select** (task 2.6 "open→join", design "join select by role"): the admin view additionally renders the join section when the owner is not yet a member so they can add their own team (with others) to reach the ≥2 members a season requires; once a member, the join section hides and only expel + "Iniciar liga" remain. Without this the start modal could never be enabled for a single-owner league.
- **Session user id via `useSession()`** (from `next-auth/react`) on `LeagueList` and `LeagueDetail` to determine owner/member/foreign; the client session already carries `user.id` via `auth.config.ts`'s JWT session callback. Component tests mock `vi.mock("next-auth/react")` per the existing `app/login` pattern.
- **`LeagueMemberTeam` type gained `userId`** so the detail can detect the session user's membership from the member-team list (the API already returns full team rows).
- No deviation from the API spec scenarios; the PR1 API shapes were consumed unchanged.

## Issues found

- The pre-existing owner-assign e2e selectors (`getByLabel("Equipos")`/"Asignar") no longer exist under the new role-aware UI; updated them minimally in `e2e/leagues.spec.ts` to the new join labels (`Tu equipo`/"Apuntarse"). No new e2e journeys added (deferred to PR3).
- The `#league-team-select` id selector used by the archived-team e2e still resolves (the join select keeps that id).
- tsc initially flagged `LeagueMemberTeam` test fixtures missing `roster`/`coaching`; added them to the fixtures. `npx tsc --noEmit` clean.

## Files changed (this batch)

| File | Action | What Was Done |
|------|--------|---------------|
| `features/leagues/api.ts` | Modified | `LeagueMemberTeam` + `userId`; `startLeague` + `selfLeave` helpers |
| `features/leagues/api.test.ts` | Created | 6 contract tests (types + start/leave/assign/unassigned) |
| `features/leagues/useLeagues.ts` | Modified | Drop N+1: single list fetch, server `memberCount`; return `League[]` |
| `features/leagues/LeagueList.tsx` | Modified | "Mis Ligas" + "Ligas abiertas" sections, Abierta/Iniciada badges, owner name + server member count |
| `features/leagues/LeagueList.test.tsx` | Modified | Rewritten for dual sections + new shapes (no N+1) |
| `features/leagues/useLeagueDetail.ts` | Modified | Added `leave`/`start` actions (self-leave + season start), both refresh |
| `features/leagues/LeagueDetail.tsx` | Modified | Role/status-aware: join/leave/expel/start + jornadas; loading + 404 guards |
| `features/leagues/LeagueDetail.test.tsx` | Modified | Rewritten for role/status scenarios + session mock |
| `features/leagues/StartLeagueModal.tsx` | Created | seasonLength input 1..teams−1, calls `startLeague`, refreshes |
| `features/leagues/StartLeagueModal.test.tsx` | Created | 4 validation/POST tests |
| `app/leagues/page.test.tsx` | Modified | Session mock + hero heading level fix |
| `app/leagues/[id]/page.test.tsx` | Modified | Session mock + status field in fixture |
| `e2e/leagues.spec.ts` | Modified | Minimal selector update to new join labels |

## Test results (this batch)

- `pnpm test` → **49 files, 612 tests passed** (PR1 597 + 15 new)
- `AUTH_MODE=local pnpm exec playwright test` → **21 passed**
- `pnpm exec playwright test --config playwright.config.auth.ts` → **7 passed**
- `pnpm lint` → 0 errors (1 pre-existing warning in `app/providers/SessionAppProvider.tsx`)
- `npx tsc --noEmit` → clean (exit 0)

## Status

**9/9 PR2 tasks complete.** Ready for `sdd-verify`. PR not created (orchestrator after verify). PR3 (e2e join→start journey + polish) remains out of scope for this slice.
