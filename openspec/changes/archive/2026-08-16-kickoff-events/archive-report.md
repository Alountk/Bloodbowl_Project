# Archive Report — kickoff-events

**Change**: kickoff-events
**Phase**: sdd-archive
**Mode**: STRICT TDD (`pnpm test`)
**Artifact store**: hybrid (OpenSpec filesystem + Engram)
**Date**: 2026-08-16

## Intent of This Archive

This is a **record-only archive**: the delta specs were synchronized into the consolidated main specs (`openspec/specs/live-match-realtime/spec.md`, `openspec/specs/match-view/spec.md`) and the archive report was persisted to OpenSpec and Engram, but the change folder was **NOT moved** to `openspec/changes/archive/`. The orchestrator explicitly instructed the archive to defer the physical move because the stacked PR chain (#100 server core → #101 feed rendering → #102 e2e + sweep, all open against `main`) is still being merged, and the artifacts under `openspec/changes/kickoff-events/` are committed on those branches. The folder move is a separate delivery step owned by the orchestrator once the stack is merged.

This decision is recorded here per the intentional-partial-archive rule; nothing was missing or incomplete in the change itself.

## Native Review Receipt Gate

`reviewGate` is **structurally absent** in `gentle-ai sdd-status` output: RDD review mode is **DISABLED for this clone only** (maintainer decision after provider defect gentle-ai #3194 blocked the correction-finalize path). No terminal receipt was ever created for this candidate. Per the Native Review Receipt Gate, with the kill switch off and no review ever governing this candidate, delivery proceeds under ordinary repository policy — the three PRs are open under ordinary hooks/tests/CI. `dependencies.archive: ready` here means proceed, not "investigate why the gate is missing".

## Task Completion Gate

The persisted tasks artifact (`openspec/changes/kickoff-events/tasks.md`) shows **11/11 implementation tasks complete** (`[x]`): PR1 server core 5 + PR2 feed rendering 4 + PR3 e2e/verification 3. No unchecked implementation tasks. The Task Completion Gate passes; no stale-checkbox reconciliation was required.

## Final-State Authority

The archive report is the terminal record and reflects the state AT CLOSE per the ranking: native review authority (none here — gate absent) → persisted tasks artifact (11/11) → orchestrator final-state facts (highest-ranked account of the change) → `verify-report`/`apply-progress` snapshots (lowest).

### Final state per the orchestrator (highest-ranked account, launch 2026-08-16)

All three stacked PRs are implemented and verified:
- **PR #100 — server core (5 tasks)**: `lib/kickoff.ts` pure module (d6ToD3, roundDownTo5k, bracketFor, resolveExpensiveMistake full 6×6 matrix, buildKickoffEvents); `LiveEventKind`/`isDisplayEvent` gain `expensive_mistake`/`fan_factor`; `beginMatch` third param splices kickoff events BEFORE `start`/`turnStart`; `beginLiveMatch` rolls server-side dice + atomic treasury decrement in the SAME `$transaction`; begin errors wrapped as 409 (retry idempotency). Includes the **R3-001 review correction**: the treasury clamp `0 ≤ amountLost ≤ treasury` — a resolved finding, no open blocker.
- **PR #101 — feed rendering (4 tasks)**: labels (💰 / "Error costoso" / "Factor de aficionados"), glyphs, `KICKOFF_OUTCOME_LABELS`, `formatTreasury` (es-ES dot-thousands + " M.O."); `expensive_mistake` 68% team card with outcome + treasury before→after line + no-throw fallback; `fan_factor` 100% centered with compact per-team totals copy; `matchTimelineBar.tsx` deliberately unchanged.
- **PR #102 — e2e + full sweep (3 tasks)**: `e2e/live-match.spec.ts` asserts 2 "Error costoso" + 1 "Factor de aficionados" at 0', retry begin → 409 with no duplicate decrement, preserves stable assertions; verification checklist mapped to scalar-shaped spec compliance (LM-21/22/23/24, MV-6, MVT-6); full sweep green.

Verification FINAL: **PASS, 8/8 requirements · 25/25 scenarios** (LM-14, LM-16, LM-21–24, MV-6, MVT-6). Suites: `pnpm test` **1319/1319** (unit+integration) · local e2e **21/21** · auth e2e **31/31** (Docker Postgres, includes `e2e/live-match.spec.ts` 1/1) · `npx tsc --noEmit` clean · `pnpm lint` clean. **0 CRITICAL / 0 WARNING / 1 SUGGESTION.**

### Carried SUGGESTION (cosmetic, non-blocking)

`lib/liveEventLabels.test.ts:149` — `expect(EVENT_GLYPH.td).toBeTruthy()` is a weak presence check; all kickoff-relevant assertions in the same describe verify real behavior (exact glyphs 💰/🎲/👥, fallback bullet, exact treasury arithmetic). Deliberately carried at close; not change-blocking and does not weaken the 25/25 scenario evidence.

### R3-001 review correction (resolved, no open blocker)

PR1 carries the R3-001 correction: the expensive-mistake treasury clamp enforces `0 ≤ amountLost ≤ treasury`. This was a finding resolved during the PR1 review pass and is included in the shipped server core; it is recorded here for traceability and is NOT an open review item. No receipt governs this candidate (see the Native Review Receipt Gate note above).

### Snapshot vs final reconciliation

- The orchestrator's final state (suites above, 1319/1319 + 21/21 + 31/31) supersedes any earlier intermediate counts where they differ from intermediate snapshots. The verify-report snapshot observed #obs-level evidence already at PASS with these same final counts; no subsequent landed work changed them.
- The single SUGGESTION was known at verification time and carried through to close as-is (cosmetic).

## Delivery-Mode Note (RDD off clone)

RDD receipt-driven review is **DISABLED for this clone only** — a maintainer decision taken after provider defect gentle-ai #3194 blocked the correction-finalize path. As a consequence, no review ledger, transaction, or terminal receipt was created for `kickoff-events`, and no `openspec/changes/kickoff-events/reviews/*` files exist. Delivery therefore proceeds under ordinary repository policy (hooks, tests, CI): the three PRs were reviewed and gated by the standard toolchain. This is a per-clone maintainer setting, not a change-scoped exception; re-enabling RDD would revalidate from the current state.

## Spec Synchronization (delta → consolidated main specs)

Per orchestrator scope: only the changed requirements were synced; all other requirements and scenarios preserved unchanged.

| Domain spec | New requirements | Modified requirements | Removed |
|-------------|------------------|----------------------|---------|
| `openspec/specs/live-match-realtime/spec.md` | LM-21 (Kickoff Event Generation), LM-22 (Fan Factor Roll), LM-23 (Expensive Mistake Resolution), LM-24 (Kickoff Feed Rendering Data) | LM-14 (taxonomy + `expensive_mistake`/`fan_factor`, kickoff kinds not commands; +1 scenario), LM-16 (10-kind display surface, "all 13 kinds"→10 display, 8→10 kinds) | — |
| `openspec/specs/match-view/spec.md` | MVT-6 (Kickoff Event Rows) | MV-6 (kickoff rows now surfaced, 10-kind surface preserved) | — |

**Spec-sync verification — per-scenario grep sweep**: all **25** changed/frozen scenarios confirmed present in the correct consolidated files:
- `openspec/specs/live-match-realtime/spec.md`: 19 scenarios (LM-14 ×3, LM-16 ×3, LM-21 ×3, LM-22 ×2, LM-23 ×5, LM-24 ×3) — each found exactly once.
- `openspec/specs/match-view/spec.md`: 6 scenarios (MV-6 ×3, MVT-6 ×3) — each found exactly once.

Preservation confirmed: all untouched requirements/scenarios remain; stale old-form statements were removed (no duplicate "all 11 kinds" / "8-kind surface" / old MV-6 "stay out of taxonomy" scenario persists). Requirement headers enumerated via grep.

## Errors Encountered

None. `verify-report` has 0 CRITICAL / 0 WARNING (1 cosmetic SUGGESTION carried); no blocker gates archive.

No `openspec/config.yaml` exists in the repo (only the per-skill default); the `rules.archive` directive ("Warn before merging destructive deltas") is satisfied — the LM-16 and MV-6 modifications expanded, not destroyed, their requirement bodies and all other requirements are preserved — so no destructive-merge warning was required.

## Archive Folder Move

**DEFERRED** by explicit orchestrator instruction — stacked PR chain (#100 → #101 → #102) still open; the artifacts are committed on the PR branches. The orchestrator owns the move to `openspec/changes/archive/2026-08-16-kickoff-events/` once the stack merges. This archive report is the terminal record; the folder move shall be byte-identity-verified (`diff -r`, archive-report additive-only) at that later delivery step.

## Artifacts Read (traceability)

- OpenSpec: `openspec/changes/kickoff-events/proposal.md`, `design.md`, `tasks.md`, `verify-report.md`, `specs/live-match-realtime/spec.md`, `specs/match-view/spec.md` (deltas).
- Consolidated (synced): `openspec/specs/live-match-realtime/spec.md`, `openspec/specs/match-view/spec.md`.
- Precedent: `openspec/changes/archive/2026-08-15-match-view-rulebook/archive-report.md` (record-only archive pattern).

## Artifacts Persisted

- OpenSpec: `openspec/changes/kickoff-events/archive-report.md` (this file — NOT included in any folder-move readback because the move is deferred).
- Engram: `sdd/kickoff-events/archive-report` (type architecture), `capture_prompt: false`.

## Verdict

Archive-ready. Change fully planned, implemented, and verified (8/8 requirements, 25/25 scenarios, full sweep green, 0 CRITICAL / 0 WARNING); delta specs consolidated into the source-of-truth main specs; terminal archive report persisted to OpenSpec and Engram. Folder move deferred pending the PR-stack merge.

## Key Learnings

1. A record-only archive can close the SDD cycle (specs synced + report persisted) while a stacked PR chain is still open, with the folder move deferred to a separate orchestrator-owned delivery step.
2. RDD review mode disabled-per-clone (provider defect gentle-ai #3194) makes `reviewGate` structurally absent — delivery proceeds under ordinary repository policy, never as a defect to investigate.
3. All 25 changed/frozen scenarios were verified landing in the correct consolidated files (19 in live-match-realtime, 6 in match-view), each exactly once, with stale old-form statements cleanly removed.
