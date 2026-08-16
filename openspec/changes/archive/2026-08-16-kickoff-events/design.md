# Design: Kickoff Events — Expensive Mistake & Fan Factor

## Technical Approach

Hook the pure begin transition (proposal approach, LM-21). A new pure `lib/kickoff.ts` owns `buildKickoffEvents`, which resolves both teams' expensive-mistake rows and the centered fan-factor row from server-owned dice (`lib/random.ts`), returning events + treasury deltas in ONE call (no drift). `beginMatch` (lib/liveMatch.ts) gains the kickoff events as an optional third input and splices them BEFORE `start`/`turnStart` (seq order em(home), em(away), fan, start, turnStart; all `at = now` → 0′ via `deriveMinute`'s clamp — no negative). `beginLiveMatch` (lib/liveStore.ts) passes the resolved deltas into `persistAndPublish`, which commits the team treasury decrements in the SAME `$transaction` as the event rows (LM-23 atomicity); the seq guard + begin guard (mapped to 409) keep begin idempotent. Display: `LiveEventKind` + `isDisplayEvent` widen — both serializers follow via the shared predicate (D23); `TEAM_EVENT_KINDS`, labels, glyphs, and cards cover the two kinds. Timeline bar intentionally untouched (proposal: feed rows only).

## Architecture Decisions

| # | Decision | Options / tradeoffs | Choice + rationale |
|---|----------|--------------------|--------------------|
| D1 | Rules location | (a) new pure `lib/kickoff.ts` (b) inline in liveMatch.ts (c) route | (a) bracket matrix, `d6ToD3`, `roundDownTo5k`, resolver, builder in one zero-mock-testable module; result-route precedent (`lib/rules/fanFactor.ts`) |
| D2 | beginMatch I/O | (a) third param `kickoffEvents: Omit<LiveEventRecord,"seq">[]` (b) beginMatch reads treasuries | (a) stays pure + deterministic; beginMatch assigns seqs +1..+N, splices before start/turnStart. Existing 2-param tests keep compiling |
| D3 | Treasury read | (a) `materializeTeamRosters` returns the two Team rows (treasury, coaching) (b) separate query | (a) one query, existing begin path; route builds `{teamId, treasury, dedicatedFans}` from it |
| D4 | Fan-factor base | (a) `coaching.dedicatedFans` (b) new persisted column | (a) result-route precedent (`dedicatedFansOf`); no migration (MV-6 lock) |
| D5 | Atomic treasury | (a) `persistAndPublish` gains `treasuryUpdates[]`; `tx.team.updateMany({data:{treasury:{decrement:amountLost}}})` inside the existing tx (b) post-commit update | (a) rollback of the tx reverts events AND treasury (LM-23); delta ≤ half treasury, never negative |
| D6 | Retry semantics | (a) `beginLiveMatch` wraps `beginMatch`'s plain errors ("begin only from ready") → `status: 409` (b) 500 | (a) LM-21: retried begin → 409, no re-roll, no double deduction; route's existing 409 catch returns "Sequence conflict"; seq guard also covers concurrent double-begin |
| D7 | Timeline bar | (a) leave `matchTimelineBar` DISPLAY_KINDS at 8 kinds | (a) out of scope (proposal); feed rows only |
| D8 | Card layout | `expensive_mistake` → `TEAM_EVENT_KINDS` (68% team card); `fan_factor` → generic 100% branch + per-team totals line | MVT-6; `side: null` fans center automatically |

## Data Flow

```
POST /live {type:"begin"} → gate → materializeTeamRosters (returns teams: treasury+coaching)
  → route rolls server dice (rollD6/rollD3, lib/random.ts) → beginLiveMatch({…, kickoff})
  → buildKickoffEvents (pure) → {events, treasuryUpdates}          ← single resolution
  → beginMatch(state, now, events) → 5-event live state
  → persistAndPublish → $transaction [seq-guard updateMany, 5×liveEvent.create,
                                     team.updateMany(decrement) per update]
  → hub → SSE → LiveEventCards (68% em card / 100% fan card) → 0′ via deriveMinute
```

## Interfaces / Contracts

```ts
// lib/kickoff.ts (new, pure)
export type KickoffBracket = "100k-195k"|"200k-295k"|"300k-395k"|"400k-495k"|"500k-595k"|"600k+";
export type KickoffOutcome = "crisis-evaded"|"minor-incident"|"serious-incident"|"catastrophe";
export function d6ToD3(roll: number): number;                 // 1-2→1, 3-4→2, 5-6→3
export function roundDownTo5k(n: number): number;
export function bracketFor(treasury: number): KickoffBracket; // <100k clamps to 100k-195k
export function resolveExpensiveMistake(input: {
  roll: number; rollD3?: number; keep?: [number, number]; treasury: number;
}): { bracket: KickoffBracket; outcome: KickoffOutcome; amountLost: number; treasuryAfter: number };
// roll→outcome = the FULL rulebook matrix (roll 1D6 × treasury bracket,
// rows 1..6 × columns 100k..600k+): 1→m/m/g/g/c/c, 2→e/m/m/g/g/c,
// 3→e/e/m/m/g/g, 4→e/e/e/m/m/g, 5→e/e/e/e/m/m, 6→e/e/e/e/e/m
// (e=crisis-evaded · m=minor-incident · g=serious-incident · c=catastrophe)
export function buildKickoffEvents(input: {
  now: number; half: number; turnNumber: number;
  home: { teamId: string; treasury: number; dedicatedFans: number };
  away: { teamId: string; treasury: number; dedicatedFans: number };
  dice: { home: { em: number; d3: number; keep: [number, number]; fan: number };
          away: { em: number; d3: number; keep: [number, number]; fan: number } };
}): { events: Omit<LiveEventRecord, "seq">[]; treasuryUpdates: { teamId: string; amountLost: number }[] };
```

