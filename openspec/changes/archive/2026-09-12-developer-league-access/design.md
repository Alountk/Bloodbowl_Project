# Design: developer-league-access

## Technical Approach

Add a `leagues.manage` permission (developer/admin) and treat its holders as **owner-equivalent** on every league. Reuse the `live.manage` precedent: **owner check FIRST, else `requirePermission("leagues.manage")`** — the DB `User.role` is authoritative (never the JWT). Reads drop their shields via a shared pure `resolveLeagueAccess`; mutations add a privileged branch before the existing 404/403. Plain `user`/member behavior is unchanged. Satisfies LAC-1..LAC-5 + all delta scenarios.

## Architecture Decisions

| Decision | Alternatives | Why |
|----------|--------------|-----|
| `leagues.manage` in typed `PERMISSIONS` + `ROLE_PERMISSIONS` | Special-case `role` inline | Zero change to `can()`/`requirePermission`; mirrors `live.manage` |
| Shared `lib/leagueAccess.ts` (pure + `getDbRole`) | Per-route inline reads | Encodes owner-first→privileged→member→foreign ONCE; client mirrors it |
| Owner check FIRST, then `requirePermission` (reset/share pattern) | Permission before ownership | Owner skips the DB role read; preserves 401/404/409 semantics |
| `reset`/`share`/`live` stay on `live.manage` | Migrate to `leagues.manage` | Already authorize dev/admin; live recovery is a distinct concern |
| Client role from `session.user.role` + server `canManage` flag | JWT alone, or flag alone | JWT is display-only; server DB-role is the only trust boundary; `canManage` closes the promotion split gap |

## Data Flow

```
READ:   GET /api/leagues ──auth()401── getDbRole ── can()? ── where:{} (ALL)
        GET /api/leagues/[id] ──auth()401── findFirst 404 ── resolveLeagueAccess ── 200 (foreign started/finished)

ACTION: POST/DELETE ──auth()401── findFirst 404 ── lifecycle 409 ── owner? : requirePermission
          ├─ ok   → tx (owner's 200/204)
          └─ fail → 404 (no-leak)  [forfeit: 403]
```

## File Changes

| File | Action | Change |
|------|--------|--------|
| `lib/permissions.ts` | Modify | +`"leagues.manage"` to `PERMISSIONS` + `developer`/`admin` |
| `lib/leagueAccess.ts` | Create | `resolveLeagueAccess(...)`; `getDbRole(userId)` |
| `features/leagues/access.ts` | Create | `isOwnerEquivalent(league,userId,role)` |
| `app/api/leagues/route.ts` | Modify | GET: drop OR filter when privileged |
| `app/api/leagues/[id]/route.ts` | Modify | GET shield bypass; DELETE owner-first + privilege |
| `app/api/leagues/[id]/start/route.ts` | Modify | owner-first + privilege |
| `app/api/leagues/[id]/members/[teamId]/route.ts` | Modify | expel: + privileged branch |
| `.../fixtures/[fixtureId]/route.ts` | Modify | GET visibility shield bypass |
| `.../fixtures/[fixtureId]/{forfeit,result,proposals,propose,accept}/route.ts` | Modify | + privileged branch |
| `features/leagues/{LeagueList,LeagueDetail}.tsx`, `features/dashboard/Dashboard.tsx` | Modify | use `isOwnerEquivalent` |
| Tests (`permissions`, `leagueAccess`, per-route, component) | Modify/Create | RED/GREEN per slice |

## Per-Route Guard Changes

Reads use `getDbRole`→`resolveLeagueAccess`; mutations use owner-first + `requirePermission("leagues.manage")`, mapping its 403 → **404 (no-leak)**. Only `forfeit` keeps 403. `reset`/`share`/`live` are **unchanged**.

