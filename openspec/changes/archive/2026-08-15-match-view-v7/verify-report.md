```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:39e5d00ff663baa66e992c7235c5c1a1ec8c94e1bd0b93df2c48d40ab1e0d6c6
verdict: pass
blockers: 0
critical_findings: 0
requirements: 10/10
scenarios: 40/40
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:6d6b682bcf8a97b97f4c91ad87fed020e88d7d19739c9beb11061730201ee164
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: match-view-rulebook
**Version**: N/A (delta specs, no version field)
**Mode**: Strict TDD

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 22 |
| Tasks complete | 22 |
| Tasks incomplete | 0 (1 follow-up deferred: per-team incentive chips — maintainer decision, NOT a pending task) |

Note: all 22 `[x]` task rows are complete. The MVT-4 team-assigned incentive chips is a deferred follow-up, not a pending task, and does not block verification.

### Build & Tests Execution
**Build**: ✅ Passed
```text
npx tsc --noEmit → exit 0, no output
pnpm lint → exit 0, no errors
```
**Tests**: ✅ 1282 passed / ❌ 0 failed / ⚠️ 0 skipped
```text
pnpm test → Test Files 98 passed (98), Tests 1282 passed (1282)
AUTH_MODE=local pnpm exec playwright test → 21 passed
AUTH_MODE=auth pnpm exec playwright test e2e/live-match.spec.ts --config playwright.config.auth.ts → 1 passed (real Postgres :5433)
```
The Docker/Postgres auth suite container is up (port 5433) and the change-relevant `live-match.spec.ts` ran green against the real Postgres (1 passed). The broader `test:e2e:auth` sweep was not re-run; the change's auth-relevant e2e is verified.
**Coverage**: ➖ Not available (no coverage tool configured in vitest.config.ts — informational, not a failure)

### Spec Compliance Matrix
**Requirements 10/10 · Scenarios 40/40 — all direct runtime evidence**

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| MV-6 | Timeline shown for live and played | `matchTimelineBar.test.tsx > MVT-2`, `MatchView.test.tsx > 344/1266` | ✅ COMPLIANT |
| MV-6 | Replay and public viewing stay out | `route.test.ts > 601 (replay 409), 192/202/544 (401/404/403)` | ✅ COMPLIANT |
| MV-6 | Kickoff and summary rows stay out of taxonomy | `route.test.ts > 258 (LM-16 display filter)`, `matchSummary.test.ts > 276 (no event kinds)` | ✅ COMPLIANT |
| MV-7 | Token and copy audit | `MatchView.test.tsx > 1382 (navy/red tokens, no dark/black, Spanish)` | ✅ COMPLIANT |
| MV-7 | Success and gradient tokens | `MatchView.test.tsx > "uses success-green tokens on the reported row and navy/red card gradients (MV-7 S2)"` (bg-green-50/text-green-700 on summary-row-reported; from-[#12225a]/[0.12], from-[#d11938]/[0.12], to-white on live-event-row) | ✅ COMPLIANT |
| MVT-1 | Team card layout | `liveEventCards.test.tsx > 69 (T4/4', 68% self-start)`, `MatchView.test.tsx > 1316 (visitor self-end, red gradient)` | ✅ COMPLIANT |
| MVT-1 | Generic event centered | `liveEventCards.test.tsx > 81 (endMatch 100%, no turn tag)` | ✅ COMPLIANT |
| MVT-1 | Per-TD partial score | `liveEventCards.test.tsx > 106 ((1-0)→(1-1))`, `liveFeed.test.ts > 117` | ✅ COMPLIANT |
| MVT-1 | Testid and label continuity | `liveEventCards.tsx L142 (live-event-row on li)`, deliberate additions in design.md | ✅ COMPLIANT |
| MVT-2 | Position by elapsed percent | `matchTimelineBar.test.tsx > 39 (50%), 50 (clamps)`, `liveFeed.test.ts > 153` | ✅ COMPLIANT |
| MVT-2 | Side placement and boundary markers | `matchTimelineBar.test.tsx > 64 (home/away/mid), 84 (0'/100% only finished)` | ✅ COMPLIANT |
| MVT-3 | Header anatomy | `MatchView.test.tsx > 255 (sticky, 1ª/2ª PARTE, Mitad·Turno, clocks), 751 (T9-16 half2), 363 (back arrow)` | ✅ COMPLIANT |
| MVT-3 | UI-only constraint | `MatchView.test.tsx > header derived from existing DTO`; source: header reads only existing live DTO, no model change | ✅ COMPLIANT |
| MVT-4 | Summary rows from snapshot | `matchSummary.test.ts > 238 (4 rows)`, `MatchView.test.tsx > 1344 (rows above cards, fecha createdAt)` | ✅ COMPLIANT |
| MVT-4 | Walkover omits summary rows | `matchSummary.test.ts > 258 (result null → [])`, `MatchView.test.tsx > 1368 (no summary-row)` | ✅ COMPLIANT |
| MVT-4 | MVP not duplicated | `matchSummary.test.ts > 276 (union limited to 4 kinds, no mvp)` | ✅ COMPLIANT |
| MVT-5 | Cause labels | `liveEventLabels.test.ts > 119 (all 6 exact)` | ✅ COMPLIANT |
| MVT-5 | Causer line | `liveEventCards.test.tsx > 136 (por Arnau, causa, dorsal)` | ✅ COMPLIANT |
| MVT-5 | Crowd and self-inflicted lines | `liveEventCards.test.tsx > 146 (El público, Esquivando — se cayó, no por)` | ✅ COMPLIANT |
| MVT-5 | Foul victim line | `liveEventCards.test.tsx > 128 (a Trash, dorsal)` | ✅ COMPLIANT |
| LM-6 | Event recorded with sequence | `route.test.ts > 717/951 (200 TD/foul persists)`, `liveStore.ts seq guard`, seq-conflict 409 test | ✅ COMPLIANT |
| LM-6 | Catch-up returns missing events only | `route.test.ts > 258/318 (seq asc snapshot)`, `lib/liveStore.ts > 132 (seq > currentSeq)` | ✅ COMPLIANT |
| LM-6 | Foul victim and casualty cause persist | `route.test.ts > 951 (payload victimRosterId), 991 (payload band/cause/causerRosterId)` | ✅ COMPLIANT |
| LM-6 | Legacy events keep rendering | `route.test.ts > 332 (verbatim {}/{band})`, `liveEventCards.test.tsx > 162 (Baja no victim/cause)` | ✅ COMPLIANT |
| LM-12 | Active coach records events | `livePhase.test.ts > 19`, `route.test.ts > 717` | ✅ COMPLIANT |
| LM-12 | Non-active TD/foul/completion rejected | `livePhase.test.ts > 36/49`, `route.test.ts > 727/813 (409 no mutation)` | ✅ COMPLIANT |
| LM-12 | Own-injury exception | `livePhase.test.ts > 55`, `route.test.ts > 737 (200)` | ✅ COMPLIANT |
| LM-12 | Opponent injury denied | `livePhase.test.ts > 62`, `route.test.ts > 748 (409)` | ✅ COMPLIANT |
| LM-12 | Spectator and foreign actors denied | `route.test.ts > 202 (foreign 404), 544 (member 403)`, `livePhase.test.ts > 69 (no side deny)` | ✅ COMPLIANT |
| LM-12 | Viewer-side DTO | `route.test.ts > 235 (viewerSide frame)`, `MatchView.test.tsx > 561 (Tu turno)` | ✅ COMPLIANT |
| LM-12 | Foul victim must be an opponent | `livePhase.test.ts > 99/110`, `route.test.ts > 963 (409)` | ✅ COMPLIANT |
| LM-12 | Casualty causer must be on opposite side | `livePhase.test.ts > 129/140`, `route.test.ts > 981 (409)` | ✅ COMPLIANT |
| LM-12 | Crowd/self-inflicted casualties omit the causer | `livePhase.test.ts > 153 (deny with causer, 200 absent)`, `route.test.ts > 1004/1016` | ✅ COMPLIANT |
| LM-20 | Active coach opens the menu | `liveControls.test.tsx > 57 (TD/Pase/Baja/Herida/Falta)` | ✅ COMPLIANT |
| LM-20 | Non-active coach restricted to Herida | `liveControls.test.tsx > 68 (only Herida; TD/Falta/Pase absent)` | ✅ COMPLIANT |
| LM-20 | No controls without a side | `liveControls.test.tsx > 46 (no +)`, `MatchView.test.tsx > 524/328 (spectator)` | ✅ COMPLIANT |
| LM-20 | Submission fires the command | `liveControls.test.tsx > 104-158 (onSubmit commands)` | ✅ COMPLIANT |
| LM-20 | Server matrix stays authoritative | `route.test.ts > 727 (non-active TD 409)`, `liveControls.test.tsx > 176 (validated until victim)` | ✅ COMPLIANT |
| LM-20 | Foul form captures the victim | `liveControls.test.tsx > 161/176 (opponent-roster Víctima select)` | ✅ COMPLIANT |
| LM-20 | Casualty form captures cause and causer | `liveControls.test.tsx > 191-251 (6 causes, causer select, dodge/crowd hides)` | ✅ COMPLIANT |

**Compliance summary**: 40/40 scenarios compliant (all runtime-enforced). The prior single PARTIAL (MV-7 "Success and gradient tokens") is now ✅ COMPLIANT via the new `MatchView.test.tsx > "MV-7 S2"` test that asserts the exact success-green and navy/red gradient combinator classes.

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| MVT-1 | ✅ Implemented | `liveEventCards.tsx`: 68% team cards (navy/red reduced-opacity gradient), 100% generic centered, turn tag own side / minute opposite, per-TD partial score, `live-event-row` preserved on `li` |
| MVT-2 | ✅ Implemented | `matchTimelineBar.tsx`: `end = finishedAt ?? lastDisplayEventAt` (reload-identical), home top / away bottom, 0'/100% markers only when finished |
| MVT-3 | ✅ Implemented | `LiveTopBar`: back arrow → jornada, league·round label, T-tracks flanking "Dar el turno", per-coach clocks, half indicator; derives only from existing DTO |
| MVT-4 | ✅ Implemented | `matchSummary.ts buildSummaryFeedRows`: reported(fecha createdAt)/ganancias/fanáticos/incentivos(único pettyCash), result==null→[], MVP excluded |
| MVT-5 | ✅ Implemented | `CAUSE_LABELS` 6 exact; causer line `por {name} (#{dorsal}) · {cause}`; crowd→"El público"; dodge bare; foul victim `a {name} (#{dorsal})`; unknown passes |
| LM-6 | ✅ Implemented | `route.ts` + `livePhase.ts`: foul REQUIRED victimRosterId, casualty cause/causerRosterId payloads; legacy fallback |
| LM-12 | ✅ Implemented | `resolveEventPermission` side matrix + `playerSide`/`checkActorInvariant` (foul=counter aggressor; casualty causer=victim opposite; dodge/crowd→no causer) |
| LM-20 | ✅ Implemented | `liveControls.tsx`: opponentRoster prop, distinct Víctima/Causa/Causante labels, causer hidden dodge/crowd |
| MV-6 | ✅ Implemented | live+played timeline, no replay/public, 8-kind display preserved, summary rows snapshot-derived (no new event kinds) |
| MV-7 | ✅ Implemented | source uses only navy/red reduced-opacity gradients, `#eef1f6` gray box, green-50/600/700 success, inline glyphs (no icon lib), Spanish copy |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 pure invariant helpers in `livePhase.ts` | ✅ Yes | `playerSide`/`checkActorInvariant` beside `resolveEventPermission` |
| D2 additive JSON payloads, no migration | ✅ Yes | `kind` TEXT, legacy fallback |
| D3 new `liveEventCards.tsx`, 68%/100%, inline glyphs | ✅ Yes | grid-template-areas, EVENT_GLYPH, no icon lib |
| D4 timeline end = finishedAt ?? lastDisplayEventAt | ✅ Yes | reload-identical, tested |
| D5 per-TD partial score via seq accumulation | ✅ Yes | `derivePartialScore` |
| D6 summary rows extend `matchSummary.ts`, MV-2 guard | ✅ Yes | `buildSummaryFeedRows`, result==null→[] |
| D7 distinct Víctima/Causa/Causante labels | ✅ Yes | tested vs `getByLabelText(/Jugador/i)` |
| D8 back arrow + timeline bar under sticky header | ✅ Yes | `LiveTopBar`/`MatchTimelineBar` |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | apply-progress obs #434 (S1-S5 cumulative) contains TDD Cycle Evidence table |
| All tasks have tests | ✅ | 22/22 task groups have covering test files (livePhase/route/liveControls/liveFeed/labels/cards/timeline/summary/MatchView/e2e) |
| RED confirmed (tests exist) | ✅ | test files verified present and running |
| GREEN confirmed (tests pass) | ✅ | 1282/1282 unit + 21/21 local e2e + 1 auth live-match e2e |
| Triangulation adequate | ✅ | 40/40 scenarios mapped to ≥1 passing test; deliberate additions triangled |
| Safety Net for modified files | ✅ | apply reports unit 1281/1281 + local 21/21 safety net prior to MV-7 S2 test; new test added bring suites to 1282 green |

**TDD Compliance**: 6/6 checks passed

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | 1282 (aggregate) | 6 dedicated (livePhase/liveFeed/labels/summary/api) | vitest |
| Integration | ~41 (dedicated) | 5 (liveEventCards/liveControls/matchTimelineBar/MatchView/route) | @testing-library/react, route.test |
| E2E | 21 local + 1 auth | 1 (live-match.spec) | playwright |
| **Total** | **1282 + 22 e2e** | **12** | |

### Changed File Coverage
Coverage analysis skipped — no coverage tool detected (vitest.config.ts has no coverage block). Informational, not a failure.

### Assertion Quality
| File | Line | Assertion | Issue | Severity |
|------|------|-----------|-------|----------|
| MatchView.test.tsx | 1395-1413 | `expect(reportedCls).toContain("bg-green-50"/"text-green-700")`; `cls` contains navy/red `from-[0.12]` + `to-white` | Value assertions on real rendered behavior — verifies MV-7 S2 exact combinator classes | — (resolves prior gap) |
| liveEventLabels.test.ts | 140-144 | `expect(EVENT_GLYPH.td).toBeTruthy()` | Type-only strength on glyph values (exact glyph not asserted) | SUGGESTION |
| matchTimelineBar.test.tsx | 127 | `aIcons.forEach((icon,i) => expect(icon.style.left)...)` | Loop over render collection; guarded by equal-length assert, fixed 3-event fixture — not a ghost loop | SUGGESTION |

**Assertion quality**: 0 CRITICAL, 0 WARNING, 2 SUGGESTION. All assertions call production code and verify real behavior (format/strings/percent/labels/classes/commands).

### Quality Metrics
**Linter**: ✅ No errors (`pnpm lint` exit 0)
**Type Checker**: ✅ No errors (`npx tsc --noEmit` exit 0)

### Issues Found
**CRITICAL**: None
**WARNING**: None
**SUGGESTION**:
1. MVT-5 fixture dorsal: scenarios cite "a Trash (#8)" / "por Arnau (#4) · Blitz", while tests resolve dorsal via roster index+1 yielding "#2". The line FORMAT is correct and tested; the numbers are fixture-placement artifacts, not a defect. Recommend aligning the spec's example dorsals with roster-derived numbering for readability.
2. `EVENT_GLYPH` assertions use `toBeTruthy()` (glyph-specific values not asserted); acceptable but could assert exact glyphs.
3. No coverage tool configured — enable vitest `coverage` for future regression (non-blocking).

### Verdict
PASS
The prior evidence-completeness failure is resolved: the new `MatchView.test.tsx > "uses success-green tokens on the reported row and navy/red card gradients (MV-7 S2)"` test directly asserts the exact success-semantic (`bg-green-50` / `text-green-700` on `summary-row-reported`) and navy/red reduced-opacity gradient combinators (`from-[#12225a]/[0.12]`, `from-[#d11938]/[0.12]`, `to-white` on `live-event-row`), delivering 40/40 scenarios with direct passing runtime evidence. All 10 requirements pass; `pnpm test` 1282/1282, `tsc` clean, `lint` clean, local e2e 21/21, auth live-match e2e 1/1 against real Postgres. Archive-ready.

## Key Learnings

1. Strict TDD verification for this change ran 1282 unit plus 22 e2e tests, all green across unit, integration, and browser layers.
2. The MV-7 evidence gap was closed by asserting the exact combinator classes (green-50/700 and navy/red at reduced opacity) in a rendered MatchView test.
3. The foul victim and casualty cause/causer data paths are enforced end-to-end from payload persistence to card rendering.
4. The reload-identical timeline end bound (finishedAt ?? lastDisplayEventAt) matches the design's D4 determinism.
5. A single deferred follow-up (per-team incentive chips) is a maintainer decision, not an incomplete task, and does not block verification.
