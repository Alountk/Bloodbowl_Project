# Archive Report — auth-backend

**Change**: auth-backend
**Closed**: 2026-08-08
**Status**: ✅ PASS — SDD cycle complete (receipt-driven review disabled by explicit maintainer decision)
**Artifact store**: openspec (filesystem)

---

## 1. Change Summary

| Field | Value |
|-------|-------|
| Change name | `auth-backend` |
| Goal | Add email + password authentication (Auth.js v5 Credentials + JWT), per-user team persistence in PostgreSQL via Prisma, session-gated shell/route protection, and a one-time localStorage→DB team migration supporting the existing `TeamStore` contract |
| Branch | `feat/auth-backend-pr3` |
| PR merge | #22 (PR1 DB) + #25 (PR2 auth/persistence) + #26 (PR3 migration/e2e/ops, `7979be1`) chained 3-PR delivery to `main` |
| Verify verdict | ✅ PASS (0 CRITICAL, 0 BLOCKER) |
| Requirements | 16/16 delta requirements compliant |
| Scenarios | 36/36 compliant |
| Unit tests | 512/512 passed |
| E2E tests | 19 local + 3 real-DB = 22 passed |
| Build / Type-check | ✅ (`pnpm build` exit 0, Next.js 16.3.0 Turbopack) |
| Lint | ✅ |
| Scope shipped | User + Team Prisma schema/PostgreSQL; Auth.js v5 Credentials signup/login/logout with JWT session; Next 16 `proxy.ts` route protection; `SessionProvider` shell gating + Topbar logout; user-scoped `/api/teams` routes (GET/POST/DELETE); `ApiTeamStore` implementing `TeamStore`; one-time `bb_teams_v1` localStorage migration (idempotent, rollback-safe) |

---

## 2. SDD Cycle Trace

| Phase | Artifact | Date | Status |
|-------|----------|------|--------|
| Propose | `openspec/changes/auth-backend/proposal.md` | 2026-08-07/08 | ✅ |
| Spec | `openspec/changes/auth-backend/specs/` (5 delta files) | 2026-08-07/08 | ✅ |
| Design | `openspec/changes/auth-backend/design.md` | 2026-08-07/08 | ✅ |
| Tasks | `openspec/changes/auth-backend/tasks.md` | 2026-08-08 | ✅ 27/27 |
| Apply | `openspec/changes/auth-backend/apply-progress.md` | 2026-08-08 | ✅ |
| Verify | `openspec/changes/auth-backend/verify-report.md` | 2026-08-08 | ✅ PASS |
| Archive | `openspec/changes/archive/2026-08-08-auth-backend/archive-report.md` (this file) | 2026-08-08 | ✅ |

