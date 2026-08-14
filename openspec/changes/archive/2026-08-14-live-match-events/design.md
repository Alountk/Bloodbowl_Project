# Design: Live Match Events — Design-A History Feed

## Technical Approach

No migration (`LiveEvent.kind` is TEXT): add `completion` (★1) and `mvp` (★4, never a command) to the TS union; filter both feed serializers via one shared predicate; derive minute/turn-tag/dorsal/stars/stats in pure client helpers; replace `LiveEventFeed` with the Design-A list + hero stats row; add LM-20 recording controls (FAB "+" → role-derived menu → mini-form driving the same commands) (LM-14…LM-20, MODIFIED LM-6/LM-12, match-result MVP write).

## Architecture Decisions

| # | Choice | Rationale |
|---|--------|-----------|
| D20 | mvp `seq`: `aggregate({_max:{seq}})` in-tx; home=max+1, away=max+2; guarded row `seq` bump; P2002 → 409 | Single-tx; `@@unique` = double-submit arbiter. Rejected: out-of-tx read; row-seq only |
| D21 | Dorsal = index+1 in served `players`; fixture GET adds `orderBy:{id:"asc"}` | Zero contract growth; backfill in roster order. Rejected: roster-JSON map; `number` field |
| D22 | Stats client-side: pure `deriveTeamStats(events)` | No DTO growth; same array the feed renders. Rejected: server-computed DTO stats |
| D23 | `bandToDisplay`+`eventSpp` in `liveEventLabels.ts`; `isDisplayEvent` in `lib/liveMatch.ts` | Display concern; filter shared by routes AND render — no drift |
| D24 | completion/mvp payload `{}`; ★ via `eventSpp` | td/foul precedent: scorer rides `playerRosterId`; PE constants single source. Rejected: `{spp:1}` |
| D25 | Hub frames keep `requestTurn`/`turnStart` (live nudge); only feed DTOs filter; feed re-filters at render | Live nudge works; reload no longer restores a pending nudge — live-only per LM-16 |
| D26 | `EventControls` in new `features/leagues/liveControls.tsx`; menu from `viewerSide` vs `activeSide`; form reuses `act`/busyRef | Keeps `MatchView.tsx` lean; hiding is UX — server matrix (D14, 409) authoritative. `viewerSide` DTO confirmed (api.ts:513, D19 server-set) |

**D26 shape**: FAB = `fixed bottom-6 right-6` navy circle, white "+" (rulebook-light), only while `status === "live"` and `viewerSide != null`. Menu: active → TD · Pase completo · Baja/Herida · Falta; non-active → Herida only (own-side casualty). Form: player `<select>` from own roster (`players` by `viewerSide`, `alive` only) + band `<select>` (5 bands, `bandToDisplay`) for casualty. Kinds: td scorer · completion thrower · casualty victim+band · foul player (victim optional). Submit → `act(...)`; menu closes; event lands in the Design-A feed via hub fan-out.

## Data Flow

```
completion POST → gate → applyCompletion (★1) → row + hub frame
result POST → computeMvpGrantee×2 → tx max(seq) → mvp +1/+2 + row bump (P2002→409)
GET fixture/snapshot → toEventDtos|serializeLive → isDisplayEvent → 8 kinds
FAB → menu (viewerSide vs activeSide) → mini-form → act() → POST live → resolveEventPermission → apply* → hub fan-out → Design-A feed
MatchView → events → deriveTeamStats / Design-A rows (isDisplayEvent at render)
```

## File Changes (5 chained PRs → main, each <400)

