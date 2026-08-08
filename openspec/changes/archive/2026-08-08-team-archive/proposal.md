# Proposal: Team Archive (soft delete) with Card Delete + Confirmation Modal

## Intent

Teams are currently hard-deleted with no UI affordance at all: the home cards offer no delete control, and the only delete path is an API call. Hard delete is irreversible data loss. This change makes deletion recoverable (archive = soft delete in the DB) and gives users a visible, confirmed delete action on every home card, protecting against accidental loss.

## Scope

### In Scope
- Prisma: `Team.archivedAt DateTime?` + migration.
- `DELETE /api/teams/[id]` → soft delete (set `archivedAt = now()`), still 204/401/404.
- `GET /api/teams` list filters `archivedAt: null`.
- Per-card delete button on home (`aria-label="Delete {team.name}"`).
- New rulebook-styled confirmation modal (scrim + panel, `role="dialog"`/`aria-modal`): irreversible message, Cancel / red Delete buttons; confirm → `removeTeam(id)` (API path archives, local path removes).
- Tests: route unit tests (soft-delete, list filter), TeamList modal open/confirm/cancel, e2e home delete flow.

### Out of Scope
- Leagues; restore UI; archived-list view; any `GET /api/teams/[id]` route (none exists — detail 404 falls out of list filtering client-side).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `team-persistence`: Persistent Schema (Team gains `archivedAt`); User-Scoped Team API (DELETE is soft; list excludes archived; archived detail → not-found).
- `team-list`: add per-card delete control + confirmation modal requirement (open/confirm/cancel, irreversible copy).

## Approach

DB layer flips DELETE to `update({ archivedAt })`; `ApiTeamStore`/`LocalStorageTeamStore`/`AppProvider` unchanged (contract already 404-idempotent; local hard remove stays). `TeamList` gets a delete button per card + a `TeamDeleteModal` component; confirm calls `removeTeam`, which already updates local state after store resolution.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` + migration | Modified | `archivedAt DateTime?` |
| `app/api/teams/[id]/route.ts` | Modified | delete → update archivedAt |
| `app/api/teams/route.ts` | Modified | list where `archivedAt: null` |
| `features/teams/TeamList.tsx` | Modified | delete button + modal wiring |
| `features/teams/TeamDeleteModal.tsx` | New | confirmation dialog (~60 lines) |
| `app/api/teams/[id]/route.test.ts`, `app/api/teams/route.test.ts`, `features/teams/TeamList.test.tsx` | Modified | soft-delete / filter / modal tests |
| `e2e/delete-team.spec.ts` | New | home delete flow |

Estimate: **~200-350 lines** (schema+migration ~20, routes ~15, modal ~60, TeamList ~40, tests ~120, e2e ~60).

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Accidental tap deletes team | Med | Irreversible-warning modal + named confirm |
| Stale Prisma client after migration | Med | `db:generate` in apply; CI runs migrations |
| `isolation.spec.ts` (foreign 404) breaks | Low | `findFirst` scoped to user stays; only `delete`→`update` changes |

## Design Invariant (leagues)

When leagues land, an active-league team MUST NOT be archivable (expel first; archive only after league ends). Guard is deferred — no league code exists.

## Copy Language (flagged)

Modal is the app's first destructive action; copy MUST state irreversibility. **Recommendation: Spanish** — detail + create are already Spanish (the bulk of team interaction); home chrome is English, so unify later. Proposed: "Esta acción no se puede deshacer. El equipo se archivará y se eliminará de tu lista." English fallback kept in design if user prefers. **Decision needed before apply: Yes** (choose language).

## Rollback Plan

Deploy a revert migration dropping `archivedAt` (data already retained in rows — archived teams restored by setting `archivedAt = NULL`). API reverted to `prisma.team.delete`. Client reverted by removing button + modal.

## Dependencies

- `prisma migrate deploy` on deploy (entrypoint already runs it).
- `pnpm db:generate` after migration.

## Success Criteria

- [ ] Archive keeps row (archivedAt set); list hides it; detail → not-found.
- [ ] Foreign/unauthenticated deletes still 401/404 (isolation suite green).
- [ ] Modal opens per card, cancel keeps team, confirm removes it.
- [ ] Unit + e2e suites green.
