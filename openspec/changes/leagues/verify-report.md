```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:cd21cbfc2bc69b5a9b8c69f29d5f58ff56e3c96e0a34c1d8a6d3c6d9f0f62b5a
verdict: fail
blockers: 0
critical_findings: 0
requirements: 5/5
scenarios: 21/22
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:79c6f2de0fe66075a3dd7263fcca404db04f75462a3eb1a697f023696adaf2f1
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b
```

## Verification Report

**Change**: leagues — PR1 (DB + API)
**Version**: delta spec v1 (leagues + team-persistence)
**Mode**: Strict TDD (runner: `pnpm test`, vitest; Playwright e2e)

### Completeness
| Metric | Value |
|--------|-------|
| PR1 tasks total | 10 |
| PR1 tasks complete | 10 |
| PR1 tasks incomplete | 0 |
| PR2/PR3 tasks (deferred) | 12 (structural — out of PR1 slice) |

### Build & Tests Execution
**Build/type-check**: ✅ Passed
```text
npx tsc --noEmit → exit 0, no diagnostics
pnpm lint → clean (0 errors/warnings)
```

**Tests (unit)**: ✅ 545 passed (40 files), 0 failed, 0 skipped
```text
pnpm test → Test Files 40 passed (40), Tests 545 passed (545)
```

**Tests (e2e, AUTH_MODE=local)**: ✅ 21 passed (chromium create-team 14 + delete-team 2 + mobile 5)
```text
AUTH_MODE=local pnpm exec playwright test → 21 passed (11.0s)
```

**Schema/migration (runtime)**: `prisma migrate status` → "Database schema is up to date!". DB inspection confirms `League` table (id/name/description/ownerId/createdAt), `Team.leagueId` present, `Team.leagueType` absent, `Team_leagueId_fkey` delete rule SET NULL, `League.name` unique index present. Regenerated Prisma client has `leagueId` (no `leagueType`) and the `League` model.

**Coverage**: ➖ Not available — no coverage tool configured in `package.json` scripts (`test` runs `vitest run` without `--coverage`). Not a failure.

### Spec Compliance Matrix

**leagues delta — Requirement: League Model**
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| League Model | League persisted | `app/api/leagues/route.test.ts > creates a league owned by the session user and returns 201` (ownerId injected, name+description stored) + DB runtime: `League` row schema | ✅ COMPLIANT |
| League Model | Duplicate league name rejected | `app/api/leagues/route.test.ts > returns 409 when the league name already exists globally` (P2002 → 409, no row) | ✅ COMPLIANT |
| League Model | League delete clears members | `app/api/leagues/[id]/route.test.ts > clears member leagueIds (SetNull) and deletes the league` (updateMany leagueId:null before league.delete) + DB FK SET NULL | ✅ COMPLIANT |

**leagues delta — Requirement: League User-Scoped API**
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| League User-Scoped API | Unauthenticated API call | `route.test.ts`/`[id]/route.test.ts` all return 401 and assert zero DB mutation | ✅ COMPLIANT |
| League User-Scoped API | List only own leagues | `route.test.ts > lists only the session user's leagues` (findMany ownerId) | ✅ COMPLIANT |
| League User-Scoped API | Foreign league denied | `[id]/route.test.ts` GET 404 + DELETE 404 (findFirst by owner, no mutation) | ✅ COMPLIANT |
| League User-Scoped API | League detail with members | `[id]/route.test.ts > returns the league detail with its non-archived member teams` (include teams, archivedAt:null) | ✅ COMPLIANT |

**leagues delta — Requirement: Team Membership Assignment**
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Team Membership | Assign own unassigned team | `app/api/leagues/[id]/teams/route.test.ts > assigns an owned, unassigned, non-archived team` (leagueId set) | ✅ COMPLIANT |
| Team Membership | Assign already-member rejected | `teams/route.test.ts > returns 409 when the team is already in a league` (leagueId set → 409, no mutation) | ✅ COMPLIANT |
| Team Membership | Assign foreign or archived denied | `teams/route.test.ts` foreign-team 404 + archived-team 409, no mutation | ✅ COMPLIANT |
| Team Membership | Expel member clears membership | `members/[teamId]/route.test.ts > clears the leagueId of a member team` (leagueId:null) | ✅ COMPLIANT |
| Team Membership | Expel non-member denied | `members/[teamId]/route.test.ts > returns 404 when the team is not a member` (no mutation) | ✅ COMPLIANT |