Note: this change produced no `state.yaml` (consistent with the repo's concise single-cycle change pattern). The folder ships proposal, specs, design, tasks, apply-progress, verify-report, archive-report.

---

## 3. Artifacts Inventory

### Filesystem (openspec/)

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `openspec/changes/archive/2026-08-08-auth-backend/proposal.md` | ✅ |
| Spec delta — user-auth | `openspec/changes/archive/2026-08-08-auth-backend/specs/user-auth/spec.md` | ✅ |
| Spec delta — team-persistence | `openspec/changes/archive/2026-08-08-auth-backend/specs/team-persistence/spec.md` | ✅ |
| Spec delta — app-shell | `openspec/changes/archive/2026-08-08-auth-backend/specs/app-shell/spec.md` | ✅ |
| Spec delta — team-list | `openspec/changes/archive/2026-08-08-auth-backend/specs/team-list/spec.md` | ✅ |
| Spec delta — create-team | `openspec/changes/archive/2026-08-08-auth-backend/specs/create-team/spec.md` | ✅ |
| Design | `openspec/changes/archive/2026-08-08-auth-backend/design.md` | ✅ |
| Apply progress | `openspec/changes/archive/2026-08-08-auth-backend/apply-progress.md` | ✅ |
| Tasks | `openspec/changes/archive/2026-08-08-auth-backend/tasks.md` | ✅ |
| Verify report | `openspec/changes/archive/2026-08-08-auth-backend/verify-report.md` | ✅ |
| Archive report | `openspec/changes/archive/2026-08-08-auth-backend/archive-report.md` | ✅ (this file) |

### Main Specs Synced

| Spec | Path | Action |
|------|------|--------|
| user-auth | `openspec/specs/user-auth/spec.md` | **Created (NEW capability)** — full spec copied: Registration, Login and Logout, Route Protection, Session Context; 4 requirements / 9 deltas |
| team-persistence | `openspec/specs/team-persistence/spec.md` | **Created (NEW capability)** — full spec copied: Persistent Schema, User-Scoped Team API, ApiTeamStore Contract, Existing Store Interface Preserved, localStorage Migration; 5 requirements / 11 scenarios |
| app-shell | `openspec/specs/app-shell/spec.md` | **Updated** — 2 ADDED (Authenticated Shell Gate, Logout Control) + 1 MODIFIED (Topbar with Route-Conditional Search → adds logggout control); 4 preserved |
| team-list | `openspec/specs/team-list.md` | **Updated** — 1 MODIFIED (Preserved List Behavior → adds user scoping + "Only own teams listed" scenario); Detail Navigation Link and Empty States restated in delta unchanged; 2 preserved |
| create-team | `openspec/specs/create-team/spec.md` | **Updated** — 1 MODIFIED (Submit Team → session-backed `ApiTeamStore` + "API failure keeps form state" scenario); 8 preserved |

---

## 4. Spec Sync Details

### user-auth → `openspec/specs/user-auth/spec.md` (NEW — full copy)

Email + password accounts via Auth.js v5 Credentials provider with JWT session strategy. 4 requirements:

- **Registration** — `/signup` open registration, bcryptjs password hashing, unique email; duplicate email fails with "An account with this email already exists". 2 scenarios.
- **Login and Logout** — `/login` authenticates against bcryptjs hash; valid credential issues JWT session (`strategy jwt`); logout clears session and redirects to `/login`. 3 scenarios.
- **Route Protection** — all routes except `/login`, `/signup`, `/api/auth` protected via Next 16 `proxy.ts` (NOT `middleware.ts`) exporting `auth as proxy`; `loggedInRedirect` prevents authenticated users from visiting auth pages. 3 scenarios.
- **Session Context** — `SessionProvider` wrapper + `useSession`; shell gates content and shows logout. 1 scenario.

### team-persistence → `openspec/specs/team-persistence/spec.md` (NEW — full copy)

Per-user persistent team storage in PostgreSQL via Prisma, backed by `ApiTeamStore` implementing the existing `TeamStore`. 5 requirements:

- **Persistent Schema** — User + Team models; Team userId FK, roster/coaching Json; cascade delete. 1 scenario.
- **User-Scoped Team API** — `/api/teams` (GET/POST) + `/api/teams/[id]` (DELETE); requires session (401), scopes to session user; foreign team id → 404. 3 scenarios.
- **ApiTeamStore Contract** — implements list/save/remove via API; list oldest-first; save upserts via POST; remove idempotent (404 → no-op). 3 scenarios.
- **Existing Store Interface Preserved** — `TeamStore` + `LocalStorageTeamStore` + `InMemoryTeamStore` intact; AppProvider swaps by session status; existing unit tests (446) continue to pass. 1 scenario.
- **localStorage Migration** — on first login/signup per browser, POSTs `bb_teams_v1` into the account, sets `bb_teams_migrated_v1`; does not clear `bb_teams_v1` (rollback); idempotent; migration failure surfaced non-blocking. 4 scenarios.

### app-shell → `openspec/specs/app-shell/spec.md`

- **ADDED `Authenticated Shell Gate`** — shell renders only inside `SessionProvider`; `unauthenticated` redirects to `/login` and shows no app content; `loading` shows a lightweight state to avoid flash of gated content. 2 scenarios.
- **ADDED `Logout Control`** — Topbar surfaces a logout control when authenticated; activating it signs out and redirects to `/login`. 1 scenario.
- **MODIFIED `Topbar with Route-Conditional Search`** — added: when authenticated, the Topbar additionally renders a logout control per the "Logout Control" requirement; the h1 MUST remain truncated so the row never overflows when the logout control is present. Carries `(Previously: …)` note. All 4 pre-existing scenarios preserved.
- Preserved unchanged: Design Tokens, Light Body Layout, Mobile Drawer Navigation, Sidebar Structure.

### team-list → `openspec/specs/team-list.md`

- **MODIFIED `Preserved List Behavior`** — the list is fed by the store; under an authenticated session the store is the user-scoped `ApiTeamStore`, so the list MUST display only the signed-in user's teams. Rendering behaviors (search, cards, navigation) remain unchanged. Carries `(Previously: …)` note. Adds scenario "Only own teams listed".
- `Detail Navigation Link` and `Empty States` are restated verbatim in the delta's `## MODIFIED Requirements`; their content is byte-identical to the existing main spec requirements, so no content change was needed (whitespace-only differences; left untouched to preserve the main spec's formatting style).
- Preserved unchanged: Home Heading with Create Action, Rulebook Card Presentation.

