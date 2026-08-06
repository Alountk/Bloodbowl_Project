# Archive Report — team-detail-view

**Change**: team-detail-view  
**Closed**: 2026-08-06  
**Status**: ✅ PASS — SDD cycle complete  
**Artifact store**: both (openspec/ + Engram)

---

## 1. Change Summary

| Field | Value |
|-------|-------|
| Change name | `team-detail-view` |
| Goal | Add a read-only team detail view accessible from the team list, displaying roster, coaching staff, and treasury |
| Base commit | `ae25b65` |
| HEAD commit | `8af5add` |
| Commits in range | 4 |
| Diffstat | 8 files changed, 481 insertions(+), 3 deletions(-) |
| Final test count | 354 / 354 |
| Lint | ✅ 0 errors, 0 warnings |
| Build | ✅ green; `/teams/[teamId]` registered as ƒ Dynamic |
| Verify verdict | PASS (0 CRITICAL, 0 WARNING, 0 SUGGESTION) |
| Branch | `main` |
| Remote push | Not yet (orchestrator handles delivery) |

---

## 2. SDD Cycle Trace

| Phase | Artifact | Date | Status |
|-------|----------|------|--------|
| Explore | — | pre-2026-08-06 | Completed (embedded in proposal) |
| Propose | `openspec/changes/team-detail-view/proposal.md` | 2026-08-06 | ✅ |
| Spec | `openspec/changes/team-detail-view/specs/` (3 files) | 2026-08-06 | ✅ |
| Design | `openspec/changes/team-detail-view/design.md` | 2026-08-06 | ✅ |
| Tasks | `openspec/changes/team-detail-view/tasks.md` | 2026-08-06 | ✅ |
| Apply | `openspec/changes/team-detail-view/apply-progress.md` | 2026-08-06 | ✅ (4 commits A–D) |
| Verify | `openspec/changes/team-detail-view/verify-report.md` | 2026-08-06 | ✅ PASS |
| Archive | `openspec/changes/team-detail-view/archive.md` (this file) | 2026-08-06 | ✅ |

---

## 3. Artifacts Inventory

### Filesystem (openspec/)

| Artifact | Path | Status |
|----------|------|--------|
| Proposal | `openspec/changes/team-detail-view/proposal.md` | ✅ |
| Spec — team-detail-view | `openspec/changes/team-detail-view/specs/team-detail-view.md` | ✅ |
| Spec — team-not-found | `openspec/changes/team-detail-view/specs/team-not-found.md` | ✅ |
| Spec delta — team-list | `openspec/changes/team-detail-view/specs/team-list.md` | ✅ |
| Design | `openspec/changes/team-detail-view/design.md` | ✅ |
| Tasks | `openspec/changes/team-detail-view/tasks.md` | ✅ |
| Apply progress | `openspec/changes/team-detail-view/apply-progress.md` | ✅ |
| Verify report | `openspec/changes/team-detail-view/verify-report.md` | ✅ |
| Archive report | `openspec/changes/team-detail-view/archive.md` | ✅ (this file) |

### Engram (both mode)

| Topic key | Content |
|-----------|---------|
| `sdd/team-detail-view/proposal` | Proposal observation |
| `sdd/team-detail-view/spec` | Spec observation |
| `sdd/team-detail-view/design` | Design observation |
| `sdd/team-detail-view/tasks` | Tasks observation |
| `sdd/team-detail-view/apply-progress` | Apply progress observation |
| `sdd/team-detail-view/verify-report` | Verify report observation |
| `sdd/team-detail-view/archive-report` | This archive report |

### Main Specs Synced

| Spec | Path | Action |
|------|------|--------|
| team-detail-view | `openspec/specs/team-detail-view.md` | Created (new capability) |
| team-not-found | `openspec/specs/team-not-found.md` | Created (new capability) |
| team-list | `openspec/specs/team-list.md` | Created (no prior main spec existed) |

---

## 4. Commits

| # | SHA | Subject | Notes |
|---|-----|---------|-------|
| A | `04d1cb6` | feat(teams): link team cards to detail view | Phase 1 — Navigation Foundation |
| B | `7a8a25d` | feat(teams): add presentational TeamDetailView component | Phase 2 — Detail Presenter |
| C | `4617388` | feat(teams): add team detail route with hydration gate | Phase 3 — Route Wiring |
| D | `8af5add` | test(teams): add runtime tests for not-found, race-forwarding, keyboard-focus | Phase 5 — Remediation |

**Diffstat**: 8 files changed, 481 insertions(+), 3 deletions(-)

---

## 5. Final Harness Results

Source: verify-report (2026-08-06) — highest-ranked artifact for final harness results; corroborated by orchestrator launch prompt final-state handoff.

```
$ pnpm test
 Test Files  15 passed (15)
      Tests  354 passed (354)
 Exit code   0

$ pnpm lint
(eslint produced no output)
 Exit code   0

$ pnpm build
✓ Compiled successfully
  Route (app)
  ┌ ○ /
  ├ ○ /_not-found
  ├ ƒ /teams/[teamId]   ← new dynamic route registered
  └ ○ /teams/create
 Exit code   0
```

> **Note**: apply-progress (intermediate snapshot) recorded 350/350 tests at initial apply; 4 additional tests were added in Commit D (remediation). Final authoritative count is 354/354 from verify-report and the orchestrator's explicit final-state handoff.

