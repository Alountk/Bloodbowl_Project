# Tasks: Matchday — Fecha, Rival y Resultado

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1000 (350 DB+API / 450 UI / 200 e2e) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 DB+API -> PR2 UI -> PR3 e2e+polish |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Focused test | Runtime harness | Rollback |
|---|---|---|---|---|
| 1 (PR1) | Migration + routes + guards + scouting | `npm test app/api/leagues app/api/teams` | started-league propose->accept->scheduledAt via curl with session | revert routes + `prisma migrate down` |
| 2 (PR2) | Pattern B UI + panel + forfeit + rival link | `npm test features/leagues` | preview: two members negotiate; admin forfeit modal | git revert UI components only |
| 3 (PR3) | e2e + polish + completion badge | `npx playwright test league-season` | full started-league e2e flow | revert e2e/README-only changes |

## PR 1 - DB + API

- [x] 1.1 RED `prisma/schema.prisma`: Fixture +`scheduledAt`/`winnerId`, `ScheduleProposal`(cascade,`@@index([fixtureId,createdAt])`) -> `migrate dev`; route tests assert new fields
- [x] 1.2 RED `propose/route.test.ts`: participant ok; non-participant 404; unauth 401; missing date 400
- [x] 1.3 GREEN propose route (started 404 gate + participant check + one-active-proposal tx)
- [x] 1.4 RED `accept/route.test.ts`: other-participant sets scheduledAt; self-accept/closed/scheduled 409
- [x] 1.5 GREEN accept route (other-participant; acceptedAt + scheduledAt tx)
- [x] 1.6 RED `forfeit/route.test.ts`: admin ok; non-admin 403; winner not home/away 400; repeat 409; closes proposals
- [x] 1.7 GREEN forfeit route (league-owner only; winnerId; close open proposals)
- [x] 1.8 RED `proposals/route.test.ts`: history to participants/admin; 404 otherwise
- [x] 1.9 GREEN proposals route (ordered history)
- [x] 1.10 RED `GET /api/teams/[id]` test: owner/league owner/member 200; outsider 404; archived 404; unauth 401
- [x] 1.11 GREEN scouting GET in `app/api/teams/[id]/route.ts` (single visibility gate)
- [x] 1.12 RED detail-route test: fixtures expose status/scheduledAt/winnerId/owners/proposals + round `complete`
- [x] 1.13 GREEN detail GET enrich (`app/api/leagues/[id]/route.ts`): round completion + owner reconciliation
- [x] 1.14 Update `features/leagues/api.ts`: `FixtureStatus`, proposals/owners types + `propose`/`accept`/`forfeit`/`getProposals`

## PR 2 - UI (Pattern B)

- [ ] 2.1 RED `LeagueDetail.test.tsx`: round tabs render; default round selected
- [ ] 2.2 GREEN tabs + `MatchCard` (centered VS, owner label below each team, rival team link)
- [ ] 2.3 RED MatchCard test: click rival team navigates to `/teams/[id]` (scouting)
- [ ] 2.4 GREEN rival link wiring in `LeagueDetail`
- [ ] 2.5 RED `NegotiationPanel.test.tsx`: participant sees propose/accept; non-participant/admin none
- [ ] 2.6 GREEN NegotiationPanel: propose date, accept other proposal, history; participant-only buttons
- [ ] 2.7 RED forfeit test: admin sees `ForfeitModal`; non-admin does not
- [ ] 2.8 GREEN `ForfeitModal`: admin picks home/away winner -> `forfeit`; refreshes
- [ ] 2.9 RED completion test: round complete only when all fixtures `played`
- [ ] 2.10 GREEN completion badge in round header
- [ ] 2.11 RED team-detail test: foreign-team fetch fallback; outsider 404 -> notFound
- [ ] 2.12 GREEN `app/teams/[teamId]/page.tsx` scoping fetch fallback + read-only render

## PR 3 - e2e + Polish

- [ ] 3.1 e2e: propose -> counter -> accept sets scheduledAt; `scheduled` badge
- [ ] 3.2 e2e: outsider team 404; non-admin forfeit 403; admin forfeit -> `played`, round complete
- [ ] 3.3 e2e: rival scouting link opens read-only roster; 3.4 polish (empty states, errors, skeletons, Spanish copy)

## Chain Strategy

- [ ] 4.1 Ask user: stacked-to-main vs feature-branch-chain before sdd-apply (`ask-on-risk`)
