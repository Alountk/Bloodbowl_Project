# Tasks: Live Match View — Match Detail Page (MVP)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1150–1210 (authored, 4 PRs) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 API → PR 2 client+mapping → PR 3 page → PR 4 nav+e2e |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Per-fixture GET + `winnings`/`mvp` snapshot persistence (MV-1, D1/D3/D4/D6) | PR 1 | `pnpm vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/{route,result}".**test.ts` | `GET /api/leagues/ID/fixtures/FID` via real app; AUTH_MODE both | Revert route + result route edits |
| 2 | Pure snapshot→section mapping + `getMatchDetail` client fn (MV-2, D2/D5) | PR 2 | `pnpm vitest run features/leagues/matchSummary.test.ts` | `N/A` — pure functions, no runtime boundary | Revert `matchSummary.ts` + `api.ts` |
| 3 | `MatchView` 3-state page, inert live shells (MV-2/3/5/6/7) | PR 3 | `pnpm vitest run features/leagues/MatchView.test.tsx` | `pnpm dev` → `/leagues/ID/fixtures/FID` in both auth modes | Revert `MatchView.tsx` + `page.tsx` |
| 4 | MatchCard "Ver partido" link + auth e2e (MV-4, AC-3) | PR 4 | `pnpm vitest run features/leagues/MatchCard.test.tsx` + `AUTH_MODE=local pnpm exec playwright test` | `pnpm run test:e2e:auth` (docker PG server) | Revert MatchCard + configs + spec |

## PR 1 — API (route + snapshot persistence)

- [x] 1.1 RED `features/leagues` payload: route.test.ts asserts GET 401 when `auth()` returns null (anonymous path), both AUTH_MODE parity asserted via mock, payload shape `{fixture,result,homeTeam,awayTeam}` with `result` nullable and no nested teams (MV-1, D3/D6)
- [x] 1.2 RED: route.test.ts asserts 404 fixture-not-found / fixture-not-in-league / STARTED foreign non-member (no existence leak) (MV-1, D6: `findFirst({id,leagueId})`, STARTED owner-OR-ANY-member else 404)
- [x] 1.3 RED: route.test.ts asserts 200 for league-owner, member-team-owner, and OPEN league any-authenticated (defensive, no fixtures while open) (MV-1)
- [x] 1.4 Create `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` GET: import `enrichFixture` from `@/app/api/leagues/[id]/route` (D7), Prisma include per design (league status/ownerId/teams.userId archived-filtered, home/away team + user + players, result), strip nested homeTeam/awayTeam after enrich (D3 D1), walkover `scores` set + `result` null keeps 200 (MV-2)
- [x] 1.5 RED (refactor guard): result route.test.ts safety net — assert POST persists `scores.mvp.{home,away}` (from recomputed `computeMvpGrantee`) and `winnings` in the snapshot JSON; PUT recomputes `mvp` and preserves prior `winnings` (D4, MV-2)
- [x] 1.6 Modify `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts`: add `winnings:{home,away}` + `mvp:{home,away}` (rosterPlayerId) to POST `scoreboard` (D4) → `route.test.ts` red→green
- [x] 1.7 Modify result PUT `scoreboard`: recompute `mvp` from re-rolled grantee, preserve prior `winnings` (D4); legacy rows lacking `mvp`/`winnings` unaffected (forward-only, MV-6 no migration)

## PR 2 — Client fetch + pure mapping

- [x] 2.1 Modify `features/leagues/api.ts`: add `getMatchDetail(leagueId, fixtureId)` + `MatchDetail`/`MatchTeamDetail`/`MatchPlayer`/`MatchScoreboard` types matching D3/D2 contract (`FixtureDraft` reuse, nullable `result`)
- [ ] 2.2 RED `features/leagues/matchSummary.test.ts`: MVP persisted `scores.mvp` wins; legacy fallback = per-team max-`pe` (floor≥4, PE_MVP=4, tie-first), unresolved→omit section (omit-not-crash) (D5, MV-2)
- [ ] 2.3 RED `features/leagues/matchSummary.test.ts`: weather kind→Spanish (heat→Calor asfixiante, sunny→Muy soleado, perfect→Perfecto, rain→Lluvioso, blizzard→Ventisca; unknown as-is); casualty kind→labels (bruise→Magullado, apaleado→Apaleado, grave→Herida grave, permanent→Permanente, dead→Muerto) (MV-2)
- [ ] 2.4 RED `features/leagues/matchSummary.test.ts`: omit-if-empty scoreboard sections, fans `postFf` (null→omit), winnings null→omit; walkover detection (fixture scores set, no snapshot) → zero summary sections + notice (MV-2)
- [ ] 2.5 Create `features/leagues/matchSummary.ts` pure functions (scoreboard/walkover/teams/ffinish/casualties/weather/pe/mvp section builders) to pass 2.2–2.4, red→green→refactor

