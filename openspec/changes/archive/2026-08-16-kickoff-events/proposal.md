# Proposal: Kickoff Events — Expensive Mistake & Fan Factor

## Intent

RAU-6: the live feed never generates kickoff events. When a match goes live it must emit two rulebook kickoff rows — Expensive Mistake ("Error costoso", per-team) and Fan Factor ("Factor de aficionados", centered) — as TEXT-kind events with JSON payloads (LM-14 precedent, NO migration), matching the Tourplay design context. The expensive-mistake treasury penalty applies server-side in the same transaction that persists the events.

## Scope

### In Scope
- New TEXT kinds `expensive_mistake` (one per team, `side` home/away) and `fan_factor` (one centered, both teams), appended in `beginMatch`'s ready→live transition, ordered BEFORE `start`/`turnStart` (minute 0').
- Server-owned dice only (`lib/random.ts` rollD6; D6→D3 map 1-2→1, 3-4→2, 5-6→3). Fan factor = team FF + mapped D3.
- Expensive Mistake: 1D6 × treasury-bracket matrix (100k–195k | 200k–295k | 300k–395k | 400k–495k | 500k–595k | 600k+; treasury <100k → first bracket) → Crisis evitada (−0 gp) | Incidente menor (−1D3×10k) | Incidente grave (−half treasury, rounded DOWN to nearest 5k) | Catástrofe (keep 2D6×10k). Treasury penalty applied server-side, atomic with event persistence.
- Display surface widened: `isDisplayEvent` (LM-16) + `TEAM_EVENT_KINDS`; labels and glyphs (money bag, dice) in `liveEventLabels.ts`; MV-6 scenario no longer excludes kickoff.
- Payloads: `expensive_mistake {side, roll, bracket, outcome, amountLost, treasuryBefore, treasuryAfter}`; `fan_factor {home:{base,dice,total}, away:{...}}` (`side` null → centered).
- Deliberate unit + e2e updates.

### Out of Scope
- Backfill for already-live/finished matches (events only for matches going live after ship).
- Timeline-bar icons for kickoff rows (feed rows only).
- FAME/advantage derivation from fan factor; weather and other kickoff-table events.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `live-match-realtime`: kickoff kinds (LM-14), display surface (LM-16).
- `match-view`: MV-6 lockout updated to admit the two kickoff kinds.

## Approach

Hook the pure `beginMatch` (`lib/liveMatch.ts`): append kickoff events before `start`/`turnStart` so they persist atomically via `beginLiveMatch`→`persistAndPublish` (seq advance + P2002 guard keeps begin idempotent). The begin dispatch (`live/route.ts`) supplies rosters + treasuries; the treasury mutation commits in the same transaction. Rendering: `expensive_mistake` → team card (68%, gradient, `side` set); `fan_factor` → centered card (100%). No migration — `LiveEvent.kind` is TEXT (LM-14).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `lib/liveMatch.ts` | Modified | beginMatch kickoff events; isDisplayEvent; TEAM_EVENT_KINDS |
| `lib/liveStore.ts` | Modified | treasury update in begin transaction |
| `.../live/route.ts` (POST begin) | Modified | pass rosters/treasuries |
| `liveEventCards.tsx` · `liveEventLabels.ts` | Modified | cards, labels, glyphs |
| `openspec/specs/{live-match-realtime,match-view}` | Modified | LM-14/16, MV-6 deltas |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Double-apply on begin retry | Low | Events inside beginMatch — atomic, seq-conflict 409 |
| Feed ordering wrong | Med | kickoff before start/turnStart; unit-tested order |
| Existing e2e feed assertions break | Med | start/turnStart labels preserved; deliberate test updates |
| Treasury rounding drift | Med | shared bracket/rounding helper + unit tests |

## Rollback Plan

Revert the begin hook commit; no migration to undo. Persisted kickoff rows render as feed rows only; treasury already deducted is server-authoritative per rulebook — no compensating rollback.

## Dependencies

Existing `lib/random.ts` rollD6; no new deps. Auth e2e needs Docker + Postgres.

## Success Criteria

- [ ] Matches going live after ship show `expensive_mistake` + `fan_factor` rows at 0' before start/turnStart.
- [ ] Treasury penalty applied server-side atomically with events; payloads carry before/after values.
- [ ] Zero migrations; new kinds persist as TEXT.
- [ ] Unit + auth e2e + lint + tsc green.

## Proposal question round

Closed assumptions (product owner, binding — not reopened): no backfill; feed-only (no timeline bar); D6→D3 mapping; per-team `expensive_mistake` + single centered `fan_factor`; server-owned dice and server-applied treasury; no FAME derivation. One open product question: render treasury before/after on the Error costoso card, or keep them payload-only?
