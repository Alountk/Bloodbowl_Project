# Design: Live Match View — Match Detail Page (MVP)

## Technical Approach

Static read-only match page (Approach 1 of exploration.md) rendering three fixture states from persisted data: played → `MatchResult.scores` snapshot summary + rosters; scheduled → `formatMatchDate`; pending → notice. A dedicated GET reuses the league auth gate and `enrichFixture`; `MatchView` (client) maps snapshot → sections via pure functions; live shells exist but render nothing. Satisfies match-view MV-1…MV-7; no realtime, no timeline, no migration, no deps, no icons.

## Architecture Decisions

| # | Option | Tradeoff | Decision |
|---|--------|----------|----------|
| D1 | New GET route vs. adding `result` include to detail GET | Detail include: bloats league payload + touches Jornadas tests (blast radius) | **New GET** `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts`; detail route untouched |
| D2 | Client fetch (repo convention) vs. server fetch | Client: auth errors surface as notFound (matches LeagueDetail); server: one round-trip less but new pattern | **Thin server page → client `MatchView` → `getMatchDetail`** via internal hook (mirrors `useLeagueDetail`) |
| D3 | Response shape | Duplicate team payloads if unfiltered (`enrichFixture` spread keeps nested teams) | **`{ fixture, result, homeTeam, awayTeam }`**: `fixture` = `enrichFixture` output **with nested `homeTeam`/`awayTeam` stripped** (normalized); `result` nullable (walkover edge, MV-2); top-level teams carry `raceId` + `user` + `Player[]`. `FixtureWithMatchday` isn't exported (`route.ts:45`) → import casts structurally |
| D4 | Winnings + MVP grantee not in snapshot today | Omit (violates MV-2) vs. column (MV-6 forbids) vs. snapshot JSON fields | **Result route POST/PUT persists `winnings:{home,away}` AND `mvp:{home,away}` (rosterPlayerIds) inside `scores` JSON** (versioned blob, no migration); PUT recomputes `mvp` (grantee re-roll matches the PE re-run) and preserves prior `winnings`; legacy rows → omit/fallback |
| D5 | MVP display source | Persisted-first vs. inference-only | **Persisted `scores.mvp.{home,away}` first** (D4 write path); legacy rows without `mvp` → **fallback**: per team the max-`pe` entry (floor ≥ 4, PE_MVP=4, tie → first), resolved to a Player row; unresolved/absent → omit section (omit-not-crash) |
| D6 | Auth gate | — | Mirror **league detail GET** (`route.ts:160-165`): 401 no session; fixture `findFirst({id, leagueId})` → 404 (covers fixture-not-in-league; fixtures never exist in open leagues); STARTED → `league.ownerId` OR **any member** (`league.teams.some(t => t.userId === userId)`, archived filter), else 404; OPEN → any authenticated (defensive) |
| D7 | `enrichFixture` reuse | Extract to `lib/fixtures.ts` (churns detail route + tests) vs. import | **Import from `@/app/api/leagues/[id]/route`** (already exported); extraction later |

### Response / Error Matrix

| Condition | Status | Body |
|-----------|--------|------|
| No session (identical in both auth modes) | 401 | `{ error: "Unauthorized" }` |
| Fixture not found / not in league (incl. any open-league row) | 404 | `{ error: "Not found" }` |
| STARTED + foreign non-member | 404 | `{ error: "Not found" }` (no existence/status leak) |
| STARTED + owner or ANY member | 200 | `{ fixture, result, homeTeam, awayTeam }` |
| OPEN + any authenticated | 200 | same payload (defensive; no fixtures exist while open) |

## Data Flow

```
page.tsx → MatchView (client, useMatchDetail) → getMatchDetail(id, fixtureId)
  → GET route → prisma.findFirst(fixture, include: { league{status,ownerId,teams{userId}},
    homeTeam/awayTeam{id,name,raceId,userId,user,players[]}, result })
  → enrichFixture → normalize (strip nested homeTeam/awayTeam)
  → { fixture, result|null, homeTeam, awayTeam }
  → matchSummary.* pure fns → sections (played|scheduled|pending|walkover)
```