---

## 6. Spec Compliance Summary

All 12 requirements and 13 scenarios from the 3 delta specs passed at close. Verified by `sdd-verify` (verdict: PASS, 0 CRITICAL findings).

| Req ID | Requirement | Spec File | Runtime Evidence | Status |
|--------|-------------|-----------|-----------------|--------|
| TDV-01 | Route Resolution | team-detail-view.md | `page.test.tsx` → renders TeamDetailView after hydration for a known team | ✅ PASS |
| TDV-02 | Hydration Gating | team-detail-view.md | `page.test.tsx` → renders skeleton while store is hydrating; does not call notFound while store is hydrating | ✅ PASS |
| TDV-03 | Team Lookup | team-detail-view.md | `page.test.tsx` → renders TeamDetailView after hydration; calls notFound after hydration for unknown teamId | ✅ PASS |
| TDV-04 | Identity Display | team-detail-view.md | `TeamDetailView.test.tsx` → renders team identity: name, race name, league type | ✅ PASS |
| TDV-05 | Roster Display | team-detail-view.md | `TeamDetailView.test.tsx` → renders RosterTable in readOnly mode; shows empty roster fallback; forwards race to RosterTable | ✅ PASS |
| TDV-06 | Coaching Staff Display | team-detail-view.md | `TeamDetailView.test.tsx` → renders per-item coaching cost breakdown with unit cost and total per item | ✅ PASS |
| TDV-07 | Derived Treasury Display | team-detail-view.md | `TeamDetailView.test.tsx` → displays correct treasury = STARTING_TREASURY - rosterCost - coachingCost | ✅ PASS |
| TDV-08 | Race-not-in-catalog Fallback | team-detail-view.md | `TeamDetailView.test.tsx` → shows raw raceId when race is not in catalog | ✅ PASS |
| TNF-01 | Post-Hydration Trigger | team-not-found.md | `page.test.tsx` → does not call notFound while store is hydrating; calls notFound for unknown teamId after hydration | ✅ PASS |
| TNF-02 | Error Message and Navigation | team-not-found.md | `not-found.test.tsx` → renders a clear error message; renders a link back to root (/) | ✅ PASS |
| TLIST-01 | Detail Navigation Link | team-list.md | `TeamList.test.tsx` → each team card has a link to the detail page; team card links are keyboard-focusable | ✅ PASS |
| TLIST-02 | Preserved List Behavior | team-list.md | `TeamList.test.tsx` → search filter works with links present | ✅ PASS |

**Compliance**: 12/12 requirements PASS · 13/13 scenarios covered

---

## 7. Final-State Facts (Remediation)

The change went through a verify → remediate cycle between Commit C and Commit D. The following improvements were made post-initial-apply and are part of the final shipped state:

### What changed in Commit D (`8af5add`)

| Item | Initial state (after Commit C) | Final state (after Commit D) |
|------|-------------------------------|------------------------------|
| `app/teams/[teamId]/not-found.test.tsx` | Missing — initial verify flagged this as a CRITICAL gap | Created with 2 runtime tests: heading + `<a href="/">` navigation link |
| `features/teams/detail/TeamDetailView.test.tsx` | Coaching breakdown: partial assertions | Strengthened: every label (Rerolls, Dedicated Fans, Assistant Coaches, Cheerleaders) + 100k reroll total asserted; new race-forwarding test counting `50k` ≥ 2 (per-row + total) |
| `features/teams/TeamList.test.tsx` | Link presence assertions only | Added keyboard-focus assertion: `link.focus()` + `expect(document.activeElement).toBe(link)` |
| `apply-progress.md` | Lacked TDD Cycle Evidence table | Updated with full mandatory TDD Cycle Evidence table |
| Total tests | 350 / 350 | 354 / 354 (+4 tests) |

### Stale-Checkbox Reconciliation Note

`tasks.md` retains unchecked `- [ ]` boxes (it was written before apply began and was not updated by `sdd-apply`). This is a mechanical artifact state issue. The Task Completion Gate reconciliation is authorized by the orchestrator's explicit final-state handoff. Evidence:

- `apply-progress.md` Phase 1–5 shows every task checked `[x]` with TDD cycle evidence.
- `verify-report.md` records Tasks complete: 11/11 (Tasks incomplete: 0).
- `sdd-verify` verdict: PASS (0 CRITICAL).

All implementation tasks are confirmed complete. The archived `tasks.md` stale unchecked checkboxes do not reflect pending work; they reflect a mechanical artifact gap fixed here by this reconciliation record.

---

## 8. Delivery Notes

- Implementation is on `main` at HEAD (`8af5add`), 4 commits ahead of base `ae25b65`.
- Not pushed to remote — delivery (PR creation, remote push) is handled by the orchestrator or delivery skill.
- Review budget: 400 lines. Diffstat: 481 insertions across 8 files. Slightly over budget but still reviewable in a single pass (the orchestrator confirmed no chained PRs needed).
- New dynamic route `/teams/[teamId]` is registered as ƒ Dynamic in the build output (expected — the page is a Client Component driven by localStorage context).
- No new npm dependencies were added.
- Rollback: revert the 4 commits (`ae25b65..8af5add`), remove `<Link>` additions in `TeamList.tsx`.
