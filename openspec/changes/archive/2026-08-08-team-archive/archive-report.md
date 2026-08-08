# Archive Report — team-archive

**Change**: team-archive
**Closed**: 2026-08-08
**Status**: ✅ PASS — SDD cycle complete (receipt-driven review disabled by explicit maintainer decision)
**Artifact store**: openspec (filesystem)

---

## 1. Change Summary

| Field | Value |
|-------|-------|
| Change name | `team-archive` |
| Goal | Soft delete (archive) for teams: add nullable `archivedAt` to the Prisma `Team` model, convert `DELETE /api/teams/[id]` to archive (`update({ archivedAt })` → 204) instead of hard-delete, filter `GET /api/teams` to non-archived rows, and add per-card delete controls on the home list with a rulebook-styled Spanish confirmation modal |
| Branch | `main` — merged via PR #28 |
| PR merge | #28 |
| Verify verdict | ✅ PASS (0 CRITICAL, 0 BLOCKER) |
| Requirements | 7/7 delta+future requirements compliant |
| Scenarios | 14/14 compliant |
| Unit tests | 522/522 passed |
| Local E2E tests | 21/21 passed |
| Real-DB E2E tests | 3/3 passed (`test:e2e:auth` — auth/migration/isolation) |
| Build / Type-check | ✅ (`npx tsc --noEmit` exit 0) |
| Lint | ✅ (`pnpm lint` exit 0) |
| Scope shipped | `archivedAt DateTime?` column + migration; `DELETE /api/teams/[id]` → soft-delete archive 204; `GET /api/teams` `where archivedAt: null`; `TeamList` per-card delete `<button aria-label="Delete {name}">`; `TeamDeleteModal` (scrim + panel, `role="dialog"`, `aria-modal`, Spanish irreversible copy, Cancelar/Eliminar); delete-flow list refresh without reload |

---

## 2. SDD Cycle Trace

| Phase | Artifact | Date | Status |
|-------|----------|------|--------|
| Propose | `openspec/changes/team-archive/proposal.md` | 2026-08-08 | ✅ |
| Spec | `openspec/changes/team-archive/specs/` (2 delta files) | 2026-08-08 | ✅ |
| Design | `openspec/changes/team-archive/design.md` | 2026-08-08 | ✅ |
| Tasks | `openspec/changes/team-archive/tasks.md` | 2026-08-08 | ✅ 12/12 |
| Apply | `openspec/changes/team-archive/apply-progress.md` | 2026-08-08 | ✅ |
| Verify | `openspec/changes/team-archive/verify-report.md` | 2026-08-08 | ✅ PASS |
| Archive | `openspec/changes/archive/2026-08-08-team-archive/archive-report.md` (this file) | 2026-08-08 | ✅ |