Payloads: `expensive_mistake { side, roll, bracket, outcome, amountLost, treasuryBefore, treasuryAfter }`; `fan_factor { home: { base, dice, total }, away: { base, dice, total } }`, `side: null`. `persistAndPublish` input gains optional `treasuryUpdates`. `BeginLiveMatchInput` gains `kickoff`. `LiveCommand` unchanged — kickoff kinds are NOT commands (rejected like `mvp`, LM-14 precedent). `LiveEventKind` gains `expensive_mistake | fan_factor`; `isDisplayEvent` gains both (serializers `toEventDtos`/`serializeLive` follow automatically — D23, comment-only updates).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `lib/kickoff.ts` | Create | matrix, `d6ToD3`, rounding, resolver, `buildKickoffEvents` |
| `lib/liveMatch.ts` | Modify | `LiveEventKind` + `isDisplayEvent`; `beginMatch` third param splices kickoff before start/turnStart |
| `lib/liveStore.ts` | Modify | `beginLiveMatch` builds kickoff via `buildKickoffEvents`, passes updates + 409 wrap; `persistAndPublish` treasury decrements in tx |
| `.../live/route.ts` | Modify | `materializeTeamRosters` returns teams; begin handler rolls dice, builds kickoff input |
| `features/leagues/liveEventLabels.ts` | Modify | `EVENT_GLYPH` +💰🎲, labels, `KICKOFF_OUTCOME_LABELS`, `formatTreasury` (Intl es-ES + " M.O.") |
| `features/leagues/liveEventCards.tsx` | Modify | `TEAM_EVENT_KINDS` + em; em card outcome + treasury lines (fallback w/o fields); fan 100% totals line |
| `matchTimelineBar.tsx` | No change | deliberate (feed-only scope) |
| `lib/random.ts` | No change | `rollD6`/`rollD3` suffice (2D6 = two rollD6) |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit kickoff | d6ToD3 bounds; bracket incl. 80k clamp; 234k minor D3=2 → 20k/214k; 234k serious → 115k/119k; 400k catastrophe 4+6 → 300k/100k; crisis-evaded 0 loss | pure, no mocks |
| Unit liveMatch | beginMatch appends 5 events in seq order, same `at`, half/turn 1/1; existing begin tests updated (2→5, deliberate) | pure |
| Unit liveStore | treasury decrement persists in SAME tx; tx failure rolls back events+treasury; retried begin → 409, single decrement | store mocks |
| Route | begin wires server dice (fabricated body rolls ignored); kickoff kinds rejected as commands; retry 409 | route.test |
| Component | em card 68% navy "Error costoso"+"Incidente grave"+"234.000 → 214.000 M.O."; fan 100% centered totals; missing treasury fields → label-only, no throw | liveEventCards.test.tsx, MatchView.test.tsx |
| E2E | after "Empezar partido": 2 "Error costoso" rows + "Factor de aficionados" at 0′; retry begin → 409 | live-match.spec.ts |
| E2E stable | "Inicio del partido", "Tu turno", "Dar el turno", `live-event-row`, TD partials, MVP rows, "por … · Blitz" | unchanged assertions |

## Threat Matrix

N/A — no routing (OS-level), shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. HTTP 409 semantics covered by route/store tests.

## Migration / Rollout

No migration (`LiveEvent.kind` TEXT, LM-14). Legacy matches begun before ship simply have no kickoff rows (render nothing, no error); payloads missing treasury fields fall back. Rollback: revert the begin-hook commit; treasury already deducted is server-authoritative per rulebook — no compensating rollback.

## Open Questions

All resolved by the product owner / orchestrator (2026-08-15):

- [x] Roll→outcome bands: the FULL rulebook matrix is encoded (see `resolveExpensiveMistake` comment above) — NOT a band simplification. Verified against the product owner's rulebook paste (LM-23).
- [x] `fan_factor.base` = `coaching.dedicatedFans` via the existing `preMatchFanFactor`/`dedicatedFansOf` module (result-route precedent, `lib/rules/fanFactor.ts`). No persisted FF column; `MAX_FAN_FACTOR` 7 is the post-match clamp only and does NOT apply to the pre-match kickoff display.
- [x] Fan-factor totals copy (product owner): compact with icons — people glyph before the base, dice glyph before the roll, e.g. `Local: 👥2 + 🎲2 = 4 · Visitante: 👥1 + 🎲3 = 4`. (LM-24)
