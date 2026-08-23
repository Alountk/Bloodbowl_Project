# Archive Report — match-view-rulebook

**Change**: match-view-rulebook
**Phase**: sdd-archive
**Mode**: STRICT TDD (`pnpm test`)
**Artifact store**: hybrid (OpenSpec filesystem + Engram)
**Date**: 2026-08-15

## Intent of This Archive

This is a **record-only archive**: the delta specs were synchronized into the consolidated main specs (`openspec/specs/match-view/spec.md`, `openspec/specs/live-match-realtime/spec.md`) and the archive report was persisted to OpenSpec and Engram, but the change folder was **NOT moved** to `openspec/changes/archive/`. The orchestrator explicitly instructed the archive to defer the physical move because the stacked PR chain (#90 S1 · #91 fix-avatar · #92 S2 · #93 S3 · #94 S4 · #95 S5, all open against `main`) is still being merged, and the artifacts under `openspec/changes/match-view-rulebook/` are committed on those branches. The folder move is a separate delivery step owned by the orchestrator once the stack is merged.

This decision is recorded here per the intentional-partial-archive rule; nothing was missing or incomplete in the change itself.

## Native Review Receipt Gate

`reviewGate` is **structurally absent** in `gentle-ai sdd-status` output: `reviewPolicy`, `reviewLedger`, `reviewReceipt`, `reviewContext`, and `reviewState` are all `missing`, and there are no `openspec/changes/match-view-rulebook/reviews/*` files. A genuine `reviewOffer` is present (an invitation, never a gate). Per the Native Review Receipt Gate, with no review ever started for this candidate, archive proceeds under ordinary repository policy. `dependencies.archive: ready` here means proceed, not "investigate why the gate is missing".

## Task Completion Gate

The persisted tasks artifact (`openspec/changes/match-view-rulebook/tasks.md`) shows **22/22 implementation tasks complete** (`[x]`); native status confirms `taskProgress { total: 22, completed: 22, pending: 0, allComplete: true }` and `applyState: all_done`. No unchecked implementation tasks. The two deferred items (per-team incentive chips, kickoff events) are documented as maintainer-scoped follow-ups OUTSIDE the change, not pending tasks — they do not block archive.

## Final-State Authority

The archive report is the terminal record and reflects the state AT CLOSE per the ranking: native review authority (none here) → persisted tasks artifact (22/22) → orchestrator final-state facts → `verify-report`/`apply-progress` snapshots (lowest).

### Final state per the orchestrator (highest-ranked account, launch 2026-08-15)

All five slices are implemented and verified:
- **S1 — server payloads**: `foul` carries `victimRosterId`; `casualty` carries `cause` + `causerRosterId` (dodge/crowd without causer).
- **S2 — EventControls**: victim/cause/causer capture in the forms; dodge/crowd omit the causer control.
- **S3 — cards chronology**: 68%/100% widths, gradient degradation, turn/minute corners, `MatchTimelineBar` in the sticky header.
- **S4 — snapshot summary rows**: reportado/ganancias/fanáticos/incentivos + MV-2 walkover guard; back arrow in `LiveTopBar`.
- **S5 — e2e** driving the new UI.

Verification FINAL: **PASS 40/40 scenarios · 10/10 requirements** (MVT-1..5, LM-6, LM-12, LM-20, MV-6, MV-7). The MV-7-S2 evidence gap closed with the "uses success-green tokens..." test (`MatchView.test.tsx`).
Suites: `pnpm test` **1282/1282** · local e2e **21/21** · auth live-match e2e **1/1** (real Postgres) · `tsc`/`lint` clean.

### Snapshot vs final reconciliation

- The orchestrator's final state (suites above) supersedes earlier intermediate counts where they differ from `apply-progress` (per-obs #434 S5: unit 1281/1281 at that time) — the +1 test that brought the suite to 1282 landed after the S5 apply-progress, matching the `verify-report` #439 green run.
- Deferred follow-ups (below) are maintainer decisions forwarded by the orchestrator; they are not open tasks and are not resurrected here.

## Deferred Follow-ups (maintainer decisions, NOT pending tasks)

1. **Per-team incentive chips (MVT-4)**: the `MatchResult` snapshot stores a single `pettyCash` (TV difference), so the "Incentivos" row of the finished feed renders the single value assigned to home ("+45.000 gp."). Per-team chip split requires a later slice (kickoff precedent); deliberately NOT implemented here.
2. **Kickoff events**: expensive-mistake/fan-factor-roll/weather kickoff rows are NOT surfaced in this version (MV-6 out-of-scope lock). A follow-up slice MAY add them as TEXT-kind events (LM-14 precedent).

## Spec Synchronization (delta → consolidated main specs)

Per orchestrator scope: only the changed requirements were synced; all other requirements and scenarios preserved.

| Domain spec | New requirements | Modified requirements | Removed |
|-------------|------------------|----------------------|---------|
| `openspec/specs/live-match-realtime/spec.md` | MVT-5 | LM-6 (foul `victimRosterId` + casualty `cause`/`causerRosterId` payloads; legacy fallback), LM-12 (foul victim / casualty causer side invariants + 3 scenarios), LM-20 (victim/cause/causer form capture + 2 scenarios) | — |
| `openspec/specs/match-view/spec.md` | MVT-1, MVT-2, MVT-3, MVT-4 | MV-6 (kickoff + snapshot-derived summary rows scoping, +1 scenario), MV-7 (rulebook gradient/success token composition, +1 scenario) | — |

Verification: all 24 changed/frozen scenarios confirmed present in the correct consolidated files; requirement headers enumerated and full requirement set preserved.

## Artifacts Read (traceability)

- OpenSpec: `proposal.md`, `exploration.md`, `specs/live-match-realtime/spec.md`, `specs/match-view/spec.md`, `design.md`, `tasks.md`, `verify-report.md` (all under `openspec/changes/match-view-rulebook/`).
- Engram: `sdd/match-view-rulebook/apply-progress` obs **#434**; `sdd/match-view-rulebook/verify-report` obs **#439**.
- Native: `gentle-ai sdd-status match-view-rulebook --cwd <repo> --json --instructions`.

## Artifacts Persisted

- OpenSpec: `openspec/changes/match-view-rulebook/archive-report.md` (this file — NOT included in any folder-move readback because the move is deferred).
- Engram: `sdd/match-view-rulebook/archive-report` (architecture), `capture_prompt: false`.

## Errors Encountered

None. No stale `verify-report` CRITICAL/WARNING issues (0/0); no CRITICAL issues block archive.

## Archive Folder Move

**DEFERRED** by explicit orchestrator instruction — stacked PR chain (#90..#95) still open; artifacts are committed on branch artifacts. The orchestrator owns `openspec/changes/archive/2026-08-15-match-view-rulebook/` once the stack merges. This archive report is the terminal record; the folder move shall be byte-identity-verified (`diff -r`) at that time.

## Verdict

Archive-ready. Change fully planned, implemented, and verified; delta specs consolidated; terminal archive report persisted. Folder move deferred pending the PR-stack merge.

## Key Learnings

1. A record-only archive can close the SDD cycle (specs synced + report persisted) while a stacked PR chain is still open, with the folder move deferred to a separate delivery step.
2. Native `sdd-status` drives the gates: `reviewGate` absent + `reviewOffer` present means proceed, not "investigate".
3. `verify-report` is an intermediate snapshot; the orchestrator's final-state facts (extra test landed, deferred follow-ups) outrank it for the archive report.
4. Merging deltas into consolidated specs must preserve every untouched requirement and append/override only the changed blocks, verified by a per-scenario grep sweep.