### create-team → `openspec/specs/create-team/spec.md`

- **MODIFIED `Submit Team`** — submission now creates the team through the session-backed store (`ApiTeamStore` when authenticated), which persists to the signed-in user's account via the `/api/teams` POST route; if the session is lost or the API returns an error, the submission MUST NOT clear the form and the error MUST be surfaced. Carries `(Previously: …)` note. Adds scenario "API failure keeps form state" (3 scenarios total).
- Preserved unchanged: Two-Step Wizard Navigation, Responsive Step 2 Hero and Panels, Step 2 Plantilla Section, Native Select Wrapper with Chevron Element, Mobile Availability Stacked Rows, Jugadores Disponibles Availability Table, Default Player Naming, Editable POSICIÓN Subtext, Coaching Staff English Labels.

---

## 5. Task Completion Gate

All 27 implementation + verification-phase tasks (Phases 1–3 implementation, Phase 4 verification 4.1/4.2) were checked `[x]` in the persisted `tasks.md` with **0 unchecked** boxes at archive time. Per `dependencies.archive`, the dispatcher reports `taskProgress 27/27 allComplete`. The archived `tasks.md` reflects the final completed state; no exceptional stale-checkbox reconciliation was required.

Note: `verify-report.md`'s internal "Tasks total 25" counts only implementation tasks (Phases 1–3); the two Phase 4 verification tasks (4.1/4.2) were executed by the verify run itself and are checked in `tasks.md`, giving 27/27 in the persisted artifact. The dispatcher's `27/27` is the authoritative tasks count.

---

## 6. Final Harness Results

