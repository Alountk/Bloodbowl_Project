# Apply Progress: Team Archive (Soft Delete) with Card Delete + Confirmation Modal

**Change**: team-archive
**Branch**: feat/team-archive
**Mode**: Strict TDD (test runner `pnpm test`, RED → GREEN → REFACTOR per strict-tdd.md)
**Delivery**: single PR (`single-pr`) — workload forecast Low, no chained PR decision required (Decision needed before apply: No).
**Skill resolution**: paths-injected — sdd-spec, sdd-design, sdd-tasks, sdd-apply, work-unit-commits read before work.

## Summary

Implemented soft-delete (archive) at the DB/API layer via `archivedAt DateTime?`, added a per-card Delete control and rulebook-styled confirmation modal on the home list, and added a local-mode e2e delete flow. All review guards honored: unit suite 512 → 522, local e2e 19 → 21 (delete-flow additive), real-DB auth/migration/isolation 3/3 green, lint + tsc clean.

## TDD Cycle Evidence (Strict TDD)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | — (schema + migration) | — | ✅ 22/22 (route+TeamList baseline) | N/A (structural) | ✅ migration applied | ➖ Single | ✅ Clean |
| 1.2/1.3 | `app/api/teams/[id]/route.test.ts` | Unit | ✅ 3/3 | ✅ Written | ✅ 4/4 passed | ✅ 2 cases (archive + soft-delete retention) | ➖ None needed |
| 1.4/1.5 | `app/api/teams/route.test.ts` | Unit | ✅ 4/4 | ✅ Written | ✅ 6/6 passed | ✅ 2 cases (scope + archive filter) | ➖ None needed |
| 2.1/2.2 | `features/teams/TeamDeleteModal.test.tsx` | Unit | N/A (new) | ✅ Written | ✅ 4/4 passed | ✅ 4 cases (null, dialog, cancel, confirm) | ➖ None needed |
| 2.3/2.4 | `features/teams/TeamList.test.tsx` | Unit | ✅ 14/14 | ✅ Written | ✅ 18/18 passed | ✅ 4 cases (button, open, cancel, confirm) | ✅ Clean |
| 3.1 | `e2e/delete-team.spec.ts` | E2E | N/A (new) | ✅ Written | ✅ 2/2 passed | ✅ 2 scenarios (cancel/confirm) | ➖ None needed |

## Work Unit Evidence

| Evidence | Unit 1 (schema+API) | Unit 2 (modal+card) | Unit 3 (e2e+docs) |
|---|---|---|---|
| Focused test command + result | `pnpm exec vitest run "app/api/teams/[id]/route.test.ts" "app/api/teams/route.test.ts"` → **10 passed** | `pnpm exec vitest run "features/teams/TeamDeleteModal.test.tsx" "features/teams/TeamList.test.tsx"` → **22 passed** | `pnpm test` → **522 passed**; `pnpm lint` → clean; `npx tsc --noEmit` → exit 0 |
| Runtime harness + result | `pnpm run test:e2e:auth` (isolation.spec.ts: foreign DELETE → 404) → **auth suite 3/3 passed** | `AUTH_MODE=local pnpm exec playwright test e2e/delete-team.spec.ts` → **2 passed**; full local suite **21 passed** | Local e2e full suite **21 passed** (19 original + 2 delete) |
| Rollback boundary | Revert migration `20260808173938_add_team_archived_at` + `app/api/teams/[id]/route.ts` + `app/api/teams/route.ts`; archived rows restore via `archivedAt = NULL` | Remove `TeamDeleteModal.tsx` + card button + pending state in `TeamList.tsx` | Revert `e2e/delete-team.spec.ts` + `openspec/changes/team-archive/*` (additive only) |

## Test Summary

- Total tests written: **12** (2 route archive, 1 route filter, 4 modal, 4 TeamList wiring, 2 e2e — 1 filter test replaced existing assertion)
- Total suites passing: unit **522/522** (36 files), local e2e **21/21**, real-DB auth **3/3**
- Layers used: Unit (10 new), E2E (2 new)
- Approval tests (refactoring): 0 — no pure refactor of existing behavior (routes changed behavior via new tests)
- Pure functions created: 0 — changes are route handlers, a React component, and event wiring

## Deviations from Design

None — implementation matches the locked design. Note: the delete control is rendered as a dedicated bottom-row button (separate `<li>` child, `mt-auto` footer) rather than an absolutely-positioned overlay, guaranteeing zero hit-area collision with the card `<Link>` and keeping it keyboard/tap friendly (locked decision 2 satisfied).

## Issues Found

- **Stale dev server**: the first local e2e delete run failed because a leftover `next dev` server from a prior session was running in unknown/auth mode on :3000 and Playwright reused it (redirecting `/` to `/login`). Killed it; fresh `AUTH_MODE=local` server boots correctly. This is environmental, not a code defect.
- Pre-existing non-fatal `no matching decryption secret` NextAuth log during anonymous-route handling (present before this change); all auth e2e tests still pass.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `prisma/schema.prisma` | Modified | Added `archivedAt DateTime?` |
| `prisma/migrations/20260808173938_add_team_archived_at/migration.sql` | Created | `ALTER TABLE "Team" ADD COLUMN "archivedAt" TIMESTAMP(3)` |
| `app/api/teams/[id]/route.ts` | Modified | DELETE → `update({ data: { archivedAt: new Date() } })` soft delete |
| `app/api/teams/route.ts` | Modified | GET list filters `archivedAt: null` |
| `features/teams/TeamDeleteModal.tsx` | Created | Rulebook modal (scrim + panel, `role=dialog`/`aria-modal`, Spanish copy, Cancelar/Eliminar) |
| `features/teams/TeamList.tsx` | Modified | Per-card Delete button + `pendingTeam` state + modal wiring via `removeTeam` |
| `app/api/teams/[id]/route.test.ts` | Modified | Archive/soft-delete/404 tests |
| `app/api/teams/route.test.ts` | Modified | List scope + archive filter tests |
| `features/teams/TeamDeleteModal.test.tsx` | Created | Modal roles/copy/cancel/confirm tests |
| `features/teams/TeamList.test.tsx` | Modified | Delete button + modal flow tests |
| `e2e/delete-team.spec.ts` | Created | Home delete flow (local store) |
| `openspec/changes/team-archive/{specs/team-persistence/spec.md,specs/team-list/spec.md,design.md,tasks.md,apply-progress.md}` | Created | SDD artifacts |

## Commits

- `4a3b806` feat(teams): soft-delete teams via archivedAt on API
- `0e85a8d` feat(teams): add delete control and confirmation modal to team cards
- `b53ac06` test(e2e): add team delete flow and record team-archive specs

## Future Invariant (deferred, leagues)

Recorded in `specs/team-persistence/spec.md`: once leagues land, a team assigned to an active league MUST NOT be archivable (expel first, archive only after league ends). Not implemented — no league code exists.
