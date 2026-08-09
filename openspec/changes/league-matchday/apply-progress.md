# Apply Progress: Matchday — PR1 (DB + API)

**Change**: `league-matchday`
**PR**: PR1 (DB + API) — slice 1 of the stacked-to-main chain
**Branch**: `feat/league-matchday-pr1` (based on `main`)
**Mode**: Strict TDD (runner `pnpm test`)
**Status**: All PR1 tasks (1.1–1.14) complete. Ready for `sdd-verify`.

## Work Units Delivered

| # | Unit | Commit | Scope | Focused test | Runtime harness | Rollback |
|---|------|--------|-------|--------------|-----------------|----------|
| 1 | Schema + migration + client API | `f31f9c0` | Fixture `scheduledAt`/`winnerId`, `ScheduleProposal`, `add_matchday` migration; `features/leagues/api.ts` types + helpers | `pnpm vitest run features/leagues/api.test.ts` → **12 pass** | `AUTH_MODE=local pnpm exec playwright test` rerun green (21); league-season auth e2e green (9) | `git revert f31f9c0` + `prisma migrate down` (additive, nullable cols/table) |
| 2 | propose/accept/forfeit/proposals routes | `416561f` | Participant-only negotiation + admin forfeit + history | `pnpm vitest run "app/api/leagues/[id]/fixtures"` → **23 pass** | Direct route tests (mocked prisma/auth); e2e league-season green (9) | `git revert 416561f` — reverts only negotiation/forfeit routes |
| 3 | Scouting GET `/api/teams/[id]` | `a8a1705` | Read-only visibility-gated scouting | `pnpm vitest run "app/api/teams/[id]"` → **19 pass** | Direct route tests; DELETE archive guard untouched | `git revert a8a1705` — reverts only scouting GET |
| 4 | League detail enrichment | `d987322` | Per-fixture status/owners/proposals + per-round completion | `pnpm vitest run "app/api/leagues/[id]/route.test.ts"` → **15 pass** | league-season auth e2e green (detail shape unchanged for existing UI) | `git revert d987322` — reverts only detail enrichment |

Runtime-harness note: fixture propose → accept → scheduledAt and admin forfeit are covered at the route layer with mocked prisma/$transaction (deterministic); the real-DB path is exercised end-to-end by the auth-config `league-season.spec.ts` (9 tests) which boots the app in AUTH_MODE=auth against Postgres 5433 and starts a season.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 schema+migration | `features/leagues/api.test.ts` | Unit/type | ✅ 612 (baseline) | ✅ Written (FixtureDraft shape) | ✅ Passed (12) | ✅ 3 cases (pending/scheduled/played + proposals) | ✅ Clean (typed FixtureWithMatchday) |
| 1.2–1.3 propose route | `app/api/leagues/[id]/fixtures/[fixtureId]/propose/route.test.ts` | Integration (mocked prisma) | N/A (new) | ✅ Written first (participant/404/401/400/409) | ✅ Passed (7) | ✅ 7 cases incl. closes-prior-in-tx | ✅ Clean |
| 1.4–1.5 accept route | `.../accept/route.test.ts` | Integration | N/A (new) | ✅ Written first (other-ok/self-409/closed-409/scheduled-409) | ✅ Passed (6) | ✅ 6 cases | ✅ Clean |
| 1.6–1.7 forfeit route | `.../forfeit/route.test.ts` | Integration | N/A (new) | ✅ Written first (admin-ok/403/400/409/closes) | ✅ Passed (6) | ✅ 6 cases | ✅ Clean |
| 1.8–1.9 proposals route | `.../proposals/route.test.ts` | Integration | N/A (new) | ✅ Written first (part/owner-200, outsider-404, unauth-401) | ✅ Passed (4) | ✅ 4 cases | ✅ Clean |
| 1.10–1.11 scouting GET | `app/api/teams/[id]/route.test.ts` | Unit + Integration | ✅ 7/7 (existing DELETE) | ✅ Written first (gate pure fn + route 401/200/404) | ✅ Passed (19 total incl. 7 legacy) | ✅ 12 cases (owner/owner-league/member/outsider/archived/unassigned) | ✅ Clean (pure `canViewScoutedTeam`) |
| 1.12–1.13 detail enrich | `app/api/leagues/[id]/route.test.ts` | Unit + Integration | ✅ 10/10 (existing GET) | ✅ Written first (status/owners/proposals/complete) | ✅ Passed (15 total) | ✅ 5 cases | ✅ Clean (pure `deriveFixtureStatus`/`enrichFixture`/`buildRoundsWithCompletion`) |
| 1.14 client API helpers | `features/leagues/api.test.ts` | Unit | N/A (new) | ✅ Written first (propose/accept/forfeit/getProposals/getScoutedTeam) | ✅ Passed (5 new) | ✅ 5 cases | ✅ Clean |