Snapshot → section map: scoreboard `scores.home.score/away.score` + `winnerId`→team name (or "Empate"); teams `name` + race via `getRaceById(raceId)` (no subtype field exists — race name only) + coach `user.name/avatar`; fans `postFf`; winnings `winnings` (new; null → omit); casualties `casualties[]` (victim name from roster; `outcome.kind` → rulebook labels: bruise→Magullado, apaleado→Apaleado, grave→Herida grave, permanent→Permanente, dead→Muerto); weather `result.weather` (raw `WeatherKind` code → Spanish: heat→Calor asfixiante, sunny→Muy soleado, perfect→Perfecto, rain→Lluvioso, blizzard→Ventisca; unknown code → display as-is); PE table `pe[]`; MVP = `scores.mvp.{home,away}` rosterPlayerId → Player row (legacy fallback: max-`pe` entry) + "+4 PE" badge. **Omit-if-empty everywhere, never placeholder (MV-2/MV-5).** Walkover: fixture scores + "Victoria por incomparecencia.", zero summary sections. Live shells `LiveTurnBar/LiveClock/LiveEventFeed` receive `live: null` (never set in this change) → render null (MV-5).

### MatchCard DOM order (MV-4)

"Ver partido" MUST be the LAST link in DOM order — `fixturesTeamNames` (`e2e/league-matchday.spec.ts:115-126`) enumerates every link in the `Jornada N` region and destructures the first two as team names, so a header-placed link would break negotiation/forfeit journeys:

```
<article aria-label="Partido N {home} vs {away}">
  <header> Partido N · {status}   [action buttons] </header>
  <div role="button" onClick={openNegotiation}>
    <Link href="/teams/{homeId}">{home}</Link>   ← link #1 (DOM)
    VS
    <Link href="/teams/{awayId}">{away}</Link>   ← link #2 (DOM)
  </div>
  <footer>                                           ← ALWAYS rendered (all 3 states)
    {scheduled → "Programado: {formatMatchDate}"      (exact existing text)
     | played → "Jugado · {score} · Ganador: {name}"  (exact existing text)
     | pending → nothing}                             (header already labels Pendiente)
    <Link href="/leagues/{leagueId}/fixtures/{fixtureId}">Ver partido</Link>   ← link #3
  </footer>
</article>
```

The footer is no longer conditional on scheduled/played (`MatchCard.tsx:158-167`); scheduled/played lines stay byte-identical so `match-report.spec.ts:241-242` labels stay green; the link renders for pending too.

## File Changes (chained PRs < 400 lines, delivery ask-on-risk)

| PR | File | Action | Δ lines |
|----|------|--------|---------|
| 1 | `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` | Create | ~115 |
| 1 | `app/api/leagues/[id]/fixtures/[fixtureId]/route.test.ts` | Create | ~200 |
| 1 | `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` | Modify (+`winnings`/`mvp` in snapshot POST/PUT) | ~+10 |
| 1 | `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` | Modify (snapshot assertions) | ~+15 |
| 2 | `features/leagues/api.ts` | Modify (`getMatchDetail` + types) | ~+75 |
| 2 | `features/leagues/matchSummary.ts` | Create (pure mapping: mvp/weather/casualty labels, sections) | ~140 |
| 2 | `features/leagues/matchSummary.test.ts` | Create | ~190 |
| 3 | `app/leagues/[id]/fixtures/[fixtureId]/page.tsx` | Create | ~15 |
| 3 | `features/leagues/MatchView.tsx` | Create (+ internal useMatchDetail, live shells) | ~280 |
| 3 | `features/leagues/MatchView.test.tsx` | Create | ~210 |
| 4 | `features/leagues/MatchCard.tsx` | Modify (always-rendered footer + "Ver partido" link) | ~+18 |
| 4 | `features/leagues/MatchCard.test.tsx` | Modify | ~+30 |
| 4 | `playwright.config.ts` | Modify (add `**/match-view.spec.ts` to testIgnore — NOT in local suite) | ~+1 |
| 4 | `playwright.config.auth.ts` | Modify (add `**/match-view.spec.ts` to testMatch — runs under `test:e2e:auth`) | ~+1 |
| 4 | `e2e/match-view.spec.ts` | Create (auth suite) | ~230 |

Deps: 1 → 2 → 3 → 4. Route file confirmed non-conflicting (no `route.ts` under `[fixtureId]/`; sub-routes are `propose/accept/forfeit/result/proposals` dirs).

