# Archive Report: incentive-chips (issue #98)

## Cycle Status

- **Change**: incentive-chips — Pre-Match Inducement Purchase + Per-Team Feed Chips (issue #98)
- **Verdict**: PASS WITH WARNINGS — archived as final (no CRITICAL findings; one documented verification debt, W1)
- **Artifact store mode**: hybrid (OpenSpec files + Engram)
- **Evidence base**: `main` @ `7f7a311` (merge #205); working tree clean except this archive folder and the synced consolidated specs
- **Archived to**: `openspec/changes/archive/2026-09-10-incentive-chips/` (byte-identical readback via `diff -r` vs. pre-move snapshot — empty)
- **Archive type**: standard (no partial-archive override; no stale-checkbox reconciliation needed — 19/19 `[x]`)

## Traceability — Engram Observations Read

| Artifact | Engram obs | Filesystem |
|---|---|---|
| explore | `sdd/incentive-chips/explore` #783 | — |
| proposal | `sdd/incentive-chips/proposal` #784 | `proposal.md` |
| spec | `sdd/incentive-chips/spec` #785 | `specs/{inducements,live-match-realtime,match-result,match-view}/spec.md` |
| design | `sdd/incentive-chips/design` #786 | `design.md` |
| tasks | `sdd/incentive-chips/tasks` #787 | `tasks.md` |
| apply-progress | `sdd/incentive-chips/apply-progress` #788 | `apply-progress.md` |
| verify-report | `sdd/incentive-chips/verify-report` #791 | `verify-report.md` |

Status authority: native `gentle-ai sdd-status` reported `dependencies.archive: ready`, `nextRecommended: archive`, `taskProgress 19/19 allComplete`, empty `blockedReasons`, `reviewGate: null` (this change has no native review engine artifacts — repo SDD v1 lineage). Archive gates: Task Completion Gate ✅ (19/19 `[x]` in the persisted `tasks.md`, mirrored in Engram #787); CRITICAL findings ✅ none (`verify-report` #791: `critical_findings: 0`, `verdict: pass_with_warnings`).

## Final-State Facts (at close)

Sources ranked per the Final-State Authority: native status + `verify-report` #791 (written at evidence base `main` @ `7f7a311`) + launch-prompt handoff agree; `apply-progress` #788 is an intermediate snapshot and is only cited where noted.

- **Tasks**: 19/19 complete (`tasks.md` + Engram #787, revision 4 "ALL TASKS COMPLETE").
- **Delivery**: 7 stacked-to-main PRs #198–#205, all merged into `main` (final merge #205 = `7f7a311`). S4's apply-progress snapshot ("NO push, NO PR opened", written mid-cycle) is superseded: `verify-report` #791 and `git log` confirm PR #205 merged the S4 commit `656fbcc`.
- **Verification** (per `verify-report` #791, evidence_revision `sha256:6d78f7b8…`): 9/9 requirements, 29/29 scenarios compliant under passing covering tests; `pnpm test` 170 files / 2458 passed / 0 failed (exit 0, output hash `sha256:d53103…`); `pnpm lint` exit 0; `npx tsc --noEmit` clean; `pnpm build` exit 0 (hash `sha256:f96c93…`); `pnpm db:generate` exit 0 (client v6.19.3); migration `20260910120000_live_match_inducements` applied to dev DB :5433 (29 migrations, schema up to date). Coverage: not available (no threshold configured).
- **E2E**: not executed — documented environment limitation (auth suite requires `AUTH_MODE=auth` + Docker Postgres; ports 3000/3001 busy). `e2e/inducement-purchase.spec.ts` + pinned MVT-4 assertion in `e2e/live-match.spec.ts:871-887` remain valid by construction; render/chip covered by component tests.
- **What shipped**: pure `lib/rules/inducements.ts` catalog (16 BB2025 COMMON entries), `LiveMatch.inducements Json?` additive column + command `purchaseInducements` (ready-only, lower-TV coach, replace-cart, seq-guarded, server-derived |ΔTV| budget), ready-phase purchase UI, per-side `{budget, cards}` snapshot on all 3 close paths (result POST / `resolveLiveMatch` / `runWizardClose`) + PUT copy-forward, per-team "Incentivos" feed rows with chip pills + legacy single-row fallback.

## Spec Reconciliation (consolidated → `openspec/specs/`)

Native composition via `gentle-ai sdd-archive-compose` (all zero-exit); new capability copied mechanically (cp + empty `diff -r` readback). Blank-line compose seams repaired only (known pattern; no content changes).

| Domain | Action | Result |
|---|---|---|
| `inducements` | **Created** (new capability; no prior consolidated spec) | `openspec/specs/inducements/spec.md` — full spec IND-1..IND-5 + 13 scenarios + deferred Star Players note, byte-copied from delta |
| `live-match-realtime` | Updated (ADDED) | LM-30 · Inducement Purchase Command + 5 scenarios appended after LM-29 (before `## Acceptance Criteria`); LM-1..29 untouched |
| `match-result` | Updated (MODIFIED + ADDED) | `Atomic Result Transaction` replaced (per-side inducement snapshot in the atomic list; scenario "Per-side inducements persisted" added); ADDED `Inducement Snapshot Parity and Copy-Forward` + 3 scenarios; all other requirements untouched |
| `match-view` | Updated (MODIFIED) | MVT-4 · Finished-Feed Summary Rows replaced (per-eligible-team inducements + chip pills + legacy single-row fallback; scenarios "Per-team incentive chips render" + "Legacy single-row fallback" added); MVT-4 note "(Previously: …)" preserved |

Main-spec `Affected:` footers and unrelated requirements preserved byte-for-byte (empty-diff readback evidence at copy/move points).

## Deviations & Open Risks (documented, none blocking)

- **W1 — IND-5 verification debt (shipped)**: `NO_APOTHECARY_RACES` empty and `wizard` at a flat 150k for every race, while the purchase UI (S2) and feed (S4) are in `main`. IND-5's finalization clause ("MUST be finalized against BB2025 before the purchase UI ships") is unmet. Seams implemented (`apothecary-eligible` = "unless no-apothecary"; reserved `wizard-type`); no scenario failing. **Follow-up change required** to pin both sets before real play.
- **Deferred**: Mercenarios (dynamic cost breaks `costOverrides`; `id` reserved, excluded from purchase) and Star Players (`star-player-*` namespace reserved) — follow-up change.
- **Unused i18n keys**: `match.inducements.subtitle/purchased/error/notEligible` shipped but unreferenced (UI reuses `quantity` key for chips). Housekeeping follow-up.
- **TV derivation duplication**: 3 copies of TV derivation (store private `raceTvParts`, `inducementBudgetOf`, result-route copy) — dedupe follow-up behind a pure helper.
- **e2e auth**: spec written and wired but unexecuted in this environment — first `pnpm run test:e2e:auth` run on a free-port machine/CI validates it.
- **S1 (informational, per verify-report)**: side-less admin and rival-side coach receive 409 rather than a distinct code; matches recorded design and spec (spectator 403 / foreign 404 satisfied by LM-2 gate). No action.
- **MVT-4 e2e caution**: the pinned `summary-row` "Incentivos" single-row assertion holds only for no-purchase closes; any e2e that buys inducements must assert per-team rows.
- **ROADMAP**: no rows moved in this phase (out of openspec scope); follow-up docs recorded above.

## Rules / Config

`openspec/config.yaml` does not exist in this repo — no `rules.archive` to apply. No destructive merge was performed (all deltas ADDED/MODIFIED; no REMOVED/RENAMED).

## SDD Cycle Complete

The change was planned (explore → proposal → spec → design → tasks), implemented in 4 chained slices across 7 stacked PRs (#198–#205), verified (PASS WITH WARNINGS, 29/29 scenarios, 2458 tests), and archived. Ready for the next change.
