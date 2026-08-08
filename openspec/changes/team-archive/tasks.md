# Tasks: Team Archive (Soft Delete) with Card Delete + Confirmation Modal

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~250–300 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Schema + API soft-delete + list filter + tests | PR 1 | `pnpm exec vitest run "app/api/teams/[id]/route.test.ts" "app/api/teams/route.test.ts"` | Real-DB isolation suite via `pnpm run test:e2e:auth` (isolation.spec.ts DELETE 404) | Revert schema migration + route.ts changes; rows already soft-deleted restore via `archivedAt = NULL` |
| 2 | TeamDeleteModal + TeamList delete button/modal + tests | PR 1 | `pnpm exec vitest run "features/teams/TeamDeleteModal.test.tsx" "features/teams/TeamList.test.tsx"` | Local e2e `AUTH_MODE=local pnpm exec playwright test delete-team.spec.ts` | Remove TeamDeleteModal.tsx + TeamList button/modal wiring |
| 3 | e2e delete flow + docs/artifacts | PR 1 | `pnpm test` (512+) + `pnpm lint` + `npx tsc --noEmit`; `AUTH_MODE=local pnpm exec playwright test` (>19) | Local e2e full suite | Additive e2e file + openspec docs only |

## Phase 1: Foundation (Schema + API)

- [x] 1.1 Add `archivedAt DateTime?` to `Team` in `prisma/schema.prisma` and create the migration.
- [x] 1.2 RED: test `DELETE /api/teams/[id]` archives (calls `update` with `archivedAt`) and returns 204.
- [x] 1.3 GREEN: update `app/api/teams/[id]/route.ts` `DELETE` to `findFirst` then `update({ data: { archivedAt: new Date() } })`.
- [x] 1.4 RED: test `GET /api/teams` filters `archivedAt: null` and still scopes to the user.
- [x] 1.5 GREEN: update `app/api/teams/route.ts` `GET` where clause to add `archivedAt: null`.

## Phase 2: Core (Modal + Card Delete)

- [x] 2.1 RED: `TeamDeleteModal` tests — dialog roles, Spanish copy, Cancelar closes, Eliminar calls onConfirm.
- [x] 2.2 GREEN: create `features/teams/TeamDeleteModal.tsx` (scrim + panel, `role="dialog"`, `aria-modal="true"`, Cancelar/Eliminar buttons).
- [x] 2.3 RED: `TeamList` tests — delete button per card with `aria-label="Delete {name}"`, no navigation, modal open/confirm/cancel wiring.
- [x] 2.4 GREEN: update `features/teams/TeamList.tsx` — delete button + `pendingTeam` state + render `TeamDeleteModal`; confirm calls `removeTeam`.

## Phase 3: Integration (E2E + Docs)

- [x] 3.1 Add `e2e/delete-team.spec.ts` — home card open modal, Spanish copy visible, Cancelar keeps team, Eliminar removes it from list.
- [x] 3.2 Confirm existing local e2e (create-team, mobile) still green when the delete flow runs in AUTH_MODE=local.
- [x] 3.3 Run `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, and the local e2e suite to verify the whole change.
