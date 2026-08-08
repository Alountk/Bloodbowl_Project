```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:3baa61d0b8a4f1b0e5d6f7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8
verdict: fail
blockers: 1
critical_findings: 1
requirements: 5/5
scenarios: 20/20
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:e48f63947b7909a2362368bd10d8bf9a723c2b573123d4dc459b08d7653d3039
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: leagues — PR2 (Core UI, Pattern 2) on branch feat/leagues-pr2 (stacked on PR1)
**Version**: delta spec v1 (leagues + app-shell + team-detail-view)
**Mode**: Strict TDD (runner: `pnpm test`, vitest; Playwright e2e local + auth)

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
pnpm lint → clean (0 errors/warnings)
```

**Tests (unit)**: ✅ 564 passed (45 files), 0 failed, 0 skipped
```text
pnpm test → Test Files 45 passed (45), Tests 564 passed (564)
```

**Tests (e2e, AUTH_MODE=local)**: ✅ 21 passed (chromium create-team 14 + delete-team 2 + mobile 5)
```text
AUTH_MODE=local pnpm exec playwright test → 21 passed; leagues.spec.ts excluded from local config (testIgnore)
```

**Tests (e2e, auth suite real Postgres)**: ❌ 3 passed, 1 FAILED (leagues flow)
```text
pnpm exec playwright test --config playwright.config.auth.ts → 1 failed, 3 passed
    1) e2e/leagues.spec.ts:50 › create league → card shows → assign team → member listed → expel
       Error: expect(locator).toBeVisible() failed — getByText('Costa Norte') not found
       Cause: modal shows `alert: Ya existe una liga con ese nombre.` (409) — a fixed-name
       league persisted from a prior run collides on re-run. Test is non-idempotent.
```

**DB/schema (runtime)**: League table (name unique, ownerId FK CASCADE, createdAt), Team.leagueId FK ON DELETE SET NULL, no Team.leagueType — verified via psql. Postgres healthy.

**Coverage**: ➖ Not available — no coverage tool configured. Not a failure.

### Spec Compliance Matrix

**app-shell delta — Requirement: Sidebar Structure**
| Scenario | Test | Result |
|----------|------|--------|
| Sidebar landmark and wordmark | `app/AppShell.test.tsx` (getByLabelText Sidebar exactly 1, wordmark) | ✅ COMPLIANT |
| Teams and Ligas navigation (exactly 2, shared desk+drawer) | `AppShell.test.tsx > renders shared nav with exactly Teams and Ligas links in both desktop and drawer` | ✅ COMPLIANT |
| Active and hover states | `components/Sidebar.tsx` shared partial (active `bg-[#12225a] text-white`, hover `bg-slate-100`) + existing shell nav tests | ✅ COMPLIANT |
| Ligas link routes to leagues | `Sidebar.tsx` NAV_ITEMS `{href:"/leagues",label:"Ligas"}` + auth leagues e2e navigates `/leagues` | ⚠️ PARTIAL (unit-sourced href; e2e navigation covered but e2e run fails for unrelated fixed-name collision) |

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
| Assign own unassigned team | `teams/route.test.ts` + `LeagueDetail.test.tsx > assigning a team POSTs … and refreshes`; **e2e journey step fails on re-run (fixed-name collision)** | ⚠️ PARTIAL |
| Assign already-member rejected (409) | `teams/route.test.ts > returns 409` | ✅ COMPLIANT |
| Assign foreign or archived denied (404/409) | `teams/route.test.ts` foreign-404 + archived-409 | ✅ COMPLIANT |
| Expel member clears membership | `members/[teamId]/route.test.ts` + `LeagueDetail.test.tsx > expelling a team DELETEs`; **e2e journey step fails on re-run** | ⚠️ PARTIAL |
| Expel non-member denied (404) | `members/[teamId]/route.test.ts > returns 404` | ✅ COMPLIANT |

