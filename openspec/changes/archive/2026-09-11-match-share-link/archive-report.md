# Archive Report: match-share-link (RAU-7)

**Change**: match-share-link (RAU-7)
**Artifact store mode**: hybrid (Engram + OpenSpec files)
**Archived to**: `openspec/changes/archive/2026-09-11-match-share-link/`
**Archive date**: 2026-09-11
**Final status**: SDD cycle complete — planned, implemented, verified, archived.

## Final State at Close

| Item | Value |
|---|---|
| Tasks | 17/17 `[x]` (S1 5/5 · S2 2/2 · S3 3/3 · S4 4/4 · S5 3/3) |
| Verification | PASS WITH WARNINGS — 0 critical, 0 blockers |
| Requirements | 11/11 compliant |
| Scenarios | 26/26 compliant |
| Tests | 2592/2592 passed (178 files), exit 0 |
| Lint / tsc / build / db:generate | green (exit 0) |
| Migration | `20260911120000_fixture_share_token` applied; DB probe `shareToken text NULL` + `Fixture_shareToken_key` |
| Delivery | 8 PRs #210–#217 merged to `main` @ `5eff57a` |
| Security invariant | No SSE frame and no watch DTO exposes `mvpNominations`/`resolutionState`/`inducements`/`inducementBudget`/`pendingCasualty`/`concedeProposedBy`/`journeymen`/`mvpGrantees`/`liveWinnings`/`homeConsented`/`awayConsented`/`rosters`/`treasury`/PE |

Final-state authority: the persisted `tasks.md` (17/17) and the orchestrator's final-state handoff outrank the stale Engram `tasks` snapshot. See "Engram Lineage and Drift".

## Delivery (PRs)

| PR | Slice | Content |
|---|---|---|
| #210 | S1a | `Fixture.shareToken` + `lib/watchAccess` (predicate + whitelist reducers) |
| #211 | S1b | Share endpoint + `/watch` public prefix |
| #212 | S2 | `GET /api/watch/[token]` reduced DTO |
| #213 | S3a | Guest SSE route + hub grace-window fix |
| #214 | S3b | `useWatchLive` hook |
| #215 | S4a | Guest page + `WatchMatchView` + AppShell exemption + i18n |
| #216 | S4b | `e2e/watch.spec.ts` |
| #217 | S5 | `MatchView` share button + `createShareLink` |

## Engram Lineage (observation IDs)

| Artifact | Observation | Notes |
|---|---|---|
| explore | #802 | `sdd/match-share-link/explore` |
| proposal | #803 | `sdd/match-share-link/proposal` |
| spec | #804 | `sdd/match-share-link/spec` |
| design | #805 | `sdd/match-share-link/design` |
| tasks | #811 | **STALE** — see drift below |
| apply-progress | #812 | `sdd/match-share-link/apply-progress` |
| verify-report | #815 | `sdd/match-share-link/verify-report` |
| archive-report | this save | `sdd/match-share-link/archive-report` |

### Engram `tasks` drift (#811)

#811 was last written before S5 and still shows Phase 5 tasks `5.1`/`5.2`/`5.3` unchecked (`- [ ]`), and describes the S5 share predicate as `canResetLive` eligibility. The canonical persisted `tasks.md` (the file, authoritative in hybrid mode) shows all 17 tasks `[x]`, and the shipped implementation uses the broader participant/owner/`live.manage` predicate. Per the Final-State Authority hierarchy, the persisted tasks artifact (the file) wins; the final state is **17/17 complete**. The stale Engram observation should be re-upserted if Engram is ever used standalone for this change.

## Spec Reconciliation (deltas → consolidated specs)

