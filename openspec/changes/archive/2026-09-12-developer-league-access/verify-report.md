```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:1a1bb81ed30f741636082142220b0b0effc21014839d5f85e7c7858f9e5d3310
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 15/15
scenarios: 73/73
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:858dcf8b14f58b8e310356c70af47170cca6e91b7c3a1d0ed4b150d0cc143570
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: developer-league-access
**Version**: N/A (delta specs, 6 domains: league-access-control [new], leagues, league-season, match-result, matchday-forfeit, matchday-negotiation)
**Mode**: Standard (Strict TDD inactive — no `openspec/config.yaml`)
**Scope**: S1–S5, uncommitted working tree on `main` (HEAD `8dc3dc5`); no commit performed

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 33 |
| Tasks complete | 33 |
| Tasks incomplete | 0 |
| ActionContext mode | standard change (not workspace-planning) |

### Build & Tests Execution

**Build / type-check**: ✅ Passed (`npx tsc --noEmit`, exit 0, zero output)
```text
npx tsc --noEmit  → exit 0 — no diagnostics (empty output, hash e3b0c442…)
pnpm lint         → exit 0 — eslint clean (4-line pnpm banner only, no findings)
```

**Tests**: ✅ 2659 passed / ❌ 0 failed / ⚠️ 0 skipped (180 files)
```text
pnpm test  → exit 0 (hash 858dcf8b…) — Test Files 180 passed (180), Tests 2659 passed (2659), Duration 22.6s
```
The reported run is the second of three consecutive green full runs. A prior full run (`/tmp/verify-test.out`, hash c968612c…) failed 1/2659 on `features/profile/ProfilePanel.test.tsx` — see WARNING #1.

**Focused change suites (all green inside the full run)**
```text
lib/permissions.test.ts (8) · lib/leagueAccess.test.ts (7) · features/leagues/access.test.ts (4)
app/api/leagues/route.test.ts (19) · app/api/leagues/[id]/route.test.ts (34) · start (13)
members (12) · fixtures/[fixtureId] (34) · forfeit (14) · result (47) · proposals (6) · propose (11) · accept (11)
LeagueList (13) · Dashboard (5) · LeagueDetail (33) · api.test.ts (26)
```

**E2E (real DB, OPTIONAL)**: ⚠️ NOT fully green — `pnpm run test:e2e:auth` exit 1
```text
66 passed, 3 failed, 2 flaky (71 tests, 6.0m). Docker up; Postgres :5433 up; port 3000 free; reuseExistingServer:false respected.
Failed (none on the leagues.manage surface):
  - e2e/profile.spec.ts:120 logout — asserts the ENGLISH heading "Your league, in your pocket." while the file sets
    test.use({ locale: "es-ES" }); the rendered landing heading is "Tu liga, en tu bolsillo." (test bug, untouched file).
  - e2e/inducement-purchase.spec.ts:147 — ready-phase `inducement-purchase` step absent (match rendered "Listo para empezar").
  - e2e/auth.spec.ts:56 logout — flaked under 4 parallel workers; PASSED on a serial re-run (`--workers=1`).
