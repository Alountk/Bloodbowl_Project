```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:48d2f1a2cbb31553f65f30e4ce7aa13450bbf31f33be4f9dae4b916f92e2eb31
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 11/11
scenarios: 32/32
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:59c81b4144cb5515cebbc1dbe946793f8bb76821a4749c707d787cc6a213df7b
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: league-season (PR2 — UI slice: public list, role-aware detail, start modal, jornadas)
**Version**: PR2 slice of chained stacked-to-main delivery (PR1 DB+API done; PR3 e2e+polish deferred)
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 9 (PR2) |
| Tasks complete | 9 |
| Tasks incomplete | 0 |

All 9 PR2 tasks (2.1–2.9) are `[x]` in tasks.md and match the code inspected. PR3 tasks (3.1–3.4) remain unchecked by design (deferred slice, out of this batch's scope).

### Build & Tests Execution
**Tests (`pnpm test`)**: 612 passed / 0 failed / 0 skipped across 49 files (exit 0)
```text
 Test Files  49 passed (49)
      Tests  612 passed (612)
```

**Focused PR2 (`pnpm exec vitest run features/leagues`)**: 28 passed across 5 files (api 6, LeagueList 6, LeagueDetail 8, StartLeagueModal 4, CreateLeagueModal 4); plus `pnpm exec vitest run app/leagues` → 3 passed (2 files).

**Local E2E (`AUTH_MODE=local pnpm exec playwright test`)**: 21 passed (exit 0).

**Auth E2E (`pnpm run test:e2e:auth` — real Postgres, `playwright.config.auth.ts`)**: 7 passed (exit 0). Includes the real-Postgres owner-assign → expel journey routed through the new join UI (`e2e/leagues.spec.ts` selectors repointed to `Tu equipo`/`Apuntarse`).

**Lint (`pnpm lint`)**: 0 errors, 1 pre-existing warning (`app/providers/SessionAppProvider.tsx` — `@next/next/no-location-assign-relative-destination`; present before PR2 in the PR1 verify, not introduced by this UI slice). Exit 0.

**Build / type check (`npx tsc --noEmit`)**: exit 0, clean (no output; blank-output digest `e3b0c44…`).

**Coverage**: not detected in this repo's tooling (no vitest coverage config found); changed-file coverage analysis skipped (informational only per Strict TDD rules, not a failure).

### Spec Compliance Matrix

Authoritative counts (from the retrieved delta specs): `league-season/spec.md` = 5 requirements / 13 scenarios; `leagues/spec.md` = 6 requirements / 19 scenarios. Total **11 requirements / 32 scenarios**. PR2 is the UI slice implementing the same 32 requirements against the PR1 API; every scenario below has passing runtime evidence from the combined PR1+PR2 suites (unit + local e2e + auth e2e), with PR2's focused UI tests mapping the UI-side facets.

| Requirement | Scenario | UI evidence | Result |
|-------------|----------|-------------|--------|
| Public Open League Listing | Open leagues visible to any user | `LeagueList.tsx` "Ligas abiertas" section (foreign open by `ownerId !== userId`); API union (PR1); `LeagueList.test.tsx` partition + badges | ✅ COMPLIANT |
| Public Open League Listing | Own started league still listed | `LeagueList.tsx` "Mis Ligas" includes own started; `LeagueList.test.tsx` "Middenheim Cup" (started) under Mis Ligas + "Iniciada" badge | ✅ COMPLIANT |
| Public Open League Listing | Foreign started league hidden | server hides (PR1 list route); list sets = open + own only; `LeagueList.test.tsx` N+1/partition test only receives listed leagues | ✅ COMPLIANT |
| Open League Detail Public | Foreign open league readable | `LeagueDetail.tsx` `!isMember → Unirse` join section on a foreign open league; `LeagueDetail.test.tsx` "foreign non-member of an open league (public join)" | ✅ COMPLIANT |
| Member Self-Leave | Member removes own team while open | `LeagueDetail.tsx` `isMember && !isOwner → Desapuntarse`; `LeagueDetail.test.tsx` self-leave → DELETE `/members/{own team}` | ✅ COMPLIANT |
| Team Membership Assignment | Assign own unassigned team to any open league | `LeagueDetail.tsx` join select (`listUnassignedTeams` filters `leagueId===null`) + Apuntarse POST `/teams`; `LeagueDetail.test.tsx` + `api.test.ts` assign route; e2e real-Postgres join | ✅ COMPLIANT |
| Team Membership Assignment | Assign already-member team rejected (unchanged) | server 409 (PR1); join select filters unassigned (`api.ts listUnassignedTeams`, `api.test.ts` filters to `leagueId===null`); 409 surfaced in detail | ✅ COMPLIANT |
| Team Membership Assignment | Assign foreign or archived team denied (unchanged) | server 404/409 (PR1); e2e archive guard + direct API 409 | ✅ COMPLIANT |
| Team Membership Assignment | Assign to started league rejected (unchanged) | server 409 (PR1); started detail renders jornadas only, no join form (`LeagueDetail.test.tsx` no Unirse/Expulsar/Desapuntarse) | ✅ COMPLIANT |
| Team Membership Assignment | Admin expels member while open (unchanged) | `LeagueDetail.tsx` `canExpel={isOwner}` → Expulsar per member; `LeagueDetail.test.tsx` owner case (3 Expulsar buttons); e2e real-Postgres expel | ✅ COMPLIANT |
| Team Membership Assignment | Expel non-member denied (unchanged) | server 404 (PR1); expel UI only renders for member rows | ✅ COMPLIANT |
| League Status Lifecycle | New league is open | CreateLeagueModal + POST (API) — server persists open (PR1 route test); list badge "Abierta" | ✅ COMPLIANT |
| League Status Lifecycle | Repeat start rejected | server 409 re-start (PR1 start route test); UI on success refreshes into started state | ✅ COMPLIANT |
| League Status Lifecycle | Started league delete blocked | server 409 delete-started (PR1 route test); no UI delete on started detail | ✅ COMPLIANT |
| Round-Robin Fixture Generation | Start requires at least two teams | `LeagueDetail.tsx` `disabled={memberCount < 2}` on Iniciar liga; `LeagueDetail.test.tsx` "fewer than 2 members → disabled"; server 409 (PR1) | ✅ COMPLIANT |
| Round-Robin Fixture Generation | Season length out of range | `StartLeagueModal.tsx` `valid = integer && 1..max`, blocks invalid & never POSTs; `StartLeagueModal.test.tsx` "0" and "4" (4 teams) blocked; server 400/409 (PR1) | ✅ COMPLIANT |
| Round-Robin Fixture Generation | Perfect round-robin (n=4, length 3) | `lib/roundRobin.test.ts` (PR1) exact pair set; `StartLeagueModal.test.tsx` length 3 → POST `/start` body `{seasonLength:3}` | ✅ COMPLIANT |
| Round-Robin Fixture Generation | Partial season (n=4, length 2) | `lib/roundRobin.test.ts` (PR1) no-repeated-pair; detail fixture fixture 2 rounds (startedLeague test fixture len 2) | ✅ COMPLIANT |
| Round-Robin Fixture Generation | Deterministic per seed | `lib/roundRobin.test.ts` (PR1) deterministic; UI consumes server-generated fixtures | ✅ COMPLIANT |
| Jornadas View | Started league returns fixtures | `LeagueDetail.tsx` `Jornadas` groups `league.fixtures` by round, sorted, home vs away labeled; `LeagueDetail.test.tsx` "renders jornadas grouped by round as Home vs Away" (Jornada 1/2, 2 "vs" separators, round 1 pairs) | ✅ COMPLIANT |
| Jornadas View | Open league has no fixtures | server returns `[]` when open (PR1); open detail renders member list not Jornadas | ✅ COMPLIANT |
| Started League Locks Membership | Start prevents join | server 409 (PR1); started detail renders only Jornadas, join form absent (test asserts no Unirse) | ✅ COMPLIANT |
| Started League Locks Membership | Start prevents leave and expel | server 409 (PR1); started detail renders no Desapuntarse/Expulsar (`LeagueDetail.test.tsx` asserts absent) | ✅ COMPLIANT |
| Started League Detail Visibility | Foreign non-member on started league hidden | `useLeagueDetail.ts` sets `notFound` on 404; `LeagueDetail.tsx` renders "Liga no encontrada o sin acceso."; `LeagueDetail.test.tsx` 404 not-found case; server 404 (PR1) | ✅ COMPLIANT |
| League Model | League persisted (unchanged) | API CreateLeagueModal POST consume `League` (PR1 create route); schema + fixture model (PR1) | ✅ COMPLIANT |
| League Model | Duplicate league name rejected (unchanged) | server 409 (PR1 route test); surfaced as request error | ✅ COMPLIANT |
| League Model | Open league delete clears members (unchanged) | server SetNull delete (PR1) | ✅ COMPLIANT |
| League Model | Started league delete blocked | server 409 (PR1) | ✅ COMPLIANT |
| League User-Scoped API | Unauthenticated API call (unchanged) | server 401 (PR1 route tests) | ✅ COMPLIANT |
| League User-Scoped API | List own plus open leagues | `useLeagues.ts` single `listLeagues()` fetch; server union + `_count` (PR1); `LeagueList.test.tsx` partition live | ✅ COMPLIANT |
| League User-Scoped API | Foreign member started detail allowed | server isMember branch 200 (PR1 route test); `LeagueDetail.test.tsx` startedLeague member fixture renders jornadas | ✅ COMPLIANT |
| League User-Scoped API | League detail with members | `LeagueDetail.tsx` member list (non-archived team rows); e2e member listed | ✅ COMPLIANT |

**Compliance summary**: 32/32 scenarios compliant (all 11 requirements covered) with passing runtime evidence from 612 unit + 21 local e2e + 7 auth e2e, plus the PR2-focused UI tests.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| List consumes server memberCount (no N+1) | ✅ Implemented | `useLeagues.ts` single `/api/leagues` fetch; `League` includes `ownerName` + `memberCount`; `LeagueList.test.tsx` asserts EVERY fetch is `/api/leagues` (no per-card detail) |
| Role-aware detail (owner vs member vs foreign) | ✅ Implemented | `isOwner`/`userMemberTeam`/`isMember` from session id; open→owner gets expel+start, member gets Desapuntarse, foreign non-member gets Unirse; started→Jornadas only |
| Owner joins own league to enable a season | ✅ Implemented (documented deviation) | owner open + not-yet-member → same Unirse select; once member, join hides, expel+start remain; enables ≥2-member start (see Coherence) |
| Start modal validation 1..n−1 | ✅ Implemented | `StartLeagueModal.tsx` integer window `1..teamCount-1`, invalid blocked (no POST), hint "Máximo {n-1} jornadas", POST `/start` then close+refresh |
| Jornadas (rounds) render | ✅ Implemented | `Jornadas` groups fixtures by round (sorted), home name "vs" away name, `aria-label="Jornada {n}"`; empty round guard |
| Session identity source | ✅ Implemented | `useSession().user.id` for owner/member/foreign (client session id via auth JWT callback); tests mock `next-auth/react` |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Server-side `_count` (no per-league N+1) consumed in UI | ✅ Yes | `useLeagues` single fetch + server `memberCount`; confirmed in source + no-N+1 test |
| List dual sections (Mis Ligas + Ligas abiertas) | ✅ Yes | `LeagueList.tsx` partitions by owner id; foreign OPEN only in open section |
| Role-aware detail (open→join, member→leave, owner→start/expel, started→jornadas) | ✅ Yes | `LeagueDetail.tsx` matches design; started branch hides all controls |
| Start modal seasonLength bound to teams−1 | ✅ Yes | exact window validation + hint |
| Jornadas render grouped by round as home vs away | ✅ Yes | `Jornadas` component |
| Design deviation: owner joins own league via public Unirse select | ⚠️ WARNING | Documented in apply-progress; without it a single-owner league could never reach ≥2 members to start. Does not break any spec scenario (spec allows owner to add their own team; test "foreign non-member of open" covers the join UI, owner case shares the same form). |
| Design deviation: session id via `useSession()` | ✅ Yes (justified) | Client session carries `user.id`; documented; consistent with existing app/login patterns |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | TDD Cycle Evidence table present in apply-progress.md |
| All tasks have tests | ✅ | 9/9 PR2 tasks map to 4 test files: `api.test.ts` (6), `LeagueList.test.tsx` (6), `LeagueDetail.test.tsx` (8), `StartLeagueModal.test.tsx` (4) — all exist and pass |
| RED confirmed (tests exist) | ✅ | 4/4 test files verified present; RED reported as absent-feature/not-a-function (plausible: new UI elements + new helpers) |
| GREEN confirmed (tests pass) | ✅ | Focused run 28/28 pass; full 612/612 pass; page tests 3/3 |
| Triangulation adequate | ✅ | Distinct values asserted: badges (Abierta/Iniciada), counts (1/2/3/5 equipos), role partitions (own vs foreign), validation (0/4 blocked, 3 accepted), jornadas grouping (round 1 vs 2 pairings) |
| Safety Net for modified files | ✅ | Component files (LeagueList/LeagueDetail/useLeagueDetail/api/useLeagues modified) — baseline 597 cited; StartLeagueModal marked "N/A (new)" and confirmed new file. Safety net coverage reported for modified files. |

**TDD Compliance**: 6/6 checks passed.

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit/Component | 612 | 49 | vitest + @testing-library/react |
| E2E local | 21 | 5 | playwright (AUTH_MODE=local) |
| E2E auth (real Postgres) | 7 | 4 | playwright (config playwright.config.auth.ts) |

**Total**: 640 passing across unit + e2e layers. PR2 UI tests are component-layer (render + user behavior + route wiring); full new user-journey e2e (join→start→locks→404) is deferred to PR3 per the chained scope.

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected in this repo's tooling (no vitest coverage config). Informational only, per Strict TDD rules.

### Assertion Quality
All PR2 test files assert real behavior and were audited (Step 5f):

- `api.test.ts` (6): asserts exact fetch route + payload for `startLeague` (POST `/start`) and `selfLeave` (DELETE `/members/{team}`); `listUnassignedTeams` filters to `leagueId===null`; a league never POSTs without a real start body.
- `LeagueList.test.tsx` (6): asserts both sections via heading levels, correct partition (own vs foreign open), Abierta/Iniciada badges, server `ownerName`/`memberCount`, and the **no-N+1** guarantee (every fetch is `/api/leagues`) — direct evidence for the scope requirement. Empty-state CTA and create-modal open also covered.
- `LeagueDetail.test.tsx` (8): asserts role+status render AND exact route wiring for join (`POST /teams {teamId}`), self-leave (`DELETE /members/{ownTeam}`) and start (`POST /start {seasonLength}`); "Iniciar liga" disabled at <2 members; started jornadas grouping (Jornada 1/2, 2 "vs", round-1 pairing) and absence of join/leave/expel; 404 not-found for foreign started.
- `StartLeagueModal.test.tsx` (4): window-validates out-of-range 0 and 4 (4 teams) blocked with no start; valid 3 POSTs `{seasonLength:3}` and closes/refreshes; hint "Máximo {5}" for 6 teams; null when closed.
- No tautologies, ghost loops, smoke-only assertions, or CSS-class coupling found. Mock/assertion balance is behavioral (route/payload wiring), and the N+1 test is a dedicated non-empty check.

**Assertion quality**: ✅ All assertions verify real behavior.

### Quality Metrics
**Linter**: ✅ 0 errors, 1 pre-existing warning (`SessionAppProvider.tsx`, present before PR2)
**Type Checker**: ✅ No errors (`npx tsc --noEmit` exit 0)

### Issues Found
**CRITICAL**: None
**WARNING**:
- Design deviation: the owner joins their own open league via the shared public "Unirse" select (so a single-owner league can reach ≥2 members to start), rather than a distinct owner-only render path. Documented in apply-progress; coherent and does not break any spec scenario.
- Session identity via `useSession().user.id` on client: correct and consistent with existing patterns, but the role-aware partition depends on the client session carrying `id` (via auth JWT callback), not just `email`. Component tests mock this; real auth e2e exercises it indirectly. Non-blocking.
- Auth E2E (`playwright.config.auth.ts`) is bootstrap-fragile (webServer boots `next dev` + `migrate deploy` on a fixed poll; cold-start race previously caused ERR_CONNECTION_REFUSED). Canonical run now 7/7 green. Non-blocking operational note (carried from PR1).
- PR3 full e2e journeys (join→start→locks→foreign 404) and polish remain out of scope for this slice by design — not a defect.

**SUGGESTION**: `StartLeagueModal` clamps `max = Math.max(teamCount - 1, 1)`; the detail already disables "Iniciar liga" below 2 members, so the modal's clamp is defensive only. Consider also disabling the modal's submit when `teamCount < 2` for belt-and-suspenders. Non-blocking.

### Verdict
**PASS WITH WARNINGS** — all 9 PR2 tasks complete; all 32 scenarios / 11 requirements compliant with passing runtime evidence (612 unit + 21 local e2e + 7 auth e2e + 28 focused UI tests), lint clean (1 pre-existing warning), tsc clean. The six requested verifications confirmed: list has no per-card detail fetches (N+1 eliminated, asserted in test), role-aware detail logic (owner/member/foreign), start-modal 1..n−1 validation, and jornadas home-vs-away render. Warnings are non-blocking implementation notes/deviations; no CRITICAL findings, 0 blockers.
