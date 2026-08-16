# Tasks: Kickoff Events — Expensive Mistake & Fan Factor

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700–950 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 → PR3 |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Server core: kickoff module + beginMatch + treasury atomicity + route | PR 1 | `pnpm vitest run lib/kickoff.test.ts lib/liveMatch.test.ts lib/liveStore.test.ts app/api/.../live/route.test.ts` | N/A — pure/unit + store mocks | revert lib/kickoff.ts + liveMatch/liveStore/route edits |
| 2 | Feed rendering: labels, glyphs, cards (em team card + fan centered) | PR 2 | `pnpm vitest run features/leagues/liveEventLabels.test.ts features/leagues/liveEventCards.test.tsx features/leagues/MatchView.test.tsx` | N/A — RTL/component | remove liveEventCards edits / revert labels |
| 3 | e2e + full sweep | PR 3 | `pnpm run test:e2e:auth` | `AUTH_MODE=local pnpm exec playwright test` (real feed) | test-only commits |

## Phase 1: Server Core (S1)

- [x] 1.1 `lib/kickoff.ts` (new, pure): `d6ToD3`, `roundDownTo5k`, `bracketFor` (<100k clamps to `100k-195k`), `resolveExpensiveMistake` with the full 6×6 matrix, `buildKickoffEvents` → `{events, treasuryUpdates}`
- [x] 1.2 `lib/liveMatch.ts`: `LiveEventKind` + `isDisplayEvent` gain `expensive_mistake`/`fan_factor`; `beginMatch` third param splices em(home), em(away), fan_factor BEFORE `start`/`turnStart` (same `at`, half 1/turn 1)
- [x] 1.3 `lib/liveStore.ts`: `beginLiveMatch` builds kickoff via `buildKickoffEvents`; wrap begin errors as 409 (LM-21 retry); `persistAndPublish` commits `treasuryUpdates` decrement in the SAME `$transaction` (LM-23 atomicity)
- [x] 1.4 `live/route.ts`: `materializeTeamRosters` returns teams (treasury + `coaching.dedicatedFans`); begin handler rolls server dice (`rollD6`/`rollD3`, ignore client rolls), builds kickoff input
- [x] 1.5 Tests: `kickoff.test.ts` (d6ToD3 bounds, 80k clamp, 234k minor D3=2→20k/214k, serious→half rounded to 5k, catastrophe keep→100k after, crisis 0); liveMatch seq order + same `at`; liveStore atomic rollback + 409 single-decrement; route ignores fabricated rolls + kickoff kinds rejected as commands + retry 409

## Phase 2: Feed Rendering (S2)

- [x] 2.1 `features/leagues/liveEventLabels.ts`: `EVENT_GLYPH` 💰🎲👥, "Error costoso"/"Factor de aficionados", `KICKOFF_OUTCOME_LABELS`, `formatTreasury` (Intl es-ES dot-thousands + " M.O.")
- [x] 2.2 `features/leagues/liveEventCards.tsx`: `TEAM_EVENT_KINDS` + `expensive_mistake` (68% team card, outcome + treasury before→after line, fallback without line, never throw); `fan_factor` 100% centered with compact copy `Local: 👥2 + 🎲2 = 4 · Visitante: 👥1 + 🎲3 = 4`
- [x] 2.3 Tests: liveEventCards.test.tsx (em card 68% navy "Error costoso"+"Incidente grave"+"234.000 → 214.000 M.O.", missing-fields fallback no throw; fan centered totals); MatchView.test.tsx (fan 100% centered)
- [x] 2.4 `matchTimelineBar.tsx`: NO change (feed-only scope, deliberate)

## Phase 3: E2E + Verification (S3)

- [ ] 3.1 `e2e/live-match.spec.ts`: after "Empezar partido" assert 2 "Error costoso" rows + "Factor de aficionados" at 0'; retry begin → 409; preserve stable assertions ("Inicio del partido", "Tu turno", "Dar el turno", `live-event-row`, MVP rows, "por … · Blitz")
- [ ] 3.2 Verification checklist map: LM-21 (seq order, server dice, retry 409), LM-22 (FF base+dice+total), LM-23 (matrix, rounding, atomicity, payload), LM-24 (labels/glyphs/treasury line), MVT-6 (em card/fan centered/0'), MV-6 (weather+summary out, 10-kind surface preserved)
- [ ] 3.3 Full sweep: `pnpm test`, `npx tsc --noEmit`, `pnpm lint`, `pnpm run test:e2e:auth` green