Flaky: e2e/locale.spec.ts:107 (same logout heading symptom; passed on retry), e2e/live-match.spec.ts:406.
Serial re-run of the 3 failures (`--workers=1 --retries=0`): 1 passed (auth), 2 failed (profile, inducement).
```

**Coverage**: ➖ Not available (no coverage threshold/tool configured; `openspec/config.yaml` absent)

### Spec Compliance Matrix

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| LAC-1 leagues.manage Permission | Developer and admin hold the permission | `lib/permissions.test.ts > grants leagues.manage to developer and admin only (LAC-1)` | ✅ COMPLIANT |
| LAC-1 | Role read from the database | `lib/leagueAccess.test.ts > reads the role from the database by user id`; `lib/devGuard.test.ts > resolves the user id for a developer` | ✅ COMPLIANT |
| LAC-1 | Unauthenticated denied | 401 cases: `leagues/route.test.ts > returns 401 when there is no session`; `[id]/route.test.ts`, `start`, `members`, `fixtures/[fixtureId]`, `forfeit`, `result > returns 401 when unauthenticated with no write`, `proposals`, `propose`, `accept` | ✅ COMPLIANT |
| LAC-2 Owner-Equivalent Access Resolution | Owner resolves first | `lib/leagueAccess.test.ts > resolves the owner FIRST regardless of role`; `features/leagues/access.test.ts > treats the owner as owner-equivalent regardless of role` | ✅ COMPLIANT |
| LAC-2 | Privileged actor is owner-equivalent | `lib/leagueAccess.test.ts > resolves a non-owner developer/admin as privileged`; `access.test.ts > treats a non-owner developer/admin as owner-equivalent` | ✅ COMPLIANT |
| LAC-2 | Plain user and member fall through | `lib/leagueAccess.test.ts > never makes a plain user privileged (falls through)`; `access.test.ts > never treats a plain user as owner-equivalent` | ✅ COMPLIANT |
| LAC-3 Privileged Owner-Equivalent Override | Override spans read and all owner actions | list `leagues/route.test.ts > returns EVERY league…(LAC-3)`; detail `[id]/route.test.ts > returns a foreign STARTED/FINISHED league…(LAC-3)`; start `start > lets a leagues.manage holder start a foreign OPEN league`; expel `members > lets a leagues.manage holder expel…`; delete `[id] > lets a leagues.manage holder delete a foreign OPEN league`; fixture `fixtures > returns 200 for a leagues.manage holder reading a foreign STARTED/FINISHED fixture`; forfeit `forfeit > lets a leagues.manage holder award a forfeit…`; result `result > lets a leagues.manage holder load a result…`; correct `result > lets a leagues.manage holder correct…`; proposals `proposals > lets a leagues.manage holder see the full history…`; propose `propose > lets a leagues.manage holder propose…`; accept `accept > lets a leagues.manage holder accept…` | ✅ COMPLIANT |
| LAC-3 | Override never exceeds the owner | delete `[id] > returns 409 for a foreign STARTED league to a leagues.manage holder`; start `start > keeps 409 for an already-started league…`; expel `members > keeps 409 for a STARTED foreign league…`; forfeit `forfeit > returns 409 on a finished league`; result `result > returns 409 on a finished league` (POST) + `PUT … finished`; propose `propose > returns 409 on a finished league`; accept `accept > returns 409 on a finished league` | ✅ COMPLIANT |
| LAC-4 No Existence Leak | Missing league id 404 for privileged | detail `[id] > returns 404 for a league that does not exist`; delete `[id] > returns 404 for a nonexistent league id without reading a role`; start `start > returns 404 for a nonexistent league id…`; expel `members > returns 404 for a nonexistent league…` | ✅ COMPLIANT |
| LAC-4 | Missing fixture id 404 for privileged | `fixtures > returns 404 for a missing fixture without reading a role`; `forfeit > returns 404 for a nonexistent fixture id…`; `proposals > returns 404 for a nonexistent fixture id…`; `propose > returns 404 for a nonexistent fixture id…`; `accept > returns 404 for a nonexistent fixture id…`; `result > returns 404 for an authenticated foreign user` | ✅ COMPLIANT |
| LAC-5 UI Owner-Equivalent Rendering | Privileged lands in the owner split | `LeagueList.test.tsx > lands a foreign league flagged canManage in Mis Ligas` + `> …for a developer session via the predicate`; `Dashboard.test.tsx > …for a developer session` + `> …flagged canManage` | ✅ COMPLIANT |
| LAC-5 | Owner controls render for privileged | `LeagueDetail.test.tsx > shows the owner-only forfeit control to a developer…`; `> renders owner controls from the server canManage flag`; `> shows expel + start controls to a developer…` | ✅ COMPLIANT |
| LAC-5 | Plain user unchanged | `LeagueList.test.tsx > keeps a plain user's split…`; `Dashboard.test.tsx > keeps a plain user's My leagues…`; `LeagueDetail.test.tsx > keeps owner controls hidden from a plain user…` + `> keeps expel/start hidden from a plain user…` | ✅ COMPLIANT |
| leagues League User-Scoped API | Unauthenticated API call (unchanged) | `leagues/route.test.ts > returns 401 when there is no session` (+ per-route 401s) | ✅ COMPLIANT |
| leagues | List own plus open leagues | `leagues/route.test.ts > lists open leagues of any user plus the session user's own leagues…` | ✅ COMPLIANT |
| leagues | Creation without the clock option | `leagues/route.test.ts > creates a league and lets the deprecated clock columns persist at DB defaults (D15)` | ✅ COMPLIANT |
| leagues | Legacy turn-clock payload ignored | `leagues/route.test.ts > ignores a legacy turn-clock payload…` | ✅ COMPLIANT |
| leagues | Creation UI drops the clock option | `CreateLeagueModal.test.tsx > no longer renders the turn-clock toggle but keeps the ruleset selector (RAU-52)` | ✅ COMPLIANT |
| leagues | Deprecated fields immutable after creation | `leagues/route.test.ts > no update path exists for the deprecated clock fields` | ✅ COMPLIANT |
| leagues | Foreign member started detail allowed (unchanged) | `[id]/route.test.ts > returns a STARTED league with fixtures to a current member (not owner)` | ✅ COMPLIANT |
| leagues | League detail with members | `[id]/route.test.ts > returns a STARTED league with fixtures to its owner` / `> returns an OPEN league to any authenticated user, with teams…` | ✅ COMPLIANT |
| leagues | Privileged detail bypasses the started/finished shield | `[id]/route.test.ts > returns a foreign STARTED league to a leagues.manage holder` + `> …foreign FINISHED league…` | ✅ COMPLIANT |
| leagues | Privileged delete on a foreign open league | `[id]/route.test.ts > lets a leagues.manage holder delete a foreign OPEN league (LAC-3)` | ✅ COMPLIANT |
| leagues | Plain user foreign started detail still hidden | `[id]/route.test.ts > returns 404 for a STARTED league to a foreign non-member` | ✅ COMPLIANT |
| leagues | Plain user delete foreign league still denied | `[id]/route.test.ts > returns 404 and performs no mutation for a foreign league` + `> …plain user on a foreign open league (regression)` | ✅ COMPLIANT |
| leagues Team Membership Assignment | Assign own unassigned team to any open league | `app/api/leagues/[id]/teams/route.test.ts` (pre-existing; full suite green) | ✅ COMPLIANT |
| leagues | Assign already-member team rejected (unchanged) | `app/api/leagues/[id]/teams/route.test.ts` (pre-existing; full suite green) | ✅ COMPLIANT |
| leagues | Assign foreign or archived team denied (unchanged) | `app/api/leagues/[id]/teams/route.test.ts` (pre-existing; full suite green) | ✅ COMPLIANT |
| leagues | Assign to started league rejected | `app/api/leagues/[id]/teams/route.test.ts` (pre-existing; full suite green) | ✅ COMPLIANT |
| leagues | Admin expels member while open (unchanged) | `members/[teamId]/route.test.ts > allows the league owner (admin) to expel any member while OPEN` | ✅ COMPLIANT |
| leagues | Expel non-member denied (unchanged) | `members/[teamId]/route.test.ts > returns 404 when the team is not a member of the league` | ✅ COMPLIANT |
| leagues | Privileged expels a member of a foreign open league | `members/[teamId]/route.test.ts > lets a leagues.manage holder expel a member of a foreign OPEN league` | ✅ COMPLIANT |
| leagues | Plain user expel still denied | `members/[teamId]/route.test.ts > returns 404 for a plain user who is neither owner nor team owner` | ✅ COMPLIANT |
| leagues Public Open League Listing | Open leagues visible to any user | `leagues/route.test.ts > lists open leagues of any user plus the session user's own leagues…` | ✅ COMPLIANT |
| leagues | Own started league still listed | `leagues/route.test.ts > returns a STARTED league where the session user is a member, flagged isMember` | ✅ COMPLIANT |
| leagues | Foreign started league hidden | `leagues/route.test.ts > keeps foreign STARTED leagues without membership hidden (WHERE excludes them)` | ✅ COMPLIANT |
| leagues | Privileged sees every league in every status | `leagues/route.test.ts > returns EVERY league in every status to a leagues.manage holder and drops the OR filter` | ✅ COMPLIANT |
| leagues | Plain user still does not see foreign started | `leagues/route.test.ts > keeps foreign STARTED leagues hidden from a plain user and reads the DB role (regression)` | ✅ COMPLIANT |
| league-season League Status Lifecycle | New league is open | `leagues/route.test.ts > creates a league…` (status open via schema default; full suite green) | ✅ COMPLIANT |
| league-season | Repeat start rejected | `start/route.test.ts > returns 409 when the league is already STARTED (re-start blocked)` | ✅ COMPLIANT |
| league-season | Started league delete blocked | `[id]/route.test.ts > returns 409 and leaves everything intact for a STARTED league` | ✅ COMPLIANT |
| league-season | Finished league is immutable too | `[id]/route.test.ts > …FINISHED league (RAU-40)`; `start > returns 409 when the league is FINISHED`; `members > returns 409 when the league is FINISHED`; `result > returns 409 on a finished league`; `propose`/`accept > returns 409 on a finished league` | ✅ COMPLIANT |
| league-season | Privileged starts a foreign open league | `start/route.test.ts > lets a leagues.manage holder start a foreign OPEN league (LAC-3)` | ✅ COMPLIANT |
| league-season | Plain user foreign start denied | `start/route.test.ts > returns 404 for a plain user starting a foreign open league (regression)` | ✅ COMPLIANT |
| league-season Started League Detail Visibility | Foreign non-member on started league hidden | `[id]/route.test.ts > returns 404 for a STARTED league to a foreign non-member`; `fixtures > returns 404 for a STARTED foreign non-member with the identical no-leak body` | ✅ COMPLIANT |
| league-season | Privileged reads a foreign started league | `[id]/route.test.ts > returns a foreign STARTED league to a leagues.manage holder`; `fixtures > …foreign STARTED fixture (LAC-3)` | ✅ COMPLIANT |
| league-season | Privileged reads a foreign finished league | `[id]/route.test.ts > returns a foreign FINISHED league…`; `fixtures > …foreign FINISHED fixture (LAC-3)` | ✅ COMPLIANT |
| league-season | Plain user foreign started league still hidden | `[id]/route.test.ts > …foreign non-member (no leak, no fixtures)`; `fixtures > returns 404 for a plain user on a foreign STARTED fixture (regression)` | ✅ COMPLIANT |
| match-result Result Authorization | Captain loads a result | `result/route.test.ts > lets a captain (home owner) load a result in one transaction` | ✅ COMPLIANT |
| match-result | Foreign user hidden | `result/route.test.ts > returns 404 for an authenticated foreign user (no leak)` | ✅ COMPLIANT |
| match-result | Unauthenticated rejected | `result/route.test.ts > returns 401 when unauthenticated with no write` | ✅ COMPLIANT |
| match-result | Captain correction allowed | `result/route.test.ts > accepts a correction from a participant captain (admin OR captain, 200)` | ✅ COMPLIANT |
| match-result | Privileged loads a result on a foreign fixture | `result/route.test.ts > lets a leagues.manage holder load a result on a foreign fixture (LAC-3)` | ✅ COMPLIANT |
| match-result | Plain user still hidden | `result/route.test.ts > returns 404 for a plain user who is neither captain nor admin (regression)` | ✅ COMPLIANT |
| match-result Correction Authorization with Audit | Correction audited | `result/route.test.ts > records an audit correction with before/after snapshot for an admin` | ✅ COMPLIANT |
| match-result | Forfeit denied to non-admin participants | `forfeit/route.test.ts > returns 403 for a participant (non-admin) and mutates nothing` | ✅ COMPLIANT |
| match-result | Spent PE never revoked | `result/route.test.ts > never revokes spent PE on a correction that awards fewer PE` | ✅ COMPLIANT |
| match-result | Participant correction e2e | `e2e/match-report.spec.ts` (auth suite: PASSED) | ✅ COMPLIANT |
| match-result | Privileged corrects a result | `result/route.test.ts > lets a leagues.manage holder correct a foreign played result and records the actor` | ✅ COMPLIANT |
| matchday-forfeit Admin-Only Forfeit | Admin awards forfeit | `forfeit/route.test.ts > sets winnerId and closes open proposals when the league owner forfeits` | ✅ COMPLIANT |
| matchday-forfeit | Non-admin forfeit forbidden | `forfeit/route.test.ts > returns 403 for a participant (non-admin) and mutates nothing` | ✅ COMPLIANT |
| matchday-forfeit | Unauthenticated forfeit rejected | `forfeit/route.test.ts > returns 401 when unauthenticated` | ✅ COMPLIANT |
| matchday-forfeit | Privileged awards a forfeit | `forfeit/route.test.ts > lets a leagues.manage holder award a forfeit on a foreign STARTED league` | ✅ COMPLIANT |
| matchday-forfeit | Plain user forfeit still forbidden | `forfeit/route.test.ts > returns 403 for a plain user who is neither owner nor privileged` | ✅ COMPLIANT |
| matchday-negotiation Participant-Only Negotiation | Participant proposes | `propose/route.test.ts > stores a proposal for a participant and closes no prior proposal` | ✅ COMPLIANT |
| matchday-negotiation | Owner participant negotiates | `propose/route.test.ts > stores a proposal for a participant…` (participant rule applies to the owner whose team plays; full suite green) | ✅ COMPLIANT |
| matchday-negotiation | Non-participant forbidden | `propose/route.test.ts > returns 404 without leaking existence for a non-participant`; `accept > returns 404 for a non-participant accepting` | ✅ COMPLIANT |
| matchday-negotiation | Unauthenticated negotiation rejected | `propose > returns 401 and stores nothing when unauthenticated`; `accept > returns 401 when unauthenticated` | ✅ COMPLIANT |
| matchday-negotiation | Privileged proposes | `propose/route.test.ts > lets a leagues.manage holder propose on a foreign pending fixture (LAC-3)` | ✅ COMPLIANT |
| matchday-negotiation | Plain user non-participant still forbidden | `propose > returns 404 …non-participant authenticated user`; `accept > returns 404 for a non-participant accepting` | ✅ COMPLIANT |
| matchday-negotiation Negotiation History Visible | History shown to participants | `proposals/route.test.ts > returns the full ordered history to a participant` | ✅ COMPLIANT |
| matchday-negotiation | Foreign user cannot see history | `proposals/route.test.ts > returns 404 for a non-participant, non-admin user` | ✅ COMPLIANT |
| matchday-negotiation | Privileged sees history | `proposals/route.test.ts > lets a leagues.manage holder see the full history of a foreign fixture` | ✅ COMPLIANT |

