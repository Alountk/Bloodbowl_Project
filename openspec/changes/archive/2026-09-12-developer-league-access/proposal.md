# Proposal: developer-league-access

## Intent

`developer`/`admin` hold RBAC permissions, but league access stays owner/member-scoped: they cannot view foreign STARTED/FINISHED leagues or run owner actions on them. Support/debugging on any league requires DB access. Make privileged roles owner-equivalent for every league.

## Scope

### In Scope
- New `leagues.manage` permission (developer/admin).
- Shared DB-authoritative access helper (server) + pure predicate (client).
- READ: list returns ALL leagues; detail bypasses the started/finished shield.
- OWNER ACTIONS anywhere: start, expel, delete, fixture visibility, forfeit, result load/correct, proposals, propose/accept.
- UI: privileged roles owner-equivalent in the existing split; owner controls render.

### Out of Scope
- Audit trail (Risk); any change for plain `user`; running live matches as a non-coach; new lifecycle rules; role assignment.

## Capabilities

### New Capabilities
- `league-access-control`: DB-authoritative role-based owner-equivalent override for developer/admin (read + owner actions); plain-user behavior unchanged.

### Modified Capabilities
- `leagues`, `league-season`: list/detail/delete/start/expel/visibility authorize privileged actors.
- `matchday-forfeit`, `match-result`, `matchday-negotiation`: owner/participant-only actions additionally allow privileged actors.

## Approach

- Reuse the `live.manage` pattern (`reset`/`share`): owner check FIRST, else `requirePermission("leagues.manage")`; role from DB, never JWT. Plain `user` falls through to today's logic unchanged.
- New `lib/leagueAccess.ts`: pure `resolveLeagueAccess(...)` + server `getDbRole(userId)`. Routes keep 401/404/409; privileged actors get the owner's 200/204; list drops the OR filter when privileged.
- UI: `features/leagues/access.ts` → `isOwnerEquivalent(league,userId,role)` for the LeagueList/Dashboard split and LeagueDetail gating. Privileged actors land in "Mis Ligas" (no new section).

## Affected Areas

| Area | Impact |
|------|--------|
| `lib/permissions.ts` | +`leagues.manage` → developer/admin |
| `lib/leagueAccess.ts` | New helper |
| `app/api/leagues/route.ts`, `[id]/route.ts` | list broadens; shield bypass; delete |
| `[id]/{start,members/[teamId]}`, `fixtures/[fixtureId]/{route,forfeit,result,proposals,propose,accept}` | owner/participant → privileged |
| `features/leagues/{access.ts,LeagueList,LeagueDetail}`, `features/dashboard/Dashboard.tsx` | predicate + rendering |

## Risks

| Risk | L | Mitigation |
|------|---|------------|
| Privileged action unattributable | High | DB role + session userId; audit deferred |
| Destructive privilege too broad | Med | Confirm scope; `user`-denial tests |
| Route misses the override | Med | Single helper; per-route tests |
| `user` regresses | Low | Unchanged-behavior scenarios |

## Rollback Plan

Revert the chained PRs. Additive (permission key + helper + UI predicate), no schema/data migration — rollback is instant.

## Dependencies

`lib/devGuard.ts`, `lib/permissions.ts`, Auth.js session (JWT role for UI only).

## Success Criteria

- [ ] developer/admin list sees every league; detail returns foreign started/finished.
- [ ] developer/admin can start/expel/delete/forfeit/load-correct/propose-accept anywhere.
- [ ] Plain `user` unchanged; nonexistent id still 404.
- [ ] `pnpm test`, `pnpm lint`, `tsc --noEmit`, auth e2e green.

## Review Workload Forecast (400-line budget)

| Slice | Content |
|-------|---------|
| S1 | `leagues.manage` + `lib/leagueAccess.ts` + tests |
| S2 | READ: list + detail shield + tests |
| S3 | League mutations: delete/start/expel/visibility + tests |
| S4 | Matchday: forfeit, result ×2, proposals, propose/accept + tests |
| S5 | Frontend predicate + LeagueList/Dashboard/LeagueDetail + tests |

~350 code + ~450 tests ≈ **800 lines** → over budget.
`Decision needed: Yes` · `Chained PRs: Yes` · `Budget risk: High`.

## Resolved Decisions

1. **Destructive actions: YES.** `developer`/`admin` get FULL owner-equivalent control on foreign leagues — including delete league, expel teams and award a walkover. (User, 2026-09-12.)
2. **Audit trail: deferred.** No dedicated privileged-action log before shipping; recorded as an accepted Risk (the actor stays identifiable by DB role + session userId). (User, 2026-09-12.)
