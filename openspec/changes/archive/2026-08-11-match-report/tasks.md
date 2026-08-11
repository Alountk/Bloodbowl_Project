# Tasks: Match Report (BB2025 post-match resolution)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1900 (Schema+Rules 600 / Result API 450 / Result UI 300 / Progression 350 / e2e 200) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | S1a → S1b → S2 → S3 → S4 → S5x2 |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| S1a | schema + migration + lib/rules + skills catalog | PR 1 | `pnpm test lib/rules features/teams/data` | `db:generate`; `ensurePlayersForTeam` via seed | revert schema + `migrate down` + lib/rules/* |
| S1b | derivation/rounds + route.test updates | PR 2 | `pnpm test app/api/leagues features/leagues` | league detail GET with recorded vs winnerId-only fixtures | revert `[id]/route.ts` + route.test.ts |
| S2 | result API POST/PUT + audit + forfeit 2-0 | PR 3 | `pnpm test app/api/leagues/[id]/fixtures` | captains/admin POST then admin PUT; curl with session | revert result+forfeit routes; delete MatchResult rows |
| S3 | ResultModal + MatchCard score + jornada | PR 4 | `pnpm test features/leagues features/teams` | e2e-ish: load score through modal, MatchCard shows score | revert ResultModal/MatchCard components |
| S4 | ProgressionPanel + improve route + élite badge | PR 5 | `pnpm test features/teams` | spend PE, open skill-roll modal, roll server-owned | revert improve route + ProgressionPanel |
| S5 | e2e + polish + ROADMAP/archive prep | PR 6 | `npx playwright test league-matchday` | full load→score→jornada completa flow | revert e2e/* + ROADMAP |

## S1a: Schema + Rules Foundation

- [x] 1.1 RED `prisma/schema.prisma`: add `Team.treasury`, `Fixture.homeScore/awayScore/resultId`, `Player@@unique(teamId,rosterPlayerId)` + pe/skills/injuries/alive/valueBonus/improvements/attributeIncreases, `MatchResult`+`MatchResultCorrection`, `PlayerPendingRoll` → `migrate dev`
- [x] 1.2 RED `lib/rules/pe.test.ts`: TD3·MJP4·Int2·CAS2·Comp1·TTM1·LS1 pinned (bb2025-rules R1)
- [x] 1.3 GREEN `lib/rules/pe.ts`: awards + MJP 1D6 nomination select
- [x] 1.4 RED `lib/rules/improvements.test.ts` + `fanFactor`/`winnings` tests: costs table rows, `((FF1+FF2)/2+TDs+1)×10k` .5 preserved, FF win↑max7 loss↓min1 (R2, R4)
- [x] 1.5 GREEN `lib/rules/improvements.ts` `winnings.ts` `fanFactor.ts`
- [x] 1.6 RED `lib/rules/skills.test.ts`: 6-col A/F/G/M/P/T table, 2D6 pick, duplicate, owned re-roll, mandatory (R3)
- [x] 1.7 GREEN `lib/rules/skills.ts` + `lib/rules/index.ts`
- [x] 1.8 RED `lib/rules/injuries.test.ts`: 1D16 rows, LMC +1, perm 1D6 (1-2 −AR), death (R5)
- [x] 1.9 RED `lib/rules/weather.test.ts`: 2D6 full effects incl. heat/blizzard (R6); GREEN `injuries.ts`+`weather.ts`
- [x] 1.10 RED `lib/value.ts` test: +10k normal / +20k élite → green `value.ts`
- [x] 1.11 Modify `features/teams/data/skills.ts`: `elite:true` Placar/Esquivar/Defensa/Golpe Mortífero; `mandatory:true,elite:false` Apariencia asquerosa/Furia; update `skills.test.ts` (REQ-RACE-08)
- [x] 1.12 RED `lib/players.test.ts` (idempotent, unknown skipped) + GREEN `lib/players.ts ensurePlayersForTeam`
- [x] 1.13 Verify `pnpm test` + `db:generate` green; commit unit S1a

## S1b: Derivation + route.test

- [x] 2.1 RED `app/api/leagues/[id]/route.test.ts`: `played ⇔ scores present`, winnerId-alone NOT played, round `complete` only all-results (league-season)
- [x] 2.2 GREEN `app/api/leagues/[id]/route.ts`: `deriveFixtureStatus` score-driven + `matchStatusLabel` score switch
- [x] 2.3 Update `route.test.ts` intentional assertion changes; commit S1b

## S2: Result API + Forfeit

- [x] 3.1 RED `result/route.test.ts`: captain POST ok; stranger 404; unauth 401; ΣTD≠score 400; played 409; forfeited 409; draw→winner null (match-result R1-R2, R4)
- [x] 3.2 RED `result/route.test.ts`: one-tx atomicity rollback; winnings/FF/PE/injuries/petty cash TV-diff (R3)
- [x] 3.3 GREEN `.../fixtures/[fixtureId]/result/route.ts`: POST loads in one `$transaction` (scores,winner,winnings,FF,PE incl. MJP, injuries, pettyCash) via `lib/rules`
- [x] 3.4 RED correction tests: captain 403; admin PUT audit before/after; spent PE never revoked (R5)
- [x] 3.5 GREEN PUT correction + `MatchResultCorrection` audit + `max(0,new−old)` deltas
- [x] 3.6 RED `forfeit/route.test.ts`: walkover scores 2-0, PE skipped, result-loaded 409, closes proposals; GREEN forfeit route updates (matchday-forfeit)
- [x] 3.7 `features/leagues/api.ts`: result client types + calls; commit S2
- [x] 3.8 S2b per-player injury persistence: `TeamResultInput.casualties` victim list (team + rosterPlayerId, server 1D16); result + correction routes persist outcomes to `Player.injuries[]`/`alive:false` (skip unknown, already-dead, duplicates); snapshot records per-victim casualties; lib/result `resolveCasualtyOutcomes` (player-progression R5)

## S3: Result UI

- [x] 4.1 RED `ResultModal.test.tsx` (textContent, no jest-dom): score inputs, per-player PE incl. TTM/lanzar+aterrizar fields, MJP 6×1-6 + 1D6 display (match-result, TTM binding)
- [x] 4.2 GREEN `ResultModal.tsx` (Spanish league-section copy) wired to POST/PUT + refresh
- [x] 4.3 RED `MatchCard.test.tsx`: score + winner label render (league-season fixture exposure)
- [x] 4.4 GREEN `MatchCard.tsx` score display + `LeagueDetail` jornada completion from played-results; commit S3

## S4: Progression UI + API

- [x] 5.1 RED `improve/route.test.ts`: 404 dead-payer/user-scoped; 409 alive; 400 PE; rolls server-owned (player-progression R2-R3)
- [x] 5.2 GREEN `.../improve/route.ts`: `PlayerPendingRoll` kinds + pick validation; `lib/improvements` cost×improvement#
- [x] 5.3 RED `ProgressionPanel.test.tsx`: spend PE, élite `$`+tooltip, value recalc (R4); GREEN `ProgressionPanel.tsx` + skill-roll modal
- [x] 5.4 `TeamDetailView` + `features/teams/types.ts`: pe/skills/injuries/valueBonus render; commit S4

## S5: e2e + Polish + Docs (final slice)

- [x] 6.1 Owner-team progression wiring: `features/teams/api.ts` (fetchTeamProgression + improvePlayer), `GET /api/teams/[id]/progression`, TeamDetailView.onImprove(rosterPlayerId, body), page passes progression/onImprove for owner teams (read-only fallback on failure)
- [x] 6.2 e2e journeys in `e2e/match-report.spec.ts`: (a) captain loads a result → MatchCard score → Jornada completa; (b) owner spends scorer PE on élite skill → badge; (c) admin corrects a result → score updates. Wired into auth config, excluded from local config
- [x] 6.3 Polish: ROADMAP match-report → Completado wording; fix `player-progression` spec stale élite label (Apariencia asquerosa NOT élite)

## Chain Strategy

- [x] 7.1 Ask user: stacked-to-main vs feature-branch-chain before sdd-apply (`ask-on-risk`) — RESOLVED: stacked-to-main
