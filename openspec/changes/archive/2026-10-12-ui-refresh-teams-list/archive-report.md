# Archive Report — ui-refresh-teams-list

**Change**: ui-refresh-teams-list (issue #335, CLOSED)
**Phase**: sdd-archive
**Date**: 2026-10-12
**Artifact store**: openspec (filesystem only — no Engram artifacts exist for this change)
**Branch**: `main` @ `0bbb987` (Merge PR #337). Working tree before this phase held exactly one pre-existing untracked file — `openspec/changes/ui-refresh-teams-list/verify-report.md` (the verify phase's own output, moved with the folder). The openspec artifacts produced by this phase (main-spec edit, archive move, this report) are **uncommitted — the orchestrator manages the docs commit** (per the established archive flow).

## Intent of This Archive

Full archive of a CLOSED change: the MODIFIED+RENAMED UIR-2 delta synchronized into the consolidated main spec (`openspec/specs/ui-refresh/spec.md`), the change folder moved to `openspec/changes/archive/2026-10-12-ui-refresh-teams-list/`, and this archive report persisted here. This completes the SDD cycle for `ui-refresh-teams-list`, seam 2 of the `bb-ui=next` program.

## Native Review Receipt Gate

Structured status tooling is unavailable in this environment (Homebrew `gentle-ai` 4.0.0 on PATH lacks the `sdd-status` command), so the gate was validated directly against native authority, as in the 2026-10-11 `ui-refresh` archive:

- `gentle-ai review mode status --cwd /Volumes/Mac_Nvme/Dev/bloodbowl_web` → **`receipt-driven development: off (decided by clone_local)`** (global: on; clone-local: off). The native kill switch is OFF for this clone — exactly the `reviewGate.delivery: disabled/unmanaged` relaxation: no terminal receipt is demanded, and none was ever created for this candidate.
- `rg -l "ui-refresh-teams-list" .git/gentle-ai/review-transactions/v2/` → no match (exit 1): no review lineage references this change or issue #335, so no review governed this candidate and no `invalid`/`scope-changed` state applies to it.
- Conclusion: gate passes under `disabled/unmanaged`. Both merged PRs shipped under ordinary repository policy (hooks, tests, CI).

## Task Completion Gate

Persisted tasks artifact (`tasks.md`, now archived) shows **10/10 implementation tasks complete** (`[x]`, Slices 1–2, tasks 1.1–1.5 + 2.1–2.5), **0 unchecked** (`rg -c '^- \[ \]'` → no match on the archived copy after the move). No stale-checkbox reconciliation was required; the gate passes without exception. `actionContext` is a standard repo-local change (not workspace-planning; no `allowedEditRoots` narrower than the authorized openspec surfaces). No `openspec/config.yaml` exists, so there is no `rules.archive` to apply.

## Final-State Authority

This report is the terminal record of the state AT CLOSE, ranked: native review authority (delivery disabled — none governing) → persisted tasks artifact (10/10) → orchestrator launch-prompt final-state facts → `verify-report`/`apply-progress` snapshots (lowest).

### Final state at close

- **Implementation**: complete on `main` @ `0bbb987` via 2 stacked-to-main PRs — **#336** (merge `d18ea78`: teams list seam + `TeamsListViewV2` skeleton + flag-ON baseline e2e) and **#337** (merge `0bbb987`: full V2 desktop/mobile translation + tests + delete parity). Issue **#335 CLOSED**.
- **Verify verdict**: **PASS, 0 warnings** (per `verify-report.md`, at verification time on `0bbb987`): 0 blockers, **0 CRITICAL**, **0 WARNING**, 5/5 requirements, **13/13 scenarios** COMPLIANT, `pnpm test` **3040/3040** (212 files), `pnpm lint` exit 0, `npx tsc --noEmit` exit 0, full local e2e **31/31** (flag-OFF baseline, `AUTH_MODE=local`), dedicated ui-refresh suite **9/9** (detail + list, desktop ON + triangulations + mobile + delete). Legacy contract frozen: zero legacy test edits across both merge commits (only this change's own declared `e2e/ui-refresh-roster.spec.ts` and its new component suite changed). Validator: `sdd-verify-validate --requirements 5 --scenarios 13` → `{"valid": true, "verdict": "pass"}`.
- **Size exception**: PR #337 (Slice 2) carried **`size:exception` 642** (authored lines over the 400-line review budget), accepted by the orchestrator at delivery per the launch prompt (rank 3); PR #336 stayed under budget. Recorded here as the accepted exception of record — both PRs are merged, so the exception is closed, not pending.
- **Two seams now declared**: UIR-2 restated from "Single Team Detail Seam" to "**Declared Seams**" — team detail (`app/teams/[teamId]/page.tsx`, `TeamDetailView` vs `TeamDetailViewV2`) AND teams list (`app/teams/page.tsx`, `TeamsPage` vs `TeamsListViewV2`), exactly one surface mounted per seam, identical props contract, presentation-only V2.

## Spec Synchronization (delta → consolidated main spec)

`openspec/specs/ui-refresh/spec.md` already existed (created by the archived `ui-refresh` change), so the skill's **main-spec-exists** path applied. The delta `openspec/changes/ui-refresh-teams-list/specs/ui-refresh/spec.md` declared 1 MODIFIED requirement (4 scenarios) + 1 RENAMED pairing (old → new title explicit, with Reason/Migration notes):

- **MODIFIED UIR-2**: the full requirement block + all 4 scenarios replaced the old block verbatim. Readback proof: extracting the UIR-2 block from both files and running `diff` → **EMPTY** (30/30 lines byte-identical to the delta).
- **RENAMED**: `UIR-2 · Single Team Detail Seam` → `UIR-2 · Declared Seams` — landed via the MODIFIED block's heading; `rg 'Single Team Detail Seam' openspec/specs/ui-refresh/spec.md` → no match. The rename's Reason/Migration notes remain delta metadata (not copied into the main spec).
- UIR-1, UIR-3, UIR-4, UIR-5 preserved untouched; no other main spec read, rewritten, or touched.

| Domain spec | Action | Details |
|-------------|--------|---------|
| `openspec/specs/ui-refresh/spec.md` | **Updated** (MODIFIED + RENAMED) | UIR-2 retitled "Declared Seams" with 4 scenarios (was 3) → **5 requirements, 13 scenarios** post-sync (was 5/12); matches the verify report's effective post-delta totals 5/13 |

## Change Folder Move (mechanical readback)

- Source: `openspec/changes/ui-refresh-teams-list/` → Destination: `openspec/changes/archive/2026-10-12-ui-refresh-teams-list/`
- Method: recursive `cp -R` snapshot to `mktemp -d`, plain `mv` (no staging, no content rewrite), then `diff -r snapshot destination`.
- **Verbatim `diff -r` output: EMPTY** (exit 0) — the only passing evidence.
- Git-friendliness: plain filesystem moves; `git status` shows the old paths as ` D` and the archive folder as untracked, and git rename detection pairs old→new at the parent's `git add -A`.
- Active changes directory no longer contains `ui-refresh-teams-list` (remaining active change `security-hardening` untouched).

## Archive Contents

- proposal.md ✅ (tracked)
- specs/ui-refresh/spec.md ✅ (delta preserved as the audit trail; tracked)
- design.md ✅ (tracked)
- tasks.md ✅ (10/10 `[x]`, 0 unchecked — re-checked post-move; tracked)
- verify-report.md ✅ (PASS snapshot; was the sole pre-existing untracked file, moved with the folder)
- archive-report.md ✅ (this file)

## Deferred Follow-ups (recorded at close)

1. **Default flip to V2** — a separate **product decision**, gated by UIR-5: the flag-ON e2e is green (9/9), so the remaining gate is the deliberate decision itself; flipping must not affect other screens (only the two declared seams consult `useUiFlag()`). Not shipped by this change.
2. **Delete parity note** — not pending: **implemented per the #328 rule** ("la V2 no esconde nada", parity precedent from #325 slice 3). Card delete in `TeamsListViewV2` wires through the SAME store-handler channel + reusable `TeamDeleteModal` legacy uses, Spanish guard copy, zero legacy edits; proven at component level (`TeamsListViewV2.test.tsx:338/:360`) and runtime (`e2e/ui-refresh-roster.spec.ts:176`). Design open question marked RESOLVED.
3. **TV valueBonus omission** — a **documented deviation**: the V2 team card shows TV without the valueBonus breakdown legacy displays. Recorded as an intentional, documented presentation deviation of the Stitch `05 teams` translation; not a UIR-2 contract violation (markup parity is not required — "only markup differs"). Follow up only if the card must carry the breakdown.
4. **ProfilePanel `role=alert` flake** — **pre-existing** (`features/profile/ProfilePanel.test.tsx`), did NOT fire during verification (21/21 passed inside the full-suite load). Candidate for a separate issue; outside this change's scope.
5. *(carried SUGGESTION from verify-report)* No network-level request-parity test compares a list action across the two surfaces; parity is enforced structurally (zero-props seam + shared-provider imports + presentation-only source guard + store-channel delete tests). Optional future flag-ON e2e if the seam grows.

## Next-Seam Candidates (future changes)

`ui-refresh` continues per-screen under UIR-5; each candidate is its own future change with its own proposal/spec/tasks/verify cycle:

- **dashboard** (home screen)
- **wizard** (create-team wizard)
- **leagues** (leagues list/detail)
- **live** (live match)

None of these seams exists yet: `useUiFlag()` currently has exactly two call sites (the two declared seams). Each candidate ships flag-OFF by default, gated by its own flag-ON e2e.

## Delivery Note

Change delivered to production code as 2 merged PRs on `main` (#336, #337), issue #335 closed. The openspec artifacts (main-spec edit, archived change folder, this report) are **uncommitted by design**: the orchestrator manages the docs commit. Suggested commit: `chore(openspec): archive ui-refresh-teams-list and sync declared seams (5/5, 13/13)`.

## Verdict

**ARCHIVED — cycle complete.** 10/10 tasks, verify PASS (0 warnings), MODIFIED UIR-2 declared-seams contract synced byte-identical into the source of truth (5 requirements / 13 scenarios), change folder archived with a byte-identical plain-`mv` move.
