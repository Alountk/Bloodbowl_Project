# Archive Report: live-match-recovery

## Cycle Status

**Status**: COMPLETE — fully planned, implemented, verified, and archived.
**Archived at**: 2026-09-11
**Artifact store**: hybrid (OpenSpec files + Engram)
**Change root (archived)**: `openspec/changes/archive/2026-09-11-live-match-recovery/`
**Base commit at archive**: `1b7eec2` (`main`)

## Executive Summary

`live-match-recovery` closes the stranding gap where a `LiveMatch` row had no delete path, permanently blocking its fixture (`canLoadResult` requires `scheduled && !liveActive`) and freezing league advancement. The change ships four deliverables across four stacked PRs: manual reset with the new `live.manage` RBAC permission (owner OR developer/admin), a lazy 8h auto-close sweep that freezes an abandoned `live` match to `finished` with its scoreboard and no progression, forfeit cleanup of the orphan LiveMatch, and the authorized reset UI with confirmation modal and ES/EN copy. Final verification is PASS: 16/16 tasks, 10/10 requirements, 33/33 scenarios, 2505/2505 tests, lint/tsc/build green, no migration.

## Final-State Authority

This report reflects the state at close, not earlier snapshots.

- **Tasks artifact** (`tasks.md`): 16/16 `[x]` — completion authority.
- **Orchestrator final-state handoff**: all four PRs merged to `main`; verify PASS confirmed by `sdd-verify-validate`.
- **Snapshot note**: the filesystem `apply-progress.md` archived here reads "S1 + S2 complete"; Engram observation #799 (updated later) reads "S1 + S2 + S3 complete". Both are intermediate snapshots and are superseded by the completed tasks artifact. No task is left unchecked in the archived `tasks.md`.

## Lineage (Engram observation IDs)

| Artifact | Observation |
|----------|-------------|
| explore | #794 |
| proposal | #795 |
| spec (3 domains) | #796 |
| design | #797 |
| tasks | #798 |
| apply-progress | #799 |
| verify-report | #800 |
| archive-report | this observation |

Project: `bloodbowl_project`. All observations were `active` at archive time.

## Delivery (merged to `main`)

| PR | Slice | Content |
|----|-------|---------|
| #206 | S1 | `live.manage` permission (developer/admin) + `resetLiveMatch` store fn + `POST .../fixtures/[fixtureId]/reset` route with RBAC guards |
| #207 | S2 | `isStaleLiveMatch` + `expireStaleLiveMatches` lazy 8h sweep wired into both league and fixture GETs |
| #208 | PR3a | Forfeit tx deletes the orphan LiveMatch; reset client + confirmation modal |
| #209 | PR3b | Reset control wired into `MatchCard` / `MatchView` / `LeagueDetail` + i18n |

## Metrics

| Metric | Value |
|--------|-------|
| Tasks | 16/16 complete |
| Requirements | 10/10 compliant |
| Scenarios | 33/33 compliant |
| Tests | 2505 passed / 172 files (0 failed) |
| `pnpm lint` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `pnpm build` | exit 0 (reset route emitted) |
| Migration | None (no `prisma/migrations` or `schema.prisma` diff) |
| Verify verdict | PASS (`gentle-ai.verify-result/v1`) |

## Spec Reconciliation

Delta specs were synced into the consolidated specs **before** the change folder moved to archive. Native composition was used for existing specs (no model-driven Read/Edit merge); the new capability was copied mechanically with a shell `cp` + `diff -r`.

| Domain | Action | Method | Result |
|--------|--------|--------|--------|
| `live-match-recovery` | Created (new capability) | `cp` + `diff -r` (empty) | `openspec/specs/live-match-recovery/spec.md` — LMR-1..LMR-7 + scenarios |
| `live-match-realtime` | Updated (MODIFIED LM-3 + ADDED LM-31) | `gentle-ai sdd-archive-compose` (exit 0) | `openspec/specs/live-match-realtime/spec.md` — LM-3 body extended with reset/expiry + 2 scenarios; LM-31 appended; LM-1..LM-30 preserved |
| `matchday-forfeit` | Updated (MODIFIED "Forfeit Sets winnerId") | `gentle-ai sdd-archive-compose` (exit 0) + blank-line seam repair | `openspec/specs/matchday-forfeit/spec.md` — orphan-LiveMatch deletion added + 1 scenario; "Admin-Only Forfeit" and "Round Completion Rule" preserved |

Compose seam repair: `matchday-forfeit` compose output dropped the blank line before `### Requirement: Round Completion Rule`. Repaired only that blank-line seam (targeted `perl` insertion); no other byte changed. Post-repair checks found no double blank lines and no heading lacking a preceding blank line.

## Mechanical Archive Evidence

- **New-spec copy readback**: `diff -r <delta live-match-recovery/spec.md> <temp copy>` → empty, exit 0 (byte-identical).
- **Folder move**: `git mv` failed (status 128 — folder untracked), source verified unchanged against a recursive snapshot, plain `mv` fallback applied.
- **Mandatory readback**: `diff -r <pre-move snapshot> <archive destination>` → empty, exit 0 (byte-identical).
- **Verification**: active `openspec/changes/` contains only `archive/`; source folder gone; archived `tasks.md` has zero unchecked implementation tasks; archive contains proposal, 3 delta specs, design, tasks, apply-progress, verify-report (plus this additive archive-report).

## Deviations and Risks

| Item | Severity | Detail |
|------|----------|--------|
| e2e auth suite not executed | WARNING | `AUTH_MODE=auth` + Docker/Postgres e2e was not run in the apply environment (ports occupied). Route-integration + component tests cover LMR-1/2/6/7; the `live-resolution.spec.ts` extension was not added. Per `verify-report` #800 at verification time. |
| `canResetLive` client-side edge case | WARNING | `MatchView` derives `canResetLive` from the client `useLeague` fetch; if that fetch fails, a developer/admin could transiently see the control on a finished league. The server still returns 409; no spec violation in normal operation. Per `verify-report` #800. |
| Auto-close loses progression (Option A) | ACCEPTED | Auto-close freezes the scoreboard and counts for the league but awards no PE/winnings/MVP/FF; progression stays deferred to the resolution wizard. If nobody returns, progression is permanently lost while the league advances. Documented and accepted. |
| No explicit "auto-close never persists winnings/PE" test | SUGGESTION | Currently proven by exact-args assertions plus the absence of the call. Suggested a dedicated unit test. Per `verify-report` #800. |

## Out-of-Scope Confirmed Absent

Auto-close of `ready`/`pending`; reset of `finished`; cron/scheduled job; reset history/audit trail; Option B auto-progression. All verified absent in `verify-report` #800.

## Follow-ups

- ROADMAP was intentionally NOT modified in this phase (out of OpenSpec archive scope). If the auto-close progression gap or the client-side `canResetLive` edge case should be tracked, add a docs/ROADMAP follow-up outside this archive.
- The archived `apply-progress.md` snapshot lags the Engram #799 revision (S3); no action required — the tasks artifact is authoritative.

## Cycle Complete

`live-match-recovery` is closed. The consolidated specs now reflect the shipped behavior. Ready for the next change.