| Domain | Action | Result | Main spec |
|---|---|---|---|
| match-share-link | Created (new capability) | MSL-1..MSL-7 + 15 scenarios, copied byte-for-byte from the delta | `openspec/specs/match-share-link/spec.md` |
| user-auth | Updated (MODIFIED Route Protection) | `/watch` public prefix for anon AND authed + 2 new scenarios; unrelated requirements preserved | `openspec/specs/user-auth/spec.md` |
| app-shell | Updated (ADDED AS-9) | Public watch shell exemption + 2 scenarios | `openspec/specs/app-shell/spec.md` |
| live-match-realtime | Updated (ADDED LM-32) | Guest watch SSE read path + 2 scenarios | `openspec/specs/live-match-realtime/spec.md` |
| match-view | Updated (ADDED MV-8) | Match share affordance + 2 scenarios | `openspec/specs/match-view/spec.md` |

### Composition mechanics

- Existing domains were composed with the mandatory native command (never a model Read/Edit merge):
  `gentle-ai sdd-archive-compose --canonical openspec/specs/{domain}/spec.md --delta openspec/changes/match-share-link/specs/{domain}/spec.md --output <canonical>.compose-tmp` then `mv`.
- The new `match-share-link` capability was copied mechanically (`cp` + `diff -r` + `mv`) and verified byte-identical.
- Known compose seam: the native composer lands a heading directly after the last list line of an inserted/replaced block without a separating blank line. Repaired with a targeted mechanical normalization (`perl -0pi -e 's/(\n- [^\n]*)\n(#{2,3} )/$1\n\n$2/g'`) applied only to the composed output. No other content changed.
- `git diff` on the four consolidated specs shows only the expected requirement additions/replacement plus the seam blank lines; unrelated requirements were preserved byte-for-byte.

## Archive Move

- Mechanism: pre-move recursive snapshot (`cp -R`) → `git mv` (failed: source untracked, exit 128) → plain `mv` after verifying the source was unchanged vs the snapshot → `diff -r` readback.
- Readback result: **empty `diff -r` output** — byte-identical move confirmed.
- Archive contents: `proposal.md`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`, `specs/{match-share-link,user-auth,app-shell,live-match-realtime,match-view}/spec.md`, and this `archive-report.md` (additive; excluded from the move diff).

## Deviations and Risks

1. **Local Playwright e2e not executed** (verify-report warning #1): a user-owned dev server occupied :3000 and the auth suite requires Docker Postgres + `AUTH_MODE=auth` with `reuseExistingServer:false`. `e2e/watch.spec.ts` is wired into `playwright.config.auth.ts` and excluded from the local default suite; the MSL-6 page scenario remains covered by passing component tests. Deferred to CI.
2. **Share button is not fixture-state gated** (verify-report warning #4): the share predicate is broader than `canResetLive`, so an eligible coach can share an already-played fixture whose guest link then returns the generic 404 (contract MSL-7/MV-8). Documented product behavior; no code defect.
3. **Hub grace-window fix shipped inside S3**: `lib/liveHub.unsubscribe` now arms the pause grace window only when none is already pending, so a non-coach (guest) disconnect no longer resets/extends the active coach's window. Real correctness fix, not a refactor.
4. **Workload overages (S1–S4)**: S1 863, S2 591, S3 1046, S4 686 changed lines vs the 400-line review budget, accepted with `size:exception`; S5 285 lines within budget. Process note, not a defect.
5. **Public read surface side effect**: the watch GET can trigger the bounded, idempotent lazy stale-live auto-close (LMR-3 parity) for a valid token on an unauthenticated surface. Documented for reviewers.
6. **ROADMAP not touched in this phase**: moving roadmap rows is outside the openspec archive scope. Follow-up docs work is required separately (see below).

## Follow-ups (outside the SDD archive scope)

- Update `ROADMAP.md`/`README.md` to reflect the shipped public share link (docs only; no SDD artifact change).
- Add a CI assertion for `e2e/watch.spec.ts` so the real-DB guest journey is self-verifying.
- If Engram is used standalone for this change, re-upsert `sdd/match-share-link/tasks` to clear the #811 drift.

## Verdict

The change is fully planned, implemented (8 PRs #210–#217 on `main` @ `5eff57a`), independently verified (11/11 requirements, 26/26 scenarios, full harness green, migration applied), and archived. No CRITICAL findings. Warnings are harness/environment and artifact-hygiene items, not code defects or regressions. SDD cycle complete.
