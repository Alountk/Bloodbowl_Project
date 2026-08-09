# Apply Progress — league-season — PR3 (e2e journey + polish) [FINAL SLICE]

> **Phase**: apply · **Artifact store**: openspec · **Mode**: STRICT TDD
> **Delivery**: chained stacked-to-main, **this batch = PR3** (e2e + polish) — built on PR1 (DB+API+round-robin) and PR2 (UI). Branch `feat/league-season-pr3` FROM `feat/league-season-pr2`.

## Delivery decision resolution

`tasks.md` `Review Workload Forecast`: `400-line budget risk: High`, `Chained PRs recommended: Yes`,
`Decision needed before apply: Yes`. The orchestrator resolved the `ask-on-risk` path explicitly as the
chained **stacked-to-main** delivery: PR1 (DB+API) → PR2 (UI) → **PR3 (e2e journey + polish)**, branched
`feat/league-season-pr3` FROM `feat/league-season-pr2`. This is the final slice; the prior two are merged.

## Prior batches — PR1 + PR2 completed [MERGED]

**PR1 (DB + API + round-robin)** — 12/12 tasks (1.1–1.12): Prisma League `status/seasonLength/startedAt` +
`Fixture` model + migrations; pure `lib/roundRobin.ts` (Fisher-Yates + circle method, 10 unit tests); public
GET `/api/leagues` open+own union with `ownerName` + `_count`; `[id]` visibility gate (open→any, started→
owner/member, foreign non-member 404, delete-started 409) with fixtures grouped by round; `teams` public
join + `members` self-leave/expel (open-only); transactional owner-only `start` route (≥2 teams,
seasonLength 1..n−1, re-start 409). Ended at **597 tests passing**.

**PR2 (UI)** — 9/9 tasks (2.1–2.9): `api.ts`/`useLeagues.ts` consume server `memberCount` (drop N+1), expose
`startLeague`/`selfLeave`; dual-section `LeagueList` ("Mis Ligas" + "Ligas abiertas") with Abierta/Iniciada
badges; role/status-aware `LeagueDetail` (join/leave/expel/start + jornadas, foreign-started 404); `StartLeagueModal`
(seasonLength 1..teams−1); `Jornadas` rendering. Ended at **612 tests passing**.

## Completed Tasks (this batch: PR3)

| Task | Description | Status |
|------|-------------|--------|
| 3.1 | e2e: B lists A's open league in "Ligas abiertas", joins with own team | ✅ |
| 3.2 | e2e: A starts (2 teams) → **1 jornada** (teams−1 = 1), unique single matchup | ✅ |
| 3.3 | e2e: post-start self-leave hidden (409 surface by API guard); started detail to foreign non-member C → 404 | ✅ |
| 3.4 | `test:e2e:auth` (8 incl. new journey) + full `pnpm test` (612) green; add journey to auth config, isolate from local config; update docs refs | ✅ |
| polish | Make the "Jornada N" round label a proper semantic heading (`<h3>`) for screen-reader navigation of the schedule | ✅ |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1–3.3 | `e2e/league-season.spec.ts` (new) | E2E | N/A (new) | ✅ journey asserts full multi-user flow on real Postgres (originally red via region/heading locator mismatch) | ✅ 1 passed (13s first run; later part of 8/8 auth suite) | ✅ journey triangulates owner-join, member-join, start-modal, post-start locks, foreign 404 | ✅ tightened selectors to `region` + scoped counts after first red |
| polish | `features/leagues/LeagueDetail.test.tsx` (existing, +2 asserts) | Component | ✅ 612 baseline | ✅ "Jornada 1/2" as `heading` role → RED (was `<header>`) | ✅ 8/8 | ✅ both rounds asserted as headings | ✅ replaced `<header>` block with semantic `<h3>` |
| config | `playwright.config.ts` + `playwright.config.auth.ts` | Config | N/A | ✅ journey ran in both suites (redundant) → added auth-boundary isolation | ✅ local suite back to 21, auth suite 8 | ✅ auth@8 includes journey; local@21 excludes it | — |

