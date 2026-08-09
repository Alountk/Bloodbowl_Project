# Design: League Seasons — Public Open Leagues + Round-Robin Jornadas

## Technical Approach

Extend the existing Pattern-2 leagues stack (Prisma + `/api/leagues` routes + `features/leagues/*`) with an additive lifecycle: `status`/`seasonLength`/`startedAt` on League, a new Fixture model, a pure `lib/roundRobin.ts` generator, public/conditional route visibility, a transaction `start`, and role-aware list/detail UI. Preserves one-team-per-league cardinality. Maps to `league-season` + `leagues` deltas.

## Architecture Decisions

| Decision | Option | Tradeoff | Choice |
|---|---|---|---|
| Fixture model | New `Fixture` table vs JSON column | Table has FKs+cascade and queryable fixtures; JSON simpler but no integrity | New Fixture table |
| Pairing algorithm | Circle method vs brute force | Circle is closed-form (n−1 rounds, n/2 pairs) and deterministic post-shuffle; brute-force backtracking | Circle method after Fisher-Yates shuffle |
| Member count | Server-side `_count` vs detail N+1 | Current `useLeagues` fetches each detail (N+1); `_count` removes it | Include `_count` in list query |
| Detail visibility | Owner/member vs public | Started content leaks to strangers publicly; members-only protects fixtures | Members/admin-only when started, open public |
| Start write atomicity | Single Prisma transaction | Must shuffle+insert fixtures+update league atomically or partial state | `prisma.$transaction` |
| Delete started | 409 vs auto-archive | Locked design: started is immutable | 409 guard |

## Data Flow

```
GET /api/leagues → league.findMany(where: { OR: [{status:"open"}, {ownerId: me}] }, include: { owner, _count:{teams:{where:{archivedAt:null}}} , fixtures? no })
GET /api/leagues/[id] → findFirst(id) then if started: require owner or membership (else 404); if open: any auth user
POST /[id]/teams → validate league open + own unassigned non-archived team → update leagueId
POST /[id]/start → findFirst owner → ≥2 teams → seasonLength 1..n−1 → $transaction: shuffle ids → circle(circleMethod) → fixture.createMany → league.update(status,length,startedAt) → re-start 409
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modify | League + `status Role[] enum` (default `open`), `seasonLength Int?`, `startedAt DateTime?`; add `Fixture` model (leagueId cascade, round Int, homeTeamId, awayTeamId, `@@index([leagueId, round])`) |
| `prisma/migrations/20260809…_add_league_season` | Create | Additive migration: League columns + Fixture table + enum; backward-default `open` |
| `lib/roundRobin.ts` | Create | `shuffle<T>(arr): T[]` (Fisher-Yates) + `generateRoundRobin(teamIds: string[], seasonLength): FixtureDraft[]` (circle method: fix first, rotate rest for n−1 rounds) |
| `lib/roundRobin.test.ts` | Create | Exhaustive: n=4 & n=6 — rounds=n−1, every unordered pair once; n=4 length 2 — no repeats; odd-round bye behavior |
| `app/api/leagues/route.ts` | Modify | GET returns open (all users) + own (any status), include owner name + `_count` memberCount |
| `app/api/leagues/[id]/route.ts` | Modify | Visibility rule; delete 409 when started; include fixtures grouped by round when started |
| `app/api/leagues/[id]/teams/route.ts` | Modify | Validate league OPEN (409 started); keep team-ownership/archive/assign guards |
| `app/api/leagues/[id]/members/[teamId]/route.ts` | Modify | Allow admin OR team-owner; open-only (409 started) |
| `app/api/leagues/[id]/start/route.ts` | Create | Owner-only POST `{seasonLength}`; guards + transaction |
| `features/leagues/api.ts` | Modify | League type + `status/seasonLength/startedAt/ownerName/memberCount`; add `listOpenOrOwn`, `selfLeave`, `startLeague` |
| `features/leagues/useLeagues.ts` | Modify | Consume server memberCount (remove N+1); add start/leave actions |
| `features/leagues/LeagueList.tsx` | Modify | "Mis Ligas" + "Ligas abiertas" sections, public/own badges, started lock badge |
| `features/leagues/LeagueDetail.tsx` | Modify | Role-aware: join select/leave/expel/start by status+role; start modal (seasonLength input); jornadas view when started; hide assign/expel when started |
| `features/leagues/StartLeagueModal.tsx` | Create | seasonLength input field (1..teams−1), calls start, refreshes |
| `app/leagues/[id]/page.tsx` | Modify | Unchanged (detail page delegates to component) or pass-on only |
| `e2e/leagues.spec.ts` | Modify | Public join → start → locks journey + visibility/404 |

## Interfaces / Contracts

```ts
// lib/roundRobin.ts
export interface FixtureDraft { round: number; homeTeamId: string; awayTeamId: string }
export function generateRoundRobin(teamIds: readonly string[], seasonLength: number): FixtureDraft[]
// throws RangeError when teamIds.length < 2 or seasonLength ∉ [1, teams.length - 1]

// GET /api/leagues → Array<League & { ownerName: string | null; memberCount: number }>
// POST /api/leagues/[id]/start { seasonLength: number } → League (status:"started")
// GET /api/leagues/[id] → LeagueDetail & { status; seasonLength; startedAt; fixtures: FixtureDraft[] }
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | roundRobin (n=4,6 perfect; partial; `RangeError`) | `lib/roundRobin.test.ts` exhaustive, vitest |
| Route | start guards (owner, ≥2 teams, out-of-range, re-start 409, transaction), visibility (started foreign → 404, member → 200), delete-started 409 | Mock `@/auth` + `@/lib/prisma` per existing route tests |
| Component | LeagueList public/own sections; LeagueDetail role/status buttons; StartLeagueModal input; jornadas render | `LeagueList.test.tsx`, `LeagueDetail.test.tsx`, `StartLeagueModal.test.tsx` |
| E2E | user B joins A's open league → A starts (2 teams) → 2 jornadas unique pairs → post-start join 409 | `e2e/leagues.spec.ts` under `test:e2e:auth` |

## Threat Matrix

N/A — this change adds feature routes and UI only; no routing shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary is introduced or modified.

## Migration / Rollout

1. One additive migration: League `status` enum default `open`, `seasonLength Int?`, `startedAt DateTime?`; `Fixture` table (cascade, index). Existing leagues backfill `status:"open"`, nulls elsewhere.
2. `prisma db:migrate` + `db:generate` before CI unit tests.
3. Rollback: downward migration drops Fixture + the three League columns (no live started data pre-deploy → safe). Per-slice git-revert PR 1 → PR 2 → PR 3.