## PR 3 — Page + MatchView

- [ ] 3.1 Create `app/leagues/[id]/fixtures/[fixtureId]/page.tsx` (~15): thin server page rendering `<MatchView leagueId fixtureId/>` (D2)
- [ ] 3.2 RED `features/leagues/MatchView.test.tsx`: 3-state render — played full summary (scores+winner, teams+race name, FF, winnings, casualties labels, weather, +4 MVP row), scheduled `Programado:` `formatMatchDate` es-ES (MV-3), pending notice no date (MV-3)
- [ ] 3.3 RED `features/leagues/MatchView.test.tsx`: walkover renders fixture scores + `Victoria por incomparecencia.`, zero summary sections (MV-2); no visible live/timeline placeholder any state (MV-5/MV-6)
- [ ] 3.4 RED `features/leagues/MatchView.test.tsx`: Spanish copy + rulebook-light tokens only, no deps/icons (MV-7); `notFound` collapses to 404 view
- [ ] 3.5 Create `features/leagues/MatchView.tsx` (client): internal `useMatchDetail` hook (mirrors `useLeagueDetail`), 3-state rendering, `LiveTurnBar/LiveClock/LiveEventFeed` shells receiving `live:null` → render null (MV-5), 404→notFound, live region hook; red→green→refactor

## PR 4 — Navigation + E2E

- [ ] 4.1 RED (refactor guard) `features/leagues/MatchCard.test.tsx`: approval—scheduled/played footer text byte-identical, "Ver partido" link is LAST DOM link, href `{leagueId}/fixtures/{fixtureId}`, renders in ALL 3 states incl. pending (MV-4), card-body click still negotiates
- [ ] 4.2 Modify `features/leagues/MatchCard.tsx`: footer `footer` always rendered (MV-4 DOM order), append `<Link>Ver partido</Link>` last; scheduled/played lines unchanged (byte-identical → Jornadas/match-report e2e green, AC-3)
- [ ] 4.3 Modify `playwright.config.ts` +`testIgnore` with `"**/match-view.spec.ts"` (+1) and `playwright.config.auth.ts` +`testMatch` (+1): new spec NOT in local, IS in auth run
- [ ] 4.4 Create `e2e/match-view.spec.ts` (auth suite, ~230): full-league helpers — played summary renders, scheduled date, pending notice, walkover notice on real DB (MV-1..MV-4, AC-1..AC-3)

## Traceability

| Spec req | Tasks |
|----------|-------|
| MV-1 Auth-Gated GET | 1.1, 1.2, 1.3, 1.4 |
| MV-2 Played Snapshot Summary | 1.5, 2.2, 2.3, 2.4, 2.5, 3.3, 3.5 |
| MV-3 Scheduled/Pending | 3.2, 3.5 |
| MV-4 MatchCard Access | 4.1, 4.2 |
| MV-5 Inert Live Shells | 3.3, 3.5 |
| MV-6 Out-of-Scope Lock | 1.7, 3.3 |
| MV-7 Design System + Copy | 3.4 |
| AC-1/2/3/4/5 | 1.x/3.x / 2.x+3.x+4.x / 4.x / 3.x / 4.x |

Design decisions D1–D7 → tasks 1.4 (D1/D3/D6/D7), 1.5-1.7 (D4), 2.1 (D2/D3), 2.2 (D5), 3.5 (D2/D5).

## Apply order (stacked-to-main)

PR 1 → PR 2 → PR 3 → PR 4; each merges to main in order, additive, deployable alone. Do not start PR N before PR N−1 merges.

## Risks

- **WARNING**: D4 touches result write path — routes/tests churn in PR 1; keep snapshot changes forward-only (legacy rows unchanged).
- **WARNING**: MatchCard footer restructure (4.2) risks Jornadas/match-report e2e; keep scheduled/played text byte-identical, run local + auth e2e before merging PR 4.
- **SUGGESTION**: `enrichFixture` cast-import from detail route (D7) couples fixture route to detail route — extract to `lib/fixtures.ts` in a later refactor PR.
