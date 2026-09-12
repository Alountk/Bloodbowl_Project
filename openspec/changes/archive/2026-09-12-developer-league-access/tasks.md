# Tasks: developer-league-access

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~800 (S1 ~120 · S2 ~150 · S3 ~180 · S4 ~200 · S5 ~150) — ~350 code + ~450 tests |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (S1) → PR2 (S2) → PR3 (S3) → PR4 (S4) → PR5 (S5) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `leagues.manage` + `lib/leagueAccess.ts` + `features/leagues/access.ts` | PR1 | `pnpm test -- lib/permissions lib/leagueAccess features/leagues/access` | N/A — pure modules, no HTTP/browser | Revert `lib/permissions.ts`, delete `lib/leagueAccess.ts` + `features/leagues/access.ts`; feature inert |
| 2 | READ: list OR-drop + detail shield + `canManage` | PR2 | `pnpm test -- app/api/leagues` | N/A — route handlers imported directly in vitest | Revert `route.ts`/`[id]/route.ts` + tests; reads unchanged for plain user |
| 3 | League mutations: DELETE/start/expel + fixture visibility | PR3 | `pnpm test -- start members fixtures` | N/A — route handlers imported directly in vitest | Revert 4 routes + tests; plain user path untouched |
| 4 | Matchday: forfeit/result×2/proposals/propose/accept | PR4 | `pnpm test -- forfeit result proposals propose accept` | N/A — route handlers imported directly in vitest | Revert 5 routes + tests |
| 5 | `canManage` consumption + LeagueList/Dashboard/LeagueDetail | PR5 | `pnpm test -- features/leagues/LeagueList features/dashboard/Dashboard features/leagues/LeagueDetail` | N/A — component tests, no browser | Revert `api.ts` type + 3 components + tests |

## Phase 1 (S1) — Foundation: permission + shared helper + predicate

- [x] 1.1 Add `"leagues.manage"` to `PERMISSIONS` union and to the `developer`/`admin` arrays in `ROLE_PERMISSIONS` in `lib/permissions.ts` (`user` stays `[]`) — LAC-1
- [x] 1.2 Extend `lib/permissions.test.ts`: `can(role,"leagues.manage")` true for developer/admin, false for user/null — LAC-1
- [x] 1.3 Create `lib/leagueAccess.ts`: `LeagueAccess` union, pure `resolveLeagueAccess({userId,role,ownerId,isMember})` (owner FIRST, then `can(role,"leagues.manage")` → privileged, then member/foreign), and `getDbRole(userId)` (DB `User.role`, never JWT) — LAC-2/LAC-3
- [x] 1.4 Create `lib/leagueAccess.test.ts`: owner resolves first regardless of role; privileged = owner-equivalent; plain user/member falls through to member/foreign — LAC-2
- [x] 1.5 Create `features/leagues/access.ts`: `isOwnerEquivalent(league, userId, role)` mirroring the server decision (client-side, JWT snapshot) — LAC-2/LAC-5
- [x] 1.6 Create `features/leagues/access.test.ts`: predicate mirrors `resolveLeagueAccess` for owner/privileged/user — LAC-2/LAC-5

## Phase 2 (S2) — READ: list + detail shield

- [x] 2.1 Modify `app/api/leagues/route.ts` GET: read DB role via `getDbRole`; when `can(role,"leagues.manage")` use `where: {}` (drop the OR filter) so every league returns; add `canManage: boolean` to each list item (DB role + ownerId) — LAC-3/LAC-5 · MODIFIED leagues `Public Open League Listing`
- [x] 2.2 Extend `app/api/leagues/route.test.ts` (use `vi.mock("@/lib/devGuard")`/`getDbRole` mock pattern): privileged sees every league in every status; plain `user` foreign started still hidden; `canManage` flag set — LAC-3/LAC-5 + plain-user regression
- [x] 2.3 Modify `app/api/leagues/[id]/route.ts` GET: after 404 lookup, `resolveLeagueAccess` bypasses the started/finished shield (privileged → 200); add `canManage` to the detail response — LAC-3 · MODIFIED league-season `Started League Detail Visibility`
- [x] 2.4 Extend `app/api/leagues/[id]/route.test.ts`: privileged foreign started/finished → 200; plain `user` foreign started → 404 (regression); nonexistent id → 404 — LAC-3/LAC-4

## Phase 3 (S3) — League mutations + fixture visibility

