# Proposal: Leagues (Team Grouping)

## Intent

Teams carry a manual `leagueType` enum ("open"/"exhibition") that groups nothing. Users cannot organise their teams. Replace `leagueType` with real user-owned Leagues: CRUD + team membership, so the league becomes the carrier of identity and teams become groupable.

## Scope

### In Scope
- League CRUD (create/list/detail/delete) + team assign/expel; league detail lists member teams
- `Team.leagueId` nullable FK; remove `Team.leagueType`; migration: existing teams start `leagueId: null`
- User-scoped `/api/leagues` routes (401/404), owner-only delete
- UI: `/leagues` list + create, league detail (members, assign/expel), wizard drops league-type select, team detail shows league name / "Sin liga"
- Archive guard enforced: 409 "expel from league first" when `leagueId != null`

### Out of Scope
- Matches, standings, seasons, schedules
- Public/shared leagues, invites, multi-league teams
- League badge on team cards (home list unchanged)

## Capabilities

### New Capabilities
- `leagues`: league CRUD, team membership (assign own unassigned team / expel), owner scoping, member-team listing

### Modified Capabilities
- `team-persistence`: schema (League model; `Team.leagueId` FK SetNull; drop `leagueType`); POST creates `leagueId: null`; store normalization drops `leagueType`; Archive invariant: deferred → enforced (409)
- `team-detail-view`: hero league label → league name or "Sin liga" (`LEAGUE_LABELS` removed)
- `create-team`: league-type select removed from coaching section
- `app-shell`: sidebar gains "Ligas" nav item (Teams-only nav modified) — flagged decision

## Approach

Prisma: `League {id, name, description?, ownerId FK User cascade, createdAt}`; `Team.leagueId?` FK SetNull; migration drops `leagueType` (no value mapping — teams start unassigned). API mirrors team routes (session-scoped, findFirst by owner, foreign → 404). Assign POST requires team owned, unassigned (`leagueId: null`), not archived; expel clears `leagueId`; league DELETE sets members' `leagueId` null then deletes. Archive guard: `DELETE /api/teams/[id]` → 409 when `leagueId` set. UI: `features/leagues/*` + `app/leagues/*` pages rulebook-styled; `Sidebar` NAV_ITEMS gains "Ligas". Home keeps teams-only.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modified | League model; Team.leagueId; drop leagueType |
| `app/api/leagues/**` | New | 4 user-scoped routes |
| `app/api/teams/route.ts`, `[id]/route.ts` | Modified | POST drops leagueType; DELETE 409 guard |
| `features/teams/types.ts`, `store/*` | Modified | Drop leagueType types + normalization |
| `features/teams/create/*` | Modified | Remove league-type select |
| `features/teams/detail/TeamDetailView.tsx` | Modified | League name / "Sin liga" |
| `components/Sidebar.tsx` | Modified | "Ligas" nav item |
| `app/leagues/*`, `features/leagues/*` | New | List/detail pages + UI |
| `e2e/*`, `*.test.ts*` | Modified | Drop leagueType fixtures; league tests updated |
| `openspec/specs/*` | Modified | 4 delta specs + new leagues spec |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Data loss dropping leagueType | Low | No mapping needed; migration test proves columns survive |
| League delete vs member teams | Med | SetNull members first, then delete; UI confirm |
| Archive guard regresses delete UX | Med | 409 surfaced in delete modal; e2e covers |
| Oversized diff | High | Chained PRs: DB+API / UI / guard+tests |

## Rollback Plan

Downward migration: drop `League` + `leagueId`, re-add `leagueType` default "open". Teams created mid-window lose membership (new feature; acceptable). DB backup before deploy.

## Dependencies

- Prisma migration + client regen (`db:migrate`, `db:generate`)
- Auth.js session (existing)

## Success Criteria

- [ ] `leagueType` column gone; pre-existing teams `leagueId: null`, no data loss
- [ ] League CRUD + assign/expel work end-to-end, user-scoped (401/404)
- [ ] Archiving a member team returns 409 "expel from league first"
- [ ] Wizard shows no league-type select; detail shows league name/"Sin liga"
- [ ] Unit + e2e suites green
