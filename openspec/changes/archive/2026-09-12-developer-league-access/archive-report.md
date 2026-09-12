# Archive Report: developer-league-access

**Change**: developer-league-access
**Artifact store mode**: OpenSpec files
**Archived to**: `openspec/changes/archive/2026-09-12-developer-league-access/`
**Archive date**: 2026-09-12
**Base commit at archive**: `8dc3dc5` (`main`) — implementation is UNCOMMITTED in the working tree (no commit performed)
**Final status**: SDD cycle complete — planned, implemented, verified, archived.

## Final State at Close

| Item | Value |
|---|---|
| Tasks | 33/33 `[x]` (S1 6/6 · S2 4/4 · S3 8/8 · S4 10/10 · S5 5/5) |
| Verification | PASS WITH WARNINGS — 0 critical, 0 blockers |
| Requirements | 15/15 compliant |
| Scenarios | 73/73 compliant |
| Tests | 2659/2659 passed (180 files), exit 0 |
| Lint / tsc | green (`pnpm lint` exit 0 · `npx tsc --noEmit` exit 0, empty output) |
| Migration | None (no `prisma/` diff) |
| Delivery | UNCOMMITTED working tree on `main` @ `8dc3dc5` — 36 changed/new paths, no commit |
| Plain-`user` parity | Status-code parity holds on every touched route (see verify-report "Security Guard" table) |

Final-state authority: the persisted `tasks.md` (33/33, zero unchecked) is the completion authority; the orchestrator's final-state handoff confirms the change is complete and verified. No intermediate snapshot contradicts it.

## Delivery

The implementation is present as an uncommitted working tree (explicitly out of scope for this phase to commit). Changed/new paths:

- **S1** `lib/permissions.ts` (+tests) · `lib/leagueAccess.ts` (new) + `lib/leagueAccess.test.ts` · `features/leagues/access.ts` (new) + `features/leagues/access.test.ts`
- **S2** `app/api/leagues/route.ts` (+tests) · `app/api/leagues/[id]/route.ts` GET (+tests)
- **S3** `app/api/leagues/[id]/route.ts` DELETE · `[id]/start/route.ts` · `[id]/members/[teamId]/route.ts` · `[id]/fixtures/[fixtureId]/route.ts` (+tests)
- **S4** `fixtures/[fixtureId]/{forfeit,result,proposals,propose,accept}/route.ts` (+tests)
- **S5** `features/leagues/api.ts` · `features/leagues/LeagueList.tsx` · `features/leagues/LeagueDetail.tsx` · `features/dashboard/Dashboard.tsx` (+tests)

## Spec Reconciliation (deltas → consolidated specs)

Delta specs were synced into the consolidated specs **before** the change folder moved to archive. Existing domains were composed with the mandatory native command (never a model Read/Edit merge); the new capability was copied mechanically with a shell `cp` + `diff -r`.

| Domain | Action | Method | Result |
|---|---|---|---|
| `league-access-control` | Created (new capability) | `cp` + `diff -r` (empty) | `openspec/specs/league-access-control/spec.md` — LAC-1..LAC-5 + 9 scenarios, byte-for-byte from the delta |
| `leagues` | Updated (MODIFIED `League User-Scoped API`, `Team Membership Assignment`, `Public Open League Listing`) | `gentle-ai sdd-archive-compose` (exit 0) + seam repair | 3 requirement blocks replaced + 8 new scenarios; `League Model`, `Open League Detail Public`, `Member Self-Leave` preserved |
| `league-season` | Updated (MODIFIED `League Status Lifecycle`, `Started League Detail Visibility`) | `gentle-ai sdd-archive-compose` (exit 0) + seam repair | 2 requirement blocks replaced + 5 new scenarios; `Round-Robin Fixture Generation`, `Jornadas View`, `Started League Locks Membership`, `Matchday Fixture Fields`, `Jornada Round Completion`, `Fixture Result Exposure`, `Season Close + Champion (RAU-40)` preserved |
| `match-result` | Updated (MODIFIED `Result Authorization`, `Correction Authorization with Audit`) | `gentle-ai sdd-archive-compose` (exit 0) + seam repair | 2 requirement blocks replaced + 3 new scenarios; `Score Validation`, `Atomic Result Transaction`, `Already-Played Guard and Idempotency`, `MVP Event Write on Result Load`, `Inducement Snapshot Parity and Copy-Forward` preserved; the pre-existing `(from RENAMED requirement)` note retained |
| `matchday-negotiation` | Updated (MODIFIED `Participant-Only Negotiation`, `Negotiation History Visible`) | `gentle-ai sdd-archive-compose` (exit 0) | 2 requirement blocks replaced + 3 new scenarios; `One Active Proposal Invariant`, `Propose Date`, `Accept Sets scheduledAt`, `Status Transition pending->scheduled`, `Rejornar` preserved |
| `matchday-forfeit` | Updated (MODIFIED `Admin-Only Forfeit`) | `gentle-ai sdd-archive-compose` (exit 0) + seam repair | requirement block replaced + 2 new scenarios; `Forfeit Sets winnerId`, `Round Completion Rule` preserved |

