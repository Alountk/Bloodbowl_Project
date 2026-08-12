# Proposal: Live Match Realtime — Interactive 2-Coach Live Mode

## Intent

Replace the MVP's inert live shells (MV-5) with real-time sync between both fixture coaches: alternating turns, per-team server clocks, scoreboard, chronological event feed — persisted from day 1, visible for live AND played matches. Finished matches pre-fill the existing result modal; POST validation stays authoritative. First Prisma migration (MV-6 lock) and first realtime channel.

## Scope

### In Scope
- Interactive 2-coach model: both coaches control; server-enforced invariants (turn alternation, no double-action, 8-turn half, half flip)
- Persisted events + visible timeline (live AND played matches)
- Result handoff: pre-fill result modal (scores, per-scorer TDs); coaches confirm; existing POST authoritative — no auto-results
- Spectators: members + league admin, read-only (MVP STARTED matrix); not public
- Events: TD, casualty (injury band), foul, end of half, end of match
- Turn clock: league-level option set at league creation (enabled toggle + per-turn duration 120/240/360s, default 240s; immutable after creation); clocks disabled when the option is off
- Transport: SSE route handler; in-memory hub; DB-baselined state; no new deps

### Out of Scope
- Full taxonomy, replay, filters, player-attribution browsing
- Public viewing; auth matrix changes; auto-generated results
- WebSockets / custom server / external realtime; multi-instance pub/sub; new deps
- Broadcast-only mode (interactive model is the product decision)

## Capabilities

### New Capabilities
- `live-match-realtime`: SSE transport, hub, `LiveMatch`/`LiveEvent`, control route, auth gates, pure transitions, result handoff seam

### Modified Capabilities
- `match-view`: MV-5 shells go live; MV-6 lock lifts (migration; timeline for live + played; replay/filters stay out)
- `leagues`: league creation accepts the turn-clock option (toggle + duration 120/240/360, default 240, immutable)

## User Stories

- Start a live match from a scheduled fixture without result
- Alternate turns; out-of-turn/double actions rejected (409)
- Server-owned per-team clocks; active clock runs, other pauses
- Events (TD/casualty/foul/half/match end) recorded with sequence + payload
- Members/admin spectate read-only; non-members 404
- League creator configures the turn clock option (enabled + duration 2/4/6 min) at league creation; live matches honor it
- Coach recovers mid-match from a NEW device (login → full snapshot + catch-up by seq; control restored — identity is user-based, not device-based)
- Active coach disconnects → clock auto-pauses after a 10s grace window; resumes on reconnect (mobile/battery friendly)
- Match end pre-fills result modal; coaches confirm and POST
- Played matches show the timeline from persisted events

## Acceptance Criteria

| # | Criterion |
|---|-----------|
| AC-1 | SSE read: 401 (both modes); 404 foreign; 200 owner/member |
| AC-2 | Control: participants + admin only; 409 invalid transitions |
| AC-3 | Alternation, no double-action, 8-turn cap, half flip — pure-fn tested |
| AC-4 | Events monotonic `seq`; catch-up never stale |
| AC-5 | MV-5/MV-6 assertions green for static states |
| AC-6 | Prefill via live state; POST validation authoritative |
| AC-7 | MV-7 preserved: tokens, Spanish copy, no icons/deps |
| AC-8 | New-device recovery: full snapshot-first subscribe + `since=0` catch-up; control restored for the same user |
| AC-9 | Disconnect policy: active-coach clock auto-pauses after 10s grace; resumes on reconnect; clocks recompute from persisted timestamps (survives server restart) |
| AC-10 | League option: turn-clock toggle + duration (120/240/360s, default 240) persisted at league creation; live match honors it (clocks disabled → no ticking, no grace pause) |

## Approach

SSE via `GET .../live` (EventSource, same-origin JWT cookie; fixture-GET gate). `POST .../live` control route (participant + admin) runs pure transitions (`lib/liveMatch.ts`), persists `LiveEvent` rows, fans out via an in-memory hub behind a narrow interface. Reconnects catch up from DB by `seq`. Local mode 401s by design. MatchView swaps `live: null` for a `useLiveMatch` SSE hook.

## Slice Plan (chained PRs, <400 lines, ask-on-risk)

| # | Slice | Δ |
|---|-------|---|
| 1 | Migration: `LiveMatch` + `LiveEvent` (additive, deploy-ahead) | ~120 |
| 2 | SSE subscribe: hub + GET route + hook | ~350 |
| 3 | Control: transitions + tests + POST route | ~350 |
| 4 | MatchView wiring: shells fed; static assertions green | ~250 |
| 5 | Timeline (played) + result-modal prefill | ~250 |
| 6 | e2e: two-context sync, auth suite | ~250 |

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| First migration (MV-6 lift) | CRITICAL | Additive; own PR; deploy ahead |
| Local mode 401s realtime | CRITICAL | Documented parity; auth-only e2e |
| First long-lived connection | WARNING | DB state + `seq` catch-up; hub interface |
| Recovery across devices | WARNING | Snapshot-first subscribe; identity = user cookie, not device |
| 400-line budget, 6 slices | WARNING | Tight stacking; ask-on-risk |
| Prefill vs. POST authority | SUGGESTION | Prefill only; route validates |
| Rulebook-light | SUGGESTION | SSE only; inline SVG; tokens/copy |

## Rollback Plan

Revert PRs in reverse order. Migration is additive — deploy-ahead safe. Crash loses only in-flight state; match resolves via existing result flow.

## Dependencies

- Migration deploys before live code (`prisma migrate deploy`)
- Realtime targets `AUTH_MODE=auth`; local 401s by design
- Single-instance Arcane web container; hub swap deferred

## Success Criteria

- [ ] Two coaches on two browsers sync turn/clock/score via SSE
- [ ] Invariant + e2e (local + auth) + lint + tsc green
- [ ] Timeline for live/played; static-state assertions hold
- [ ] Result modal prefill; POST behavior unchanged