**team-persistence delta — Requirement: Persistent Schema**
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| Persistent Schema | Team persisted to DB | `app/api/teams/route.test.ts > creates a team … returns 201` (leagueId:null, no leagueType prop) + DB runtime: `leagueId` present, `leagueType` absent | ✅ COMPLIANT |
| Persistent Schema | Archived team still persisted | `app/api/teams/[id]/route.test.ts > does not hard-delete the row when archiving` (only update issued, row retained) | ✅ COMPLIANT |
| Persistent Schema | Existing team starts unassigned | migration `20260808230000_add_leagues_drop_league_type/migration.sql` (DROP leagueType, ADD leagueId null) + DB runtime: `leagueId` present / `leagueType` absent | ✅ COMPLIANT |
| Persistent Schema | League delete nulls membership | `[id]/route.test.ts` SetNull updateMany + DB runtime FK SET NULL | ✅ COMPLIANT |

**team-persistence delta — Requirement: User-Scoped Team API**
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| User-Scoped Team API | Unauthenticated API call | `app/api/teams/route.test.ts` + `[id]/route.test.ts` 401 with zero mutation | ✅ COMPLIANT |
| User-Scoped Team API | List only own non-archived teams | `route.test.ts > excludes archived teams` (findMany userId + archivedAt:null) | ✅ COMPLIANT |
| User-Scoped Team API | Foreign team denied | `[id]/route.test.ts` 404, no mutation | ✅ COMPLIANT |
| User-Scoped Team API | Archive is a soft delete | `[id]/route.test.ts > archives (soft-deletes) … returns 204` (update archivedAt) | ✅ COMPLIANT |
| User-Scoped Team API | Deletion blocked for league member | `[id]/route.test.ts > returns 409 and does not archive a team that still belongs to a league` + `features/teams/store/ApiTeamStore.test.ts > remove surfaces an ArchiveGuardError when the API blocks a league member (409)` | ✅ COMPLIANT |
| User-Scoped Team API | Archived detail is not found | List portion: `route.test.ts > excludes archived teams` (archivedAt:null filter) — PASSES. "Reference by id / detail resolution not-found" portion: NO passing covering test and the only id-based API (`DELETE /api/teams/[id]`) uses `findFirst({ where: { id, userId } })` WITHOUT an `archivedAt: null` filter, so re-deleting an already-archived team returns 204 (idempotent re-archive) rather than 404. No GET `[id]` detail route exists, so archived teams never leak via a read. | ⚠️ PARTIAL |