- [x] 3.1 Modify `app/api/leagues/[id]/route.ts` DELETE: `findFirst({id})` (drop ownerId scope) → 409 started/finished; owner-first else `requirePermission("leagues.manage")` (403→404 no-leak); privileged foreign OPEN → 204 — LAC-3 · MODIFIED leagues `League User-Scoped API`
- [x] 3.2 Extend `[id]/route.test.ts` DELETE: privileged delete foreign OPEN → 204 (team leagueIds nulled); started → 409; plain `user` foreign → 404 (regression) — LAC-3/LAC-4
- [x] 3.3 Modify `app/api/leagues/[id]/start/route.ts` POST: owner-first else `requirePermission("leagues.manage")` (foreign OPEN → 200, repeat → 409) — LAC-3 · MODIFIED league-season `League Status Lifecycle`
- [x] 3.4 Extend `start/route.test.ts`: privileged starts foreign OPEN → 200 + fixtures; plain `user` foreign → 404 (regression) — LAC-3
- [x] 3.5 Modify `app/api/leagues/[id]/members/[teamId]/route.ts` DELETE expel: `isAdmin || isTeamOwner || privileged` — LAC-3 · MODIFIED leagues `Team Membership Assignment`
- [x] 3.6 Extend `members/[teamId]/route.test.ts`: privileged expels member of foreign OPEN → 200; plain `user` (non-owner, non-team-owner) → 404 (regression) — LAC-3
- [x] 3.7 Modify `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` GET: `resolveLeagueAccess` bypasses the started/finished shield (foreign fixture → 200) — LAC-3 · MODIFIED league-season `Started League Detail Visibility`
- [x] 3.8 Extend `fixtures/[fixtureId]/route.test.ts`: privileged reads foreign fixture → 200; plain `user` foreign → 404 (regression); missing fixture → 404 — LAC-3/LAC-4

## Phase 4 (S4) — Matchday actions

- [x] 4.1 Modify `forfeit/route.ts` POST: owner-first else `requirePermission("leagues.manage")` (fail stays 403) — LAC-3 · MODIFIED matchday-forfeit `Admin-Only Forfeit`
- [x] 4.2 Extend `forfeit/route.test.ts`: privileged awards forfeit → 200; plain `user` non-owner → 403 (regression); unauth → 401 — LAC-3
- [x] 4.3 Modify `result/route.ts` POST + PUT: `isAdmin || isCaptain || privileged` (fail → 404 no-leak); PUT audit row records the privileged actor — LAC-3 · MODIFIED match-result `Result Authorization` + `Correction Authorization with Audit`
- [x] 4.4 Extend `result/route.test.ts`: privileged loads/corrects foreign fixture → 200 (audit `correctedBy` = actor); plain `user` non-captain non-admin → 404 (regression) — LAC-3
- [x] 4.5 Modify `proposals/route.ts` GET: `isParticipant || isAdmin || privileged` (fail → 404) — LAC-3 · MODIFIED matchday-negotiation `Negotiation History Visible`
- [x] 4.6 Extend `proposals/route.test.ts`: privileged sees full history → 200; plain `user` non-participant → 404 (regression) — LAC-3
- [x] 4.7 Modify `propose/route.ts` POST: `isParticipant || privileged` (fail → 404) — LAC-3 · MODIFIED matchday-negotiation `Participant-Only Negotiation`
- [x] 4.8 Extend `propose/route.test.ts`: privileged proposes → 200; plain `user` non-participant → 404 (regression) — LAC-3
- [x] 4.9 Modify `accept/route.ts` POST: `isParticipant || privileged` (fail → 404); keep self-accept 409 — LAC-3 · MODIFIED matchday-negotiation `Participant-Only Negotiation`
- [x] 4.10 Extend `accept/route.test.ts`: privileged accepts → 200; plain `user` non-participant → 404 (regression); self-accept 409 preserved — LAC-3

## Phase 5 (S5) — Frontend: `canManage` + predicate consumption

- [x] 5.1 Add `canManage: boolean` to the `League` interface in `features/leagues/api.ts` (list + detail flag) — LAC-5
- [x] 5.2 Modify `features/leagues/LeagueList.tsx`: `myLeagues = canManage || ownerId===userId || isMember` (privileged foreign lands in "Mis Ligas"); fallback to `isOwnerEquivalent(league, userId, session?.user?.role)` — LAC-5
- [x] 5.3 Modify `features/dashboard/Dashboard.tsx`: same predicate for the `myLeagues` split — LAC-5
- [x] 5.4 Modify `features/leagues/LeagueDetail.tsx`: `isOwnerEquivalent` replaces `isOwner` for `canExpel`, the start button, and the `isLeagueOwner` prop to `Jornadas`; `canResetLive` stays on `live.manage` — LAC-5
- [x] 5.5 Extend `LeagueList.test.tsx` + `Dashboard.test.tsx` + `LeagueDetail.test.tsx`: privileged lands in "Mis Ligas" and sees owner controls; plain `user` split/controls unchanged — LAC-5

## Verification

- Prereq: `pnpm db:generate` (no schema change — client regeneration only).
- `pnpm test` · `pnpm lint` · `npx tsc --noEmit` stay green.
- `pnpm run test:e2e:auth` (Docker + Postgres) for the real-DB auth suite.
- E2E: none required for RBAC (route-tested). Optional: add a dev/admin list assertion to `e2e/auth.spec.ts`; no existing e2e asserts captain-403 for correction (that flip already shipped — `result/route.test.ts` already asserts captain-200).
