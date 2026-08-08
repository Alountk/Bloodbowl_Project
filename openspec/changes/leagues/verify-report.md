```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:0d6694f89c507b81e064b9be4dfe1f8b096a5bfb9ba79c4a249ec202c944ea1e
verdict: pass
blockers: 0
critical_findings: 0
requirements: 5/5
scenarios: 20/20
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:1edd333a6efd409996ea9d39af06e5ae5cc0d7e97261ed36170b9f1e72d71a27
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: leagues — PR2 (Core UI, Pattern 2) on branch feat/leagues-pr2 (stacked on PR1)
**Version**: delta spec v1 (leagues + app-shell + team-detail-view)
**Mode**: Strict TDD (runner: `pnpm test`, vitest; Playwright e2e local + auth)

**Re-verification note**: Prior verdict was FAIL (1 blocker) because the auth E2E leagues flow was non-idempotent — the spec used a fixed league name ("Costa Norte") that collided with rows persisted by a prior run, surfacing the required-but-erroring 409. The fix (commit `9bc7610`):
1. `e2e/leagues.spec.ts`: league name is now unique per run (`Liga E2E ${Date.now()}`) — no collision with persisted rows.
2. `playwright.config.auth.ts`: `DATABASE_URL` now uses `POSTGRES_PORT` (default 5433) to match the compose published port (`bloodbowl_web-postgres-1` publishes `0.0.0.0:5433->5432`), matching `.env`.

Independent re-verification confirms the auth leagues journey is now reproducibly green (see E2E evidence below).

### Completeness
| Metric | Value |
|--------|-------|
| PR2 tasks total | 10 |
| PR2 tasks complete | 10 |
| PR2 tasks incomplete | 0 |
| PR3 tasks (deferred) | 8 (structural — out of PR2 slice) |

### Build & Tests Execution
**Build/type-check**: ✅ Passed
```text
npx tsc --noEmit → exit 0, no diagnostics
pnpm lint → clean (0 errors/warnings, exit 0)
```

**Tests (unit)**: ✅ 564 passed (45 files), 0 failed, 0 skipped
```text
pnpm test → Test Files 45 passed (45), Tests 564 passed (564)
```

**Tests (e2e, AUTH_MODE=local)**: ✅ 21 passed
```text
AUTH_MODE=local pnpm exec playwright test → 21 passed (chromium create-team 14 + delete-team 2 + mobile 5)
```

**Tests (e2e, auth suite real Postgres)**: ✅ 4 passed × 2 runs (idempotent)
```text
Run 1: pnpm exec playwright test --config playwright.config.auth.ts → 4 passed (auth + isolation + leagues + migration)
Run 2: pnpm exec playwright test --config playwright.config.auth.ts → 4 passed (same, against persisted rows from run 1)
The previously-failing leagues journey (create league → card → detail → assign → member listed → expel) is GREEN on both runs — the unique-name fix resolves the 409 collision entirely.
```

**DB/schema (runtime)**: League table (name unique `@unique`, ownerId FK CASCADE, createdAt), Team.leagueId FK `ON DELETE SET NULL`. Postgres healthy (`bloodbowl_web-postgres-1` on host port 5433).

**Coverage**: ➖ Not available — no coverage tool configured. Not a failure.

### Spec Compliance Matrix

**app-shell delta — Requirement: Sidebar Structure**
| Scenario | Test | Result |
|----------|------|--------|
| Sidebar landmark and wordmark | `app/AppShell.test.tsx` (getByLabelText Sidebar exactly 1, wordmark) | ✅ COMPLIANT |
| Teams and Ligas navigation (exactly 2, shared desk+drawer) | `AppShell.test.tsx > renders shared nav with exactly Teams and Ligas links in both desktop and drawer` | ✅ COMPLIANT |
| Active and hover states | `components/Sidebar.tsx` shared partial (active `bg-[#12225a] text-white`, hover `bg-slate-100`) + existing shell nav tests | ✅ COMPLIANT |
| Ligas link routes to leagues | `Sidebar.tsx` NAV_ITEMS `{href:"/leagues",label:"Ligas"}` + auth leagues e2e navigates `/leagues` end-to-end | ✅ COMPLIANT |

**team-detail-view delta — Requirement: Identity Display**
| Scenario | Test | Result |
|----------|------|--------|
| Displaying a valid team (name, bold race, league/Sin liga, tags) | `features/teams/detail/TeamDetailView.test.tsx` + `app/teams/[teamId]/page.test.tsx > renders after hydration` | ✅ COMPLIANT |
| Unassigned team shows Sin liga (no raw token) | `TeamDetailView.test.tsx > renders Style A hero: ... Sin liga, and tags`; `page.test.tsx` unassigned fixture | ✅ COMPLIANT |
| Superhero league name | `TeamDetailView.test.tsx > shows the resolved league name for an assigned team` + `page.test.tsx > passes the resolved league name to TeamDetailView when the team has a league` (fetches /api/leagues/league-1, asserts North Reikland League, Sin liga absent) | ✅ COMPLIANT |
| Hero heading responsive | `TeamDetailView.tsx` source `text-2xl md:text-[28px]` responsive tokens (existing shell + team-detail tests) | ✅ COMPLIANT |

**leagues delta — UI portion (API verified in PR1; route tests still green in the 564 suite)**
| Scenario | Test | Result |
|----------|------|--------|
| League persisted (UI create flow) | `CreateLeagueModal.test.tsx > POSTs the league and refreshes` + `app/api/leagues/route.test.ts > creates … 201` | ✅ COMPLIANT |
| Duplicate league name rejected (409 surfaced in UI) | `CreateLeagueModal.test.tsx > surfaces the duplicate-name 409 and stays open` + `route.test.ts > returns 409` | ✅ COMPLIANT |
| League delete clears members | `app/api/leagues/[id]/route.test.ts > clears member leagueIds (SetNull)` | ✅ COMPLIANT |
| Unauthenticated API call (401) | all `app/api/leagues/**/route.test.ts` | ✅ COMPLIANT |
| List only own leagues | `route.test.ts > lists only the session user's leagues` + `LeagueList.test.tsx` list/card counts | ✅ COMPLIANT |
| Foreign league denied (404) | `[id]/route.test.ts` (404) + `app/leagues/[id]/page.test.tsx > renders a not-found message for a foreign or missing league` | ✅ COMPLIANT |
| League detail with members | `[id]/route.test.ts` + `LeagueDetail.test.tsx > lists member rows` + `app/leagues/[id]/page.test.tsx > renders the league detail` | ✅ COMPLIANT |
| Assign own unassigned team | `teams/route.test.ts` + `LeagueDetail.test.tsx > assigning a team POSTs … and refreshes` + **green e2e journey (both auth runs)** | ✅ COMPLIANT |
| Assign already-member rejected (409) | `teams/route.test.ts > returns 409` | ✅ COMPLIANT |
| Assign foreign or archived denied (404/409) | `teams/route.test.ts` foreign-404 + archived-409 | ✅ COMPLIANT |
| Expel member clears membership | `members/[teamId]/route.test.ts` + `LeagueDetail.test.tsx > expelling a team DELETEs` + **green e2e journey (both auth runs)** | ✅ COMPLIANT |
| Expel non-member denied (404) | `members/[teamId]/route.test.ts > returns 404` | ✅ COMPLIANT |

**Compliance summary**: 20/20 scenarios fully COMPLIANT — unit/component/route evidence passes in the 564 suite, and the two scenarios previously ⚠️ PARTIAL (`Assign own unassigned team`, `Expel member clears membership`) now have reproducibly green end-to-end auth-E2E coverage (2×4 passed), and `Ligas link routes to leagues` is proven by the e2e journey that navigates to `/leagues`. Canonical verdict `pass` (0 blockers).

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Sidebar Ligas nav item (shared NAV_ITEMS) | ✅ Implemented | `components/Sidebar.tsx` NAV_ITEMS = Teams (/), Ligas (/leagues); single shared `SidebarContent` for desktop + drawer; active navy, hover bg-slate-100 |
| `/leagues` list (Pattern-2 cards) | ✅ Implemented | `app/leagues/page.tsx` + `LeagueList.tsx` + `useLeagues.ts`: hero "Mis Ligas", + Nueva liga, grid with band/name/desc/count/Ver, empty state + CTA |
| Card member count via detail fetch (documented N+1) | ✅ Implemented | `useLeagues.ts` fetches `/api/leagues` then per-league `/api/leagues/[id]` `.teams.length`; documented |
| Create modal (name required, 409 dup surfaced) | ✅ Implemented | `CreateLeagueModal.tsx`: name required; on 409 shows "Ya existe una liga con ese nombre." |
| `/leagues/[id]` detail | ✅ Implemented | `LeagueDetail.tsx` + `useLeagueDetail.ts`: hero, assign select, member rows + Expulsar; foreign → "Liga no encontrada o sin acceso." |
| Assign select own unassigned teams | ✅ Implemented | `listUnassignedTeams` filters `/api/teams` to `leagueId === null` |
| Team detail leagueName wired (Sin liga / league name) | ✅ Implemented | `app/teams/[teamId]/page.tsx` `useLeagueName(team.leagueId)` → TeamDetailView; no leagueType/LEAGUE_LABELS refs |
| Auth e2e leagues flow in auth config; ignored in local | ✅ Implemented | auth testMatch += leagues.spec.ts; local chromium testIgnore += leagues.spec.ts; mobile testMatch mobile-only |
| E2E spec idempotent (unique league name per run) | ✅ Implemented | `e2e/leagues.spec.ts` `Liga E2E ${Date.now()}` — resolves prior 409 collision |
| Auth config DB port aligned with compose | ✅ Implemented | `playwright.config.auth.ts` `DATABASE_URL` uses `process.env.POSTGRES_PORT ?? "5433"` — matches `bloodbowl_web-postgres-1` published port and `.env` |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Pattern-2 cards grid (band, name, desc, N equipos, Ver) | ✅ Yes | `LeagueList` matches design |
| Create via rulebook modal (name + desc) → list refresh | ✅ Yes | `CreateLeagueModal` + `onCreate` refresh |
| Detail: hero + assign select (own unassigned) + member rows with Expulsar | ✅ Yes | `LeagueDetail` matches design |
| Sidebar shared NAV_ITEMS + "Ligas" | ✅ Yes | Single source desktop+drawer |
| Card "N equipos" via client detail fetch | ✅ Yes | Documented deviation; API unchanged, no `_count` added |
| `leagueName` resolved client-side via `/api/leagues/[id]` | ✅ Yes | Design's stated simplest path; matches shipped `leagueName?` prop |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | PR2 table present in apply-progress (rows 2.1–2.10) |
| All tasks have tests | ✅ | 10/10: component/page test files exist and pass |
| RED confirmed (tests exist) | ✅ | All referenced test files exist; focused sweep 26 tests / 7 files pass |
| GREEN confirmed (tests pass) | ✅ | `pnpm test` → 564; focused PR2 sweep → 26; local e2e → 21; auth e2e → 2×4 |
| Triangulation adequate | ✅ | LeagueList 4, CreateLeagueModal 4 (incl dup-409), LeagueDetail 5, AppShell exact-2, team page 5 |
| Safety Net for modified files | ✅ | 548/548 baseline reported; full suite green at 564 |

**TDD Compliance**: 6/6 checks passed

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (component) | 26 (PR2 scope) | 7 | vitest + @testing-library/react |
| Integration (pages) | app-shell, team-detail, leagues pages | 4 | vitest + RTL |
| E2E local | 21 | 3 specs | Playwright (AUTH_MODE=local) |
| E2E auth | 4 (×2 runs, idempotent) | 4 specs | Playwright AUTH_MODE=auth, real Postgres |

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected (`pnpm test` runs `vitest run` with no `--coverage`). Informational, not blocking.

### Assertion Quality
Scan of new PR2 test files (LeagueList, CreateLeagueModal, LeagueDetail, AppShell, teams page, leagues pages) found no tautologies, no ghost loops, no orphan empty checks, no smoke-only renders, no implementation-detail coupling. Component/page tests assert real rendered content, fetch shapes, and 4xx behaviors. `CreateLeagueModal.test` asserts the 409 duplicate-name inline error (the required PR2 behavior). `LeagueDetail.test` asserts unassigned-only filter via null `queryByRole`. AppShell asserts exactly 2 nav links in both desktop and drawer. The idempotency fix added no assertions; the leagues e2e (create → card → detail → assign → member → expel) asserts real user-visible behavior and is reproducibly green.
**Assertion quality**: ✅ All assertions verify real behavior

### Quality Metrics
**Linter**: ✅ No errors/warnings (`pnpm lint` exit 0)
**Type Checker**: ✅ No errors (`npx tsc --noEmit` exit 0)

### Issues Found
**CRITICAL**: None — the prior single blocker (non-idempotent auth E2E leagues flow) is resolved: unique league name per run prevents the 409 collision, confirmed green on two consecutive auth-suite runs against the same Postgres.

**WARNING**:
- E2E leagues card-count step (`N equipos`) is not asserted in the e2e journey (unit-only). Non-blocking; the journey asserts the full create → detail → assign → expel flow.
- The N+1 league-detail fetch for card member counts is a deliberate, documented deviation; acceptable at this scale, flagged for growth.

**SUGGESTION**:
- `useLeagueDetail` duplicates load logic between the initial `useEffect` and `refresh` callback (lines 25-69); a single shared loader would remove the duplication (set-state-in-effect lint forced the split).
- Consider asserting the card "N equipos" count in the auth E2E journey now that the suite is idempotent (currently unit-only) — the composing scaffold is in place.

### Verdict
**PASS** — 5/5 requirements and 20/20 scenarios are compliant. Independent re-verification after the idempotency fix: `pnpm test` 564 passed, `AUTH_MODE=local` e2e 21 passed, auth E2E 4 passed × 2 runs (leagues journey reproducibly green), lint and `tsc --noEmit` clean, Postgres healthy. The prior FAIL blocker (fixed-name league collision → 409) is fully resolved by the unique-per-run league name and the aligned auth-config DB port. Blockers: 0.
