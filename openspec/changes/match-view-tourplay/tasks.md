# Tasks: Match View Tourplay Redesign

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1200–1600 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 → PR4 → PR5 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Server payloads + invariants | PR 1 | `pnpm vitest run lib/livePhase.test.ts app/api/.../live/route.test.ts` | N/A — pure unit (phase+route matrix) | revert route.ts/livePhase.ts/api.ts |
| 2 | EventControls capture | PR 2 | `pnpm vitest run features/leagues/liveControls.test.tsx` | N/A — RTL only | revert liveControls.tsx |
| 3 | Tourplay cards + feed derivations | PR 3 | `pnpm vitest run lib/liveFeed.test.ts features/leagues/liveEventLabels.test.ts features/leagues/MatchView.test.tsx` | N/A — pure/RTL | remove liveEventCards.tsx, revert MatchView.tsx |
| 4 | Timeline + summary rows + back arrow | PR 4 | `pnpm vitest run features/leagues/matchSummary.test.ts features/leagues/MatchView.test.tsx` | N/A — pure component | remove matchTimelineBar.tsx, revert matchSummary.ts |
| 5 | e2e + full sweep | PR 5 | `pnpm run test:e2e:auth` + `AUTH_MODE=local pnpm exec playwright test` | `AUTH_MODE=local pnpm exec playwright test` (real feed) | test-only commits |

## Phase 1: Server Persistence (S1)

- [x] 1.1 `lib/livePhase.ts`: add `RosterSideMap`, `playerSide`, `checkActorInvariant` (foul→opponent; casualty causer→opposite victim; dodge/crowd→causer MUST be absent, deny if present; unresolvable id→deny)
- [x] 1.2 `route.ts`: load both rosters → `RosterSideMap`, gate commands via invariant, add `victimRosterId` REQUIRED to foul command (+payload), `cause`/`causerRosterId` to casualty (+payload)
- [x] 1.3 `features/leagues/api.ts`: extend `LiveCommand` union; type `MatchResultRecord.createdAt: string`
- [x] 1.4 `livePhase.test.ts` RED+unit: foul own-side 409, causer same-side 409, dodge/crowd+causer 409, unresolvable id 409, non-active own-injury still 200
- [x] 1.5 `route.test.ts`: 409 invariant bypass, 200 foul with victim, legacy `{}`/`{band}` payload fallback renders

## Phase 2: EventRecording Controls (S2)

- [x] 2.1 `liveControls.tsx`: `opponentRoster` prop; Falta form victim select; Baja/Herida cause select + causer select
- [x] 2.2 Strict client rule: hide causer select for `dodge`/`crowd` + client-side reject if sent
- [x] 2.3 Distinct labels `Víctima`/`Causa`/`Causante` (keeps `getByLabelText(/Jugador/i)` unambiguous)
- [x] 2.4 `liveControls.test.tsx` RED+unit: capture+submit foul victim, casualty cause+causer, dodge/crowd hides causer

## Phase 3: Tourplay Cards (S3)

- [x] 3.1 `lib/liveFeed.ts`: `derivePartialScore` (per-TD "(H - A)" from seq accumulation), `timelinePercent` (round+clamp 0..100)
- [x] 3.2 `liveEventLabels.ts`: `CAUSE_LABELS` (blitz→Blitz … block→Bloqueo), move `EVENT_GLYPH` here, unknown passes through
- [x] 3.3 `liveEventCards.tsx` (create): 68% team cards (navy/red 68%-opacity gradient, turn tag own side/minutes opposite), 100% generic centered, victim "a {name} (#{dorsal})", causer "por {name} (#{dorsal}) · {cause}"; preserve `live-event-row` on `li`
- [x] 3.4 `MatchView.tsx`: swap `LiveEventsList`→`LiveEventCards`, remove local glyph/list
- [x] 3.5 Unit: cards 68%/100%, "a Trash (#8)", "por Arnau (#4) · Blitz", crowd line "El público", labels exact, unknown passes; MatchView.test.tsx deliberate updates

## Phase 4: Timeline + Summary + Header (S4)

- [x] 4.1 `matchTimelineBar.tsx` (create): `match-timeline`, icons at `round((at-startedAt)/elapsed×100)%`, home top/away bottom, 0'/100' markers when finished
- [ ] 4.2 `features/leagues/matchSummary.ts`: `buildSummaryFeedRows` (reported/ganancias/fanáticos/incentivos) from snapshot; `result==null`→`[]`; MV-2 walkover guard; report date = `result.createdAt`; MVP NOT duplicated
- [ ] 4.3 `MatchView.tsx` FinishedLiveView: render summary rows above cards; `summary-row`/`summary-row-reported`; incentives shows single `pettyCash` (chips deferred @open)
- [ ] 4.4 `LiveTopBar`: back arrow to jornada under `tourplay-header`; UI-only, existing DTO
- [ ] 4.5 `matchSummary.test.ts` RED+unit: 4 rows from snapshot, walkover→[], MVP not duplicated; MatchView.test.tsx header/summary

## Phase 5: E2E + Cleanup (S5)

- [ ] 5.1 `e2e/live-match.spec.ts`: victim/causer survive reload; cards/timeline/summary rows; labels preserved
- [ ] 5.2 Full sweep: `pnpm test`, `npx tsc --noEmit`, `pnpm lint`, auth e2e green
- [ ] 5.3 Resolve open questions: `createdAt` datetime typing; strict dodge/crowd causer reject confirmed; incentive chips follow-up slice (kickoff precedent)
