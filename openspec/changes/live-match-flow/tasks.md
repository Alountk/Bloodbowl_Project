# Tasks: Live Match Flow

## Workload Forecast

| Field | Value |
|-------|-------|
| Est. lines | 1a ~340 / 1b ~350 / 2 ~420 / 3 ~150 / 4 ~125 |
| 400-line risk | Medium |
| Chained PRs | Yes |
| Split | 1a→1b→2→3→4 (stacked) |
| Delivery | ask-on-risk |
| Chain | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Work Units

| # | Goal | PR | Test cmd | Harn | Rollback |
|---|------|-----|----------|------|----------|
| 1 | Server core | 1a | vitest lib/{liveMatch,liveStore,liveHub}.test | N/A (pure/route) | revert mig+lib+route |
| 2 | Client+dep+e2e | 1b | vitest leagues/{CreateLeagueModal,MatchView}.test | auth e2e live-match | revert feats+api+spec |
| 3 | Matrix+nudge | 2 | vitest livePhase+live/route+liveEventLabels.test | live-match e2e | revert livePhase+route+MV |
| 4 | Rejornar | 3 | vitest propose+accept+NegotiationPanel.test | auth e2e matchday | revert locks+panel |
| 5 | Correction | 4 | vitest result/route+MatchCard.test | auth e2e match-report | revert result PUT+MatchCard |

## PR 1a — Server Core

- [x] 1.1 RED mig `<ts>_add_live_match_flow`: ALTER TYPE +'ready' (**note**: confirm PG≥12 or isolate); +consents/startedAt/turnMs (schema+SQL)
- [x] 1.2 RED consentStart/retractConsent/beginMatch `liveMatch.ts`+test (LM-11/LM-3; ready→live via begin)
- [x] 1.3 unified clock: bump outgoing acc `(now-clockStartedAt)`; deriveLiveClock; delete D4+DTO clock fields (LM-5)
- [x] 1.4 `liveStore.ts` consent/retract/begin + pause/resume repurpose (LM-7); RED test
- [x] 1.5 `liveHub.ts` ticker accumulates; **RED** grace-gate (WARNING-2): drop `if(!turnClockEnabled)return` L135; del onClockExpired+2 tests
- [x] 1.6 live/route: wire consent/retract/begin, del D4 seam, POST viewerSide (D16/D19); RED 401/403/404/409
- [x] 1.7 serializeLive+viewerSide+DTO-parity vs toLiveViewState; api/leagues drop turn-clock (D15); RED
- [x] 1.8 delete 6 D4 tests in liveMatch.test; grep 5 D4 sites clean

## PR 1b — Client + Deprecation + e2e

- [x] 1b.1 CreateLeagueModal+api.ts drop clock option; RED tests
- [x] 1b.2 useLeagues+League type: deprecated-note on clock fields
- [x] 1b.3 MatchView consent/ready/begin+clock UI; useLiveMatch keep viewerSide (D19); RED
- [x] 1b.4 e2e begin: coach side from REAL fixture owner map (home/away rand.), consent both→begin→"Dar el turno" (was `start` @L213)

## PR 2 — Permissions + Nudge

- [ ] 2.1 Create `lib/livePhase.ts` `resolveEventPermission` 6-cell matrix (D14); RED
- [ ] 2.2 live/route side-guard recordCasualty/foul (409/403/404); turnStart+requestTurn events; 60s cooldown (D17); RED
- [ ] 2.3 MatchView controls by viewerSide+"Tu turno"+"Pedir turno"; liveEventLabels 2 labels; RED tests
- [ ] 2.4 **WARNING split path**: if >400, split 2a (matrix+guards+tests) / 2b (UI+labels+tests)

## PR 3 — Rejornar

- [ ] 3.1 propose+accept: relax 409 (scheduled ok; played 409), accept updates scheduledAt; **name** route.test flips (L70/49/87)
- [ ] 3.2 NegotiationPanel gate pending|scheduled; LeagueDetail+MatchCard notes; RED
- [ ] 3.3 e2e rejornar: propose+accept updates date; history intact

## PR 4 — Correction

- [ ] 4.1 result/route PUT gate admin∪both captains 200; forfeit admin-only; RED flip route.test:476 403→200 (forfeit 403 stays)
- [ ] 4.2 MatchCard `(owner||participant)&&played`; LeagueDetail pass onCorrectResult; RED MatchCard.test
- [ ] 4.3 **net-new** e2e match-report participant-correction (SUGGESTION-4: add)

## Traceability

LM-11/12/13→1.1-1.2,2.1-2.3 · LM-3/5/7→1.2-1.5 · Deprecation→1.7,1b.1-1b.2 · Rejornar→3.1-3.3 · Correction→4.1-4.3 · ACs via RED+e2e.
