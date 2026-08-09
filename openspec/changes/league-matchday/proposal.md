# Proposal: Matchday — Fecha, Rival y Resultado

## Intent

Started leagues show pairings, but opponents can't agree a date, scout the rival, or resolve a match. This adds date negotiation (toma y daca), rival scouting, and an admin walkover as the only result mechanism.

## Scope

### In Scope
- Fixture lifecycle: `scheduledAt`, `winnerId`, derived status.
- Negotiation: single active proposal; counter-propose; accept; history.
- Admin forfeit: award win to home or away.
- Pattern B UI: round tabs, VS cards, owner under team, rival nav, panel, completion.
- `GET /api/teams/[id]` read-only scouting.

### Out of Scope
- Live match scoring, real scoring/standings, avatars/My Profile (future).

## Capabilities

### New Capabilities
- `matchday-negotiation`: propose/accept by participants; one active; sets `scheduledAt`.
- `matchday-forfeit`: admin-only walkover; sets `winnerId`; terminal played.
- `team-scouting`: GET /api/teams/[id] read-only; owner or league member.

### Modified Capabilities
- `league-season`: Jornadas View — fixtures gain status/scheduledAt/winnerId/owners/proposals; round complete when all played.
- `team-detail-view`: server-backed for foreign teams (visibility gate); owner path preserved.

## Approach

1. **DB** (additive): Fixture +`scheduledAt DateTime?`, +`winnerId String?`; NEW `ScheduleProposal` (fixtureId cascade, userId, date, acceptedAt?, closedAt?). `status` derived: played = winnerId; scheduled = scheduledAt; else pending.
2. **API** (started-league 404 gate): propose {date} — participants only; tx closes prior active, inserts. accept — other participant; sets acceptedAt + scheduledAt. forfeit {winnerTeamId} — league owner only; sets winnerId, closes open proposals.
3. **UI**: Jornadas (Pattern B), negotiation panel, owner forfeit, tabs + completion; `useLeagueDetail` adds propose/accept/forfeit; `/teams/[teamId]` fallback.
4. **e2e**: extend league-season spec.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | Modified | Fixture cols, ScheduleProposal |
| `app/api/leagues/[id]/…` | Modified | Propose/accept/forfeit routes + payload |
| `app/api/teams/[id]/route.ts` | Modified | + GET scouting |
| `features/leagues/LeagueDetail.tsx` | Modified | Pattern B jornadas + panel |
| `app/teams/[teamId]/page.tsx` | Modified | Server fetch fallback |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Propose/accept/forfeit race | Med | Tx re-checks active + winnerId |
| Rival-roster leak | Med | Single gate; 404 outsiders; tests |
| Forfeit irreversible | Low | Admin only; played terminal |

## Rollback Plan

Additive migration only: `prisma migrate` down or follow-up migration dropping new cols/table (nullable). API/UI via git revert. Forfeits the only lossy data — deliberate.

## Dependencies

- Existing auth/prisma patterns.

## Success Criteria

- [ ] e2e: propose → counter → accept → `scheduledAt`; outsider 404; non-admin forfeit 403
- [ ] Forfeit marks match played, round complete
- [ ] Existing league-season e2e green

## Forecast & Workload

3 chained PRs: DB+API ~350 / UI ~450 / e2e ~200.

Decision needed before apply: Yes
Chained PRs recommended: Yes
400-line budget risk: High
