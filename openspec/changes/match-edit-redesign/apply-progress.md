# Apply Progress: match-edit-redesign (RAU-122)

## Slice S1 — Server contract + route

- **Branch**: `feat/match-edit-redesign-pr1`
- **Mode**: Strict TDD (RED → GREEN → TRIANGULATE)
- **Chain strategy**: `stacked-to-main` (PR 1 of 6)
- **Boundary**: starts from `feat/match-edit-redesign` (planning artifacts commit); ends with the
  additive server contract + POST route behavior. S2–S6 untouched.
- **Rollback boundary**: revert `features/leagues/api.ts`, `lib/result.ts`,
  `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` and their tests. The legacy
  payload shape (6-nomination MVP + server dice) remains accepted, so nothing else depends on
  the new fields yet.

## Completed Tasks

- [x] 1.1 Additive `TeamResultInput` (`ff`, `neverHeld`, `fanRoll`, `injuryRoll`, `permanentRoll`,
  `mvp.grantee`), `ResultPayload` (`duration`, `inducements`) and `MatchScoreboard` snapshot keys
  in `features/leagues/api.ts`.
- [x] 1.2 `resolveCasualtyOutcomes` extended with optional `permanentRolls` → `outcome.attribute`
  via `permanentAttribute()` for `permanent` victims only (no new helper).
- [x] 1.3 RED → GREEN `lib/result.test.ts` for the permanent attribute + non-permanent/legacy cases.
- [x] 1.4 `parseTeamResult` accepts `ff`, `neverHeld`→`heldBall`, `fanRoll`, `injuryRoll`,
  `permanentRoll`, direct `mvp.grantee`; top-level `duration` + `inducements` parsed.
- [x] 1.5 POST computes winnings from input FF (no 1D3), direct MVP, applies the dedicated-fans
  delta (`tx.team.updateMany`), persists the permanent `attribute`, and stores the extended snapshot.
- [x] 1.6 RED → GREEN `route.test.ts` for direct MVP, input-FF winnings, fan-delta write,
  permanent attribute persist, 400 invalid grantee, and the unchanged legacy path.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `features/leagues/api.ts` | Modified | Additive result-contract + snapshot types |
| `lib/result.ts` | Modified | `resolveCasualtyOutcomes` permanent-attribute support |
| `lib/result.test.ts` | Modified | 3 new unit tests (permanent band, cursor alignment, legacy) |
| `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` | Modified | Parse new fields; input-FF winnings; direct MVP; fan delta; permanent persist; extended snapshot; non-live inducements |
| `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` | Modified | 5 new route tests + `team.updateMany` mock |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.2/1.3 | `lib/result.test.ts` | Unit | ✅ 12/12 | ✅ Written (2 failed: attribute missing) | ✅ 15/15 passed | ✅ 3 cases (permanent, cursor alignment, legacy/no-roll) | ✅ Clean |
| 1.4/1.5/1.6 | `route.test.ts` | Route/Integration | ✅ 45/45 | ✅ Written (6 failed → 400/NaN/no write) | ✅ 50/50 passed | ✅ 5 cases (direct MVP, invalid grantee 400, FF winnings + neverHeld, fan delta, permanent attr) | ✅ Clean |

- **Total tests written**: 8 (3 unit + 5 route); **passing**: 8/8 in the two focused files.
- **Layers used**: Unit (3), Route/Integration (5), E2E (0 — out of S1 scope).
- **Pure functions created**: 0 (extended existing `resolveCasualtyOutcomes`; no new helper).
- **Approval tests (refactoring)**: the existing 45 legacy route tests + 12 result tests served as
  the safety net and remain green (legacy payload accepted unchanged).

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run lib/result.test.ts "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → **2 files, 65 tests passed** |
| Runtime harness command/scenario and exact result | `AUTH_MODE=local pnpm exec playwright test e2e/match-report.spec.ts` → **N/A (ports busy, as forecast in tasks.md)**. Route behavior is proven at the route-test layer with a mocked Prisma `$transaction`. |
| Rollback boundary | Revert `api.ts` + `lib/result.ts` + `route.ts` and their tests; legacy payload path unchanged so no downstream consumer breaks. |

## Verification (exact commands / observed results)

- `pnpm exec vitest run lib/result.test.ts` → **15 passed (1 file)**
- `pnpm exec vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → **50 passed (1 file)**
- `pnpm test` → **180 files, 2667 tests passed**
- `pnpm lint` → **clean (no output)**
- `npx tsc --noEmit` → **clean (no output)**

## Changed Lines

- `added=348 removed=51 total=399` (< 400 budget).

## Deviations from Design

- None material. `resolveCasualtyOutcomes` indexes `permanentRolls` by a permanent-victim cursor
  (one 1D6 per permanent-band victim), matching the design's "1D6 per permanent victim" comment;
  the route builds that cursor array (client roll, server `rollD6` fallback) in
  `resolveReportedCasualties`.
- The route also applies the shared resolver on PUT (direct grantee + client/permanent rolls) for
  contract consistency; PUT winnings/treasury recompute stays in S5.
- Non-live POST persists the payload's per-side `inducements` (live fixtures keep the cart snapshot
  for parity). Correction inducement precedence remains S5 (F1).

## Issues Found

- None. All new fields are additive and the legacy 6-nomination + server-dice path is unchanged.
