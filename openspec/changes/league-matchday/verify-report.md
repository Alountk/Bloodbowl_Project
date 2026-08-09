```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:5552a613ccf320c720119bb4b8c90ce5b81c69616618f82dcf693849064010bf
verdict: pass
blockers: 0
critical_findings: 0
requirements: 18/18
scenarios: 43/43
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:5552a613ccf320c720119bb4b8c90ce5b81c69616618f82dcf693849064010bf
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: league-matchday
**Version**: complete change (PR1 DB+API + PR2 UI Pattern B + PR3 e2e + polish) — final slice of the 3-PR stacked-to-main chain
**Mode**: Strict TDD (runner `pnpm test`)
**Branch**: feat/league-matchday-pr3 (stacked on feat/league-matchday-pr2, on feat/league-matchday-pr1, on main)

This is the INDEPENDENT final verification of the complete `league-matchday` change across all three chained PRs. All five spec artifacts, the design, and all tasks were retrieved and read before judging. Source inspection was executed (routes, components, migration, schema, e2e spec), then every declared command was run.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 27 (PR1 1.1–1.14 + PR2 2.1–2.12 + PR3 3.1–3.4) |
| Tasks complete | 27 |
| Tasks incomplete | 0 |

All PR1, PR2, PR3 tasks are `[x]` in `tasks.md` and cross-referenced in `apply-progress.md` (TDD evidence tables for each PR). The only unchecked task is 4.1 (chain strategy ask), which is an orchestrator-level pre-apply decision, not an implementation task, and legitimately outside the verify scope. Full-suite verification permitted (no pending implementation task).

### Build & Tests Execution
**Build**: ✅ Passed
```text
npx tsc --noEmit  → exit 0 (clean, empty output, sha256 e3b0c442…)
pnpm lint         → exit 0 (0 errors, 0 warnings)
```

**Tests**: ✅ 725 passed / 0 failed / 0 skipped
```text
pnpm test                                          → 692 passed (56 files), exit 0
AUTH_MODE=local pnpm exec playwright test          → 21 passed, exit 0
pnpm exec playwright test --config playwright.config.auth.ts → 12 passed, exit 0 (9 legacy + 3 new matchday journeys, real Postgres)
```

**Coverage**: ➖ Not available — no coverage tooling detected in this Next/Prisma vitest setup (`@vitest/coverage-*` not installed); static-instruction coverage is not blocking.

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | `apply-progress.md` contains TDD Cycle Evidence tables for PR1 (1.1–1.14), PR2 (2.1–2.12), PR3 (3.1–3.4) |
| All tasks have tests | ✅ | 27/27 task groups map to on-disk test files (route tests, component tests, page tests, e2e spec) |
| RED confirmed (tests exist) | ✅ | All claimed test files verified on disk: propose/accept/forfeit/proposals route tests, scouting route test, detail route test, api.test, MatchCard/NegotiationPanel/ForfeitModal/LeagueDetail, team-page, PR3 e2e + MatchCard polish |
| GREEN confirmed (tests pass) | ✅ | 692/692 vitest pass on actual execution; 21 local + 12 auth e2e green; every reported test file passed |
| Triangulation adequate | ✅ | Status derivation covers pending/scheduled/played + played-overrides; propose/accept/forfeit guards cover 401/404/409/400/403; scouting gate covers owner/league-owner/member/outsider/archived/unassigned; completion covers complete vs pending; distinct expected values across cases |
| Safety Net for modified files | ✅ | PR2/PR3 claim pre-existing baseline guards (658/689 baseline); league-season auth e2e preserved with no selector regressions |
| Assertion quality | ✅ | Manual audit of the PR3 e2e spec and all changed component/route/page test files — see "Assertion Quality" below |

**TDD Compliance**: 6/6 checks passed

---

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (pure helpers + route) | matchStatusLabel×3, formatMatchDate, deriveFixtureStatus×4, buildRoundsWithCompletion, enrichFixture, buildProposalDateTime, canViewScoutedTeam | 8 route/helper files | vitest |
| Integration (RTL component + client API) | MatchCard, NegotiationPanel, ForfeitModal, LeagueDetail, team-page, api.ts | 7 files | vitest + testing-library |
| E2E (local in-memory) | 21 | 5 spec files | Playwright |
| E2E (auth/real Postgres) | 12 (incl. 3 new matchday journeys) | 6 spec files | Playwright |
| **Total** | **725** | **~74 files** | vitest + Playwright |

---

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected (vitest configured without `--coverage`; no `@vitest/coverage-*` installed). Informational only, not blocking.

---

### Assertion Quality
Manual audit of all changed test artifacts for this complete change (route tests, scouting/detail page tests, MatchCard/NegotiationPanel/ForfeitModal/LeagueDetail, team-detail page, PR3 e2e spec):
- **No tautologies** (`expect(true).toBe(true)` style): none found.
- **No ghost loops**: the PR3 e2e loops over team-name links in `fixturesTeamNames` assert `count >= 2` before iterating (guaranteed non-empty); no assertions hide inside possibly-empty loops.
- **Every test exercises production code**: route tests call the route handlers, component tests render and assert rendered output/navigation, e2e exercises real browser + Postgres journeys.
- **Behavioral, not implementation-detail**: asserts exact status codes (401/403/404/400/409/200), rendered Spanish labels (Pendiente/Programado/Jugado/Jornada completa/✓ Acordado), exact `href` (`/teams/t1`), exact `fetch` POST bodies (`{winnerTeamId:"t1"}`, `{date:...}`), and exact Prisma `update` payloads (`data: { scheduledAt }`, `data: { winnerId, scheduledAt: null }`). No CSS-class or mock-call-count assertions (the one `toHaveBeenCalledTimes(1)` on onNegotiate asserts a user-facing navigation, not an internal call).
- **Pure helpers triangulated with concrete values**: `deriveFixtureStatus` (4 combinations incl. played-overrides), `buildRoundsWithCompletion` (complete vs incomplete), `buildProposalDateTime("2026-03-01","18:30")` vs `new Date(2026,2,1,18,30).toISOString()`, `canViewScoutedTeam` (owner/league-owner/member/outsider/unassigned), `formatMatchDate` (two distinct slots + null/invalid), `matchStatusLabel` (all three statuses).

**Assertion quality**: ✅ All assertions verify real behavior

---

### Quality Metrics
**Linter**: ✅ No errors (0 warnings)
**Type Checker**: ✅ No errors

---

### Spec Compliance Matrix (complete change)
Every requirement/scenario across the 5 spec artifacts is mapped to a covering test that PASSED at runtime. Counts: **18 requirements / 43 scenarios** (negotiation 6/13, forfeit 3/9, scouting 3/8, league-season 3/7, team-detail-view 3/6).

#### matchday-negotiation
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Participant-Only Negotiation | Participant proposes | `propose/route.test.ts` (participant → 200, proposal stored) + `e2e/league-matchday.spec.ts` negotiations journey (proposer proposes 18:00, `waitForActive=1`) | ✅ COMPLIANT |
| Participant-Only Negotiation | Non-participant forbidden | `propose/route.test.ts` (non-participant/league-admin → 404) + `LeagueDetail.test.tsx` (member sees no negotiate controls) + `NegotiationPanel.test.tsx` (non-participant hides Proponer/Aceptar) | ✅ COMPLIANT |
| Participant-Only Negotiation | Unauthenticated rejected | `propose/route.test.ts` → 401; `accept/route.test.ts` → 401 | ✅ COMPLIANT |
| One Active Proposal Invariant | Counter-propose closes the prior | `propose/route.test.ts` (active closed + new inserted in one `$transaction`) + `e2e` (counter proposes 20:30, `waitForActive` stays exactly 1) | ✅ COMPLIANT |
| One Active Proposal Invariant | Concurrent propose keeps one active | `propose/route.test.ts` (tx re-checks active state inside `$transaction`) | ✅ COMPLIANT |
| One Active Proposal Invariant | Propose on scheduled rejected | `propose/route.test.ts` (scheduled fixture → 409) | ✅ COMPLIANT |
| Propose Date | Missing date rejected | `propose/route.test.ts` (missing/invalid date → 400) | ✅ COMPLIANT |
| Accept Sets scheduledAt | Other participant accepts | `accept/route.test.ts` (OTHER accepts → acceptedAt + scheduledAt set) + `e2e` (proposer accepts counter's slot → fixture `scheduled`, Programado + agreed time) | ✅ COMPLIANT |
| Accept Sets scheduledAt | Creator cannot self-accept | `accept/route.test.ts` (creator self-accept → 409) | ✅ COMPLIANT |
| Accept Sets scheduledAt | Accept on scheduled/closed rejected | `accept/route.test.ts` (scheduled fixture + closed/accepted proposal → 409) | ✅ COMPLIANT |
| Status Transition pending->scheduled | Accept schedules; played overrides | `app/api/leagues/[id]/route.test.ts` `deriveFixtureStatus` (pending/scheduled/played + played-overrides-scheduled) | ✅ COMPLIANT |
| Negotiation History Visible | History shown to participants | `proposals/route.test.ts` (200, ordered history) + `NegotiationPanel.test.tsx` (full history, author, date, ✓ Acordado) + `e2e` (history visible) | ✅ COMPLIANT |
| Negotiation History Visible | Foreign user cannot see history | `proposals/route.test.ts` (non-participant/non-admin → 404) | ✅ COMPLIANT |

#### matchday-forfeit
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Admin-Only Forfeit | Admin awards forfeit | `forfeit/route.test.ts` (owner → winnerId set, played) + `e2e` forfeit journey (modal award → Jugado + winner) + `LeagueDetail.test.tsx` (ForfeitModal POST `{winnerTeamId:"t1"}`) | ✅ COMPLIANT |
| Admin-Only Forfeit | Non-admin forfeit forbidden | `forfeit/route.test.ts` (non-admin → 403) + `e2e` (non-admin member forfeit API → 403) | ✅ COMPLIANT |
| Admin-Only Forfeit | Unauthenticated rejected | `forfeit/route.test.ts` → 401 | ✅ COMPLIANT |
| Forfeit Sets winnerId | Winner must be home or away | `forfeit/route.test.ts` (foreign winnerTeamId → 400) | ✅ COMPLIANT |
| Forfeit Sets winnerId | Forfeit on scheduled allowed | `forfeit/route.test.ts` (scheduled fixture → winnerId set, scheduledAt cleared, played) | ✅ COMPLIANT |
| Forfeit Sets winnerId | Repeat forfeit rejected | `forfeit/route.test.ts` (already played → 409, winnerId unchanged) | ✅ COMPLIANT |
| Forfeit Sets winnerId | Forfeit closes open proposals | `forfeit/route.test.ts` (tx closes open proposals + sets winnerId) | ✅ COMPLIANT |
| Round Completion Rule | Round complete when all played | `route.test.ts` `buildRoundsWithCompletion` (all played → complete:true) + `e2e` (single round → "Jornada completa") | ✅ COMPLIANT |
| Round Completion Rule | Round incomplete with pending | `route.test.ts` (round with pending → complete:false) + `LeagueDetail.test.tsx` (round 1 pending → no badge) | ✅ COMPLIANT |

#### team-scouting
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Get Team Scouting Endpoint | Owner fetches own team | `app/api/teams/[id]/route.test.ts` (owner → 200, read-only fields) + `canViewScoutedTeam` pure (grants owner) | ✅ COMPLIANT |
| Get Team Scouting Endpoint | Unauthenticated rejected | `app/api/teams/[id]/route.test.ts` → 401 | ✅ COMPLIANT |
| Get Team Scouting Endpoint | Archived team hidden | `app/api/teams/[id]/route.test.ts` (archivedAt filter excludes → 404) | ✅ COMPLIANT |
| Scouting Visibility Gate | League owner scouts member team | `app/api/teams/[id]/route.test.ts` (league owner → 200) | ✅ COMPLIANT |
| Scouting Visibility Gate | League member scouts rival | `app/api/teams/[id]/route.test.ts` (current member → 200) + `e2e` (member opens rival roster read-only) | ✅ COMPLIANT |
| Scouting Visibility Gate | Outsider scouting 404 | `app/api/teams/[id]/route.test.ts` (outsider no membership → 404) + `e2e` (outsider → "Team not found") + `page.test.tsx` (scouting 404 → notFound) | ✅ COMPLIANT |
| Scouting Visibility Gate | Unassigned team owner only | `app/api/teams/[id]/route.test.ts` (unassigned non-owner → 404) + `canViewScoutedTeam` (no-league → owner only) | ✅ COMPLIANT |
| Read-Only Scouting Data | Scouting has no side effects | `app/api/teams/[id]/route.ts` GET returns only read-only fields (no mutation), `DELETE` (owner archive) unchanged; `app/api/teams/route.test.ts` + scouting route test cover no-mutation | ✅ COMPLIANT |

#### league-season
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Matchday Fixture Fields | Fixture lifecycle fields persisted | `prisma/schema.prisma` + migration (`scheduledAt`/`winnerId` nullable) + `features/leagues/api.test.ts` (FixtureDraft) + `route.test.ts` (status derivation from persisted fields) | ✅ COMPLIANT |
| Matchday Fixture Fields | Proposal cascade on fixture delete | schema `ScheduleProposal.fixture @relation(... onDelete: Cascade)` + migration `ON DELETE CASCADE` | ✅ COMPLIANT |
| Jornada Round Completion | Round completion exposed | `route.test.ts` `buildRoundsWithCompletion` + detail GET (`rounds[].complete`) | ✅ COMPLIANT |
| Jornada Round Completion | Fixture owners exposed | `route.test.ts` `enrichFixture` (homeOwner/awayOwner) + detail GET | ✅ COMPLIANT |
| Jornadas View (modified) | Started league returns fixtures | `LeagueDetail.test.tsx` (round tabs, round 1 selected, match card) + detail GET + `e2e` (Jornada region / VS) | ✅ COMPLIANT |
| Jornadas View (modified) | Open league has no fixtures | `LeagueDetail.test.tsx` (open-league renders member UI, no Jornadas) + detail GET (open → empty fixtures) | ✅ COMPLIANT |
| Jornadas View (modified) | Fixture with schedule and result | `MatchCard.test.tsx` (Programado badge + date; Jugado badge + winner) + `route.test.ts` derive status | ✅ COMPLIANT |

#### team-detail-view
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Route Resolution | Navigating to detail page | `app/teams/[teamId]/page.test.tsx` (renders TeamDetailView after hydration for known team; resolves `use(params)`) | ✅ COMPLIANT |
| Route Resolution | Foreign team loads via scouting | `page.test.tsx` (rival fetch `/api/teams/rival-1`, renders read-only) + `e2e` scouting journey | ✅ COMPLIANT |
| Route Resolution | Unauthorized rival triggers not-found | `page.test.tsx` (scouting 404 → notFound) + `e2e` (outsider → "Team not found") | ✅ COMPLIANT |
| Team Lookup | Unknown team ID | `page.test.tsx` ("calls notFound after hydration for an unknown teamId") | ✅ COMPLIANT |
| Read-Only Scouting Detail | Rival roster read-only | `page.test.tsx` (renders read-only TeamDetailView/Plantilla) + `e2e` (no eliminate/rename/edit buttons) | ✅ COMPLIANT |
| Read-Only Scouting Detail | Owner path keeps editing | `page.test.tsx` (local store, no scouting fetch) + `e2e` (create-team journey persists owner team) | ✅ COMPLIANT |

**Compliance summary**: 43/43 scenarios compliant (43/43 by covering passing runtime test). 18/18 requirements fully mapped.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Fixture `scheduledAt`/`winnerId` + ScheduleProposal migration | ✅ Implemented | Additive migration; `@@index([fixtureId, createdAt])`; cascade on delete; schema verified |
| Participant-only propose/accept routes (participant check, started gate, 404 no-existence-leak, 401 unauth) | ✅ Implemented | Both routes guard `isParticipant`, started-league, `leagueId===id` |
| One-active-proposal transaction (propose) | ✅ Implemented | `prisma.$transaction` re-checks active state before close+insert — concurrency-safe |
| Accept sets acceptedAt + scheduledAt in tx; creator self-accept 409 | ✅ Implemented | Single `$transaction`; proposal.found + state guards |
| Admin-only forfeit (403), winner home/away (400), repeat (409), clears scheduledAt + closes proposals | ✅ Implemented | `$transaction`; clears scheduledAt so forfeit sets played |
| Proposals history (participants/admin only, 404 otherwise, ordered) | ✅ Implemented | `orderBy createdAt desc`, participant-or-admin gate |
| Scouting GET `/api/teams/[id]` with visibility gate + archived filter | ✅ Implemented | `canViewScoutedTeam` pure; `archivedAt: null`; read-only fields only |
| Derived status + per-round completion | ✅ Implemented | `deriveFixtureStatus` + `buildRoundsWithCompletion` pure; returned in detail GET |
| Pattern B UI: round tabs, MatchCards (VS, owner below, status badge, rival link), completion badge | ✅ Implemented | `LeagueDetail` Jornadas + `MatchCard` |
| NegotiationPanel participant-only (propose/accept, history read-only for others/admin) | ✅ Implemented | `canNegotiate = isParticipant && !isLeagueOwner`; `negotiationOpen` gates controls |
| ForfeitModal admin-only | ✅ Implemented | Opened only when `isLeagueOwner`; picks home/away → forfeit POST |
| Team-detail page `use(params)` + scouting fallback + read-only + notFound on 404 | ✅ Implemented | Verified in page.tsx |
| PR3 e2e journeys (negotiation, forfeit/completion, scouting) real-DB | ✅ Implemented | 3 journeys, idempotent unique data, deterministic pairing, commit polling |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Status DERIVED in route layer (`pending`/`scheduled`/`played`), no denormalized column | ✅ Yes | `deriveFixtureStatus`; winnerId overrides scheduledAt |
| One-active-proposal via `$transaction` with conditional re-check | ✅ Yes | propose route `$transaction` re-check; concurrent-safe |
| Forfeit ADMIN-ONLY (403) | ✅ Yes | league owner guard; participants/members 403 |
| Scouting gate single function, 404 for all denied | ✅ Yes | `canViewScoutedTeam`; owner | league owner | member 200, else 404 |
| Rival page server-fetch fallback, 404 → notFound(); owner store path preserved | ✅ Yes | page.tsx `getScoutedTeam` fallback; `notFound()` on 404 |
| 3 CHAINED PRs (DB+API / UI / e2e+polish) | ✅ Yes | PR1→PR2→PR3 stacked-to-main verified on the final branch |
| PR2 deviation #1: overlay modals vs persistent panel | ✅ Yes (documented deviation) | NegotiationPanel/ForfeitModal as overlays; independently testable/reusable; Pattern B realized |
| PR2 deviation #2: completion badge reads detail GET `rounds[].complete` | ✅ Yes (documented deviation) | Client trusts server-derived `complete`; no duplicated logic; does not break spec |
| PR2 deviation #3: status inline in card header + footer vs separate floating badge | ✅ Yes (documented deviation) | "Partido N · <status>" + footer (Programado date / Ganador name) |
| PR3 polish: scheduled footer shows date AND time | ✅ Yes | `formatMatchDate` es-ES 24h DD/MM/YYYY HH:MM; new RED→GREEN test; e2e asserts Programado + agreed time |

### Issues Found
**CRITICAL**: None
**WARNING**:
- Auth e2e cold-start flakiness (inherited): the first `playwright.config.auth.ts` invocation cold-boots the dev server (`reuseExistingServer:false`); an early `/signup` navigation can time out before the server is warm. A clean re-run is 12/12 green. Harness/timing only (60s nav timeout), not a product defect — for CI stability, raise the webServer readiness timeout or add a readiness probe.
- No per-file coverage reporting (vitest coverage tooling not installed) — informational only, not blocking.

**SUGGESTION**:
- `NegotiationPanel.test.tsx` test "does not offer Aceptar on the viewer's OWN active proposal" (L130–136) has a name/assertion mismatch: the name implies no accept control, but the assertion checks `>= 1` (the rival's active proposal correctly keeps an Aceptar). The behavior asserted is valid and passing; only the test name is misleading. Recommend renaming to "keeps Aceptar for the rival's active proposal while the viewer's own is not accepted" for clarity.
- The "Concurrent propose keeps one active" scenario is proven at the route-test (mocked-prisma) level and by the one-active `waitForActive=1` e2e assertion; a true multi-browser simultaneous SUBMIT race is not exercised end-to-end. Acceptable given the `$transaction` re-check pattern; an optional stress e2e could strengthen it.

### Verdict
PASS
Complete `league-matchday` change verified independently: all 27 tasks from the 3-PR chain complete; 692 unit + 21 local e2e + 12 auth e2e (incl. 3 new real-DB matchday journeys) green; lint + tsc clean; every one of the 18 requirements / 43 scenarios across all 5 spec artifacts has a covering passing runtime test; DB/API negotiation + forfeit + scouting, Pattern B UI, and real-DB e2e journeys all confirmed with no blockers and no critical findings.
