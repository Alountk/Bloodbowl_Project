# Proposal: League Seasons — Public Leagues + Round-Robin Jornadas

## Intent

Leagues are private per-user silos: invisible to others, no shared competition, no lifecycle. This change makes them public, joinable competitions — any user browses open leagues and joins with own teams (`Team.leagueId` stays single-assignment) — and lets the creator (admin) start the league with auto round-robin jornadas.

## Scope

### In Scope
- Lifecycle: `status` (open|started), `seasonLength`, `startedAt`
- Public listing + join/self-leave/expel (open only) + start (owner only)
- Automatic round-robin fixtures (shuffle + circle method) via new `Fixture` model
- Jornadas view (home vs away)
- Migration + unit/component/e2e coverage

### Out of Scope
- Results/standings; finished status; editing; bye polish; match dates

## Capabilities

### New Capabilities
- `league-season`: status lifecycle, owner-only start with `seasonLength` validation, `Fixture` model, round-robin generation

### Modified Capabilities
- `leagues`: public open listing, join with own teams, self-leave, admin expel, delete-started → 409, detail visibility, owner + fixtures in responses

## Approach

- **DB (additive)**: League + `status` (enum, default `open`), `seasonLength Int?`, `startedAt DateTime?`; `Fixture` (cuid id, leagueId, round, homeTeamId, awayTeamId; index `[leagueId, round]`; cascade)
- **List** GET `/api/leagues`: open leagues of all users + own (any status), with owner name + member count (removes N+1)
- **Detail** GET `/api/leagues/[id]`: owner/members any status, others only if open; fixtures by round when started
- **Join** POST `/teams`: own unassigned non-archived team, league open → else 409. **Leave/expel** DELETE `/members/[teamId]`: admin expels any member, owner self-leaves; open only. **Delete** league: started → 409
- **Start** POST `/start` (owner only): `{seasonLength}`, `1 ≤ s ≤ teams−1`, teams ≥ 2; transaction: shuffle ids → circle method (n−1 rounds, n/2 pairings, every pair once) → fixtures → status/seasonLength/startedAt; re-start → 409
- **UI**: list "Mis Ligas" + "Ligas abiertas"; detail join/leave/start by role + status; start modal; jornadas view when started; assign/expel hidden when started
- **Tests**: round-robin suite (every pair once, rounds = n−1); route guards; component + e2e

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma`, `lib/roundRobin.ts` | Modified/New | League fields + Fixture; generator |
| `app/api/leagues/**` (5 routes + new `/start`) | Modified/New | Public list, visibility, open-only join/leave, delete guard, start |
| `features/leagues/*` (api, hooks, list/detail, new start modal) | Modified/New | Types, hooks, UI, start flow |
| `e2e/leagues.spec.ts` | Modified | Join/start journey |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Round-robin bugs (repeat/missed pairs) | Med | Exhaustive unit tests |
| Started-league visibility leak | Med | Members/admin-only (see decision) |
| Migration on live rows | Low | Additive, defaults |
| Teams locked post-start | Med | Deliberate lock, documented |

## Rollback Plan

Revert migration (drop Fixture/columns, status → open); git-revert per PR slice (API → UI → e2e).

## Dependencies

None external (Prisma + Postgres).

## Success Criteria

- B joins A's open league; A starts (length 2); 2 jornadas, unique pairings; post-start join/leave → 409; started delete → 409
- Round-robin suite: 4 & 6 teams — every pair once, rounds = n−1
- vitest + `test:e2e:auth` green; delta archived

## Proposal question round

- **Started-league visibility** (flagged): recommend members/admin-only (non-members → 404). Public view adds surface with no value — foreign started leagues never appear in the public list. Confirm or choose public.
- Assumed: public list "Ver" link shown only for open (joinable) leagues.