**Compliance summary**: 21/22 scenarios compliant; 1 PARTIAL (see WARNING). Canonical verdict is `fail` because incomplete scenario evidence admits only a `fail` envelope.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| Schema/migration (one migration) | ✅ Implemented | `20260808230000` creates League, adds `Team.leagueId` FK SET NULL, drops `leagueType`; single migration; applied to postgres; client regenerated (leagueId true, leagueType absent) |
| leagueType sweep | ✅ Implemented | `rg` over `features/ app/ e2e/` shows zero source refs; remaining refs are historical migration SQL + the two intentional absence-assertions in `app/api/teams/route.test.ts` (lines 114/121) |
| Teams DELETE 409 guard | ✅ Implemented | `/api/teams/[id]` returns 409 before archiving when `leagueId != null`; `ApiTeamStore.remove` throws typed `ArchiveGuardError` on 409 |
| Leagues API user-scoped | ✅ Implemented | All routes `auth()` → 401; `findFirst`/`findMany` by `ownerId`; foreign → 404 with no mutation |
| Team Membership Assignment | ✅ Implemented | assign guards (owned/unarchived/leagueId null/foreign 404); expel member-only; 404/409 no-mutation |
| Types + stores | ✅ Implemented | `Team.leagueId: string \| null`, `League` interface, no `leagueType`; ApiTeamStore maps `leagueId`, drops leagueType |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| League global name `@unique` | ✅ Yes | `League.name @unique`; P2002 → 409 |
| Team membership one-to-many `leagueId` FK SetNull | ✅ Yes | `Team.leagueId String?`, `onDelete: SetNull`, named `LeagueMembers` relation |
| `leagueType` drop in one migration, no value mapping | ✅ Yes | Single migration drop; existing teams start `leagueId: null` |
| Team delete guard → 409 "expel from league first" | ✅ Yes | Route 409 + typed `ArchiveGuardError` in `ApiTeamStore` |
| Route pattern mirrors `/api/teams` (session-scoped findFirst-by-owner, foreign→404) | ✅ Yes | All `/api/leagues/**` routes follow this |
| Migration authored as one deployable SQL | ✅ Yes | `migrate diff --script` → single migration; SQL byte-identical to Prisma diff |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Table present in apply-progress (all 10 PR1 tasks) |
| All tasks have tests | ✅ | 10/10: route/store test files exist for 1.3–1.9; structural gates for 1.1/1.2/1.10 (migration, `tsc`) |
| RED confirmed (tests exist) | ✅ | All referenced test files exist on disk and are imported by the runner |
| GREEN confirmed (tests pass) | ✅ | `pnpm test` → 545 passed; e2e → 21 passed |
| Triangulation adequate | ✅ | leagues routes: 22 tests across guards (401/create/dup-409/detail/foreign-404/delete-SetNull/assign guards/expel); teams routes: 12 tests (401/204/404/409/null/soft-delete); stores: 28 tests incl. 409 ArchiveGuardError |
| Safety Net for modified files | ⚠️ | apply-progress claims 522/522 baseline on modified files; independently the full suite is green at 545 (baseline not re-run pre-change — reported, not reconstructed) |

**TDD Compliance**: 5/6 checks fully confirmed (safety-net baseline reported, not independently re-derived)

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 545 | 40 | vitest (mocked auth/prisma) |
| E2E | 21 | 3 specs | Playwright (AUTH_MODE=local) |
| Structural | migration + client regen + DB inspection | — | prisma migrate / generate, psql inspection |

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected (`pnpm test` runs `vitest run` with no `--coverage`). Informational, not blocking.

### Assertion Quality
Scan of all new route + store test files found no tautologies, no ghost loops, no orphan empty checks, no smoke-only renders, no implementation-detail assertions. All unit tests assert real HTTP status codes, mutation call/absence, and payload shapes.
**Assertion quality**: ✅ All assertions verify real behavior

### Quality Metrics
**Linter**: ✅ No errors/warnings (`pnpm lint` clean)
**Type Checker**: ✅ No errors (`npx tsc --noEmit` exit 0)

### Issues Found
**CRITICAL**: None
**WARNING**:
- `Archived detail is not found` (team-persistence, User-Scoped Team API) is `PARTIAL`: the archived-not-in-list portion is covered (GET `/api/teams` filters `archivedAt: null`, tested), but the "reference by id / detail resolution not-found" clause has no passing test and is not enforced by `DELETE /api/teams/[id]` — its `findFirst({ where: { id, userId } })` has no `archivedAt: null` filter, so re-deleting an already-archived team returns 204 (idempotent re-archive), not 404. Benign (no data loss, no leak; no GET `[id]` detail route exists). Recommended fix: add `archivedAt: null` to the DELETE lookup predicate + a regression test, or re-scope the clause in PR3 spec-sync.
**SUGGESTION**:
- No coverage tool is configured; adding `vitest run --coverage` (e.g. `@vitest/coverage-v8`) would let future PRs report changed-file coverage for the roadmap/task coverage tables.

### Verdict
**FAIL** (canonical envelope) — 21/22 scenarios fully compliant; one scenario `PARTIAL` because incomplete evidence is only admissible as `fail`. Not a runtime/regression failure: all 545 unit + 21 e2e green, lint clean, tsc clean, migration applied, DB schema verified. The `PARTIAL` is a benign idempotent DELETE nuance, not a blocker (blockers: 0, critical_findings: 0). Resolution recommended before archive: add `archivedAt: null` to the DELETE `findFirst` predicate + a re-delete-archived → 404 test, or re-scope the clause in PR3.
