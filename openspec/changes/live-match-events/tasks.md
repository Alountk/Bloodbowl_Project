# Tasks: Live Match Events — Design-A History Feed

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1425 total (PR1 ~340 / PR2 ~325 / PR3a ~275 / PR3b ~240 / PR4 ~260) |
| 400-line budget risk | Low |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3a → PR 3b → PR 4 (stacked to main) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Event model + mvp write (server) | PR 1 | `pnpm vitest run lib/liveMatch.test.ts lib/livePhase.test.ts app/api/leagues/[id]/fixtures/[fixtureId]/live/route.test.ts app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` | `gh api .../live -X POST {"type":"completion"}` active/non-active; result POST on a live fixture | revert remove `applyCompletion`, `completion` dispatch, `mvp` append in result/route.ts |
| 2 | DTO filter + pure derivations | PR 2 | `pnpm vitest run lib/liveMatch.test.ts lib/liveFeed.test.ts features/leagues/liveEventLabels.test.ts app/api/leagues/[id]/fixtures/[fixtureId]/route.test.ts` | fixture GET shows only 8 kinds replayed from DB | revert `isDisplayEvent` usage in both serializers + `lib/liveFeed.ts` |
| 3a | Design-A feed UI | PR 3a | `pnpm vitest run features/leagues/MatchView.test.tsx` | `pnpm dev` + navigate to live fixture | revert `MatchView.tsx` row render, keep `liveControls.tsx` untouched |
| 3b | Event recording controls | PR 3b | `pnpm vitest run features/leagues/liveControls.test.tsx features/leagues/MatchView.test.tsx` | `pnpm dev`, open live match, FAB→menu→mini-form per role | revert `liveControls.tsx` + `EventControls` render in `MatchView.tsx` |
| 4 | e2e + regression | PR 4 | `AUTH_MODE=local pnpm exec playwright test` | full local e2e suite (auth 31+ separate) | revert `e2e/live-match.spec.ts` edits only |

Implement stack-to-main: PR1→main, PR2→main, PR3a→main, PR3b→main, PR4→main, in order. Each green independently.

---

## PR 1 — Event model (server) + mvp write

- [x] **1.1** `lib/livePhase.ts`: add `"completion"` to `EventKind` (no permission change — resolveEventPermission already allows active-coach; non-active auto-deny).
- [x] **1.2** `lib/liveMatch.ts`: add `"completion"|"mvp"` to `LiveEventKind` union (TEXT col, no migration).
- [x] **1.3** `lib/liveMatch.ts`: add pure `applyCompletion(state, { side, playerRosterId })` — ★1 fixed, no turn flip, monotonic `seq`.
- [x] **1.4** T-unit: `applyCompletion` active-coach path persists `completion` kind with next seq and ★1, no turn flip (LM-6/LM-15, validator explicit case).
- [x] **1.5** T-unit: `applyCompletion` non-active deny → 409 no mutation (LM-15/LM-12).
- [x] **1.6** `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.ts`: dispatch `completion` (shape `{type,side,playerRosterId}`); `type:"mvp"` → 400 no mutation (LM-14 mvp-not-command).
- [x] **1.7** `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.test.ts`: completion 200/409; `mvp`→400.
- [x] **1.8** `features/leagues/api.ts`: extend `LiveCommand` with `completion` (no `mvp`, D26/D22).
- [x] **1.9** `features/leagues/liveEventLabels.ts`: add pure `bandToDisplay` (`bruise`→`{Herida,0}`; `apaleado|grave|permanent|dead`→`{Baja,2}`) + `eventSpp` (td 3, completion 1, casualty via band lasting?2:0, mvp 4) (LM-18).
- [x] **1.10** T-unit: `liveEventLabels.test.ts` — 5 bands→2 buckets; spp per kind incl. completion/mvp (LM-18).
- [x] **1.11** `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts`: add `include:{ liveMatch: ... }`; if LiveMatch exists, in-tx `aggregate({_max:{seq}})` → home mvp seq+1, away +2, rows with payload `{}`, each team's `side`, guarded row bump (D20); no LiveMatch → no write.
- [x] **1.12** T-route: result on live fixture appends home+away `mvp` monotonic seq (`at` = `lm.finishedAt ?? now` per validator); concurrent double-write P2002→409; fixture without LiveMatch unchanged (match-result all 3 scenarios).

## PR 2 — DTO filter + pure derivations