### Composition mechanics

- Existing domains composed with `gentle-ai sdd-archive-compose --canonical openspec/specs/{domain}/spec.md --delta openspec/changes/developer-league-access/specs/{domain}/spec.md --output <canonical>.compose-tmp` then `mv`; all five exited 0.
- The new `league-access-control` capability was copied mechanically (`cp` + `diff -r` + `mv`) and verified byte-identical.
- Known compose seam: the native composer lands the next `### Requirement:` heading directly after the last scenario bullet of a replaced block without a separating blank line. It occurred in 4 of 5 composed specs (`leagues`, `league-season`, `match-result`, `matchday-forfeit`); `matchday-negotiation` ended with the replaced block. Repaired with the same targeted mechanical normalization used by the prior archive (`perl -0pi -e 's/(\n- [^\n]*)\n(#{2,3} )/$1\n\n$2/g'`), applied only to the composed outputs. Post-repair checks: no heading lacking a preceding blank line, zero triple-newline sequences.
- `(Previously: ...)` notes inside modified requirements were preserved (the delta carries them; the composer keeps them).
- `git diff --stat` on the consolidated specs: 5 files, +152 / −10 — only the expected requirement replacements/additions; unrelated requirements preserved byte-for-byte.

## Mechanical Archive Evidence

- **New-spec copy readback**: `diff -r <delta league-access-control/spec.md> <temp copy>` → empty, exit 0 (byte-identical).
- **Folder move**: `git mv` failed (status 128 — folder untracked); source verified unchanged against a pre-move recursive `cp -R` snapshot; plain `mv` fallback applied.
- **Mandatory readback**: `diff -r <pre-move snapshot> <archive destination>` → empty, exit 0 (byte-identical move confirmed).
- **Verification**: active `openspec/changes/` contains only `archive/`; the source folder is gone; the archived `tasks.md` has 33 checked and **0 unchecked** implementation tasks; archive contains proposal, 6 delta specs, design, tasks, verify-report (plus this additive archive-report).

## Sanity Test Run (archive-time)

```text
pnpm test → Test Files 180 passed (180) · Tests 2659 passed (2659) · 0 failed
```

Matches the `verify-report` run (2659/180). The archive operation is documentation-only and did not touch production code or tests.

## Deviations and Risks

| Item | Severity | Detail |
|---|---|---|
| Implementation uncommitted | NOTE | The change ships as an uncommitted working tree per orchestrator instruction; no PRs were created and no commit was made. The SDD artifacts are archived; delivery (committing/PRs) is a separate step. |
| `pnpm test` flaky (pre-existing) | WARNING | Per `verify-report` at verification time: one full run failed 1/2659 on `features/profile/ProfilePanel.test.tsx` (a mock-isolation/parallelism flake in an untouched file); isolation and follow-up full runs were green. The archive-time run was fully green (2659/2659). |
| Real-DB auth e2e not green (optional suite) | WARNING | Per `verify-report` at verification time: 66 passed / 3 failed / 2 flaky, all outside the `leagues.manage` surface (logout-heading locale assertion bug in `profile.spec.ts`/`auth.spec.ts`, and an inducement-step render in `inducement-purchase.spec.ts`). Not a PASS for this change; route + component suites cover the change. |
| `start` no-status-leak ordering test gap | WARNING | Per `verify-report` at verification time: the DELETE path has a dedicated plain-user + STARTED test; `start` covers foreign OPEN → 404 plus privileged STARTED → 409 only. Same code pattern, low risk. |
| No route-level stale-JWT-role test | WARNING | Per `verify-report` at verification time: the DB-role mechanism is proven at helper level (`getDbRole`, `requirePermission`); route tests mock those. The design guarantee holds by construction. |

## Out-of-Scope Confirmed Absent

Audit trail for privileged actions (deferred; actor still recorded in result correction `correctedBy`); any behavior change for plain `user`; running live matches as a non-coach (`live`/`reset`/`share` stay on `live.manage`); new lifecycle rules; role assignment; schema migration.

## Follow-ups (outside the SDD archive scope)

- Commit/PR the uncommitted implementation if delivery is desired (out of scope for this phase).
- Optional: add the two coverage niceties flagged by `verify-report` (`start` plain-user + STARTED test; a route-level stale-JWT-role test) and harden the `ProfilePanel.test.tsx` mock flake.
- Optional: update `ROADMAP.md`/docs to reflect the privileged league-access behavior (docs only).

## Verdict

The change is fully planned, implemented (uncommitted working tree on `main` @ `8dc3dc5`), independently verified (15/15 requirements, 73/73 scenarios, full harness green), and archived. No CRITICAL findings. Warnings are pre-existing/environmental and coverage niceties, not code defects or regressions. SDD cycle complete.
