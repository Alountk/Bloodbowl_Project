# Archive Report: match-report

**Archived**: 2026-08-11
**Change**: `match-report`
**Artifact store**: hybrid (openspec + engram)
**Predecessor chain**: PR1 `feat/match-report-s1a` (#49, schema+rules) → PR2 `feat/match-report-s1b` (#50, derivation) → PR3 `feat/match-report-s2` (#51, result API) → PR4 `feat/match-report-s3` (#52, result UI) → PR5 `feat/match-report-s4` (#53, progression) → PR6 `feat/match-report-s5` (#54, e2e+polish) — all merged to main. Stacked-to-main chain.
**Status**: ✅ SDD cycle closed. Verified PASS WITH WARNINGS.
**Archive**: intended-with-warnings (see "Review Gate" and "Known Warnings Carried Into Archive" below)

---

## Final State (at close)

The change shipped BB2025 post-match resolution across the six merged PRs:

- **Schema + Rules (PR1 #49)**: additive `Team.treasury`, `Fixture.homeScore/awayScore/resultId`, `Player` reconciliation table (`@@unique(teamId,rosterPlayerId)` + pe/skills/injuries/alive/valueBonus/improvements/attributeIncreases), `MatchResult`+`MatchResultCorrection`, `PlayerPendingRoll`; pure `lib/rules/` PE awards + MJP nomination select, improvement cost table, random skills (2D6 pick, mandatory/élite), winnings `((FF1+FF2)/2+TDs+1)×10k`, fan factor win/loss/draw, 1D16 injuries with LMC, 2D6 weather, élite value +10k/+20k; `Player` backfill reconciliation. Skills catalog: `elite:true` for Placar/Esquivar/Defensa/Golpe Mortífero; `mandatory:true, elite:false` for Apariencia asquerosa/Furia (REQ-RACE-08).
- **Derivation (PR2 #50)**: `deriveFixtureStatus` score-driven (`played` from recorded result / walkover, not `winnerId` alone) + `matchStatusLabel`.
- **Result API (PR3 #51)**: `POST .../fixtures/[fixtureId]/result` in one `$transaction` (scores, winner, winnings, FF, PE incl. MJP, injuries incl. per-victim casualties, petty cash TV-diff); captain 401/404/403 semantics; 400 ΣTD≠score; 409 already-played/forfeited; admin-only PUT correction with `MatchResultCorrection` audit and `max(0,new−old)` deltas (spent PE never revoked); forfeit walkover 2-0, no PE, mutual-exclusion 409s.
- **Result UI (PR4 #52)**: `ResultModal.tsx` (Spanish league-section copy; per-player PE incl. TTM/lanzar+aterrizar, MJP 6×1-6 + 1D6) wired to POST/PUT; `MatchCard.tsx` score display; jornada completion from played-results.
- **Progression (PR5 #53)**: `ProgressionPanel` + skill-roll modal, `improve` route (server-owned rolls, `PlayerPendingRoll` kinds, cost×improvement#), élite `$` badge + tooltip, value recalc, `TeamDetailView` + owner-team progression wiring (`GET /api/teams/[id]/progression`, `features/teams/api.ts` read-only guest/rival fallback).
- **e2e + Polish (PR6 #54)**: `e2e/match-report.spec.ts` real-DB journeys (result→score→Jornada completa, PE→Block élite→`$` badge, admin correction→score update); owner progression wiring; `ballHeld` fix regression; ROADMAP update + élite-label spec fix.

**Verification (terminal, per `archive/2026-08-11-match-report/verify-report.md` S5 section, FINAL)**: verdict **PASS WITH WARNINGS**, 0 blockers, 0 critical findings, **23/23 requirements, 63/63 scenarios** across the six change specs, every scenario backed by a passing runtime test. At close: **926 unit/vitest (81 files) + 21 local e2e + 2 auth e2e (real Postgres)** all green; `pnpm lint` clean; `npx tsc --noEmit` clean. Strict TDD 6/6. The S3 latent `ballHeld` bug fixed with regression; the S4 improve-route boot clash resolved. No scope drift (exactly 15 S5 files). No CRITICAL findings, no blockers.

## Review Gate (Native Review Receipt relaxation — do not fabricate allow)

Following the repo precedent established by `avatar-profile` (2026-08-10) and prior completed changes: no full receipt-driven review governed this change. Native status shows all review artifacts missing (`reviewPolicy`/`reviewLedger`/`reviewReceipt`/`reviewContext`/`reviewState` empty) and `reviewGate: null`. The review-mode store carries only a non-interactive-review notice marker (`non-interactive-notice-shown`, 2026-08-05), i.e. review `start` is refused from producing. Consistently with prior completed-change closures, the change was archived under the **`disabled/unmanaged`** relaxation — **no `allow` was fabricated**. The relaxation is validated by the dispatcher gate state authorizing archive (`nextRecommended: archive`, `blockedReasons: []`). While non-interactive review mode is active, demanding a terminal receipt would deadlock (review `start` is refused from producing). Re-enabling receipt-driven review would require revalidating from the current state. Nothing in this archive is evidence of a receipt-validated review; it is evidence of a fully verified, six-PR-merged change closed under the disabled-review relaxation. Note: four older dangling compact review lineages in `.git/gentle-ai/review-transactions/v2/` are `malformed_compact_state` with no sanctioned exits; they never produced a terminal receipt for this change and do not govern its archive closure.

## Task Completion Gate

All implementation tasks **1.1–6.3** and chain-strategy gate **7.1** are `[x]` in `tasks.md`. Native status confirms `taskProgress: total 36, completed 36, allComplete true`. No unchecked implementation task remains — **no reconciliation was required**. The archived `tasks.md` carries zero `[ ]` rows and 36 `[x]` rows.

## Spec Sync to Source of Truth

Delta specs merged into `openspec/specs/`:

| Main spec | Action | Merge detail |
|-----------|--------|--------------|
| `openspec/specs/bb2025-rules/spec.md` | **Created** (NEW full spec) | Copied directly from delta (7 requirements, 16 scenarios) — PE, improvement cost table, random skills (mandatory vs élite), winnings/FF, injuries, weather, server-side values pinned. |
| `openspec/specs/match-result/spec.md` | **Created** (NEW full spec) | Copied directly from delta (5 requirements, 12 scenarios) — authorization, score validation, atomic transaction, already-played/idempotency, admin-only correction with audit. |
| `openspec/specs/player-progression/spec.md` | **Created** (NEW full spec) | Copied directly from delta (5 requirements, 9 scenarios) — reconciliation, PE spending, random roll, élite/value recalc, injury persistence & alive guard. Carries the S5 élite-label fix (Apariencia asquerosa `mandatory`, NOT élite). |
| `openspec/specs/league-season/spec.md` | **Updated** (2 MODIFIED + 1 ADDED) | MODIFIED "Matchday Fixture Fields" (adds `homeScore`/`awayScore`/result link, `played` from recorded result not `winnerId`; 4 scenarios) and "Jornada Round Completion" (completion from recorded scores, `homeScore`/`awayScore` exposure folded into body; 3 scenarios); ADDED "Fixture Result Exposure" (MatchCard score + winner label, result overrides schedule; 2 scenarios). All other requirements/scenarios preserved. |
| `openspec/specs/matchday-forfeit/spec.md` | **Updated** (1 MODIFIED) | MODIFIED "Forfeit Sets winnerId" (records walkover 2-0 scores, derives `played` from scores, mutual-exclusion 409 with result route, no PE on walkover; 7 scenarios). "Admin-Only Forfeit" and "Round Completion Rule" preserved. |
| `openspec/specs/race-data-bb2025/spec.md` | **Updated** (1 MODIFIED + 1 ADDED) | MODIFIED "REQ-RACE-07" (valid access set normalized to `{A,F,G,M,P,T}` random-table categories, F≠Fitness, canonical order `A→F→G→M→P→T`; 7 scenarios); ADDED "REQ-RACE-08: Skill Catalog Élite Flag" (élite vs mandatory — Placar/Esquivar/Defensa/Golpe Mortífero élite; Apariencia asquerosa/Furia mandatory not élite; 3 scenarios). REQ-RACE-01..06 preserved. |

**Merge note (least-destructive)**: the three new full specs (`bb2025-rules`, `match-result`, `player-progression`) were copied unchanged from their deltas (byte-identical `diff`). The three merged specs each applied only the exact MODIFIED/ADDED requirement blocks from their deltas; all untouched requirements and scenarios were preserved verbatim. Merge verification: the delta change's authoritative totals (23 requirements, 63 scenarios: bb2025-rules 7/16, match-result 5/12, player-progression 5/9, league-season 3/9, matchday-forfeit 1/7, race-data 2/10) are fully present in the merged main specs with matching per-requirement scenario counts. **No requirement was lost in the merge.**

## Artifacts Archived

- `proposal.md` ✅
- `specs/` ✅ (6 delta specs: bb2025-rules, league-season, match-result, matchday-forfeit, player-progression, race-data-bb2025)
- `design.md` ✅
- `tasks.md` ✅ (36 tasks 1.1–7.1 all `[x]`, no unchecked)
- `verify-report.md` ✅ (PASS WITH WARNINGS; 23/23 reqs, 63/63 scenarios; six slice sections PR1–PR6)
- `archive-report.md` ✅ (this file)

Engram traceability: `sdd/match-report/tasks` (#303) and `sdd/match-report/verify-report` (#323, S4 intermediate slice snapshot) exist in the engram store; the proposal, spec, design, and the terminal S5 verify-report live on the openspec filesystem (this hybrid change's authoritative artifacts). The archive report is persisted to engram topic `sdd/match-report/archive-report` (`capture_prompt: false`).

## Verification Checklist

- [x] Main specs updated correctly (3 created, 3 merged; no requirement lost — delta 23 reqs / 63 scenarios fully present)
- [x] Change folder moved to `openspec/changes/archive/2026-08-11-match-report/`
- [x] Archive contains all artifacts (proposal, 6 specs, design, tasks, verify-report, archive-report)
- [x] Archived `tasks.md` has no stale unchecked tasks (36/36 `[x]`, zero `[ ]`)
- [x] Active `openspec/changes/` no longer contains `match-report` (only `archive` remains)

## Known Warnings Carried Into Archive

Per the terminal verify-report (final state), the four WARNINGs are size/deviation/transparency items, all carried, non-spec-failing, non-blocking:

- **Integer-coded skills for random rolls** (WARNING): the random-pick implementation sends the skill NAME (a user-approved deviation from the earlier integer-encoding sketch); resolved and documented as intended.
- **Attribute increases value-neutral** (WARNING): attribute increases contribute no `valueBonus` change (value recompute treats them as +0), a documented behavior, not a defect.
- **Pre-existing full-auth `adminAsBye` flake** (WARNING): the full `test:e2e:auth` suite can flake once on the legacy `league-matchday adminAsBye` negotiation retry; passes on re-run, unrelated to this slice. The match-report spec itself is stable (2/2 on real Postgres).
- No per-file coverage tooling installed — informational, pre-existing repo-wide.

## SDD Cycle Complete

`match-report` has been fully planned, proposed, specified, designed, implemented (PR1 #49 → PR2 #50 → PR3 #51 → PR4 #52 → PR5 #53 → PR6 #54, stacked-to-main), independently verified (PASS WITH WARNINGS, terminal), merged, spec-synced (3 new domains created, 3 merged), and archived. Ready for the next change. The next roadmap feature is **standings** (tabla de posiciones) — result loading and matchday completion are now implemented; the standings table per jornada is the remaining pending item.
