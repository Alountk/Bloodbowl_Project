# Archive Report — ui-refresh-dashboard

**Change**: ui-refresh-dashboard (issue #339, CLOSED)
**Phase**: sdd-archive
**Date**: 2026-10-13
**Artifact store**: openspec (filesystem only — no Engram artifacts exist for this change)
**Branch/HEAD**: `feat/ui-refresh-dashboard` @ `4e235f6` == `origin/main` (`git fetch origin` re-verified at phase start: `git rev-parse origin/main` → `4e235f6b36381c5b5e0bdbc2ac33ea3b6232b1cc`). Working tree before this phase held exactly one pre-existing untracked file — `openspec/changes/ui-refresh-dashboard/verify-report.md` (the verify phase's own output, moved with the folder). The openspec artifacts produced by this phase (main-spec edit, design.md checkbox fold-in, archive move, this report) are **uncommitted — the orchestrator manages the docs commit** (per the established archive flow).

## Intent of This Archive

Full archive of a CLOSED change: the MODIFIED UIR-2 delta (three seams incl. dashboard, flag-free Landing clause, new "Landing unaffected by the flag" scenario) synchronized into the consolidated main spec (`openspec/specs/ui-refresh/spec.md`), the change folder moved to `openspec/changes/archive/2026-10-13-ui-refresh-dashboard/`, and this archive report persisted here. This completes the SDD cycle for `ui-refresh-dashboard`, seam 3 of the `bb-ui=next` program.

## Native Review Receipt Gate

Structured status (`~/go/bin/gentle-ai sdd-status ui-refresh-dashboard`, schema `gentle-ai.sdd-status@1`) exposes **no `reviewGate` field** and reported `archive: blocked` for two reasons that were classified before proceeding:

1. `discover compact review stores: invalid compact authority graph: json: unknown field "reviewer_context_level"` — a **tooling version-skew defect**: `.git/gentle-ai/review-transactions/v2/review-900e3afcdbdcbd8c/review-state.json` carries a field written by a newer gentle-ai build that the 2.2.4 reader rejects. It is a discovery failure over OTHER candidates' stores, not review state for this change.
2. `verify evidence cannot enter remediation: verify result total 5 does not match actual requirement count 1; bounded review transaction is missing` — status counts the **delta-scoped** requirement headings (1 MODIFIED) while `verify-report` reports the correct **effective post-delta** domain totals (5 requirements / 14 scenarios); the "missing bounded review transaction" is the expected shape when receipt-driven development is OFF, not a failed review.

The gate was therefore validated directly against native authority, exactly as in the 2026-10-12 `ui-refresh-teams-list` archive:

- `gentle-ai review mode status --cwd /Volumes/Mac_Nvme/Dev/bloodbowl_web` → **`receipt-driven development: off (decided by clone_local)`** (global: on; clone-local: off). The native kill switch is OFF for this clone — the `reviewGate.delivery: disabled/unmanaged` relaxation: no terminal receipt is demanded, and none was ever created for this candidate.
- `rg -l "ui-refresh-dashboard" .git/gentle-ai/` → no match (exit 1): no review lineage references this change or issue #339, so no review governed this candidate and no `invalid`/`scope-changed` state applies to it.
- Conclusion: gate passes under `disabled/unmanaged`. Both merged PRs shipped under ordinary repository policy (hooks, tests, CI).

## Task Completion Gate

Persisted tasks artifact (`tasks.md`, now archived) shows **9/9 implementation tasks complete** (`[x]`, Slices 1–2, tasks 1.1–1.5 + 2.1–2.4), **0 unchecked** (`rg -c '^- \[ \]'` on the archived copy → no match; `rg -c '^- \[x\]'` → 9). No stale-checkbox reconciliation was required; the gate passes without exception. NOTE (final-state authority): the verify report records that launch context once said "10/10" — the observed artifact contains 9 tasks (this change's slice 2 has four units); the persisted artifact's 9/9 is authoritative. `actionContext`: `mode: repo-local`, `allowedEditRoots: [/Volumes/Mac_Nvme/Dev/bloodbowl_web]` (standard repo-local change, not workspace-planning). No `openspec/config.yaml` exists, so there is no `rules.archive` to apply.

## Final-State Authority

This report is the terminal record of the state AT CLOSE, ranked: native review authority (delivery disabled — none governing) → persisted tasks artifact (9/9) → orchestrator launch-prompt final-state facts → `verify-report`/`apply-progress` snapshots (lowest).

### Final state at close

- **Implementation**: complete on `main` @ `4e235f6` via 2 stacked-to-main PRs — **#340** (merge `7d34e32`: dashboard seam in `HomeDashboard.tsx` + `DashboardV2` skeleton + flag-ON baseline e2e) and **#341** (merge `4e235f6`: full V2 desktop/mobile translation + tests). Issue **#339 CLOSED**.
- **Verify verdict**: **PASS WITH WARNINGS** (per `verify-report.md`, at verification time on `4e235f6`): 0 blockers, **0 CRITICAL**, **`pass_with_warnings`**, 5/5 requirements, **14/14 scenarios** (13 ✅ COMPLIANT, 1 ⚠️ PARTIAL, 0 FAILING, 0 UNTESTED), `pnpm test` **3055/3055** (213 files), `pnpm lint` exit 0, `npx tsc --noEmit` exit 0, full local e2e **35/35** (flag-OFF baseline, `AUTH_MODE=local`), dedicated ui-refresh suite **13/13** (detail + list + dashboard, desktop ON + triangulations + mobile + delete). Validator: `sdd-verify-validate --requirements 5 --scenarios 14` → `{"valid": true, "verdict": "pass_with_warnings"}`.
- **The 1 spec-relevant warning**: UIR-2 "Landing unaffected by the flag" is ⚠️ PARTIAL — the flag-GIVEN half is static-only (`app/page.tsx` has zero flag references; the three seam consumers are the only `useUiFlag()` call sites; the THEN half runs green in `app/page.test.tsx`). **Follow-up**: a future **auth-mode flag-ON Landing e2e** would close the runtime gap. (The report's second WARNING bullet is the PR #341 budget overrun, recorded next as the accepted size:exception.)
- **Size exception**: PR **#341** (Slice 2, merge `4e235f6`) carried **`size:exception` 737 changed lines** against the 400-line review budget (tasks.md forecast said "Slice 2 ~350; each <400") — **accepted by the orchestrator at delivery** (launch prompt, rank 3). PR #340 code stayed within budget (301 lines excluding openspec planning docs). Both PRs merged, so the exception is closed, not pending.
- **Three seams now declared**: UIR-2 restated — team detail (`app/teams/[teamId]/page.tsx`) AND teams list (`app/teams/page.tsx`) AND **dashboard (`features/dashboard/HomeDashboard.tsx`, `Dashboard` vs `DashboardV2`)**, exactly one surface mounted per seam, identical props contract (`{authenticated, userName}` for the dashboard), presentation-only V2, plus the flag-free Landing clause (anonymous branch of `/` in `app/page.tsx` MUST NOT consult the flag).

## Spec Synchronization (delta → consolidated main spec)

`openspec/specs/ui-refresh/spec.md` already existed, so the skill's **main-spec-exists** path applied. The delta `openspec/changes/archive/2026-10-13-ui-refresh-dashboard/specs/ui-refresh/spec.md` declared 1 MODIFIED requirement (5 scenarios):

- **MODIFIED UIR-2 · Declared Seams**: the full requirement block + all 5 scenarios (incl. the new "Landing unaffected by the flag") replaced the old block. Readback proof: extracting the UIR-2 block from both files (main spec: `### Requirement: UIR-2` up to but excluding `### Requirement: UIR-3`; delta: `### Requirement: UIR-2` to EOF), normalizing the trailing separator blank line, and running `diff` → **EMPTY (exit 0)**; matching **md5 `7abd6a6ec7b6d2904ffa5d4ccf4fdec5`, 35/35 lines byte-identical**.
- Old two-seam text gone: `rg 'Single Team Detail Seam|ui-v2-teams-\* marker alongside' openspec/specs/ui-refresh/spec.md` → 0 matches.
- UIR-1, UIR-3, UIR-4, UIR-5 preserved untouched (git diff of the main spec: only the UIR-2 hunk changed, 12 insertions / 6 deletions); no other main spec read, rewritten, or touched.

| Domain spec | Action | Details |
|-------------|--------|---------|
| `openspec/specs/ui-refresh/spec.md` | **Updated** (MODIFIED) | UIR-2 gains the dashboard seam, flag-free Landing clause, and 5th scenario → **5 requirements, 14 scenarios** post-sync (was 5/13); matches the verify report's effective post-delta totals 5/14 |

## Bookkeeping Folded In (pre-move, inside authorized surfaces)

- `design.md` Open Question "Zone-by-zone reuse of `PendingAttention`/`LeagueCard`" marked **`[x]` RESOLVED** — both were reused in slice 2 (`DashboardV2.tsx:204` PendingAttention, `:345` LeagueCard), per verify-report Coherence + SUGGESTION. Edited BEFORE the folder move; the move's hash readback covers the edited bytes.
- NOT applied (verify SUGGESTIONS outside this phase's explicit authorization): `proposal.md` Success Criteria checkboxes left `[ ]` (consistent with the archived predecessors); `design.md` interface-prose fetch sentence (`/api/me/dashboard` + `/api/me/stats` vs the passing allow-list that also permits `/api/leagues`) left as written — spec UIR-2 is satisfied either way.

## Change Folder Move (mechanical readback)

- Source: `openspec/changes/ui-refresh-dashboard/` → Destination: `openspec/changes/archive/2026-10-13-ui-refresh-dashboard/`
- Method: plain `mv` (no staging, no content rewrite). Readback: `shasum -a 256` of all 5 files captured before and after the move → **all five hashes identical** (e.g. `tasks.md` `0963a14a…`, `verify-report.md` `587ffeb3…`, edited `design.md` `bae54a44…`).
- Git-friendliness: plain filesystem move; `git status --porcelain` shows the 4 tracked old paths as ` D`, `openspec/specs/ui-refresh/spec.md` as ` M`, and the archive folder as untracked (`??`); `git diff --cached` empty — nothing staged. Git rename detection pairs old→new at the parent's `git add`.
- Active changes directory no longer has `ui-refresh-dashboard` (remaining active change `security-hardening` untouched).

## Archive Contents

- proposal.md ✅ (tracked)
- specs/ui-refresh/spec.md ✅ (delta preserved as the audit trail; tracked)
- design.md ✅ (tracked; reuse open question folded to RESOLVED pre-move)
- tasks.md ✅ (9/9 `[x]`, 0 unchecked — re-checked post-move; tracked)
- verify-report.md ✅ (pass_with_warnings snapshot; was the sole pre-existing untracked file, moved with the folder)
- archive-report.md ✅ (this file)

## Deferred Follow-ups (recorded at close)

1. **Default flip to V2** — a separate **product decision**, gated by UIR-5: flag-ON e2e green (13/13), so the remaining gate is the deliberate decision itself; flipping must not affect other screens (exactly three `useUiFlag()` call sites exist). Not shipped by this change.
2. **Next seams** — `ui-refresh` continues per-screen under UIR-5; remaining candidates, each its own future change: **wizard** (create-team), **leagues**, **live** (live match). Each ships flag-OFF by default, gated by its own flag-ON e2e.
3. **Landing flag-ON runtime e2e** (verify WARNING follow-up) — an auth-mode e2e that sets `bb-ui=next` while an anonymous visitor loads `/` would turn the "Landing unaffected by the flag" scenario's flag-GIVEN half from static proof into runtime proof.

## Delivery Note

Change delivered to production code as 2 merged PRs on `main` (#340, #341), issue #339 closed. The openspec artifacts (main-spec edit, design checkbox fold-in, archived change folder, this report) are **uncommitted by design**: the orchestrator manages the docs commit. Suggested commit: `chore(openspec): archive ui-refresh-dashboard and sync three declared seams (5/5, 14/14)`.

## Verdict

**ARCHIVED — cycle complete.** 9/9 tasks, verify PASS WITH WARNINGS (0 critical; 1 spec warning — Landing flag-GIVEN static-only, follow-up recorded; PR #341 size:exception 737 accepted), MODIFIED UIR-2 three-seams contract synced byte-identical into the source of truth (5 requirements / 14 scenarios), change folder archived with a hash-verified plain-`mv` move.
