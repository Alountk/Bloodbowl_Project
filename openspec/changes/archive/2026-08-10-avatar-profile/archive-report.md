# Archive Report: avatar-profile

**Archived**: 2026-08-10
**Change**: `avatar-profile`
**Artifact store**: hybrid (openspec + engram)
**Predecessor chain**: PR1 `feat/avatar-profile-pr1` (#44, storage+DB) → PR2 `feat/avatar-profile-pr2` (#45, API+sharp) → PR3 `feat/avatar-profile-pr3` (#46, profile+nav) → PR4 `feat/avatar-profile-pr4` (#47, MatchCard+e2e) — all merged to main. Stacked-to-main chain.
**Status**: ✅ SDD cycle closed. Verified PASS WITH WARNINGS.
**Archive**: intended-with-warnings (see "Review Gate" and "Task Reconciliation" below)

---

## Final State (at close)

The change shipped the complete avatar/profile feature across the four merged PRs:

- **Storage + DB (PR1)**: pluggable `StorageAdapter` (`lib/storage/`) with a local-disk driver (default, writes `public/uploads/avatars/`, issues `/uploads/avatars/<key>`) and an S3 driver (issues `${S3_PUBLIC_URL}/${key}`), selected by `STORAGE_DRIVER`, with safe delete (missing key is a no-op). Additive `User.avatar String?` migration `20260810115651_add_user_avatar`.
- **Profile API + sharp (PR2)**: `POST /api/me/avatar` (session 401, >2MB 400, magic-byte sniff rejects SVG/`data:` — MIME never trusted, sharp resize to 256×256 cover-cropped WebP ONLY, server-issued key `<userId>-<uuid>.webp`, previous file deleted on replace) + `GET/PATCH /api/me` (PATCH allowlist only `name` or `avatar` null/adapter-issued value; `data:`/external → 400).
- **Profile + Nav (PR3)**: `/profile` page (Spanish copy) with react-easy-crop 1:1 crop UX (client-side canvas `toBlob()` export capped ≤1024px), `components/UserAvatar.tsx` shared component, and an English "My Profile" nav entry in the Sidebar's shared `NAV_ITEMS` (Teams + Ligas + My Profile).
- **MatchCard + E2E (PR4)**: league-detail GET carries each fixture owner's `avatar` (enrichFixture → FixtureOwnerRef → FixtureDraft, zero extra round-trips); MatchCard TeamSide renders the owner avatar when present, nothing + name fallback when absent; real-DB e2e journey (upload/render/reload/clear on `/profile` + MatchCard).

**Verification (terminal, per `verify-report.md` PR4 section, FINAL)**: verdict **PASS WITH WARNINGS**, 0 blockers, 0 critical findings, **12/12 requirements, 28/28 scenarios** accounted for (25 fully runtime-compliant; 3 app-shell scenarios PARTIAL — pre-existing behaviors, statically verified, unchanged by this change). At close: **756 unit/vitest (65 files) + 21 local e2e + 2 auth avatar e2e** green (real Postgres, no cold-start race this run); `lint` 0 errors; `tsc --noEmit` clean. Compliance rollup runtime-proven end-to-end: storage R1–R5, avatar field R1, crop R2, upload API R3, current-user API R5, My Profile nav, MatchCard R6, and the app-shell Sitebar Structure delta.

## Review Gate (Native Review Receipt relaxation — do not fabricate allow)

Following the repo precedent established by `league-matchday` (2026-08-09): no full receipt-driven review governed this change. Native status shows the review artifacts missing and the kill switch is confirmed **off** (`receipt-driven development: off (decided by global)`, `global: off`). Consistently with the prior completed-change closure, the change was archived under the **`disabled/unmanaged`** relaxation — **no `allow` was fabricated**. The relaxation is validated by the dispatcher gate state authorizing archive; while the kill switch is off, demanding a terminal receipt would deadlock (review `start` is refused from producing). Re-enabling receipt-driven review would require revalidating from current state. Nothing in this archive is evidence of a receipt-validated review; it is evidence of a fully verified, four-PR-merged change closed under the disabled-review relaxation.

## Task Completion Gate

All implementation tasks **1.1–4.4** are `[x]` in `tasks.md`. Two gate checkboxes (**5.1**, **5.2**) remained `[ ]` in the intermediate tasks snapshot.

### Reconciliation of gates 5.1–5.2 (exceptional, orchestration-approved via final-state authority)

Gates 5.1 (`pnpm test`, `pnpm lint`, `tsc --noEmit` green) and 5.2 (`AUTH_MODE=local` + `AUTH_MODE=auth` playwright) are **verification gate rows, not implementation tasks**. Per the verify-report terminal (PR4 §"Completeness" and §"Verdict"), both gates were **executed in the PR4 final verification and passed**: full unit 65/756 green, lint clean, tsc clean, local e2e 21 passed, auth avatar e2e 2 passed on real Postgres. The orchestrator's final-state handoff also states gates 5.1–5.2 are complete. Per the Final-State Authority hierarchy, the verify-report terminal receipt and the launch prompt outrank the earlier tasks snapshot; the gates' deliverable (a green final verification) is proven complete. The archived `tasks.md` marks 5.1 and 5.2 `[x]` with an explicit reconciliation note so the audit trail contains no stale unchecked task for completed work. **Reason for exceptional mechanical reconciliation (per `sdd-archive` skill)**: orchestrator explicitly instructed archive, and the terminal verify-report proves gates 5.1/5.2's deliverable (the final verification run) is complete. `sdd-archive` does not otherwise own task completion; no implementation task was reconciled — only the two gate checkboxes.

## Spec Sync to Source of Truth

Delta specs merged into `openspec/specs/`:

| Main spec | Action | Merge detail |
|-----------|--------|--------------|
| `openspec/specs/user-profile/spec.md` | **Created** (NEW full spec) | Copied from delta (6 requirements, 16 scenarios). |
| `openspec/specs/storage-adapter/spec.md` | **Created** (NEW full spec) | Copied from delta (5 requirements, 8 scenarios). |
| `openspec/specs/app-shell/spec.md` | **Updated** (MODIFIED) | MODIFIED "Sidebar Structure" requirement: nav now includes a "My Profile" link to `/profile` in the shared `NAV_ITEMS` array; scenario "Teams and Ligas navigation" replaced by "Teams, Ligas, and My Profile navigation" (asserts no other nav items); `(Previously: ...)` note updated. Test-coverage row updated to reference the Teams + Ligas + My Profile nav. All other requirements, scenarios, and test-coverage rows preserved (7 requirements unchanged). |

**Merge note (least-destructive)**: the app-shell delta is a MODIFIED requirement only — no requirement was added, removed, or renamed; only the "Sidebar Structure" requirement body, its second scenario, and the `Previously:` note were updated to reflect the added "My Profile" nav entry. All remaining app-shell content was preserved verbatim. The two new full specs (user-profile, storage-adapter) were copied unchanged from their deltas. **No requirement was lost in the merge.**

## Artifacts Archived

- `proposal.md` ✅
- `specs/` ✅ (3 delta specs: user-profile, storage-adapter, app-shell)
- `design.md` ✅
- `tasks.md` ✅ (16 implementation tasks 1.1–4.4 `[x]` + gates 5.1/5.2 reconciled `[x]`)
- `verify-report.md` ✅ (PASS WITH WARNINGS; 12/12 reqs, 28/28 scenarios; 4 slice sections PR1–PR4)
- `archive-report.md` ✅ (this file)

## Verification Checklist

- [x] Main specs updated correctly (2 created, 1 merged; all original requirements preserved — no requirement lost)
- [x] Change folder moved to `openspec/changes/archive/2026-08-10-avatar-profile/`
- [x] Archive contains all artifacts (proposal, 3 specs, design, tasks, verify-report, archive-report)
- [x] Archived `tasks.md` has no stale unchecked tasks (all 16 implementation tasks `[x]`; gates 5.1/5.2 reconciled with documented final-state evidence)
- [x] Active `openspec/changes/` no longer contains `avatar-profile` (only `archive` remains)

## Known Warnings Carried Into Archive

- Three carried **pre-existing app-shell PARTIALs** (wordmark "BLOODBOWL" + `hidden md:flex`, active navy/hover `bg-slate-100`, Ligas href → `/leagues`) are NOT runtime-asserted by any test (statically verified in `Sidebar.tsx`) — pre-existing behaviors unchanged by this change, informational, not a defect of this change. These are why the verdict is PASS WITH WARNINGS rather than PASS.
- No per-file coverage tooling installed — informational, non-blocking (pre-existing repo-wide).
- Earlier auth e2e cold-start race recorded in apply-progress was a fixed assertion-scope bug, not the documented cold-start; the PR4 terminal run was clean (14.0s, no race).

## SDD Cycle Complete

`avatar-profile` has been fully planned, proposed, specified, designed, implemented (PR1 #44 → PR2 #45 → PR3 #46 → PR4 #47, stacked-to-main), independently verified (PASS WITH WARNINGS, terminal), merged, spec-synced, and archived. Ready for the next change.
