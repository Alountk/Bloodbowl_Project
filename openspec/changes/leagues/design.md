# Design: Leagues (Team Grouping)

## Technical Approach

Replace `Team.leagueType` with a real user-owned `League` grouping model: Prisma schema + migration, four user-scoped `/api/leagues` routes and assign/expel, UI under `/leagues`, sidebar "Ligas", wizard select removal, and an enforced 409 archive guard. Mirrors existing `/api/teams` patterns (session-scoped, `findFirst` by owner, foreign → 404).

## Architecture Decisions

| Decision | Options | Chosen | Rationale |
|----------|---------|--------|-----------|
| League name uniqueness | Global `@unique` vs per-owner | Global `@unique` | Locked by user; spec Scenario "Duplicate league name rejected" |
| Team membership cardinality | one-to-many via `leagueId` vs join table | `Team.leagueId String?` FK `onDelete: SetNull` | Locked design #2; one league per team, simple queries |
| `leagueType` removal | Keep + coexist vs single migration drop | Drop in migration, no value mapping | Locked design #4; existing teams start `leagueId: null`, zero data mapping |
| Team delete guard | Return 409 vs auto-expel | 409 "expel from league first" | Locked design #6; enforced, surfaced in delete modal |
| Nav item source | Hardcode vs shared `NAV_ITEMS` | Shared `NAV_ITEMS` array | Sidebar spec requires single-sourced desktop+drawer nav |

## Data Flow

    wizard POST /api/teams (no leagueType, leagueId null) → prisma.team.create
    /api/leagues POST/GET        → prisma.league (findMany by ownerId)
    /api/leagues/[id] GET/DELETE → prisma.league.findFirst({ where:{id,ownerId} }); delete sets members SetNull
    /api/leagues/[id]/teams POST assign → prisma.team.update leagueId (guards: owned, unarchived, leagueId null)
    /api/leagues/[id]/members/[teamId] DELETE expel → prisma.team.update leagueId:null
    /api/teams/[id] DELETE → if leagueId!=null → 409; else archive

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modify | Add `League` model; add `Team.leagueId` FK SetNull; drop `leagueType` column |
| `prisma/migrations/<new>_add_leagues` | New | Migration: create League, add leagueId, drop leagueType |
| `features/teams/types.ts` | Modify | Remove `TeamLeagueType`, `LEAGUE_TYPES`, `DEFAULT_LEAGUE_TYPE`; Team loses `leagueType`, gains `leagueId: string \| null`; add `League` type |
| `features/teams/store/InMemoryTeamStore.ts` | Modify | Backfill `leagueId: null`; drop leagueType default |
| `features/teams/store/LocalStorageTeamStore.ts` | Modify | Backfill `leagueId: null`; drop leagueType default |
| `features/teams/store/ApiTeamStore.ts` | Modify | `ApiTeam` type + normalization: drop leagueType, map `leagueId`; surface 409 as typed error |
| `app/api/teams/route.ts` | Modify | POST drops leagueType, writes `leagueId: null` |
| `app/api/teams/[id]/route.ts` | Modify | DELETE returns 409 when `team.leagueId != null` before archiving |
| `app/api/leagues/route.ts` | New | GET list (owner), POST create (401/409 dup name) |
| `app/api/leagues/[id]/route.ts` | New | GET detail with members, DELETE owner-only |
| `app/api/leagues/[id]/teams/route.ts` | New | POST assign (guards) |
| `app/api/leagues/[id]/members/[teamId]/route.ts` | New | DELETE expel |
| `features/leagues/*` + `app/leagues/*` | New | List page, detail page (members + assign/expel), create form, shared types |
| `components/Sidebar.tsx` | Modify | `NAV_ITEMS` gains `{ href: "/leagues", label: "Ligas" }` |
| `features/teams/create/CreateTeamForm.tsx` | Modify | Remove league-type select block |
| `features/teams/create/useCreateTeamForm.ts` | Modify | Drop `leagueType` from form state |
| `features/teams/detail/TeamDetailView.tsx` | Modify | Remove `LEAGUE_LABELS`; show league name or "Sin liga" |
| `features/teams/TeamDeleteModal.tsx` + `TeamList.tsx` | Modify | Surface 409 message ("expel from league first") when confirm returns it |
| `e2e/*`, `*.test.ts*` | Modify | Drop leagueType fixtures; add leagues e2e + guard assertions |

## Interfaces / Contracts

```ts
// features/teams/types.ts
export interface League {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  createdAt: string;
}
export interface Team { /* ... */ id, name, raceId, roster, coaching,
  leagueId: string | null; } // leagueType removed
```

`TeamStore.remove(id)` now throws a typed `ArchiveGuardError` on 409 so the UI surfaces it; 404 still resolves as no-op.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | League routes (CRUD, assign/expel, owner scoping, dup name 409) | Route tests with mocked prisma/auth per `app/api/teams/route.test.ts` pattern |
| Unit | Team DELETE 409 guard | `/api/teams/[id]` route test with leagueId set |
| Unit | Types/store normalization sweep | Update InMemory/LocalStorage/Api store tests + 446-test regression |
| Component | Leagues list/detail/create, wizard no-select, detail league badge, delete-modal 409 | `*.test.tsx` component tests |
| E2E | Create league → assign team → list detail; guard 409 in delete-team.spec | Playwright spec updates + fixtures without leagueType |

## Threat Matrix

N/A — this change adds feature routes only; no routing shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary is introduced or modified.

## Migration / Rollout

1. Add `League` model + `Team.leagueId` (nullable, SetNull), drop `Team.leagueType` in ONE migration.
2. Existing teams: `leagueType` column dropped; `leagueId` starts null (no value mapping — locked design).
3. `prisma db:migrate` + regenerated client (`db:generate`) before unit tests in CI.
4. Rollback: downward migration re-adds `leagueType` default "open", drops League + leagueId (teams created mid-window lose membership — acceptable). DB backup before deploy.

## Open Questions

- [ ] None blocking — locked design covers schema, scoping, guard, and UI.

## UI Pattern (user-approved)

**Patrón 2 — Cards grid** (mobile-friendly, consistent with the teams home):
- `/leagues` list: hero "Mis Ligas" + "+ Nueva liga" button (navy); cards grid (`grid gap-3 sm:grid-cols-2 lg:grid-cols-3`), each card: navy/red top band, league name (navy 800), description (slate), "N equipos" count, "Ver" ghost button.
- Create: "+ Nueva liga" opens a rulebook modal (name + description) → POST → list refreshes.
- League detail `/leagues/[id]`: hero with league name + description, assign select (own teams without league) + "Asignar" button, member rows (team name · race · players) with "Expulsar" (red).
- Guard: team delete modal surfaces 409 "No se puede borrar este equipo — pertenece a la liga... Expulsalo primero."