**Compliance summary**: 15/15 requirements and 73/73 scenarios have passing covering tests.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| LAC-1 | ✅ Implemented | `lib/permissions.ts:27,34,36` adds `"leagues.manage"` to `PERMISSIONS` and to `developer`/`admin`; `user` stays `[]`. `can()` unchanged. `getDbRole` (`lib/leagueAccess.ts:37-43`) and `requirePermission` (`lib/devGuard.ts:20-27`) read `User.role` from the DB, never the JWT. |
| LAC-2 | ✅ Implemented | `resolveLeagueAccess` (`lib/leagueAccess.ts:24-30`) checks `userId === ownerId` FIRST, then `can(role,"leagues.manage")` → `privileged`, else `member`/`foreign`. Client mirror `isOwnerEquivalent` (`features/leagues/access.ts:11-18`) is identical. |
| LAC-3 | ✅ Implemented | Reads use `getDbRole` + `resolveLeagueAccess` (list `route.ts:33-48`; detail `[id]/route.ts:197-216`; fixture `fixtures/…/route.ts:410-422`). Mutations are owner-first then `requirePermission("leagues.manage")`: delete `[id]/route.ts:283-288`, start `start/route.ts:46-51`, expel `members/…/route.ts:52-59`, forfeit `forfeit/route.ts:55-63`, result POST `result/route.ts:271-276`, result PUT `result/route.ts:577-582`, proposals `proposals/route.ts:41-46`, propose `propose/route.ts:63-68`, accept `accept/route.ts:54-59`. Privileged 403 mapped to 404 except forfeit (keeps 403). |
| LAC-4 | ✅ Implemented | Every route looks up by id (no owner scope) and returns 404 before any role read when the row is missing: `[id]/route.ts:190-192,274-276`; `start/route.ts:37-40`; `members/…/route.ts:30-33`; `fixtures/…/route.ts:402-404`; `forfeit:40-42`; `result:252-254,557-559`; `proposals:32-34`; `propose:48-50`; `accept:39-41`. Fixture lookups stay scoped by `leagueId`. |
| LAC-5 | ✅ Implemented | Server computes `canManage = privileged || ownerId===userId` (list `route.ts:70`; detail `[id]/route.ts:216,247`). Client prefers it and falls back to `isOwnerEquivalent`: `LeagueList.tsx:112-124`, `Dashboard.tsx:46-51`, `LeagueDetail.tsx:74-76` (gates `canExpel` :342, start :354, `isLeagueOwner` to Jornadas :260). `canResetLive` stays on `live.manage` (`LeagueDetail.tsx:81`). |
| leagues / league-season | ✅ Implemented | List drops the OR filter only when privileged (`route.ts:36-48`); detail/fixture shield bypass via `access === "foreign"`; DELETE/start look up unscoped then authorize; lifecycle 409s preserved. |
| match-result / forfeit / negotiation | ✅ Implemented | POST/PUT result, forfeit, proposals, propose, accept each add the privileged branch before the existing denial; self-accept 409 (`accept/route.ts:98-100`) and finished-league 409s are untouched. PUT records `correctedBy: userId` in the audit row (`result/route.ts:679-686`). |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| `leagues.manage` in typed `PERMISSIONS` + `ROLE_PERMISSIONS` | ✅ Yes | Mirrors `live.manage`; zero change to `can()`/`requirePermission`. |
| Shared `lib/leagueAccess.ts` (pure + `getDbRole`) | ✅ Yes | Single resolution; client mirrors it in `features/leagues/access.ts`. |
| Owner check FIRST, then `requirePermission` | ✅ Yes | Owner skips the DB role read; plain-user 401/404/409 preserved. |
| `reset`/`share`/`live` stay on `live.manage` | ✅ Yes | Not touched by the diff. |
| Client role from `session.user.role` + server `canManage` | ✅ Yes | Flag preferred, predicate fallback; client never authorizes. |
| `canManage` optional flag | ✅ Yes | Optional only so legacy fixtures/serializations type-check; server always emits it on list + detail. Plain user → `false` + predicate `false` = identical. |
| S3 ordering: authz before the started/finished 409 | ✅ Yes | DELETE and start run owner/privilege before the lifecycle guard, so a foreign STARTED league never leaks status to a plain user (404). |
| No schema migration | ✅ Yes | No `prisma/` diff in the change set. |

