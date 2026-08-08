# Design: Team Archive (Soft Delete) with Card Delete + Confirmation Modal

## Technical Approach

Convert team deletion from hard delete to recoverable archive (soft delete) at the DB layer, expose a delete button on every home team card, and gate the action behind a rulebook-styled confirmation modal. The API flips `DELETE` to `update({ archivedAt })` and `GET /api/teams` to filter `archivedAt: null`. No store, AppProvider, or route contract changes are required (remove is already idempotent; the client list refresh already happens in `removeTeam`). This matches the locked design decision 1–4.

## Architecture Decisions

### Decision: Soft-delete via `archivedAt` timestamp

**Choice**: Add `Team.archivedAt DateTime?`; `DELETE /api/teams/[id]` becomes `update({ data: { archivedAt: new Date() } })`; `GET /api/teams` filters `archivedAt: null`.
**Alternatives considered**: Hard delete (current) — irreversible data loss; dedicated Archive table / `deletedAt` tombstone JSON — over-engineered for a single timestamp.
**Rationale**: Recoverable, minimal schema surface, no client contract change. Archived rows retain full data and can be restored by clearing `archivedAt`. Matches locked decision 1.

### Decision: No GET-by-id archive detail route

**Choice**: Do not add `GET /api/teams/[id]`. Archived detail falls out of client list filtering (a deleted team no longer appears in `GET /api/teams`, so the client never links to it).
**Alternatives considered**: Adding a detail route that returns 404 for archived teams.
**Rationale**: No such route exists today; the client only reaches detail through the home list. Filtered list already hides archived teams. Zero extra server surface. Matches locked decision 1.

### Decision: Delete control as independent `<button>`, not a Link

**Choice**: Each card renders the body as a `<Link>` to `/teams/[id]` and a separate delete `<button aria-label="Delete {team.name}">`, positioned so they do not overlap (e.g. delete on the card edge, outside the link's clickable area).
**Alternatives considered**: Making the whole card a parent with a nested link/button; wrapping delete inside the Link.
**Rationale**: Nested interactive controls break accessibility and keyboard focus. A sibling button keeps the link body and the delete control as independent, focusable elements. Matches locked decision 2.

### Decision: Single controlled modal instance

**Choice**: One `TeamDeleteModal` in `TeamList`, controlled by `pendingTeam` state; `null` closes it, a team id opens it. Confirm calls `useApp().removeTeam(id)`; cancel resets to `null`.
**Alternatives considered**: A modal per card (unmanageable); using the browser `confirm()` (not rulebook-styled, no accessible dialog).
**Rationale**: One instance controlled by state gives focus management and a11y requirements in one place. `removeTeam` already updates list state after store resolution, so refresh is free. Matches locked decision 3.

## Data Flow

```
TeamList ──delete button──▶ pendingTeam set ──▶ TeamDeleteModal (role=dialog, aria-modal)
     ▲                                          │  Cancelar → pendingTeam=null (no action)
     │                                          └  Eliminar ─▶ removeTeam(team.id)
     └──────────── list re-render (no team) ◀──────── AppProvider: store.remove + setTeams(filter)
```

API path: `DELETE /api/teams/[id]` → session check → `findFirst({id, userId})` → `update({ archivedAt })` → 204.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modified | Add `archivedAt DateTime?` to Team |
| `prisma/migrations/<ts>_add_team_archived_at/` | Create | Migration adding `archivedAt` |
| `app/api/teams/[id]/route.ts` | Modified | `delete` → `update({ archivedAt: now() })` |
| `app/api/teams/route.ts` | Modified | list `where: { userId, archivedAt: null }` |
| `features/teams/TeamDeleteModal.tsx` | Create | Rulebook modal (~60 lines) |
| `features/teams/TeamList.tsx` | Modified | Delete button per card + modal wiring + pending state |
| `features/teams/TeamDeleteModal.test.tsx` | Create | Modal open/confirm/cancel tests |
| `app/api/teams/[id]/route.test.ts` | Modified | DELETE → archive test |
| `app/api/teams/route.test.ts` | Modified | list filter archived test |
| `features/teams/TeamList.test.tsx` | Modified | delete button + modal integration tests |
| `e2e/delete-team.spec.ts` | Create | Home delete flow (local store) |
| `openspec/changes/team-archive/specs/team-persistence/spec.md` | Create | Delta spec |
| `openspec/changes/team-archive/specs/team-list/spec.md` | Create | Delta spec |
| `openspec/changes/team-archive/design.md` | Create | This design |
| `openspec/changes/team-archive/tasks.md` | Create | Task breakdown |

## Interfaces / Contracts

`TeamStore` and `AppProvider.removeTeam` unchanged. New component props:

```tsx
interface TeamDeleteModalProps {
  team: { id: string; name: string } | null;
  onCancel: () => void;
  onConfirm: (id: string) => Promise<void>;
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (route) | DELETE soft-deletes owns team, 204; list filters archived | Vitest route tests with prisma mock |
| Unit (modal) | dialog roles, copy, Cancel keeps team, Eliminar removes | Vitest + Testing Library with InMemory store |
| Unit (TeamList) | delete button present per card, no navigation on delete; modal confirm/cancel wiring | Vitest + Testing Library |
| E2E (local) | home card → modal Spanish copy → Cancelar keeps → Eliminar removes | Playwright, AUTH_MODE=local |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. The only mutation is a Prisma `update` on a user-scoped record; existing HTTP status contracts (401/404/204) are preserved and already covered.

## Migration / Rollout

`prisma migrate deploy` adds the nullable `archivedAt` column (no data rewrite, backfill `null` by default). `pnpm db:generate` regenerates the client so `archivedAt` is typed. No feature flag. Rollback: revert migration (drop column) and restore `prisma.team.delete` on the API + remove UI button/modal; archived rows in DB can be restored by clearing `archivedAt`.

## Open Questions

- None — design is locked and user-approved.