| # | File | Action | Δ |
|---|------|--------|---|
| 1 | `lib/liveMatch.ts` | union +`completion\|mvp`; `applyCompletion`; `isDisplayEvent` | ~45 |
| 1 | `lib/livePhase.ts` | `EventKind` +`"completion"` | ~5 |
| 1 | `live/route.ts` (+`api.ts` `LiveCommand` +completion, no `mvp`) | completion gate+dispatch; `mvp` → 400 | ~22 |
| 1 | `result/route.ts` | `include:{liveMatch:true}`; in-tx mvp append (D20) | ~35 |
| 1 | `liveEventLabels.ts` | ADD `bandToDisplay` + `eventSpp` | ~45 |
| 1 | tests ×5 | completion 200/409; mvp 400; mvp ±LiveMatch; seq race; new fns | ~225 |
| 2 | `live/route.ts`, fixture `route.ts` | serializers use `isDisplayEvent`; players `orderBy:{id:"asc"}` | ~6 |
| 2 | `liveFeed.ts` | **Create**: `deriveMinute`/`turnTag` (`half===2?+8`)/`playerRef`/`deriveTeamStats` | ~90 |
| 2 | `liveEventLabels.ts` | rewire casualty→`bandToDisplay`; +completion/mvp labels | ~15 |
| 2 | tests ×3 | snapshot filter rework; label updates; liveFeed suite | ~155 |
| 3a | `MatchView.tsx` | Design-A rows (minute/`T{n}`/dorsal/name/icon/label/★/gradient); hero stats; rosters to timelines | ~135 |
| 3a | `MatchView.test.tsx` | Design-A asserts; nudge-test rework (D25) | ~125 |
| 3b | `liveControls.tsx` | **Create**: FAB, role-derived menu, mini-form (player+band selects), submit via `act` | ~150 |
| 3b | `liveControls.test.tsx` | **Create**: menu matrix per role; band select; submit shapes; menu closes | ~90 |
| 3b | `MatchView.tsx` | pass own roster into `LiveActiveMatch`; render `EventControls` | ~25 |
| 3b | `MatchView.test.tsx` | FAB visible for active; hidden for spectator | ~25 |
| 4 | `e2e/live-match.spec.ts` + residual unit fixes | Design-A asserts; +completion, +mvp rows; FAB→TD flow | ~245 |

Slices ≈ 320/310/260/290/245 — all < 400. Slice 3 → 3a (feed) / 3b (controls): combined ~550 would overflow; proposal's slice-3 controls stand, delivery = 5 PRs.

## Interfaces / Contracts

```ts
// lib/liveMatch.ts — shared filter (LM-16)
export function isDisplayEvent(k: string): boolean { return ["start","td","completion","casualty","foul","endHalf","endMatch","mvp"].includes(k); }
// result/route.ts — D20: in-tx aggregate _max seq → home mvp +1, away +2, guarded row bump; P2002 → 409
// LM-18: bruise → {"Herida",0}; apaleado|grave|permanent|dead → {"Baja",2} · LM-19: eventSpp td→3, completion→1, casualty→lasting?2:0, mvp→4
// EventControls submit → act() → LiveCommand (slice 1 adds completion)
// td/completion: {type, side, playerRosterId} (scorer/thrower)
// casualty: {type, side, victimRosterId, band} (victim + 5-band select) · foul: {type, side, playerRosterId} (victim optional)
// band ∈ INJURY_OUTCOMES (bruise|apaleado|grave|permanent|dead) → bandToDisplay/casualtyKindLabel
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `bandToDisplay` (5 bands), `eventSpp`, `isDisplayEvent`, `deriveMinute`, `turnTag`, `deriveTeamStats` (1td+1comp+1cas+1foul → 1/1/1/1/★6; empty → 0) | pure-fn suites, slices 1–2 |
| Integration | completion 200/409; `mvp` → 400; snapshot excludes turn kinds, DB rows stay; mvp ±LiveMatch; seq race | route tests, slices 1–2 |
| Component | Design-A rows (all fields + gradient); hero stats; null-player rows | `MatchView.test.tsx`, 3a |
| Component | Controls: spectator → no FAB; active → 4 kinds; non-active → Herida only; submit fires command (spy on `act`); band select only for casualty; menu closes | `liveControls.test.tsx` + `MatchView.test.tsx`, 3b |
| E2E | history renders, reload persistence, completion flow, mvp rows, FAB→TD flow | `live-match.spec.ts`, 4 |

Bypass: hiding is UX, not security — completion 409 (slice 1) + `resolveEventPermission` suites already prove the server matrix (LM-20).

## Threat Matrix

N/A — no routing/shell/subprocess/VCS/process-integration boundary.

## Migration / Rollout

No migration (kind TEXT). Each slice is an independent PR to main; reverting the result-route slice stops `mvp` writes while existing rows still render.

## Open Questions

- [ ] D25: confirm dropping the reload-restored nudge banner is accepted (LM-16 makes the nudge live-only).
- [ ] `mvp` `at` = result-load time → feed minute is load minute (no match-end timestamp on the result path) — accepted.
