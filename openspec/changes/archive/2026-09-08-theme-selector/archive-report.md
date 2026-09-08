# Archive Report — theme-selector

**Change**: theme-selector
**Phase**: sdd-archive
**Date**: 2026-09-08
**Artifact store**: hybrid (OpenSpec filesystem + Engram)
**Branch**: `main` @ `499fd4e` (PRs #183, #184, #185, #186 merged). Working tree clean except the openspec artifacts delivered by this phase (uncommitted — orchestrator manages the docs commit).

## Intent of This Archive

Full archive of a CLOSED change: delta specs synchronized into the consolidated main specs (`openspec/specs/{theme-switching,user-profile,app-shell}/spec.md`), change folder moved to `openspec/changes/archive/2026-09-08-theme-selector/`, and this archive report persisted to OpenSpec (here) and Engram (`sdd/theme-selector/archive-report`).

## Native Review Receipt Gate

`reviewGate` is **structurally absent** in `gentle-ai sdd-status` output (`reviewGate: null`, `reviewState: null`, `reviewTransaction: null`, `reviewReceipt: null`): the RDD review mode is DISABLED for this clone (maintainer decision documented in the kickoff-events archive report after provider defect gentle-ai #3194). No terminal receipt was ever created for this candidate. Per the Native Review Receipt Gate, with the kill switch off and no review ever governing this candidate, delivery proceeds under ordinary repository policy — the four PRs were merged under ordinary hooks/tests/CI. `dependencies.archive: ready` means proceed, not "investigate a missing gate".

## Structured Status (native, read 2026-09-08)

- `gentle-ai sdd-status theme-selector --cwd /Volumes/Mac_Nvme/Dev/bloodbowl_web --json` → `changeName: theme-selector`, `artifactStore: openspec`, `applyState: all_done`, `taskProgress: 20/20 allComplete`, `dependencies.archive: ready`, `nextRecommended: archive`, `blockedReasons: []`, `actionContext.mode: repo-local` with `allowedEditRoots: [/Volumes/Mac_Nvme/Dev/bloodbowl_web]`.

## Task Completion Gate

The persisted tasks artifact (`openspec/changes/theme-selector/tasks.md`, now archived) shows **20/20 implementation tasks complete** (`[x]`, Slice A 1.1–1.12 + Slice B 2.1–2.8), zero unchecked. Confirmed independently on the archived copy (20 `[x]`, 0 `- [ ]`). No stale-checkbox reconciliation was required; the gate passes without exception.

## Engram Observation Trace (read this phase)

| Artifact | Observation ID |
|----------|----------------|
| sdd/theme-selector/explore | #762 |
| sdd/theme-selector/proposal | #763 |
| sdd/theme-selector/spec | #764 |
| sdd/theme-selector/design | #765 |
| sdd/theme-selector/tasks | #766 |
| sdd/theme-selector/apply-progress | #767 |
| sdd/theme-selector/verify-report | #769 |
| sdd/theme-selector/archive-report | this phase (saved after this file) |

All Engram observations were retrieved in full (`mem_get_observation`) and match the filesystem artifacts byte-for-byte in substance.

## Final-State Authority

The archive report is the terminal record and reflects the state AT CLOSE per the ranking: native review authority (none here — gate absent) → persisted tasks artifact (20/20) → orchestrator final-state facts (highest-ranked account of the change) → `verify-report`/`apply-progress` snapshots (lowest).

### Final state at close

- **Implementation**: complete on `main` @ `499fd4e` via 4 stacked-to-main PRs — **#183** (PR1a plumbing) + **#184** (PR1b API) + **#185** (PR2a switcher nav) + **#186** (PR2b ProfilePanel). Each PR under the 400-line budget; the originally forecast Slice B split (2a/2b) is how the 445-line slice was delivered.
- **Verify verdict**: **PASS WITH WARNINGS** — 8/8 requirements, 23/23 scenarios, `pnpm test` **2306/2306** (163 files), `pnpm lint` clean, `npx tsc --noEmit` clean, `pnpm build` clean (22/22 static pages), `pnpm db:generate` exit 0. Runtime SSR probe (verify-time, `next start -p 3100`): no cookie → `data-theme="vintage"`; `bb-theme=scoreboard` → `data-theme="scoreboard"`; `bb-theme=grimdark` (invalid) → `data-theme="vintage"`. **0 CRITICAL / 3 WARNING / 3 SUGGESTION** in the snapshot.
- **Snapshot vs final reconciliation (Warnings resolved after verify-report was written)**:
  - Verify Warning 2 (migration NOT deployed to the dev docker DB) is **RESOLVED after close of verification**: `pnpm db:migrate` ran successfully and this phase re-checked the live container — `_prisma_migrations` on `bloodbowl_web-postgres-1` (port 5433, db `bloodbowl`) contains `20260908000000_user_theme`, and `information_schema.columns` shows `User.theme` with default `'vintage'::text`. Confirmed 2026-09-08 by direct psql query. The remaining two Warnings (e2e suite not run due to :3000/:3001 port ownership; TS-4/UP-7 evidence robustness) are environmental/evidence items with no code defect — see carried notes below.
  - Verify Warning 1 (Playwright not run) remains an environment limitation at close; the static selector audit in the snapshot showed no collisions and no theme label appears in any e2e assertion.

### Carried at close (non-blocking, for the docs delivery)

1. **ROADMAP.md line 40** still references the UI slice as `PR 2 (feat/theme-selector-slice-b)`; the merged reality is **#185/#186**. Docs follow-up owned by the orchestrator's docs commit: replace that provisional reference with `#185, #186` (aligns with the apply-progress Deviation 4 and verify SUGGESTION 1). This phase did not touch ROADMAP.md (product-doc file outside the openspec artifact scope).
2. **app-shell spec debt**: the consolidated `openspec/specs/app-shell/spec.md` still describes the legacy Sidebar/Topbar shell for the earlier requirements; the live shell chrome is `components/AppNav.tsx`. This change added AS-8 against the REAL AppNav contract and documented the delta note; a full legacy→AppNav reconciliation of the whole app-shell spec is a follow-up outside `theme-selector` (documented in the delta spec and preserved in the archived folder).
3. **user-profile scope note**: GET `/api/me` in the real route also returns `role` and `plan` (additional fields beyond the UP-4 contract); the consolidated UP-4 requirement reflects the delta contract (id/name/email/avatar/locale/theme) and does not claim exclusivity. No contradiction — the code returns a superset; recorded for completeness.
4. **Compose seam repair note**: the native `gentle-ai sdd-archive-compose` output for both existing main specs had two heading/list-item seams missing a blank line (UP-7 appended at EOF, `## Test Coverage` glued to AS-8, and the UP-4 replacement block glued to the next requirement). Content was composed natively (zero exit both runs); this phase repaired ONLY the missing blank-line separators mechanically (verified: zero glued headings remain, no content altered by the repair). This is a formatting repair, not a model-driven re-merge; the composition itself ran through the mandatory native command.

## Spec Synchronization (delta → consolidated main specs)

Per orchestrator scope: only the changed requirements were synced; all other requirements and scenarios preserved unchanged.

| Domain spec | Action | Details |
|-------------|--------|---------|
| `openspec/specs/theme-switching/spec.md` | **Created** (new capability) | Full spec copied mechanically (shell `cp` + `mktemp` + empty `diff -r`) — TS-1 Theme Set, TS-2 Server Theme Resolution, TS-3 Theme Cookie, TS-4 Anti-FOUC SSR Attribute, TS-5 Client Theme Sync (5 requirements, 10 scenarios) |
| `openspec/specs/user-profile/spec.md` | **Updated** | UP-4 Current User API MODIFIED (reconciled to the shipped contract incl. `locale` + `theme`: GET returns id/name/email/avatar/locale/theme; PATCH allowlist name/avatar/locale/theme; +3 scenarios: Update locale, Update theme, Invalid theme rejected); **UP-7 Theme Field on User ADDED** (2 scenarios). Other requirements preserved. |
| `openspec/specs/app-shell/spec.md` | **Updated** | **AS-8 Theme Toggle in Shell Chrome ADDED** (5 scenarios) against the real AppNav contract. Legacy shell requirements preserved as-is (debt documented above). |

Composition evidence: `gentle-ai sdd-archive-compose` exited 0 for both existing main specs (`user-profile`, `app-shell`); new `theme-switching` spec copied with empty `diff -r` readback. Final readback diffs (vs HEAD) appended below in Command Evidence.

## Change Folder Move (MANDATORY mechanical readback)

- Source: `openspec/changes/theme-selector/` → Destination: `openspec/changes/archive/2026-09-08-theme-selector/`
- Method: recursive `cp -R` snapshot to `mktemp -d`, `git mv` attempt (failed: source untracked — "source directory is empty"), source verified identical to snapshot, plain `mv` fallback, source-gone check, then `diff -r snapshot destination`.
- **Verbatim `diff -r` output: EMPTY** (no differences) — the only passing evidence. The `archive-report.md` file is additive-only and excluded (it did not exist in the source snapshot).

## Archive Contents

- proposal.md ✅
- specs/{app-shell,theme-switching,user-profile}/spec.md ✅ (delta specs preserved as the audit trail)
- design.md ✅
- tasks.md ✅ (20/20 `[x]`)
- apply-progress.md ✅ (cumulative Slice A + Slice B)
- verify-report.md ✅
- archive-report.md ✅ (this file)

## Delivery Note

Change delivered to production code as 4 merged PRs on `main` (#183, #184, #185, #186). The openspec artifacts (consolidated spec updates, archived change folder, this report) are **uncommitted by design**: the orchestrator manages the docs commit per the established theme-selector flow ("openspec artifacts uncommitted — orchestrator manages docs commit"). Suggested commit: `docs(openspec): archive theme-selector (sync delta specs, PASS 8/8)` (or `chore(openspec)` per the repo's historical archive-commit convention, e.g. `chore: archive avatar-profile change and sync delta specs`), plus the optional ROADMAP line-40 fix as `docs(roadmap): finalize theme-selector PR reference (#185/#186)`.

## Verdict

**ARCHIVED — cycle complete.** 20/20 tasks, verify PASS WITH WARNINGS (all warnings environmental/evidence, Warning 2 resolved by later migration deployment and re-verified at close), delta specs reconciled to the consolidated source of truth, change folder archived with byte-identical mechanical move.