Note: this change produced no `state.yaml` (consistent with the repo's concise single-cycle change pattern). The folder ships proposal, specs, design, tasks, apply-progress, verify-report, archive-report.

---

## 3. Artifacts Inventory

### Filesystem (openspec/archive)

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `openspec/changes/archive/2026-08-08-team-archive/proposal.md` | ✅ |
| Spec delta — team-list | `openspec/changes/archive/2026-08-08-team-archive/specs/team-list/spec.md` | ✅ |
| Spec delta — team-persistence | `openspec/changes/archive/2026-08-08-team-archive/specs/team-persistence/spec.md` | ✅ |
| Design | `openspec/changes/archive/2026-08-08-team-archive/design.md` | ✅ |
| Apply progress | `openspec/changes/archive/2026-08-08-team-archive/apply-progress.md` | ✅ |
| Tasks | `openspec/changes/archive/2026-08-08-team-archive/tasks.md` | ✅ 12/12 |
| Verify report | `openspec/changes/archive/2026-08-08-team-archive/verify-report.md` | ✅ |
| Archive report | `openspec/changes/archive/2026-08-08-team-archive/archive-report.md` | ✅ (this file) |

### Main Specs Synced

| Spec | Path | Action |
|------|------|--------|
| team-persistence | `openspec/specs/team-persistence/spec.md` | **Updated** — 2 MODIFIED (Persistent Schema, User-Scoped Team API) + 1 ADDED (Archived Team Table State) + Future Invariant (League-Active Teams Not Archivable) appended; 3 preserved |
| team-list | `openspec/specs/team-list.md` | **Updated** — 3 ADDED (Per-Card Delete Control, Confirmation Modal, Delete Flow List Refresh); 5 preserved |

---

## 4. Spec Sync Details

### team-persistence → `openspec/specs/team-persistence/spec.md`

Existing main spec (from the auth-backend archive) had 5 requirements: Persistent Schema, User-Scoped Team API, ApiTeamStore Contract, Existing Store Interface Preserved, localStorage Migration.

- **MODIFIED `Persistent Schema`** — Team model gains a nullable `archivedAt DateTime?`; existing rows and writes gain `archivedAt: null` default; no gameplay column is lost. Carries `(Previously: …)` note. Scenario "Team persisted to DB" updated to include `archivedAt: null`; adds scenario "Archived team still persisted".
- **MODIFIED `User-Scoped Team API`** — `DELETE` now archives (`set archivedAt = now()`) instead of hard-deleting; `GET /api/teams` lists only non-archived (`archivedAt: null`) teams; a foreign or already-inactive team id still returns 404 with no mutation. Carries `(Previously: …)` note. Adds scenarios "List only own non-archived teams", "Archive is a soft delete", "Archived detail is not found"; preserves "Unauthenticated API call" and "Foreign team denied".
- **ADDED `Archived Team Table State`** — persisted nullable `archivedAt`, `null` while active, set on archive; archived teams remain stored (soft delete) and recoverable by clearing `archivedAt`. 1 scenario ("Archive flag stored").
- **Future Invariant (deferred, leagues)** — new subsection carrying **`League-Active Teams Not Archivable`**: once leagues exist, a team in an active league MUST NOT be archivable (expel first), and may be archived only after the league ends. Recorded but NOT implemented in this change because no league code exists; enforcement lands with the league feature. **This is the league-invariant note** explicitly called out by the orchestrator.
- Preserved unchanged (not in the delta): `ApiTeamStore Contract`, `Existing Store Interface Preserved`, `localStorage Migration`.

### team-list → `openspec/specs/team-list.md`

Existing main spec had 5 requirements: Detail Navigation Link, Preserved List Behavior, Home Heading with Create Action, Empty States, Rulebook Card Presentation.

- **ADDED `Per-Card Delete Control`** — each card renders a visible `<button aria-label="Delete {team.name}">` that does not collide with the card `<Link>` body, keyboard-focusable, must not trigger card navigation. 2 scenarios ("Delete button present per card", "Delete does not navigate").
- **ADDED `Confirmation Modal`** — rulebook-styled modal (scrim + white panel), `role="dialog"`, `aria-modal="true"`, focusable buttons, exact Spanish irreversible copy, "Cancelar" (closes) / "Eliminar" (destructive red, confirms). Exactly one modal instance controlled by list state. 3 scenarios ("Modal opens on delete", "Cancelar keeps the team", "Eliminar removes the team").
- **ADDED `Delete Flow List Refresh`** — after confirmed delete, the list reflects the removed team without a full page reload regardless of store. 1 scenario ("List refreshes after confirm").
- Preserved unchanged: Detail Navigation Link, Preserved List Behavior, Home Heading with Create Action, Empty States, Rulebook Card Presentation.

---

## 5. Task Completion Gate

All **12** implementation + verification-phase tasks (Phases 1–3 implementation, Phase 4 verification handled by the verify run) were checked `[x]` in the persisted `tasks.md` with **0 unchecked** boxes at archive time. The dispatcher (`gentle-ai sdd-status --json`) reports `taskProgress 12/12 allComplete`. The archived `tasks.md` reflects the final completed state; no exceptional stale-checkbox reconciliation was required.

Note: `verify-report.md`'s internal "Completeness" header says "Tasks total 9" — that count covers only the implementation-phase tasks the verify author enumerated, not the full persisted task list. The persisted `tasks.md` (12/12) and the dispatcher's `12/12 allComplete` are authoritative for completion visibility (per the Final-State Authority hierarchy, the persisted tasks artifact outranks the verify snapshot's internal count).

---

## 6. Final Harness Results

Source: `verify-report.md` (persisted verification artifact, strict `gentle-ai.verify-result/v1` envelope `evidence_revision sha256:97537c0e7bd5ab3735b84ee7e011790a1d8a88397325e277d34b5f3f52f15c10`) + the orchestrator's launch-prompt final-state handoff (most recent authoritative account — change merged to `main` via PR #28).

- **Verify verdict**: `verdict: pass`, `blockers: 0`, `critical_findings: 0`
- **Requirements**: 7/7 compliant (R1–R7 per compliance matrix; R7 is the deferred league invariant, recorded not implemented)
- **Scenarios**: 14/14 compliant
- **Unit**: `pnpm test` → 522 passed, 0 failed (exit 0)
- **Local E2E**: 21 passed (`AUTH_MODE=local pnpm exec playwright test`), including `delete-team.spec.ts` (2 scenarios)
- **Real-DB E2E**: 3 passed (`pnpm run test:e2e:auth` — Docker Postgres healthy; auth/migration/isolation; isolation proves foreign-delete→404 on real Postgres)
- **Build / Type-check**: exit 0 (`npx tsc --noEmit`)
- **Lint**: exit 0 (`pnpm lint`)
- **TDD**: strict (test runner `pnpm test`), 6/6 TDD compliance checks passed
- **Issues**: 0 CRITICAL, 0 WARNING, 2 SUGGESTION (real-Postgres archive-mutation assertion and modal focus-trap/Escape — both informational, not spec gaps)

The verify-report itself documents a deliberate layer-depth choice: R1 "Archive flag stored" and R2 "Archived team still persisted" are proven at the mock-unit layer (R2's row-retention via `update` not `delete`), and the real-DB isolation suite proves foreign-delete→404 and full persistence. These are recorded as accepted, not failures, and I carry them accurately rather than as blockers.

---

## 7. Native Review Receipt Gate & Final-State Facts

The dispatcher (`gentle-ai sdd-status --json --instructions`) reported `reviewGate.result: invalidated` with `dependencies.archive: blocked`, `nextRecommended: resolve-review`, and **no review receipt/ledger/policy/state artifacts present** (`artifactPaths.review*: []`, no `reviews/` directory in the change folder). A terminal review receipt was not producible because the user explicitly disabled receipt-driven review for this already-merged change (repo precedent, twice before): `gentle-ai review mode disable` → global off. Verified at archive time: `gentle-ai review mode status` → `receipt-driven development: off (decided by global)`, `global: off`, `clone-local: unset`.

Per the skill's Native Review Receipt Gate, with the kill switch off and no review governing this change, `reviewGate.delivery` is in the `disabled/unmanaged` relaxation: demanding a terminal receipt here would demand one that `review start` is refused from producing — a deadlock, not a safeguard. There are no explicit review artifacts (receipt/ledger) that failed validation; the dispatcher's `invalidated` reflects the absence of a valid receipt under the disabled regime, not a rejected review artifact. The gate therefore proceeds under the `disabled/unmanaged` relaxation (orchestrator-confirmed explicit maintainer decision, consistent with the prior precedents archived in `2026-08-07-mobile-tables-refinement` and `2026-08-08-auth-backend`). No fabrication of `allow` occurred.

---

## 8. Commit History

PR #28 merged to `main`. The orchestrator owns all commits; this archive phase made no commits. At archive close the change only added documentation/artifact renames (main spec merges and the change folder move to `archive/2026-08-08-team-archive/`) pending the orchestrator's commit.

---

## 9. Delivery Notes

- Implementation merged to `main` via PR #28.
- Git working tree at archive close: `openspec/changes/team-archive/` deleted (moved to archive), `openspec/specs/team-list.md` + `openspec/specs/team-persistence/spec.md` modified, `openspec/changes/archive/2026-08-08-team-archive/` new. Commits are owned by the orchestrator.
- Rollback: revert PR #28. Rows already soft-deleted are recovered by `UPDATE teams SET "archivedAt" = NULL WHERE ...` — no data is lost (soft delete retained rows by design).
- Archive folder naming follows repo precedent (`YYYY-MM-DD-{change-name}`).

---

## 10. Non-Blocking Notes & Risks

- **Receipt-driven review globally disabled** (explicit maintainer decision) to close this already-merged change; the `disabled/unmanaged` relaxation applied. Re-enabling review revalidates from current state; no `allow` was manufactured.
- **League-aware archive is deferred**: the `League-Active Teams Not Archivable` invariant is recorded in the main spec but NOT enforced — no league code exists yet. When the league feature lands, that guard MUST be implemented; the archive report records the invariant so it is not lost.
- **Soft-delete is recoverable**: archiving only sets `archivedAt`; rows remain in PostgreSQL. There is no admin UI in this change to un-archive; recovery is a direct DB update. This is scope-by-design, not a defect.
- **Real-Postgres archive mutation not directly asserted** (per verify SUGGESTION): covered at the mock-unit layer. Informational.
- No `openspec/config.yaml` exists in this repo, so no `rules.archive` constraints applied; the merge and archive-move followed the existing repo archive precedent.
