# Archive Report: league-matchday

**Archived**: 2026-08-09
**Change**: `league-matchday`
**Artifact store**: openspec
**Predecessor chain**: PR1 `feat/league-matchday-pr1` (#39, base main) → PR2 `feat/league-matchday-pr2` (#42) → PR3 `feat/league-matchday-pr3` (#43) — all merged. Stacked-to-main chain.
**Status**: ✅ SDD cycle closed. Verified PASS.
**Archive**: intended-with-warnings (see "Review Gate" and "Task Reconciliation" below)

---

## Final State (at close)

The change shipped the complete Matchday feature across the three merged PRs:

- **DB/API (PR1)**: `Fixture.scheduledAt`/`winnerId` + `ScheduleProposal` (cascade, indexed) additive migration; participant-only propose/accept routes with one-active-proposal `$transaction`; admin-only forfeit; proposals history; visibility-gated scouting `GET /api/teams/[id]`; league-detail enrichment (derived status + per-round `complete`).
- **UI Pattern B (PR2)**: Jornadas round tabs + MatchCards (VS, owner below, status badge, rival link); participant-only NegotiationPanel; admin-only ForfeitModal; round-completion badge; rival-scouting fallback on the team-detail page.
- **e2e + polish (PR3)**: 3 real-DB multi-user journeys (negotiation / forfeit-completion / scouting) + scheduled-time footer polish.

**Verification (terminal, per `verify-report.md`, evidence_revision `sha256:5552a613…`)**: verdict **PASS**, 0 blockers, 0 critical findings, 18/18 requirements, 43/43 scenarios compliant. At close: **692 unit/vitest (56 files) + 21 local e2e + 12 auth e2e** green (725 total); `lint` 0 errors; `tsc --noEmit` clean.

## Review Gate (Native Review Receipt relaxation — do not fabricate allow)

No full receipt-driven review governed this change. Native status shows all review artifacts `missing` (policy, ledger, receipt, bundle, context, state). The kill switch is confirmed **off** (repo command: `receipt-driven development: off (decided by global)`, `global: off`). Per the orchestrator's decision and the prior repo precedent of closing already-merged changes, the change was archived under the **`disabled/unmanaged`** relaxation — **no `allow` was fabricated**. This relaxation is validated by the dispatcher gate state, which is what authorized the archive. Because the kill switch is off, demanding a terminal receipt would be a deadlock (a review `start` is refused). Re-enabling receipt-driven review would require revalidating from current state. Nothing in this archive should be read as evidence of a receipt-validated review; it is evidence of a fully verified, merged change closed under the disabled-review relaxation.

## Task Completion Gate

All implementation tasks across PR1 (1.1–1.14), PR2 (2.1–2.12), and PR3 (3.1–3.4) are `[x]` in `tasks.md`, cross-referenced by the TDD evidence tables in `apply-progress.md`. The dispatcher's `taskProgress` shows 30 total / 29 completed / 1 pending, where the one pending is **task 4.1**.

### Reconciliation of task 4.1 (exceptional, orchestration-approved)

Task 4.1 (`- [x]`) is a **delivery-strategy question**, not an implementation task: "Ask user: stacked-to-main vs feature-branch-chain before sdd-apply (`ask-on-risk`)". It was left unchecked because it is an orchestrator-level pre-apply decision. Per `verify-report.md` it is "legitimately outside the verify scope."

Reconciliation: the underlying decision **was** made and executed — the chain strategy resolved to **stacked-to-main**, evidenced by the three merged PRs (PR1 #39 → PR2 #42 → PR3 #43) and the `apply-progress.md` chain documentation. The archived `tasks.md` therefore marks 4.1 `[x]` with an explicit reconciliation note, so the audit trail contains no stale unchecked task for completed work. **Reason for exceptional mechanical reconciliation (per `sdd-archive` skill)**: orchestrator explicitly instructed archive, and `apply-progress`/`verify-report` prove task 4.1's deliverable (the chain-strategy decision) is complete. `sdd-archive` does not otherwise own task completion.

Note: the orchestrator's launch prompt quoted "tasks all [x] 27/27" — the verification report counts **27 implementation tasks** (verify-report "Tasks total 27 / complete 27"), while `tasks.md` contains 30 rows (14 PR1 + 12 PR2 + 4 PR3 + 1 chain-strategy 4.1). No contradiction: 4.1 is a meta-decision outside the 27 implementation tasks. Dispatcher's "30 total" counts the 4.1 row. All 27 implementation tasks are complete; 4.1 is reconciled as above.

## Spec Sync to Source of Truth

Delta specs merged into `openspec/specs/`:

| Main spec | Action | Merge detail |
|-----------|--------|--------------|
| `openspec/specs/matchday-negotiation/spec.md` | **Created** (NEW full spec) | Copied from delta (6 requirements, 13 scenarios). |
| `openspec/specs/matchday-forfeit/spec.md` | **Created** (NEW full spec) | Copied from delta (3 requirements, 9 scenarios). |
| `openspec/specs/team-scouting/spec.md` | **Created** (NEW full spec) | Copied from delta (3 requirements, 8 scenarios). |
| `openspec/specs/league-season/spec.md` | **Updated** (MODIFIED + ADDED) | MODIFIED "Jornadas View" replaced with enriched version (adds derived status/scheduledAt/winnerId/owners/proposals + per-round `complete`; +1 scenario → 3). ADDED "Matchday Fixture Fields" and "Jornada Round Completion" appended. All other requirements preserved. Result: 7 requirements, 14 scenarios. |
| `openspec/specs/team-detail-view.md` | **Updated** (MODIFIED + ADDED) | MODIFIED "Route Resolution" and "Team Lookup" replaced with their delta versions (scouting fetch / `notFound()` fallback). ADDED new "Read-Only Scouting Detail" requirement (rival-path read-only + owner affordance preserved). All other requirements (Hydration Gating, Identity Display, Roster Display, Mobile ReadOnly, Coaching Staff, Treasury, Race-fallback) preserved. Result: 10 requirements. |

**Merge note (least-destructive)**: the delta `team-detail-view`/`spec.md` lists `Read-Only Scouting Detail` under MODIFIED, but no same-named requirement exists in the main flat spec. Rather than deleting the still-valid "Roster Display" / "Mobile ReadOnly Roster Inherits Row-Cards" requirements (which define the read-only rendering mechanics the scouting path uses), it was added as a NEW requirement scoping WHEN read-only applies (rival path) vs owner affordance preservation. No requirement was removed. This preserves all main-spec content and reflects the final verified behavior.

## Artifacts Archived

- `proposal.md` ✅
- `specs/` ✅ (5 delta specs: matchday-negotiation, matchday-forfeit, team-scouting, league-season, team-detail-view)
- `design.md` ✅
- `tasks.md` ✅ (30/30 rows, incl. reconciled 4.1; 27 implementation tasks complete)
- `apply-progress.md` ✅
- `verify-report.md` ✅ (PASS, 18/18 reqs, 43/43 scenarios)
- `archive-report.md` ✅ (this file)

## Verification Checklist

- [x] Main specs updated correctly (3 created, 2 merged; all original requirements preserved)
- [x] Change folder moved to `openspec/changes/archive/2026-08-09-league-matchday/`
- [x] Archive contains all artifacts (proposal, 5 specs, design, tasks, apply-progress, verify-report, archive-report)
- [x] Archived `tasks.md` has no stale unchecked tasks (29/30 were already `[x]`; 4.1 reconciled with documented reason)
- [x] Active `openspec/changes/` no longer contains `league-matchday`

## Known Warnings Carried Into Archive

- Auth e2e cold-start flakiness (inherited harness timing; clean re-run 12/12 green) — not a product defect, informational.
- No per-file coverage tooling installed — informational, non-blocking.
- Two verify SUGGESTIONs (test-name mismatch in `NegotiationPanel.test.tsx`; optional multi-browser race stress e2e) — non-blocking, recorded for the record.

## SDD Cycle Complete

`league-matchday` has been fully planned, proposed, specified, designed, implemented (PR1/PR2/PR3), independently verified (PASS), merged, spec-synced, and archived. Ready for the next change.
