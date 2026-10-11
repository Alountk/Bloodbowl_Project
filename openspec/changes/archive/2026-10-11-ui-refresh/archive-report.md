# Archive Report — ui-refresh

**Change**: ui-refresh (issue #325, CLOSED)
**Phase**: sdd-archive
**Date**: 2026-10-11
**Artifact store**: openspec (filesystem only — no Engram artifacts exist for this change)
**Branch**: `main` @ `b07e5d1` (Merge PR #328). Pre-existing untracked `.opencode/opencode.json` and `odd/` present before this phase and untouched. The openspec artifacts delivered by this phase are **uncommitted — the orchestrator manages the docs commit** (per the established archive flow).

## Intent of This Archive

Full archive of a CLOSED change: the delta spec synchronized into the consolidated main specs (`openspec/specs/ui-refresh/spec.md`), the change folder moved to `openspec/changes/archive/2026-10-11-ui-refresh/`, and this archive report persisted here. This completes the SDD cycle for `ui-refresh`.

## Native Review Receipt Gate

Structured status tooling is unavailable in this environment: the Homebrew `gentle-ai` 4.0.0 on PATH reports `unknown command "sdd-status"`. Gates were therefore validated directly against native authority:

- `gentle-ai review mode status --cwd /Volumes/Mac_Nvme/Dev/bloodbowl_web` → **`receipt-driven development: off (decided by clone_local)`** (global: on; clone-local: off). The native kill switch is OFF for this clone, which is exactly the `reviewGate.delivery: disabled/unmanaged` relaxation: no terminal receipt is demanded, and none was ever created for this candidate.
- `gentle-ai review status --cwd ...` (read-only inventory) returns two `compact-v2` lineages marked `invalid` (`json: unknown field "lens_results"` — a provider defect) plus three quarantined diagnostics. **No lineage references `ui-refresh` or issue #325** (grep over `.git/gentle-ai/review-transactions/v2/` returned no match), so no review governed this candidate and no `invalid` state applies to it. The invalid/quarantined entries are pre-existing inventory diagnostics outside this change's scope.
- Conclusion: gate passes under `disabled/unmanaged`. The three merged PRs shipped under ordinary repository policy (hooks, tests, CI).

## Task Completion Gate

Persisted tasks artifact (`tasks.md`, now archived) shows **18/18 implementation tasks complete** (`[x]`, Slices 1–3), **0 unchecked** (`grep -c '^- \[ \]'` → 0, re-checked on the archived copy after the move). No stale-checkbox reconciliation was required; the gate passes without exception. `actionContext` is a standard repo-local change (not workspace-planning; no `allowedEditRoots` narrower than the authorized openspec surfaces).

## Final-State Authority

This report is the terminal record of the state AT CLOSE, ranked: native review authority (delivery disabled — none governing) → persisted tasks artifact (18/18) → orchestrator launch-prompt final-state facts → `verify-report`/`apply-progress` snapshots (lowest).

### Final state at close

- **Implementation**: complete on `main` @ `b07e5d1` via 3 stacked-to-main PRs — **#326** (flag plumbing: `lib/ui-flag/` + `app/layout.tsx` seed), **#327** (team detail seam + `TeamDetailViewV2` skeleton + flag-ON e2e harness), **#328** (full V2 desktop ledger table + mobile cards). Each slice under the 400-line budget, per the tasks forecast.
- **Verify verdict**: **PASS WITH WARNINGS** (per `verify-report.md`, at verification time on `b07e5d1`): 0 blockers, **0 CRITICAL**, 5/5 requirements, 12/12 scenarios (12 ✅ COMPLIANT), `pnpm test` **3011/3011** (210 files), `pnpm lint` exit 0, `npx tsc --noEmit` exit 0, full local e2e **26/26** (flag-OFF baseline, `AUTH_MODE=local`), dedicated flag-ON/triangulation/mobile suite **4/4**. Legacy contract frozen: zero legacy test files edited across the three merge commits. Snapshot issue counts: 0 CRITICAL / 1 WARNING / 2 SUGGESTION.
- **Warning resolved pre-archive** (orchestrator final-state fact, rank 3, confirmed in this phase by direct grep): verify **WARNING 1** — mobile e2e viewport prose said `375×812` while the implementation uses `390×844` — is **RESOLVED**: `design.md:70` and `tasks.md:29,60` now document `390×844`, matching `e2e/ui-refresh-roster.spec.ts:105`. The `verify-report.md` snapshot text still records the older 375×812 prose (it predates the fix); per Final-State Authority the resolved state above is current. The two SUGGESTIONS (design.md `app/layout.tsx` line-reference drift 42–44 vs merged :47-51; no network-level request-parity test) are doc/evidence items carried below, not defects.

## Spec Synchronization (delta → consolidated main specs)

`openspec/specs/ui-refresh/spec.md` did **not** exist, so per the skill the delta IS a full spec and was copied directly (mechanical `cp` + single-file `diff` readback, empty — byte-identical). No other main spec was read, rewritten, or touched: pre-existing capabilities (`theme-switching`, `app-shell`, `user-profile`, etc.) stay untouched — `ui-refresh` was declared a new capability with zero modified capabilities in `proposal.md`.

| Domain spec | Action | Details |
|-------------|--------|---------|
| `openspec/specs/ui-refresh/spec.md` | **Created** (new capability) | Full spec copied: UIR-1 Flag Resolution Server and Client, UIR-2 Single Team Detail Seam, UIR-3 Legacy Contract Frozen With Flag OFF, UIR-4 Flag-ON e2e for Desktop and Mobile, UIR-5 Per-Screen Flip Discipline — **5 requirements, 12 scenarios** |

## Change Folder Move (mechanical readback)

- Source: `openspec/changes/ui-refresh/` → Destination: `openspec/changes/archive/2026-10-11-ui-refresh/`
- Method: recursive `cp -R` snapshot to `mktemp -d`, plain `mv` (no staging, no content rewrite), then `diff -r snapshot destination`.
- **Verbatim `diff -r` output: EMPTY** (no differences) — the only passing evidence. `archive-report.md` is additive-only and excluded (it did not exist in the source snapshot).
- Git-friendliness: plain filesystem moves; git rename detection pairs old→new paths at the parent's `git add -A` (design.md/tasks.md carry their uncommitted viewport-prose fix into the archive folder unchanged).

## Archive Contents

- proposal.md ✅
- specs/ui-refresh/spec.md ✅ (delta preserved as the audit trail)
- design.md ✅ (includes the pre-archive viewport prose fix)
- tasks.md ✅ (18/18 `[x]`, 0 unchecked — re-checked post-move)
- verify-report.md ✅ (PASS WITH WARNINGS snapshot)
- archive-report.md ✅ (this file)

## Deferred Follow-ups (recorded at close)

1. **Default flip to V2** — a separate product decision, gated by UIR-5: only after the screen's flag-ON e2e is green (it is, 4/4) AND a deliberate decision flips the seam default; flipping must not affect other screens (no other seam consults the flag today).
2. **V2 copy is Spanish-only** until i18n keys are added — `TeamDetailViewV2` strings follow the Spanish detail-section convention; internationalization is out of scope for this change.
3. **ProfilePanel unit flake** — pre-existing `role=alert` flake in `features/profile/ProfilePanel.test.tsx`; it did NOT fire during verification (21/21 passed inside the full-suite load) but remains a known flake. Candidate for a separate issue.
4. *(carried SUGGESTION)* `design.md` cites `app/layout.tsx` "lines 42–44" for the cookie read; merged file reads at :47-51 (comment growth). Doc-only drift, safe to refresh when design.md is next edited for another reason.

## Delivery Note

Change delivered to production code as 3 merged PRs on `main` (#326, #327, #328). The openspec artifacts (new consolidated spec, archived change folder, this report) are **uncommitted by design**: the orchestrator manages the docs commit. Suggested commit: `chore(openspec): archive ui-refresh and sync ui-refresh spec (5/5, 12/12)`.

## Verdict

**ARCHIVED — cycle complete.** 18/18 tasks, verify PASS WITH WARNINGS with the single warning resolved pre-archive, new capability spec synced to the source of truth, change folder archived with a byte-identical mechanical move.
