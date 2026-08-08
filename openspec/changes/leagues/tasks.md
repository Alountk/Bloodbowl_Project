# Tasks: Leagues (Team Grouping)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1400–1800 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 DB+API → PR 2 UI → PR 3 guard+tests+spec sync |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (user to choose) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | DB + API: schema/migration, League routes, teams route updates, store type sweep | PR 1 | `npx vitest run app/api/leagues app/api/teams/route.test.ts features/teams/store` | `npx prisma db:migrate && npx tsc --noEmit` (real migration + type regen) | Revert schema/migration + route files; teams unaffected functionally |
| 2 | UI: leagues pages, sidebar Ligas, wizard/detail updates, component tests | PR 2 | `npx vitest run features/leagues features/teams/detail features/teams/create app/teams` (after PR 1 merged/base) | `npm run dev` + manual `/leagues` create→assign→detail; Playwright `mobile` | Revert `features/leagues`, `app/leagues`, Sidebar/wizard/detail edits |
| 3 | 409 guard surface in delete modal + e2e fixture refresh + delta spec merges | PR 3 | `npx playwright test delete-team.spec.ts e2e/leagues` | run e2e suite against local server | Revert guard-UI wiring + fixture changes; spec merges are doc-only |

## Phase 1: Foundation — Schema, Store, and DB API (PR 1)

- [x] 1.1 RED `prisma/schema.prisma` + migration test: `League` model, `Team.leagueId` FK SetNull, drop `leagueType`; prove columns via migration fixture
- [x] 1.2 RED `features/teams/types.ts`: remove `TeamLeagueType`/`LEAGUE_TYPES`/`DEFAULT_LEAGUE_TYPE`; Team gains `leagueId: string | null`; add `League` type (compile fails → fix)
- [x] 1.3 RED `features/teams/store/{InMemory,LocalStorage,Api}TeamStore*`: drop leagueType backfill, add `leagueId: null`; ApiTeam type maps `leagueId`
- [x] 1.4 RED `app/api/teams/route.test.ts`: POST writes `leagueId: null`, no leagueType; DELETE 409 when `leagueId != null`
- [x] 1.5 GREEN `app/api/teams/route.ts` + `[id]/route.ts`: drop leagueType, set `leagueId: null`, add 409 guard
- [x] 1.6 RED `app/api/leagues/route.test.ts`: GET list (owner-only, 401), POST create, dup name 409
- [x] 1.7 RED `app/api/leagues/[id]/route.test.ts`: GET detail w/ members, foreign 404, DELETE owner-only + SetNull members
- [x] 1.8 RED `app/api/leagues/[id]/teams/route.test.ts` + `members/[teamId]` test: assign guards (owned/unarchived/unassigned), expel non-member 404
- [x] 1.9 GREEN create `app/api/leagues/**` routes (findFirst-by-owner, 401/404/409)
- [x] 1.10 Run PR-1 unit sweep + `prisma migrate` new migration `add_leagues`

## Phase 2: Core UI — Leagues Pages, Sidebar, Wizard, Detail (PR 2)

- [ ] 2.1 RED `components/Sidebar.tsx`: `NAV_ITEMS` gains `{ href: "/leagues", label: "Ligas" }`; `AppShell.test.tsx` asserts Teams + Ligas only
- [ ] 2.2 RED `features/teams/create` tests: no `aria-label="League type"` / league-type select; drop `leagueType` from form state
- [ ] 2.3 GREEN `CreateTeamForm.tsx` + `useCreateTeamForm.ts`: remove league-type select + state
- [ ] 2.4 RED `TeamDetailView.test.tsx`: meta line shows league name or "Sin liga"; `LEAGUE_LABELS` removed
- [ ] 2.5 GREEN `TeamDetailView.tsx`: resolve league name from store, "Sin liga" fallback
- [ ] 2.6 RED `features/leagues/LeagueList.test.tsx` + `app/leagues/page.test.tsx`: list own leagues, empty state, "Create League" CTA
- [ ] 2.7 RED `features/leagues/CreateLeagueForm.test.tsx`: name required, dup-name 409 surfaced
- [ ] 2.8 RED `features/leagues/LeagueDetail.test.tsx`: members list, assign own unassigned, expel, delete league confirm
- [ ] 2.9 GREEN create `app/leagues/*` + `features/leagues/*` (rulebook-styled: list page, create form, detail w/ assign/expel)
- [ ] 2.10 Run component sweep (`features/leagues`, `app/teams`) + `tsc --noEmit`

## Phase 3: Integration, Guard Surface, E2E + Spec Sync (PR 3)

- [ ] 3.1 RED `TeamDeleteModal.test.tsx` + `TeamList.test.tsx`: confirm on member team surfaces "expel from league first"
- [ ] 3.2 GREEN `TeamDeleteModal.tsx` + `TeamList.tsx`: catch `ArchiveGuardError`(409) from `removeTeam`, render message, keep modal/list
- [ ] 3.3 Sweep remaining `leagueType` fixtures: `features/migration/*`, `e2e/{mobile,migration,delete-team}.spec.ts`, store/roster tests (100+ matches → `rg "leagueType|LEAGUE_LABELS"`)
- [ ] 3.4 Add e2e `e2e/leagues.spec.ts`: create league → assign team → detail listing; guard 409 in delete-team
- [ ] 3.5 Verify unit + e2e suites green; regenerate reports; `sdd-archive` merges all five delta specs into main specs
- [ ] 3.6 Update main-spec `team-list`/fixtures if any league-less card assertions break

## Phase 4: Cleanup — Docs + Dead Code (PR 3 tail)

- [ ] 4.1 Remove `LEAGUE_LABELS`, `leagueType` ephemeral/test helpers dead code
- [ ] 4.2 Update `openspec/specs/*` Test Coverage tables (app-shell, create-team, team-detail-view, team-persistence) to reflect no-league-type assertions

## Must-Not-Miss Headlines

- `leagueType` sweep across **100+ matches** (tests, stores, API, form, detail, fixtures)
- Migration `Team.leagueId` **onDelete: SetNull**; league delete nulls members before delete
- **409 guard** in `/api/teams/[id]` DELETE + surfaced in TeamDeleteModal
- League **name unique global** (@unique) → 409 on dup
- Sidebar shared `NAV_ITEMS` + "Ligas" → `/leagues` (single source desktop+drawer)