### Security Guard — plain `user` status-code parity (all touched routes)

| Route | Caller | Before | After | Same? |
|-------|--------|--------|-------|-------|
| GET `/api/leagues` | plain, foreign STARTED | hidden | hidden (OR filter retained, `privileged=false`) | ✅ |
| GET `/[id]` | plain, foreign STARTED/FINISHED | 404 | 404 (`access==="foreign"`) | ✅ |
| GET `/[id]` | plain, missing id | 404 | 404 | ✅ |
| DELETE `/[id]` | plain, foreign OPEN | 404 | 404 (guard fail → 404) | ✅ |
| DELETE `/[id]` | plain, foreign STARTED | 404 | 404 (guard runs BEFORE lifecycle) | ✅ |
| DELETE `/[id]` | owner, own STARTED | 409 | 409 | ✅ |
| POST `/[id]/start` | plain, foreign OPEN/STARTED | 404 | 404 (guard runs BEFORE lifecycle) | ✅ |
| POST `/[id]/start` | owner, own STARTED | 409 | 409 | ✅ |
| DELETE `members/[teamId]` | plain, foreign OPEN | 404 | 404 | ✅ |
| DELETE `members/[teamId]` | plain, foreign STARTED | 409 | 409 (lifecycle guard is pre-existing and still first) | ✅ |
| GET `fixtures/[fixtureId]` | plain, foreign STARTED/FINISHED | 404 | 404 | ✅ |
| POST `forfeit` | plain non-owner | 403 | 403 | ✅ |
| POST/PUT `result` | plain non-participant | 404 | 404 | ✅ |
| GET `proposals` | plain non-participant | 404 | 404 | ✅ |
| POST `propose` | plain non-participant | 404 | 404 | ✅ |
| POST `accept` | plain non-participant | 404 | 404 | ✅ |