## Work Unit Evidence

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm exec playwright test --config playwright.config.auth.ts e2e/league-season.spec.ts` → **1 passed** (the full multi-user journey, real Postgres). `pnpm exec vitest run features/leagues/LeagueDetail.test.tsx` → **8 passed** (heading polish). |
| Runtime harness command/scenario and exact result | `pnpm exec playwright test --config playwright.config.auth.ts` → **8 passed** (auth+migration+isolation+leagues+journey). `AUTH_MODE=local pnpm exec playwright test --config playwright.config.ts` → **21 passed** (journey correctly excluded). `pnpm test` → **612 passed (49 files)**. `pnpm lint` → 0 errors (1 pre-existing warning in `SessionAppProvider.tsx`). `npx tsc --noEmit` → clean (exit 0). |
| Rollback boundary | `git revert` the PR3 commits: `e2e/league-season.spec.ts`, the `playwright.config.*` testMatch/testIgnore edits, and the `Jornadas` `<h3>` heading change (+ its 2 test assertions). Reverts cleanly without touching PR1/PR2 files. |

## Deviations from design / original task wording

- **Task 3.2 originally read "A starts (2 teams) → 2 jornadas".** With 2 teams the server constrains
  `seasonLength` to `1..teams−1 = 1`, so a valid start yields exactly **1 jornada** (one A-vs-B matchup). The
  journey starts with `seasonLength: 1` (per the spec's "1 ≤ s ≤ n−1") and asserts one round / one matchup.
  The tasks.md wording was corrected to "1 jornada (teams−1 = 1)".
- **Post-start join/leave/expel are surfaced as hidden controls in the role-aware UI** (a STARTED league
  renders the Jornadas view and omits the join/leave/expel actions entirely), rather than an on-page 409
  dialog. The server API still returns 409 for any direct join/leave/expel on a started league (PR1). The
  journey asserts the UI hides self-leave post-start, which is the correct client representation of the 409
  lock.
- **New e2e file** (`e2e/league-season.spec.ts`) rather than extending `e2e/leagues.spec.ts`: the journey is a
  distinct multi-user scenario; its own storage contexts (A/B/C) stay isolated. It is wired into the auth
  suite's `testMatch` and excluded from the local `testIgnore` because `/api/leagues` 401s under
  `AUTH_MODE=local`.

## Issues found

- **Double-running the journey in the default local config.** Because `e2e/league-season.spec.ts` is under
  `testDir: "./e2e"`, the default `playwright.config.ts` (chromium project, `testIgnore` list) picked it up.
  In a clean local run (`AUTH_MODE=local`, no DB) it would fail, but with a reused auth-mode server it falsely
  passed. Added `**/league-season.spec.ts` to the default config's `testIgnore` so it runs **only** in the
  auth suite that has Postgres. Comment added in the spec explaining the auth-only requirement.
- **Jornada labels were not semantic headings.** The round label rendered as a `<header>` with the accessible
  name only via `aria-label`; screen-reader user could not navigate rounds by heading. Elevated to `<h3>`.
- The journey's first GREEN failed on `getByRole("heading", { name: "Jornada 1" })` (the label was a
  `<header>`, not a heading) — that failure drove the polish + the correct `region` locator.
- Team creation requires a roster of `MIN_PLAYERS..MAX_PLAYERS` (3–16); the journey creates 11 linemen per the
  prompt footnote for the BB2025 minimum.

## Files changed (this batch)

| File | Action | What Was Done |
|------|--------|---------------|
| `e2e/league-season.spec.ts` | Created | Full multi-user (A admin / B rival / C outsider) journey: signup → 11-player team → league; B joins via "Ligas abiertas"; A starts seasonLength=1 → 1 jornada matched A-vs-B; post-start self-leave hidden; C gets 404. Item idempotent via unique emails/names per run. |
| `playwright.config.auth.ts` | Modified | Added `**/league-season.spec.ts` to `testMatch` (auth suite). |
| `playwright.config.ts` | Modified | Added `**/league-season.spec.ts` to chromium `testIgnore` (local suite). |
| `features/leagues/LeagueDetail.tsx` | Modified | `Jornadas` round label `<header>` → semantic `<h3>` (a11y polish). |
| `features/leagues/LeagueDetail.test.tsx` | Modified | Added heading-role assertions for "Jornada 1"/"Jornada 2" (RED→GREEN). |
| `openspec/changes/league-season/tasks.md` | Modified | Marked 3.1–3.4 `[x]`; corrected 3.2 to "1 jornada (teams−1 = 1)". |

## Test results (this batch)

- `pnpm test` → **49 files, 612 passed** (PR3 is e2e+polish; unit count unchanged from PR2 as expected)
- `pnpm exec playwright test --config playwright.config.auth.ts` → **8 passed** (7 prior + 1 new journey)
- `AUTH_MODE=local pnpm exec playwright test` → **21 passed** (journey excluded, baseline preserved)
- `pnpm lint` → 0 errors (1 pre-existing `SessionAppProvider.tsx` warning)
- `npx tsc --noEmit` → clean (exit 0)

## Status

**4/4 PR3 tasks complete** (plus the polish item). All league-season tasks (Phase 1–3) are now `[x]`.
Cumulative: PR1 12 + PR2 9 + PR3 4 = **25/25 tasks complete**. Ready for `sdd-verify`. PR NOT created
(orchestrator after verify) — branch `feat/league-season-pr3` stacked on `feat/league-season-pr2`.
