# Archive Report: live-match-events

**Archived**: 2026-08-14
**Change**: `live-match-events` (Design-A History Feed — event taxonomy, feed filtering, event recording controls, MVP-on-result write)
**Artifact store**: openspec (filesystem source of truth) + engram archive summary (per orchestrator instruction)
**Predecessor chain**: PR1 `feat/live-match-events-pr1` (#80, event model + MVP write) → PR2 `feat/live-match-events-pr2` (#81, DTO filter + pure derivations) → PR3a `feat/live-match-events-pr3a` (#82, Design-A feed UI) → PR3b `feat/live-match-events-pr3b` (#83, event recording controls) → PR4 `feat/live-match-events-pr4` (#84, e2e + regression) — all merged to main, stacked-to-main.
**Status**: ✅ SDD cycle closed. Verify **PASS** (validator-admitted). 0 CRITICAL, 0 WARNING, 0 blockers, 2 SUGGESTIONs carried as future work.

---

## Final State (at close)

The change shipped the **Design-A history feed** (event taxonomy + recording controls) across five merged, stacked-to-main PRs (#80–#84):

- **PR1 #80 — Event model server + MVP write**: `LiveEventKind` union gains `completion`/`mvp` (TEXT column, **no migration** — LM-14). `applyCompletion` pure fn (★1, no turn flip, monotonic seq). Live route dispatches `completion` only from the ACTIVE coach (200/409; `type:"mvp"` → 400, MVP is not a live command). Result route appends TWO `mvp` events (home + away MJP-computed grantee) inside the result transaction, `max(seq)` read in-tx bumped consistently (D20, `@@unique([liveMatchId,seq])` collision → 409); no LiveMatch → no MVP write (`at = lm.finishedAt ?? now`). `bandToDisplay` (bruise→Herida★0; lasting→Baja★2) + `eventSpp` (TD3/Comp1/Cas2/MVP4) (LM-18).
- **PR2 #81 — DTO filter + pure derivations**: ONE shared `isDisplayEvent` (8 display kinds `start|td|completion|casualty|foul|endHalf|endMatch|mvp`); BOTH `toEventDtos` (live route) and `serializeLive` (fixture route) filter via it (LM-16); `turn`/`turnStart`/`requestTurn` persist in DB for audit and stay live-only (nudge banner, D25). New `lib/liveFeed.ts`: `deriveMinute` (e.g. `199'`), `turnTag` (half 2 → +8 → `T16`), `deriveTeamStats` (TD/completions/casualties/fouls/★ per team, zeroed empty) (LM-17/LM-19). Dorsal = roster index+1, players `orderBy id asc` (D21/D22/D23).
- **PR3a #82 — Design-A feed UI**: `MatchView` renders the Design-A row list (minute, `T{n}` tag, dorsal, name+position from detail rosters, icon, label, ★, side gradient local navy/visitor red); hero mini-stats via `deriveTeamStats`; rosters plumbed into live/finished timelines; nudge banner stays live-only, reload no longer restores a pending nudge (D25, LM-16).
- **PR3b #83 — Event recording controls**: new `features/leagues/liveControls.tsx` `EventControls` FAB (`fixed bottom-6 right-6` navy "+") visible only while `status==="live"` && `viewerSide != null` (spectator/admin no controls, LM-20); role menu derived from `viewerSide` vs `activeSide` (active: TD/Pase completo/Baja/Herida/Falta; non-active: Herida only, own player); mini-form (own-roster alive `<select>` + 5-band `<select>`); commands map to route shapes; submit via `act`/busyRef, menu closes; server matrix stays authoritative (any bypass → 409) (LM-12/LM-20).
- **PR4 #84 — e2e + regression**: updated `e2e/live-match.spec.ts` (turn/label asserts to the new feed, completion e2e via command, Design-A row renders, reload persistence, FAB→TD flow, non-active Herida-only, mvp rows after result load; full suite green incl. roster-materialize-at-begin + roster-JSON-merge production fixes surfaced by the e2e).

**Verify (terminal, PASS)**: **10/10 requirements, 30/30 scenarios COMPLIANT**, 34/34 tasks `[x]`. Evidence at close: full `pnpm test` **1211/1211** (96 files), focused 67 + 117 route/component units, `pnpm lint` clean, `npx tsc --noEmit` clean, local e2e **21/21**, authoritative auth e2e **31/31 ×2** (deterministic, incl. live-match Design-A/controls/reload/mvp journey). **Note**: the 1211 count is the repo's *at-verify-time* total; the archive commit runs pre-commit lint + test against **current `main`** (which has since grown with UI PRs #85–#89 and a score-block removal `c412593`), so the archive commit's green test count reflects the current repo, not the verify snapshot (per Final-State Authority, the verify-report's intermediate test counts are not restated as current).

## Documented Ops / Runbook Notes (MUST be preserved)

- **No DB migration** for this change: `LiveEvent.kind` was already TEXT, so the new `completion`/`mvp` kinds persist as TEXT with no schema change.
- **Single `next start` process still required** for the SSE fan-out (in-memory `liveHub`); safe on the single Arcane container (production runs one `next start`).
- **Demo seed data lives only in the local dev DB** — NOT in the repository. The e2e/design fixtures are local-only; production has no seed fixtures from this change.
- **Local mode**: `AUTH_MODE=local` realtime routes return 401 by design; live e2e runs only in the auth suite (requires Docker/Postgres `POSTGRES_PORT=5433` + a single running `next start`).

## Review Gate (Native Review Receipt — structurally absent)

Following the repo precedent of prior completed changes (live-match-flow 2026-08-12 and earlier): no receipt-driven review governed this change. Archived under ordinary repository policy with `reviewGate` structurally absent — the kill switch is off and/or no review was ever started for this candidate. The orchestrator launch confirmed `dependencies.archive: ready`. Per the Native Review Receipt Gate, this absence is not itself a defect and does not demand a receipt. **No `allow` was fabricated; this is not evidence of a receipt-validated review — it is a fully verified, five-PR-merged change closed under ordinary policy.**

## Task Completion Gate

All 34 implementation tasks (1.1–4.3) are `[x]` in `tasks.md`; 0 unchecked implementation tasks. Verify confirms `Tasks complete: 34/34`, `incomplete: 0`. **No reconciliation was required.** The archived `tasks.md` carries zero `[ ]` rows and 34 `[x]` rows (see also final PR 4 apply-progress in `apply-progress.md`).

## Spec Sync to Source of Truth

The change carried two delta specs. Per the repo's capability-per-domain convention, each was merged into its existing main spec (least-destructive block replacement / addition; unrelated requirements preserved verbatim). All merges verified byte-identical in content (normalized `diff` shows no content difference).

| Main spec | Action | Merge detail |
|-----------|--------|--------------|
| `openspec/specs/live-match-realtime/spec.md` | **Updated** (7 ADDED, 2 MODIFIED) | ADDED LM-14 (Event Taxonomy: Completion and MVP, TEXT no migration), LM-15 (Completion Command), LM-16 (Server-Side Feed Filtering), LM-17 (Design-A Feed Rows), LM-18 (Casualty Band and SPP Mapping), LM-19 (Derived Team Stats), LM-20 (Event Recording Controls); MODIFIED LM-6 (completion joins the persisted kinds; previously no completion existed) and LM-12 (completions added to active-coach kind list; non-active TD/foul/completion rejected). LM-1..LM-5/7/8/9/10/11/13 and the AC table preserved verbatim. 20 reqs / 64 scenarios total. |
| `openspec/specs/match-result/spec.md` | **Updated** (1 ADDED) | ADDED "MVP Event Write on Result Load" (two `mvp` events appended in-tx with monotonic seq, collision-safe via `@@unique`; no LiveMatch → none). Result Authorization, Score Validation, Atomic Result Transaction, Already-Played Guard, Correction Authorization with Audit preserved verbatim. 6 reqs / 17 scenarios total. |

**Merge note (least-destructive)**: both syncs preserve authoritative totals — every delta requirement/scenario is present byte-identical in the consolidated main specs (the delta's 27 + 3 = 30 scenarios all present; no requirement lost), and all non-delta requirements/scenarios are preserved verbatim. Verified by normalized block-level diff + per-scenario presence check.

## Artifacts Archived

- `exploration.md` ✅
- `proposal.md` ✅
- `specs/` ✅ (2 delta specs: live-match-realtime, match-result)
- `design.md` ✅
- `tasks.md` ✅ (34/34 tasks all `[x]`, no unchecked)
- `apply-progress.md` ✅ (intermediate snapshot — final state per Final-State Authority supersedes PR-ordering nuances of the snapshot)
- `verify-report.md` ✅ (PASS; 10/10 reqs, 30/30 scenarios) — committed as part of the archive (was untracked in the working tree)
- `archive-report.md` ✅ (this file)

Engram traceability: archive summary persisted to engram topic `sdd/live-match-events/archive-report` (`capture_prompt: false`). The change's authoritative artifacts live on the openspec filesystem (this is an openspec-store change).

## Verification Checklist

- [x] Main specs updated correctly (2 updated: live-match-realtime, match-result; no requirement/scenario lost — delta 10 reqs / 30 scenarios fully present)
- [x] Change folder moved to `openspec/changes/archive/2026-08-14-live-match-events/` (mechanical `mv` + recursive snapshot, `diff -r` empty)
- [x] Archive contains all artifacts (exploration, proposal, 2 specs, design, tasks, apply-progress, verify-report, archive-report)
- [x] Archived `tasks.md` has no stale unchecked tasks (34/34 `[x]`, zero `[ ]`)
- [x] Active `openspec/changes/` no longer contains `live-match-events` (only `archive`)
- [x] Verbatim `diff -r` readback empty (folder move) — byte-identity proven

## SUGGESTIONs Carried Into Archive (future work)

Two non-blocking SUGGESTIONs from the terminal verify-report are carried — neither is a defect:

- **Dorsal is an index-based pseudo-number** (roster index + 1) — accepted in the proposal; **real jersey numbers are a future change**.
- **SPP stars render numerically (`★3`)** rather than as repeated glyphs (`★★★`) — an intentional deviation (documented in PR 3a) to keep the SPP number explicit and test-stable.

## Future Work (out of scope, carried)

- **Auto-close confirmation on live finish** — pending confirmation (design follow-up).
- **Real emblems** (team/race emblems in the Design-A feed rows) — future UI enhancement.
- **Real jersey / dorsal numbers** — the dorsal is currently an index-based pseudo-number; real jersey assignment is future.
- **Match-end timestamp on the result path** — currently the MVP `at` uses `lm.finishedAt ?? now`; the result path itself does not yet persist a dedicated match-end timestamp.
- **Standings / Notificaciones / Histórico con replay** — pre-existing roadmap pendientes (from prior archives).
- **`enrichFixture` extraction** to `lib/fixtures.ts` (D7 tech-debt SUGGESTION carried from the live-match MVP archive) — later refactor PR.
- **Cleanup migration dropping the deprecated `League` turn-clock columns** — future, from the live-match-flow archive.

## SDD Cycle Complete

`live-match-events` has been fully planned, proposed, specified, designed, implemented (PR1 #80 → PR2 #81 → PR3a #82 → PR3b #83 → PR4 #84, stacked-to-main), independently verified (PASS), merged, spec-synced (2 domains updated), and archived. Ready for the next change.