- [x] **2.1** `lib/liveMatch.ts`: add pure `isDisplayEvent(k)` — `start|td|completion|casualty|foul|endHalf|endMatch|mvp` (LM-16).
- [x] **2.2** `app/api/leagues/[id]/fixtures/[fixtureId]/live/route.ts`: `toEventDtos` filters via `isDisplayEvent` (LM-16; hub fan-out frames stay unfiltered live-only, D25).
- [x] **2.3** `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts`: `serializeLive` filters via `isDisplayEvent`; players fetched with `orderBy:{id:"asc"}` for stable dorsal (D21 validator note).
- [x] **2.4** T-route: snapshot excludes `turn|turnStart|requestTurn`; DB rows unchanged; fixture GET filter integration check (LM-16, validator explicit fixture-GET test).
- [x] **2.5** `lib/liveFeed.ts` **create**: pure `deriveMinute(at, startedAt)`→`199'`; `turnTag(half, turnNumber)`→`half===2 ? +8 : turnNumber`; `eventSpp` re-export; `deriveTeamStats(events)` per team TD/completions/casualties/fouls/★ (zeroed empty); `playerRef` dorsal map = roster index+1 (D22/D23).
- [x] **2.6** T-unit `lib/liveFeed.test.ts`: 1td+1comp+1lastingcas+1foul → 1/1/1/1/★6; empty → all 0; minute 199; T16 (LM-17/LM-19).
- [x] **2.7** `liveEventLabels.ts`: rewire casualty→`bandToDisplay`; `completion`/`mvp` labels (LM-18).
- [x] **2.8** T-unit: `liveEventLabels.test.ts` label updates (turn rows moved live-only).

## PR 3a — Design-A feed UI

- [ ] **3.1** `features/leagues/MatchView.tsx`: replace `LiveEventFeed` with Design-A row list (minute, `T{n}` tag, dorsal, name+position from detail rosters, icon, label, ★, side gradient local navy/visitor red) (LM-17).
- [ ] **3.2** `MatchView.tsx`: hero mini-stats row via `deriveTeamStats` (LM-19).
- [ ] **3.3** `MatchView.tsx`: plumb `homeTeam`/`awayTeam` `players` rosters into `FinishedLiveTimeline`/`LiveActiveMatch` for name/position/dorsal resolution (D21).
- [ ] **3.4** `MatchView.tsx`: D25 rework — nudge banner stays live-only; reload no longer restores a pending nudge (LM-16).
- [ ] **3.5** T-comp `MatchView.test.tsx`: Design-A row asserts (minute/tag/dorsal/name/position/icon/label/stars + gradient); hero stats; null-player rows; nudge-test rework asserts live-only reload behavior (LM-17).

## PR 3b — Event recording controls

- [ ] **3.6** `features/leagues/liveControls.tsx` **create**: `EventControls` FAB `fixed bottom-6 right-6` navy "+", only while `status==="live"` && `viewerSide != null`; menu from `viewerSide` vs `activeSide` (D26).
- [ ] **3.7** `liveControls.tsx`: menu — active: TD/Pase completo/Baja/Herida/Falta; non-active: Herida only (own player); mini-form player `<select>` from own roster (alive only) + 5-band `<select>` for casualty; commands map to route shapes (`td`/`completion`→playerRosterId scorer/thrower, `casualty`→victimRosterId+band, `foul`→playerRosterId) (LM-20).
- [ ] **3.8** `liveControls.tsx`: submit via `act`/busyRef; menu closes on submit (LM-20 submission).
- [ ] **3.9** `features/leagues/MatchView.tsx`: pass own roster into `LiveActiveMatch`; render `EventControls`; read `viewerSide` from merged session DTO (never raw SSE frame) (D26).
- [ ] **3.10** T-comp `liveControls.test.tsx`: menu per role (spectator no FAB; active 4 kinds; non-active Herida only); band select only casualty; submit fires `act`; menu closes (LM-20 all scenarios).
- [ ] **3.11** T-comp `MatchView.test.tsx`: FAB visible active, hidden spectator (LM-20 no-side).

## PR 4 — e2e + regression

- [ ] **4.1** `e2e/live-match.spec.ts`: update turn/label asserts (~279-332) to new feed (no turn rows); completion e2e via command.
- [ ] **4.2** `e2e/live-match.spec.ts`: Design-A row renders (minute/tag/dorsal/label/★); reload persistence; FAB→TD flow records event; non-active sees only Herida; mvp rows visible after result load.
- [ ] **4.3** Full suite green: `pnpm test`, auth e2e (31+), `pnpm lint`, `npx tsc --noEmit` (AGENTS.md).

## Traceability
LM-6→1.2-1.4 · LM-12→1.1/1.5/3.7 · LM-14→1.1/1.2/1.6/1.7 · LM-15→1.3-1.7 · LM-16→2.1-2.4/3.4/3.5 · LM-17→2.6/3.1-3.5 · LM-18→1.9/1.10/2.7/2.8 · LM-19→2.5/2.6/3.2 · LM-20→3.6-3.11 · mVmP→1.11/1.12. ACs: completion 200/409→1.4-1.7; mvp write→1.11/1.12; feed filter→2.1-2.4; row render→3.1; band→1.9/1.10; stats→2.5/2.6; reload→3.5/4.2; controls→3.6-3.11. Validator: mvp at=finishedAt 1.12 · applyCompletion case 1.4 · serializeLive test 2.4 · dorsal orderBy 2.3 · D25 nudge test 3.5.