## Interfaces / Contracts

```ts
interface MatchPlayer { rosterPlayerId: string; name: string; positionalKey: string;
  pe: number; skills: unknown; injuries: unknown; alive: boolean; valueBonus: number }
interface MatchTeamDetail { id: string; name: string; raceId: string;
  user: { id: string; name: string | null; email: string | null; avatar?: string | null } | null;
  players: MatchPlayer[] }
interface MatchScoreboard { home: { score: number; postFf?: number | null; winnings?: number | null;
  casualties: { team: "home"|"away"; rosterPlayerId: string; outcome: { kind: string } }[];
  pe: { rosterPlayerId: string; pe: number }[] }; away: MatchScoreboard["home"];
  winnerId: string | null;
  mvp?: { home: string; away: string } | null }                 // persisted grantee ids (D4)
interface MatchDetail { fixture: FixtureDraft; result: (MatchResult & { scores: MatchScoreboard }) | null;
  homeTeam: MatchTeamDetail; awayTeam: MatchTeamDetail }
async function getMatchDetail(leagueId: string, fixtureId: string): Promise<MatchDetail>
```

Prisma include: `homeTeam: { select: { id,name,raceId,userId, user:{select:{id,name,email,avatar}}, players:{select:{rosterPlayerId,name,positionalKey,pe,skills,injuries,alive,valueBonus}} } }` (×2) + `result: true` + `league: { select: { status, ownerId, teams: { select: { userId: true }, where: { archivedAt: null } } } }`. `enrichFixture` result is stripped of nested `homeTeam`/`awayTeam` before embedding (D3); `result` stays top-level.

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (route) | 401 (auth null — anonymous path per SUGGESTION); 404 foreign/unknown-fixture; 200 owner/any-member; 404 member of another league team on STARTED fixture; open-league 200 defensive; walkover (`scores` set, `result` null); payload shape (nullable result, players, status, normalized — no nested teams) | Mock `auth`+`prisma` (repo `vi.hoisted` pattern); route is AUTH_MODE-agnostic (never reads env), parity asserted in both suites |
| Unit (pure) | MVP: persisted `scores.mvp` wins, legacy fallback (max, floor ≥4, tie-first, unresolved → omit); weather kind→label incl. unknown as-is; casualty labels (Herida grave/Permanente); omit-if-empty sections; walkover detection | `matchSummary.test.ts` |
| Unit (MatchView) | 3 states render; walkover notice; no live/timeline placeholders (MV-5/MV-6); Spanish copy + tokens only (MV-7) | `MatchView.test.tsx` |
| Unit (MatchCard) | "Ver partido" link href + renders in ALL 3 states; link is last in DOM order; card-body click still negotiates; scheduled/played footer text unchanged | extend `MatchCard.test.tsx` |
| E2E (auth) | played summary / scheduled date / pending / walkover on real DB | new `e2e/match-view.spec.ts` (full-league-flow helpers) |
| E2E (regression) | Jornadas selectors intact — `fixturesTeamNames` (region links: first two still team links), region "Jornada 1", `getByText("vs")` count 1, "Partido 1 · Jugado", "Cargar resultado" button, "Ver" exact link | existing specs stay green (link adds no button/avatar/"vs" text; DOM order preserved) |
| Config | match-view.spec.ts NOT in local run; IS in auth run | testIgnore (`playwright.config.ts`) + testMatch (`playwright.config.auth.ts`) |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. The new endpoint is standard HTTP within the existing app; git/shell rows do not apply (matrix rule: do not manufacture).

## Migration / Rollout

No schema migration (MV-6). `scores` JSON gains `winnings` + `mvp` forward-only on new results; legacy snapshots omit `winnings`/`mvp` → those sections fall back or are omitted (MV-2 omit-not-crash). Rollback: revert chained PRs; read-only, zero data risk.

## Open Questions

- [ ] D4 touches the result write path (JSON-only: `winnings` + `mvp`) — confirm in-scope; required by MV-2 scenarios.
- [ ] "Race subtype" does not exist in the catalog — teams section shows race name only; confirm.
- [ ] MatchView client-fetch means page 404 depends on API 404 (matches LeagueDetail) — confirm.
