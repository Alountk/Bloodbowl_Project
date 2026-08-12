# Proposal: Live Match Flow

## Intent

Refine shipped live-match-realtime (PRs #61–67): consent-based start, unified match clock, turn-phase permissions, notifications + nudge, rejornar, participant correction.

## Scope

### In Scope
- Double-consent: both coaches consent → `ready` (two persisted booleans; retractable; indefinite); first turn → `live`, clock starts.
- Unified clock: `startedAt` + `homeTurnMs`/`awayTurnMs`, server-derived; ticker accumulates active side (info-only); per-turn clocks removed; league option deprecated-not-removed (columns stay; UI/API stop); D4 + `onClockExpired` removed (5 sites); grace pauses clock.
- Turn asymmetry: active coach records TD/foul/casualty/pass-turn; non-active only own-player casualty.
- Notifications: `turnStart` SSE + notice; nudge "te piden el turno", never flips.
- Rejornar: participant re-opens negotiation pre-play (even pre-date); accept updates date; played/result 409; league started; live starts anytime via consent.
- Correction: admin + both coaches; forfeit admin-only. Viewing unchanged.

### Out of Scope
Replay/taxonomy/public viewing/auto-results; dropping clock columns; WebSockets/custom server/deps.

## Capabilities

New: None.
Modified:
- `live-match-realtime`: ready + consent + kickoff; unified/per-side clock; D4 removed; side permissions; turnStart/requestTurn; grace pauses clock.
- `matchday-negotiation`: rejornar pre-play; accept updates `scheduledAt`.
- `match-result`: correction → participants; forfeit unchanged.
- `leagues`: turn-clock option deprecated (UI/API stop; columns remain).

## User Stories & Acceptance Criteria

- Consent ×2 → `ready`; retract → pending; `ready`→`live` only via first turn.
- Unified per-coach time accumulates; restart recompute correct; D4/`onClockExpired` gone (5 sites).
- Non-active TD/foul → 409; own-injury → 200; spectator 403, foreign 404.
- "Tu turno" notice; "te piden el turno" nudge — persists, labeled, never flips.
- Scheduled propose/accept 200; played 409; `scheduledAt` updated.
- Correction 200 admin+coaches; forfeit 403 non-admin.
- e2e updated (consent begin, rejornar, correction); suites green.

## Approach

- Additive migration: LiveMatch += `ready`, consents, `startedAt`, `homeTurnMs`/`awayTurnMs`.
- `startMatch` split: consent + begin (first turn).
- Ticker recomputes from timestamps; grace pauses via `paused`; `onClockExpired` deleted.
- Side-aware POST guard (pure decision, `liveAccess` pattern).
- Relax propose/accept locks (played 409); accept writes `scheduledAt`; panel gate widens.
- Correction: admin ∪ participants; forfeit untouched; DTO fields in both serializers.

## Slice Plan (4 chained PRs → main)

| # | Slice | Deps |
|---|-------|------|
| 1 | Clock+lifecycle: ready/consent, unified clock, ticker, D4 sweep, deprecation, MatchView, migration | — |
| 2 | Permissions+nudge: side gate, own-casualty, events, UI | 1 |
| 3 | Rejornar: locks, `scheduledAt`, gates, tests+e2e | 1 |
| 4 | Correction+UI+e2e | 1 |

1→2 strict; 3–4 parallel; begin-step in 1–2.

## Risks

| Risk | Sev | Mitigation |
|------|-----|-----------|
| e2e start breaks | CRITICAL | Begin rewrite (1–2) |
| D4 sweep incomplete | WARNING | Audit 5 sites |
| Duplicate DTO serializers | WARNING | Add to both |
| Correction→forfeit leak | WARNING | Forfeit admin-only; update tests |
| Grace semantics | SUGGESTION | Pause via `paused` |
| Rejornar drift | SUGGESTION | 409 played/winnerId |

## Rollback Plan

Revert PRs 4→1; migration additive (no destructive SQL); deprecated columns keep old leagues working.

## Dependencies

Additive `add_live_match_flow` migration (deploy-ahead safe); single `next start` (LM-1 hub).

## Success Criteria

- [ ] 4 PRs merged; unit + auth e2e green; 401/403/404/409 hold.
- [ ] No `turnClockEnabled` in creation UI/API or live DTO; columns remain.