**Compliance summary**: 18/20 scenarios fully COMPLIANT via passing unit/component/route tests; 2 scenarios (`Assign own unassigned team`, `Expel member clears membership`) ⚠️ PARTIAL because the end-to-end auth E2E journey that proves them is not reproducibly green; plus `Ligas link routes to leagues` ⚠️ PARTIAL (unit-sourced). Canonical verdict `fail` (1 blocker).

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
| leagueType/LEAGUE_LABELS removal | ✅ Implemented | `rg leagueType|LEAGUE_LABELS|LEAGUE_TYPES|TeamLeagueType|DEFAULT_LEAGUE_TYPE` over source → zero matches |

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
| GREEN confirmed (tests pass) | ✅ | `pnpm test` → 564; focused PR2 sweep → 26; local e2e → 21 |
| Triangulation adequate | ✅ | LeagueList 4, CreateLeagueModal 4 (incl dup-409), LeagueDetail 5, AppShell exact-2, team page 5 |
| Safety Net for modified files | ✅ | 548/548 baseline reported; full suite green at 564 |

**TDD Compliance**: 6/6 checks passed

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (component) | 26 (PR2 scope) | 7 | vitest + @testing-library/react |
| Integration (pages) | app-shell, team-detail, leagues pages | 4 | vitest + RTL |
| E2E local | 21 | 3 specs | Playwright (AUTH_MODE=local) |
| E2E auth | 4 (1 FAILED) | auth + isolation + migration + leagues | Playwright AUTH_MODE=auth, real Postgres |

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected (`pnpm test` runs `vitest run` with no `--coverage`). Informational, not blocking.

### Assertion Quality
Scan of new PR2 test files (LeagueList, CreateLeagueModal, LeagueDetail, AppShell, teams page, leagues pages) found no tautologies, no ghost loops, no orphan empty checks, no smoke-only renders, no implementation-detail coupling. Component/page tests assert real rendered content, fetch shapes, and 4xx behaviors. `CreateLeagueModal.test` asserts the 409 duplicate-name inline error (the required PR2 behavior). `LeagueDetail.test` asserts unassigned-only filter via null `queryByRole`. AppShell asserts exactly 2 nav links in both desktop and drawer.
**Assertion quality**: ✅ All assertions verify real behavior

### Quality Metrics
**Linter**: ✅ No errors/warnings (`pnpm lint` exit 0)
**Type Checker**: ✅ No errors (`npx tsc --noEmit` exit 0)

### Issues Found
**CRITICAL (blocker = 1)**:
- The auth E2E leagues flow (`e2e/leagues.spec.ts`) is NOT reproducibly green. It creates a league with a **fixed name** "Costa Norte" and never deletes the created league. Any run after the first collides with the persisted DB row → the app correct returns 409 "Ya existe una liga con ese nombre." → the modal stays open and the "Costa Norte" card never appears → `expect(getByText('Costa Norte')).toBeVisible()` fails. My independent run of `pnpm exec playwright test --config playwright.config.auth.ts` → 3 passed, 1 failed (leagues). The apply-progress "4 passed" claim was only true on the first run against a clean DB. Fix: unique league name (like the spec's unique email) or `afterEach` DB cleanup. This is NOT a product bug — the 409 surfacing is the required behavior and works.

**WARNING**:
- E2E leagues card-count step (`N equipos`) is not asserted in the e2e journey (unit-only).
- The N+1 league-detail fetch for card member counts is a deliberate, documented deviation; acceptable at this scale, flagged for growth.

**SUGGESTION**:
- Add `afterEach` DB cleanup (or unique names) to the auth E2E specs so the suite is idempotent — root cause of the CRITICAL.
- `useLeagueDetail` duplicates load logic between the initial `useEffect` and `refresh` callback (lines 25-69); a single shared loader would remove the duplication (set-state-in-effect lint forced the split).

### Verdict
**FAIL** — 5/5 requirements and 18/20 scenarios have passing unit/component/route evidence; the auth E2E leagues journey (a headline PR2 deliverable) fails independently because the spec is non-idempotent (fixed league name collides with a persisted row on re-run), so the full create → card → detail → assign → expel journey is not reproducibly proven green. Test-harness defect, not a product regression: all 564 unit + 21 local e2e green, lint clean, tsc clean, DB schema correct, 409 duplicate surfacing (a required behavior) works as specified. Blockers: 1 (fix leagues E2E idempotency before archive).