Privileged self-accept 409 preserved (`accept/route.test.ts > keeps 409 when a privileged actor tries to self-accept their own proposal`); finished-league immutability preserved on delete/start/expel/result/propose/accept.

### Out-of-Scope Verification

| Item | Expected | Observed |
|------|----------|----------|
| Plain `user` behavior change | None | ✅ None — status parity table above; `user` holds `[]` permissions. |
| Audit trail for privileged actions | Deferred | ✅ No new model/migration; actor still recorded in result correction `correctedBy`. |
| Running live matches as non-coach | Unchanged | ✅ `live`/`reset`/`share` untouched, still `live.manage`. |
| Role assignment / new lifecycle rules | None | ✅ No new roles or status transitions. |
| Schema migration | None | ✅ No `prisma/` files in the diff. |

### Issues Found

**CRITICAL**: None. Every touched route preserves the plain-`user` status codes; every requirement/scenario has a passing covering test; no existence leak; lifecycle 409s preserved.

**WARNING**:
1. **`pnpm test` is flaky (pre-existing, untouched file).** One full run failed 1/2659: `features/profile/ProfilePanel.test.tsx > language selector (RAU-58) > flips the whole page language immediately when the PATCH succeeds` — `TypeError: Cannot read properties of undefined (reading 'then')` at `features/profile/ProfilePanel.tsx:72` (`getMe().then`). The file passes 5/5 in isolation and both follow-up full runs were green (2659/2659). The file is NOT part of this change; it is a mock-isolation/parallelism flake. Reported as a warning because the change adds 4 test files and could raise the flake's probability, but the root cause is in `ProfilePanel.test.tsx`.
2. **Real-DB auth e2e not green (OPTIONAL suite).** 66 passed / 3 failed / 2 flaky. Failures are outside the `leagues.manage` surface: `profile.spec.ts:120` and `auth.spec.ts:56` fail the logout helper's ENGLISH landing-heading assertion while `profile.spec.ts` sets `locale: "es-ES"` (page renders "Tu liga, en tu bolsillo.") — an assertion/test bug in untouched files; `auth.spec.ts` passed on a serial re-run; `inducement-purchase.spec.ts:147` fails to render the ready-phase `inducement-purchase` step (untouched feature). This suite is NOT a PASS for this change.
3. **`start` no-status-leak ordering lacks a dedicated plain-user + STARTED test.** The ordering is correct in code and is directly tested for DELETE (`[id]/route.test.ts > keeps 404 for a plain user on a foreign STARTED league`); for `start`, coverage is foreign OPEN → 404 plus privileged STARTED → 409. Same code pattern, low risk.
4. **No route-level test asserts a stale JWT role is ignored for `leagues.manage`.** The DB-role mechanism is proven at helper level (`getDbRole`, `requirePermission`); route tests mock those, so the JWT is never consulted in tests. The design guarantee holds by construction (routes call the DB helpers), but the scenario "Role read from the database" is not exercised end-to-end through a route.

**SUGGESTION**:
- `GET /api/leagues/[id]` now calls `getDbRole(userId)` for every request, including OPEN leagues where the role cannot change the outcome; consider resolving the role only inside the started/finished branch to avoid the extra DB read.
- Add an explicit privileged FINISHED-league DELETE test (only STARTED is covered) to mirror the start/result finished cases.
- Consider hardening `ProfilePanel.test.tsx`'s `getMe` mock so the unrelated suite flake stops recurring.

### Verdict

**PASS WITH WARNINGS**
All 33 tasks complete; `pnpm test` (2659/2659, 180 files), `pnpm lint`, and `npx tsc --noEmit` exit 0 on the reported run; all 15 requirements and 73 scenarios have passing covering tests; the plain-`user` status-code parity holds for every touched route and the privileged override never exceeds the owner. Warnings are non-blocking and outside the change's surface: a pre-existing flaky `ProfilePanel` test, a non-green optional auth e2e (logout-heading test bug + inducement step), and two coverage niceties on the `start`/JWT-role paths.
