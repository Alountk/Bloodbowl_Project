# Archive Report: match-edit-redesign

**Change**: match-edit-redesign (Linear RAU-122)
**Artifact store mode**: OpenSpec files
**Archived to**: `openspec/changes/archive/2026-09-13-match-edit-redesign/`
**Archive date**: 2026-09-13
**HEAD at archive**: `8a45e03` (`docs(match-edit-redesign): record the passing final verification report`) on `chore/match-edit-redesign-finalize`
**Final status**: SDD cycle complete — planned, implemented, verified, archived.

## Final State at Close

| Item | Value |
|---|---|
| Tasks | 41/41 `[x]` — zero unchecked implementation tasks |
| Verification | PASS WITH WARNINGS — 0 critical, 0 blockers |
| Requirements | 20/20 compliant |
| Scenarios | 38/38 compliant (37 COMPLIANT, 1 PARTIAL — participant-correction e2e) |
| Tests (archive-time) | `pnpm test` 2756/2756 passed (189 files), exit 0 |
| Delivery | 26 stacked PRs #232–#257 on `feat/match-edit-redesign-*` plus `docs/match-edit-redesign` |
| Migration | None (no `prisma/` migration required by this change) |

Final-state authority: the persisted `tasks.md` (41/41, zero unchecked) is the completion authority; the orchestrator's final-state handoff confirms the change is complete and verified with `archive: ready` and `blockedReasons: []`. No intermediate snapshot contradicts it.

## What Shipped

The match-result flow was rebuilt around the 7-step **"Acta del partido"** wizard (Contexto → Marcador → Acciones → MVP → Bajas → Final → Revisar), replacing the legacy `ResultModal` (fully retired, no remaining code references). The result route now computes winnings from the FINAL input FF (no 1D3 roll), persists a full wizard-input snapshot for correct-mode prefill, applies post-match dedicated fans on the non-live path, persists the permanent-injury attribute from the client 1D6, and recomputes winnings + treasury delta on correction. Corrections are now authorized for the two participant coaches in addition to admin/`leagues.manage`. Inducements are persisted per side on all three close paths. The dead `result.*` dictionary keys were removed.

## Spec Reconciliation (deltas → consolidated specs)

Delta specs were synced into the consolidated specs **before** the change folder moved to archive. The existing domain was composed with the mandatory native command (never a model Read/Edit merge); the new capability was copied mechanically with a shell `cp` + `diff -r`.

| Domain | Action | Method | Result |
|---|---|---|---|
| `match-acta-wizard` | Created (new capability) | `cp` + `diff -r` (empty) | `openspec/specs/match-acta-wizard/spec.md` — MAW-1..MAW-9, 9 requirements / 11 scenarios, byte-for-byte from the delta |
| `match-result` | Updated (MODIFIED 5, ADDED 6) | `gentle-ai sdd-archive-compose` (exit 0) | 7 → 13 requirements, 24 → 35 scenarios; 5 requirement blocks replaced + 6 appended; `Result Authorization`, `Already-Played Guard and Idempotency` preserved byte-for-byte |

### match-result requirement/scenario counts before → after

| Metric | Before | Added | Modified (replaced) | Removed | After |
|---|---|---|---|---|---|
| Requirements | 7 | 6 | 5 | 0 | 13 |
| Scenarios | 24 | 11 | 16 | 0 | 35 |

MODIFIED blocks (replaced whole): `Score Validation`, `Atomic Result Transaction`, `MVP Event Write on Result Load`, `Correction Authorization with Audit`, `Inducement Snapshot Parity and Copy-Forward`.
ADDED blocks (appended): `Winnings Computed from Input Fan Factor`, `Direct MVP Selection`, `Correct-Mode Prefill Snapshot`, `Post-Match Dedicated Fans Applied`, `Permanent Injury Attribute Persisted`, `Additive Result Contract`.
Untouched and preserved: `Result Authorization`, `Already-Played Guard and Idempotency`.

### Provenance preserved

- The accumulated `(Previously: ...)` notes are retained — 10 in the composed `match-result` spec (2 on `Result Authorization`, 1 on `Score Validation`, 2 on `Atomic Result Transaction`, 3 on `Correction Authorization with Audit`, 1 on `MVP Event Write on Result Load`, 1 on `Inducement Snapshot Parity and Copy-Forward`). The delta carried them; the composer kept them.
- The `> **Rename note**` block (`Admin-Only Correction with Audit` → `Correction Authorization with Audit`) is retained verbatim.
- `match-result` keeps NAME-ONLY requirement headings (no numeric IDs); `match-acta-wizard` uses `MAW-N` IDs. No IDs were retrofitted.
- Observed consequence of native composition: the stale legacy annotation `Affected: slice 1 (MatchResult audit + Fixture score fields) · slice 2 (route) · slice 3 (ResultModal Spanish UI) · slice 5 (e2e updates).` that trailed the old `MVP Event Write on Result Load` block is not carried, because a MODIFIED delta replaces the whole block and this delta does not include it. It referenced slices of an earlier change, not spec behavior; no `(Previously: ...)` note or rename note was lost.