| Route | New guard | Privileged result |
|-------|-----------|-------------------|
| GET `/api/leagues` | if `can(dbRole)` → `where:{}` | all leagues |
| GET `/[id]` | `resolveLeagueAccess` bypasses shield | foreign started/finished → 200 |
| DELETE `/[id]` | `findFirst({id})`; started→409; owner-first else privilege | foreign OPEN → 204; started → 409 |
| POST `/[id]/start` | `findFirst({id})`; owner-first else privilege | foreign OPEN → 200; repeat → 409 |
| DELETE `/[id]/members/[teamId]` | `isAdmin\|\|isTeamOwner\|\|privilege` | member expelled → 200 |
| GET `fixtures/[fixtureId]` | `resolveLeagueAccess` bypass | foreign → 200 |
| POST `forfeit` | owner-first else privilege (fail→**403**) | → 200 |
| POST/PUT `result` | `isAdmin\|\|isCaptain\|\|privilege` (fail→404) | load/correct → 200 |
| GET `proposals` | `isParticipant\|\|isAdmin\|\|privilege` (fail→404) | history → 200 |
| POST `propose`/`accept` | `isParticipant\|\|privilege` (fail→404) | → 200 |

## Interfaces / Contracts

```ts
// lib/leagueAccess.ts (pure; server passes DB role, client passes JWT snapshot)
export type LeagueAccess = "owner" | "privileged" | "member" | "foreign";
export function resolveLeagueAccess(a: {
  userId: string | null; role: string | null | undefined;
  ownerId: string | null; isMember: boolean;
}): LeagueAccess; // owner FIRST, then can(role,"leagues.manage") → "privileged"
export async function getDbRole(userId: string): Promise<string | null>;

// features/leagues/access.ts
export function isOwnerEquivalent(league: { ownerId: string }, userId: string | undefined, role: string | null | undefined): boolean;
```

## Client Design

- **Role source**: `session?.user?.role` (JWT snapshot) — the same source `LeagueDetail` uses for `canResetLive`. Display-only; server re-reads DB role every request.
- **Server `canManage` flag**: list items + detail add `canManage: boolean` (DB role + `ownerId`). Components prefer it, falling back to `isOwnerEquivalent(league, userId, session?.user?.role)`. A promotion renders immediately; the client never authorizes.
- **LeagueList/Dashboard**: `myLeagues` = `canManage || ownerId===userId || isMember` → privileged foreign leagues land in "Mis Ligas".
- **LeagueDetail**: `isOwnerEquivalent` replaces `isOwner` for `canExpel`, the start button, and the `isLeagueOwner` prop to `Jornadas` (gates forfeit/result/negotiation). `canResetLive` stays on `live.manage`.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `can(role,"leagues.manage")`; `resolveLeagueAccess` ordering | extend `permissions` test; new `leagueAccess.test.ts` (pure) |
| Route | 401/404/409/200 + privileged 200 + plain-`user` denial | extend each `route.test.ts` with the `requirePermissionMock` from `reset`/`share` |
| Component | split + owner-control visibility (LAC-5) | `LeagueList`/`LeagueDetail` tests |
| E2E | none required | RBAC is route-tested; optional auth-suite dev/admin list |

## Work Units (proposal slices)

| Slice | Content | Test command | Rollback |
|-------|---------|--------------|----------|
| S1 | permission + `leagueAccess.ts` + predicate | `pnpm test -- lib/permissions lib/leagueAccess features/leagues/access` | revert |
| S2 | list OR-drop + detail shield | `pnpm test -- app/api/leagues` | revert |
| S3 | delete/start/expel + fixture visibility | `pnpm test -- start members fixtures` | revert |
| S4 | forfeit/result×2/proposals/propose/accept | `pnpm test -- forfeit result proposals propose accept` | revert |
| S5 | `canManage` + LeagueList/Dashboard/LeagueDetail | `pnpm test -- features` | revert |

Additive; independently revertible per slice.

## Threat Matrix

N/A — no routing/shell/subprocess/VCS/PR/executable-classification/process-integration boundary. RBAC widening over existing HTTP routes only.

## Migration / Rollout

No schema migration; additive permission + helper + predicate + guard branches. Rollback = revert the chained PRs.

## Open Questions

- `canManage` flag: ship in S5 or defer (JWT-only lags UI on promotion; server still authorizes).
- Privileged proposer cannot self-accept (existing 409) — accepted participant-mirror.