Source: `verify-report.md` (persisted verification artifact, `evidence_revision sha256:6df13945…` — the change's strict `gentle-ai.verify-result/v1` envelope) + the orchestrator's launch-prompt final-state handoff (most recent authoritative account — change merged to `main` via PRs #22, #25, #26, working tree clean).

- **Verify verdict**: `verdict: pass`, `blockers: 0`, `critical_findings: 0`
- **Requirements**: 16/16 compliant
- **Scenarios**: 36/36 compliant
- **Unit**: `pnpm test` → 512 passed, 0 failed (exit 0)
- **E2E**: 19 local e2e + 3 real-DB e2e = 22 passed
- **Build**: `pnpm build` → exit 0 (Next.js 16.3.0, TypeScript 0 errors, static pages 8/8)
- **Lint**: exit 0
- **Secrets**: none committed (verified via launch prompt)
- **TDD mode**: strict (test runner `pnpm test`)

---

## 7. Native Review Receipt Gate & Final-State Facts

The dispatcher (`gentle-ai sdd-status --json --instructions`) reported `reviewGate.result: invalidated` with `dependencies.archive: blocked`, `nextRecommended: resolve-review`, and **no review receipt/ledger/policy/state artifacts present** (`artifactPaths.review*: []`, no `reviews/` directory in the change folder). A terminal review receipt was not producible because the user explicitly disabled receipt-driven review for this already-merged change: `gentle-ai review mode disable` (global scope). Verified at archive time: `gentle-ai review mode status` → `receipt-driven development: off (decided by global)`, `global: off`.

Per the skill's Native Review Receipt Gate, with the kill switch off and no review governing this change, `reviewGate.delivery` is in the `disabled/unmanaged` relaxation: demanding a terminal receipt here would demand one that `review start` is refused from producing — a deadlock, not a safeguard. There are no explicit review artifacts (receipt/ledger) that failed validation; the dispatcher's `invalidated` reflects the absence of a valid receipt under the disabled regime, not a rejected review artifact. The gate therefore proceeds under the `disabled/unmanaged` relaxation (orchestrator-confirmed explicit maintainer decision, consistent with the prior precedent archived in `2026-08-07-mobile-tables-refinement`). No fabrication of `allow` occurred.

---

## 8. Commit History

| SHA | Subject | Notes |
|-----|---------|--------|
| `7979be1` | Merge pull request #26 from Alountk/feat/auth-backend-pr3 | Merge to `main` |
| `e99b59c` | docs(auth-backend): mark final verification tasks complete | Docs — final tasks `[x]` |
| `7bd122d` | docs(auth-backend): record complete change verify PASS | Docs — verify PASS |
| `973fc12` | docs(auth-backend): record PR3 apply progress with TDD and work-unit evidence | Docs — PR3 apply |
| `ff02ede` | docs(ops): document auth_mode, postgres, prisma and e2e:auth | Docs — ops |
| `2338714` | test(e2e): add real-DB auth, migration and isolation suites | Tests — real-DB e2e |
| `52e7940` | feat(migration): re-hydrate team list after localStorage migration | Feature — migration re-hydration |
| `b3dd6fc` | fix(auth): carry user id in JWT and normalize email on login | Bugfix — JWT user id + email normalization |

PR1 (#22, DB/schema) + PR2 (#25, auth/persistence) + PR3 (#26, migration/e2e/ops) chained 3-PR delivery, all merged to `main`. Review workload: 3 PRs, each within the 400-line budget (`delivery_strategy = single-pr` per PR / chained, per the 3-PR chained delivery).

---

## 9. Delivery Notes

- Implementation merged to `main` via PRs #22, #25, #26. HEAD on `main` at archive time is `e99b59c` (docs final verification).
- Git working tree is clean at archive time; commits are owned by the orchestrator (this archive phase made no commits).
- Rollback: revert PR #26, then #25, then #22 in order (`git revert <merge-sha>` each). Introduces auth + Postgres + Prisma; requires `DATABASE_URL` env (documented in `docs/ops`). The `bb_teams_v1` localStorage key is retained by the migration (not cleared) so a rollback of the DB migration does not lose legacy local teams.

---

## 10. Non-Blocking Notes & Risks

- **Receipt-driven review globally disabled** (explicit maintainer decision) to close this already-merged change; the `disabled/unmanaged` relaxation applied. Re-enabling review revalidates from current state; no `allow` was manufactured.
- **Postgres dependency**: the app now requires a reachable PostgreSQL instance + Prisma migrations for team persistence. If DB is unavailable, `/api/teams` routes fail recoverably (per spec) and legacy localStorage teams remain readable until migration.
- **Migration is one-time per browser**: new browsers/incognito begin with the migrated account; `bb_teams_v1` is intentionally retained for rollback but no longer the source of truth post-migration.
- No `openspec/config.yaml` exists in this repo, so no `rules.archive` constraints applied; the merge and archive-move followed the existing repo archive precedent.
