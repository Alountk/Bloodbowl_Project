# Tasks: League Seasons — Public Open Leagues + Round-Robin Jornadas

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 850–1100 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 DB+API+algorithm → PR2 UI → PR3 e2e+polish |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | DB+API+algorithm | PR 1 | `pnpm test` (roundRobin + routes) | `AUTH_MODE=auth`: B joins A's open league, A starts | revert PR 1: migration + `lib/roundRobin.ts` + routes |
| 2 | UI list/detail/start/jornadas | PR 2 | `pnpm test` (League/StartModal) | detail on STARTED league renders jornadas | revert PR 2: `features/leagues/*` + StartModal |
| 3 | e2e + polish | PR 3 | `pnpm run test:e2e:auth` | playwright auth journey | revert PR 3: `e2e/leagues.spec.ts` + docs |

## Phase 1: PR 1 — DB + API + Algorithm

- [x] 1.1 Prisma `schema.prisma`: League `status Role[]`(default `open`), `seasonLength Int?`, `startedAt DateTime?`; `Fixture`(id, leagueId cascade, round, homeTeamId, awayTeamId, `@@index([leagueId,round])`)
- [x] 1.2 RED `lib/roundRobin.test.ts`: n=4 & 6 perfect (rounds=n−1, every pair once); n=4 len 2 no repeats; <2 teams / out-of-range → RangeError
- [x] 1.3 GREEN `lib/roundRobin.ts`: Fisher-Yates `shuffle` + `generateRoundRobin` (circle method, fixed pivot)
- [x] 1.4 Migration `add_league_season`; `db:generate`
- [x] 1.5 Route tests RED→GREEN: GET `/api/leagues` open+own union w/ ownerName + `_count`; foreign started hidden
- [x] 1.6 `app/api/leagues/route.ts` GET: open (all) + own (any), include owner name + `_count`
- [x] 1.7 Route tests: `[id]` visibility open→any, started→owner/member, foreign non-member 404; delete-started 409
- [x] 1.8 `app/api/leagues/[id]/route.ts`: visibility gate, delete 409 started, fixtures grouped by round when started
- [x] 1.9 Route tests: `teams` join started→409; `members/[teamId]` admin OR team-owner, started→409
- [x] 1.10 `teams` + `members` routes: open-only guard, admin/team-owner leave
- [x] 1.11 RED `start` route tests: owner-only, ≥2 teams, len 1..n−1, re-start 409, transaction fixtures+update
- [x] 1.12 GREEN `app/api/leagues/[id]/start/route.ts`: validate then `$transaction` (shuffle → generateRoundRobin → createMany → update)

## Phase 2: PR 2 — UI

- [x] 2.1 RED `features/leagues/api.ts` types test: status/seasonLength/startedAt/ownerName/memberCount; `startLeague`/`selfLeave`
- [x] 2.2 GREEN `api.ts` + `useLeagues.ts`: consume server `memberCount` (drop N+1), expose start/selfLeave/refresh
- [x] 2.3 RED `LeagueList.test.tsx`: "Mis Ligas" + "Ligas abiertas", public/own/started badges
- [x] 2.4 GREEN `LeagueList.tsx`: dual sections, badges, open join CTA
- [x] 2.5 RED `LeagueDetail.test.tsx`: role+status join/leave/expel/start; started hides assign/expel, shows jornadas
- [x] 2.6 GREEN `LeagueDetail.tsx`: owner→start/expel, member→leave, open→join; started hides assign/expel
- [x] 2.7 RED `StartLeagueModal.test.tsx`: seasonLength input 1..teams−1, invalid blocked
- [x] 2.8 GREEN `StartLeagueModal.tsx`: seasonLength bound to teams−1, calls `startLeague`, refreshes
- [x] 2.9 GREEN jornadas: render FixtureDraft[] grouped by round as home vs away

## Phase 3: PR 3 — e2e + Polish

- [ ] 3.1 `e2e/leagues.spec.ts`: B lists A's open league, joins with own team
- [ ] 3.2 e2e: A starts (2 teams) → 2 jornadas, unique pairings
- [ ] 3.3 e2e: post-start join/leave/expel → 409; started detail to foreign → 404
- [ ] 3.4 `pnpm run test:e2e:auth` + full `pnpm test` green; update docs refs