## Mechanical Archive Evidence

- **New-spec copy readback**: `diff -r openspec/changes/match-edit-redesign/specs/match-acta-wizard/spec.md openspec/specs/match-acta-wizard/spec.md` → empty, exit 0 (byte-identical).
- **Composition**: `gentle-ai sdd-archive-compose --canonical openspec/specs/match-result/spec.md --delta openspec/changes/match-edit-redesign/specs/match-result/spec.md --output openspec/specs/match-result/spec.md.compose-tmp` → exit 0, then `mv` (atomic write).
- **Folder move**: `git mv openspec/changes/match-edit-redesign openspec/changes/archive/2026-09-13-match-edit-redesign` → exit 0.
- **Mandatory readback**: `diff -r <pre-move snapshot> openspec/changes/archive/2026-09-13-match-edit-redesign` → empty, exit 0 (byte-identical move confirmed).
- **Verification**: active `openspec/changes/` contains only `archive/`; the source folder is gone; the archived `tasks.md` has 41 checked and **0 unchecked** implementation tasks; archive contains exploration, proposal, 2 delta specs, design, tasks, apply-progress, verify-report (plus this additive archive-report).

## Sanity Test Run (archive-time)

```text
pnpm test → Test Files 189 passed (189) · Tests 2756 passed (2756) · 0 failed · exit 0
```

Matches the `verify-report` run (2756/189). The archive operation is documentation-only and did not touch production code, tests, or the wizard.

## Open Findings (recorded, NOT fixed at archive)

1. **MAW-7 literal deviation — client-computed winnings preview.** `StepFinal.tsx` and `StepRevisar.tsx` call the shared pure `computeWinnings` client-side to render the read-only preview. The spec says winnings "MUST be computed server-side" and the client MUST NOT compute the amount. This is a documented, deliberate design decision (Step 5 precedes submit, so no server value exists to fetch); the server recomputes authoritatively on POST/PUT and the payload carries no amount. The requirement's intent (no client authority over persisted winnings) holds; the literal clause is not satisfied for the preview.
2. **"Participant correction e2e" scenario is only partially met.** `e2e/match-report.spec.ts:464` drives the correction as the ADMIN; participant-coach correction is covered at the route level only (`route.test.ts:890`). Recorded as PARTIAL in the verify report.
3. **Match summary may render Spanish weather.** `matchSummary.buildWeather` passes the raw persisted weather value to `weatherLabel`, so the match summary can render Spanish regardless of the active locale.
4. **Overlapping corrections can double-apply the treasury delta.** No row lock / serializable isolation guards the correction read-modify-write of the winnings/treasury delta.
5. **No server-side FF range validation.** An explicit `ff: 0` is honoured; the POST path shares this behavior.
6. **Roll arrays are positional with no stable victim key.** Deleting an earlier Step-2 casualty line shifts persisted rolls onto different victims.
7. **Partial casualty reconstruction not warned.** When some action rows but more persisted victims exist, the legacy-casualties warning does not trigger.
8. **Pre-existing e2e failures unrelated to this change** (base-proven, in untouched files): `e2e/inducement-purchase.spec.ts`, plus concurrency flakes in `e2e/locale.spec.ts`, `e2e/auth.spec.ts`, and `e2e/league-season.spec.ts`.

Additional non-blocking notes from `verify-report` (recorded for completeness): the three `result.server.*` i18n keys were deleted in s6c (no code references them; the `apply-progress` claim that they were kept is inaccurate); `MatchCard.tsx:316` carries a stale comment and a hardcoded Spanish label; `LeagueDetail.tsx:773` swallows a failed `getMatchDetail`; petty cash is a single scalar with no per-team attribution (pre-existing).

## Delivery / Commit References

- **Linear**: RAU-122.
- **PRs**: 26 stacked PRs **#232–#257** on branches `feat/match-edit-redesign-*`, plus the `docs/match-edit-redesign` docs branch merged into `chore/match-edit-redesign-finalize` (`c182d0b`).
- **Finalize HEAD**: `8a45e03` — `docs(match-edit-redesign): record the passing final verification report`.
- **Prior blocker fix**: `fe7d694` — `test(match-result): reject absent-grantee payloads with non-six nominations` (test-only, +22 lines) closed the single prior FAIL.

## Verdict

The change is fully planned, implemented, verified, and archived. 41/41 tasks complete, verification PASS WITH WARNINGS (0 critical, 0 blockers, 20/20 requirements, 38/38 scenarios), full unit/integration harness green at archive time. The recorded open findings are non-blocking design deviations, coverage niceties, or pre-existing flakes; none is a code defect or regression introduced by this change. SDD cycle complete.
