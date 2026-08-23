# Proposal: Live Match Events — Design-A History Feed

## Intent

Live matches already persist every event (`LiveEvent` + snapshot-first resume), but the feed dumps raw kinds — turn passes, `turnStart` nudges — instead of a rulebook-style match story. This change turns that history into the Design-A chronological feed (minute, global turn tag, dorsal, name/position, icon, label, ★ SPP stars, side gradient), adds the missing `completion` and `mvp` event kinds, filters feed noise server-side, and derives per-team stats. No DB migration: `LiveEvent.kind` is TEXT.

## Scope

### In Scope
1. **Design-A feed**: row per important event — minute (`199'`), global turn tag (`T16`; half 2 = `turnNumber + 8`), dorsal (`#4` = roster index+1, no jersey field), player name + position, icon, label, ★ stars; side gradient (local navy / visitor red).
2. **Server-side feed filtering**: only `start|td|completion|casualty|foul|endHalf|endMatch|mvp` reach the DTO (`toEventDtos` + `serializeLive`); `turn|turnStart|requestTurn` stay in DB (audit/replay) and live-only (nudge banner).
3. **Stars = SPP** (BB2025): TD ★3 · Completion ★1 · Casualty ★2 · MVP ★4. **Band mapping**: `bruise` → "Herida" ★0; `apaleado|grave|permanent|dead` → "Baja" ★2.
4. **Derived team stats**: per-team TD, completions, casualties, fouls, ★ SPP total (hero mini-row).
5. **New event kinds**: `completion` (active-coach live command, ★1) and `mvp` (result-route write — home + away grantee, `max(seq)` in-transaction; NOT a live command).
6. **Extend persisted history** (LiveEvent model + Design-A UI + derived stats).
7. **Event recording controls** (NEW, user-approved): a floating "+" button (rulebook-style) opens the event-type menu, then a mini-form (player select from the ACTIVE coach's roster + band select for casualty/injury). The active coach records TD, Pase completo, Baja/Herida, Falta; the NON-active coach only records Herida (casualty to their OWN player) per LM-12. Controls honor the viewer-side permission matrix.

### Out of Scope
- No jersey `number` field (dorsal = roster index+1; real numbers = future change).
- No replay/filter UI; no timeline-dots redesign (Design A is the list).
- No permission-matrix change beyond `completion` slotting in (active coach already may record any kind).
- No WebSockets/custom server/new deps.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `live-match-realtime`: new event kinds (`completion`, `mvp`); Design-A history feed; server-side feed filtering; derived stats; minute/turn-tag/dorsal display derivation.
- `match-result`: writes `mvp` events into the fixture's LiveMatch when a result is loaded.

## User Stories
- As the active coach, I record a completion (★1) during my turn and it appears in the feed.
- As a member, I see the match history rulebook-style — no turn-pass rows.
- As a member, I see MVP rows in the played timeline after the result is loaded.
- As a member, I reload/reconnect and see the same persisted history (snapshot-first).

## Acceptance Criteria
- `completion` command: 200 for active coach, 409 for non-active; event persists with ★1.
- Feed DTO excludes `turn|turnStart|requestTurn`; contains the 8 display kinds; DB rows unchanged (audit intact).
- Row renders minute, tag, dorsal, name+position, icon, label, stars, side gradient.
- Casualty mapping: `bruise`→"Herida" ★0; `apaleado|grave|permanent|dead`→"Baja" ★2.
- Result POST on a fixture with LiveMatch appends home+away `mvp` rows with monotonic seq; fixtures without LiveMatch unchanged.
- `deriveTeamStats` returns per-team TD/completions/casualties/fouls/SPP totals.
- Reload renders identical persisted history.
- Event controls: floating "+" opens the event menu; active coach records TD/Pase completo/Baja/Herida/Falta via the mini-form (player + band); non-active coach only records Herida (own player); spectator/admin-without-side see no event controls (LM-12/403) → LM-20.

## Approach

Extend the TS union (`+completion|mvp`, no migration); add `applyCompletion` + route command wiring (`EventKind`); result route adds `include: { liveMatch }` and appends `mvp` rows via `max(seq)` inside the transaction; filter `toEventDtos`/`serializeLive`; pure helpers `deriveMinute`/`turnTag`/`eventSpp`/`deriveTeamStats` + roster-index dorsal map; replace `LiveEventFeed` with Design-A list + hero stats row; nudge banner stays live-only.

## Slice Plan (5 chained PRs → main, each <400 lines)

| # | Content | Intentional test breakage budget |
|---|---------|----------------------------------|
| 1 | Event model (server): `LiveEventKind` + `applyCompletion` + completion command/permission + band→label/★ mapping + result-route `mvp` write | Minimal — additive; small permission-test updates |
| 2 | DTO/filter/derivations: server-side filtering; `deriveMinute`/`turnTag`/`eventSpp`/`deriveTeamStats`; dorsal map; DTO types | Route snapshot `requestTurn` assert; `liveEventLabels` turn/casualty asserts |
| 3a | Design-A feed UI: replace `LiveEventFeed`; hero stats row; rosters into `FinishedLiveTimeline`/`LiveActiveMatch` | `MatchView.test.tsx` timeline/label asserts |
| 3b | Event recording controls: `liveControls.tsx` (FAB "+" → menu → mini-form; role-aware per LM-12/LM-20) | New controls tests; small `MatchView` asserts |
| 4 | e2e + regression: update `live-match.spec.ts`; add completion + Design-A row + controls e2e; full suite | e2e turn/label asserts (lines ~279-332) |

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| `mvp` seq race (`@@unique([liveMatchId, seq])`) | CRITICAL | read `max(seq)` inside the transaction |
| Band vocabulary divergence (5 bands → 2 buckets) | WARNING | confirmed mapping; budget label-test churn |
| e2e/unit breakage across 4 suites | WARNING | update tests in the slice that changes behavior; each PR stays green |
| Dorsal is index-based pseudo-number | SUGGESTION | accepted; real jersey = future change |
| `mvp` must not become a live command | SUGGESTION | keep out of `LiveCommand`/`resolveEventPermission` |

## Rollback Plan

No migration → each slice is a git revert to main. Reverting the result-route slice stops `mvp` writes (existing rows still render safely). Reverting UI slices restores `LiveEventFeed`. DB stays compatible throughout.

## Dependencies

- No DB migration (`LiveEvent.kind` is TEXT).
- Result route adds `include: { liveMatch }`.
- Deploy note: single `next start` instance (in-memory hub); DB snapshot-first resume covers reconnect.

## Success Criteria

- [ ] 4 chained PRs merged; full suite green (`pnpm test`, auth e2e, lint, `tsc --noEmit`).
- [ ] Feed shows only the 8 display kinds; turn passes never render.
- [ ] Completion e2e green; MVP rows visible in played timeline.