### Test Summary
- **Total tests written (new)**: 50 (6 api helpers + 7 propose + 6 accept + 6 forfeit + 4 proposals + 12 scouting + 5 detail enrich + 4 type/derivation)
- **Total tests passing**: 658 (`pnpm test` = 49 files / 658 tests)
- **Layers used**: Unit (pure gates/derivations), Integration (route tests with mocked prisma/$transaction), E2E (local 21 + auth 9)
- **Approval tests** (refactoring): existing league-detail GET (10) and teams/[id] DELETE (7) left green as safety nets
- **Pure functions created**: `canViewScoutedTeam`, `deriveFixtureStatus`, `enrichFixture`, `buildRoundsWithCompletion`

## Verification Results (final)

| Command | Result |
|---------|--------|
| `pnpm test` | **49 files / 658 tests** passed (baseline 612) |
| `AUTH_MODE=local pnpm exec playwright test` | **21 passed** |
| `pnpm exec playwright test --config playwright.config.auth.ts` | **9 passed** (incl. league-season journey) |
| `pnpm lint` | clean (0 errors, 0 warnings) |
| `npx tsc --noEmit` | clean |

## Files Changed (PR1)

| File | Action | What Was Done |
|------|--------|---------------|
| `prisma/schema.prisma` | Modified | Fixture `scheduledAt DateTime?` + `winnerId String?` (FK RESTRICT); new `ScheduleProposal` model (fixtureId cascade, userId, date, acceptedAt?, closedAt?, `@@index([fixtureId,createdAt])`); Team `wonFixtures` relation |
| `prisma/migrations/20260809121445_add_matchday/migration.sql` | Created | Additive migration (nullables + new table) |
| `features/leagues/api.ts` | Modified | `FixtureStatus`, `ScheduleProposal`, enriched `FixtureDraft` (scheduledAt/winnerId/status/homeOwner/awayOwner/proposals), `FixtureRound`; helpers proposeFixtureDate/acceptFixtureProposal/forfeitFixture/getFixtureProposals/getScoutedTeam |
| `app/api/leagues/[id]/fixtures/[fixtureId]/propose/route.ts` + `.test.ts` | Created | Participant-only propose, one-active-proposal `$transaction` |
| `app/api/leagues/[id]/fixtures/[fixtureId]/accept/route.ts` + `.test.ts` | Created | Other-participant accept; acceptedAt + scheduledAt tx |
| `app/api/leagues/[id]/fixtures/[fixtureId]/forfeit/route.ts` + `.test.ts` | Created | Admin-only forfeit; winnerId + close proposals tx |
| `app/api/leagues/[id]/fixtures/[fixtureId]/proposals/route.ts` + `.test.ts` | Created | History GET (participants/admin) |
| `app/api/teams/[id]/route.ts` + `.test.ts` | Modified | Added scouting GET with pure visibility gate; DELETE unchanged |
| `app/api/leagues/[id]/route.ts` + `.test.ts` | Modified | Enriched detail (status/owners/proposals) + per-round `complete` |
| `openspec/changes/league-matchday/tasks.md` | Modified | PR1 tasks 1.1–1.14 marked `[x]` |

## Deviations from Design

1. **Detail response keeps flat enriched `fixtures` + adds `rounds`** (rather than replacing `fixtures` with grouped rounds as the design's data-flow sketch implies). Reason: PR1 must not break the existing `Jornadas` UI/its tests (UI work is deferred to PR2), so the enriched flat `fixtures` array is preserved for backward compatibility and the new `rounds: FixtureRound[]` field carries per-round `complete`. The richer shape and `rounds` are ready for PR2's tabbed UI.
2. Winner FK uses `onDelete: Restrict` (design allowed SetNull or Restrict) — consistent with the existing `Fixture.homeTeam`/`awayTeam` FK style.
3. Accept/closed-proposal guards map to 409 (not 404) to satisfy the spec's "closed/accepted proposal → 409" scenario while a genuinely foreign proposal id still returns 404 (no leak).

## Issues Found

- A pre-existing stale `next-server` on port 3000 caused 20 spurious local e2e failures (they ran against a server in the wrong env state). Restarting the dev server resolved it; the final `AUTH_MODE=local` run is 21/21. No code defect.
- None in the delivered code.

## Workload / PR Boundary

- Mode: **chained stacked-to-main slice** (PR1 of 3)
- Current work unit: PR1 — DB schema/migration + negotiation/forfeit API + scouting + detail enrichment
- Boundary: starts from `main`, ends at the API/enrichment layer; UI (PR2) and e2e polish (PR3) explicitly NOT included
- Review budget impact: ~1500 authored +/− lines across 4 work-unit commits, each independently revertable and verified
- PR creation: deferred to the orchestrator after `sdd-verify` (per instructions, do NOT create the PR)
