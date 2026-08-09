# Design: Matchday — Fecha, Rival y Resultado

## Technical Approach

Additive Prisma migration (Fixture +`scheduledAt`/`winnerId`, new `ScheduleProposal`); status derived in the route layer. Nested fixture routes under `/api/leagues/[id]/fixtures/[fid]/` for propose/accept/forfeit/proposals. Add `GET /api/teams/[id]` scouting with a single visibility gate. Pattern B UI in `LeagueDetail` (tabs per round, VS cards, owner below team, rival link, negotiation panel, forfeit modal). Team detail page does a server-scoping fetch fallback for foreign teams. Maps to `matchday-negotiation`, `matchday-forfeit`, `team-scouting` specs + the league-season/team-detail deltas.

## Architecture Decisions

| Decision | Options | Decision |
|---|---|---|
| Status storage | stored column vs derived | DERIVED in route layer — `pending`/`scheduled`/`played` from `scheduledAt`/`winnerId`. No denormalized column to drift. |
| One-active-proposal | app-level check vs tx re-check | TX — propose closes prior active and inserts with a conditional findFirst on active proposal inside one `$transaction`. Concurrency per `matchday-negotiation` spec. |
| Forfeit authorization | participant or admin | ADMIN-ONLY (403) — proposal is the only resolution path; forfeit is a walkover by the league owner (`matchday-forfeit`). |
| Scouting gate | 3 allowed sets | owner / league owner / league member → 200; everyone else 404 (`team-scouting`). Single function, no existence leak. |
| Rival page | client-only vs server fetch | Server fetch `GET /api/teams/[id]` fallback in `/teams/[teamId]` when store lacks it; 404 → `notFound()`. Owner store path preserved. |
| PR chain | single vs 3 chained | 3 CHAINED (DB+API / UI / e2e+polish), 400-line budget guard. Delivery strategy `ask-on-risk` → ask before apply; chain strategy `pending`. |

## Data Flow

```
POST /api/leagues/:id/fixtures/:fid/propose {date}
  -> auth() 401; started-league 404 gate; participant check (home/away owner)
  -> $transaction: close active proposal, insert {userId,date}, set scheduledAt=null
POST .../accept  -> other participant; tx: acceptedAt=now, fixture.scheduledAt=date
POST .../forfeit {winnerTeamId} -> league owner(403), winner∈{home,away}(400), played(409)
GET  /api/teams/[id] -> auth 401; owner|leagueOwner|leagueMember ? 200 : 404
Detail GET -> fixtures grouped by round, each enriched {status,scheduledAt,winnerId,homeOwner,awayOwner,proposals}
```

## File Changes

| File | Action | Description |
|---|---|---|
| `prisma/schema.prisma` | Modify | Fixture +`scheduledAt`,`winnerId`; new `ScheduleProposal` (fixtureId cascade, userId, date, acceptedAt?, closedAt?) + `@@index([fixtureId, createdAt])`; Fixture relates proposals |
| `app/api/leagues/[id]/fixtures/[fid]/propose/route.ts` + `.test.ts` | Create | participant-only propose; one-active-proposal tx |
| `app/api/leagues/[id]/fixtures/[fid]/accept/route.ts` + `.test.ts` | Create | other-participant accept; sets scheduledAt |
| `app/api/leagues/[id]/fixtures/[fid]/forfeit/route.ts` + `.test.ts` | Create | admin-only walkover; sets winnerId; closes proposals |
| `app/api/leagues/[id]/fixtures/[fid]/proposals/route.ts` + `.test.ts` | Create | history GET (participants/admin) |
| `app/api/leagues/[id]/route.ts` + `.test.ts` | Modify | enrich fixtures with status/owners/proposals + round `complete` |
| `app/api/teams/[id]/route.ts` + `.test.ts` | Modify | add GET with visibility gate |
| `features/leagues/api.ts` + `.test.ts` | Modify | `FixtureDraft`+status/scheduledAt/winnerId/owners; types for round complete; `propose`/`accept`/`forfeit`/`getProposals`; `getTeam` scouting |
| `features/leagues/useLeagueDetail.ts` | Modify | add propose/accept/forfeit + refresh |
| `features/leagues/LeagueDetail.tsx` + `.test.tsx` | Modify | Pattern B: tabs per round, MatchCard(VS+owner+rival link), NegotiationPanel, ForfeitModal, completion badge |
| `app/teams/[teamId]/page.tsx` + `.test.tsx` | Modify | server-scoping fetch fallback; notFound on 404 |

## Interfaces / Contracts

```ts
export type FixtureStatus = "pending" | "scheduled" | "played";
export interface ScheduleProposal { id; fixtureId; userId; date; acceptedAt?: string|null; closedAt?: string|null; createdAt; }
Type Fixture holds +scheduledAt: string|null, winnerId: string|null, status: FixtureStatus,
  homeOwner:{id,nane}|null, awayOwner:{id,name}|null, proposals:ScheduleProposal[]
POST propose {date:string}       => 200 {proposal} | 400/401/404/409
POST accept  {}                  => 200 {fixture}  | 401/403/404/409
POST forfeit {winnerTeamId}      => 200 {fixture}  | 400/401/403/404/409
GET  proposals                   => 200 {proposals}| 401/404
GET  /api/teams/[id]             => 200 team read-only | 401/404
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit/route | propose/accept/forfeit guards, status derivation, visibility gate, one-active tx, round completion | route tests with mocked `prisma`/`auth` per existing pattern (`.test.ts` beside routes) |
| Component | MatchCard, NegotiationPanel, ForfeitModal, tabs, rival link, completion | `.test.tsx` with testing-library, existing RTL setup |
| E2E | propose→counter→accept→scheduledAt; outsider 404; non-admin forfeit 403; round complete | extend league-season e2e |

## Threat Matrix

`N/A — this change adds HTTP API routes and React UI components only; it introduces no shell/subprocess/VCS/PR-automation/executable-file-classification boundary.` Applied to all five rows (documentation-like paths, git selection, commit state, push state, PR commands) — no RED tests required for those classes. The relevant authorization boundaries (participant-only propose/accept, admin-only forfeit, scouting 404, one-active-proposal invariant) are covered as route tests in the specs above and RED tests in tasks.

## Migration / Rollout

Additive-only Prisma migration: Fixture `scheduledAt`/`winnerId` nullable, new `ScheduleProposal` table (cascade). Rollback via `prisma migrate down` or a follow-up migration dropping the new nullable cols/table. API/UI via `git revert`. Forfeits are the only intentionally lossy data.

## Open Questions

- [ ] Decision: chain strategy for the 3-PR split (stacked-to-main vs feature-branch-chain) — ask user before apply.
