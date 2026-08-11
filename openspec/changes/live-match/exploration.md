# Exploration: live-match

> Seed artifact for the SDD `live-match` change (live match view / partido en vivo).
> Scope resolved here: the first slice is a read-only match VIEW page adapted to the
> rulebook-light design system, from existing result + team + league data. Realtime
> sync is explicitly out of slice 1 (long-term goal, scoped separately).

## Current State

**Data model.** The `Fixture` Prisma model (`prisma/schema.prisma`) carries `round`,
`homeTeamId`, `awayTeamId`, `scheduledAt`, `winnerId`, `homeScore`, `awayScore`, and
a relation to `MatchResult`. Status is **derived**, never stored:
`deriveFixtureStatus` in `app/api/leagues/[id]/route.ts` (lines 26-33):
`played ⇔ (homeScore/awayScore != null) ∨ (result present)`; else `scheduled ⇔ scheduledAt`
; else `pending`. There is **NO in-progress/live state** — no turns, half, clock, or
event feed fields exist on `Fixture` or anywhere else.

**Post-match data.** A result POST (`app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts`)
persists in one transaction: fixture scores + winner, a `MatchResult` row
(`weather` string, `scores` JSON snapshot, `pettyCash`, `loadedBy`), per-team winnings
incremented onto `Team.treasury`, and per-player PE increments + casualty injuries on
`Player` rows. The `MatchResult.scores` snapshot shape is:
`{ home: { score, postFf, casualties: ResolvedCasualty[], pe: {rosterPlayerId, pe}[] },
   away: { score, postFf, casualties, pe }, winnerId }` (built in the result route lines
291-295). This IS enough to build a post-match summary (final score, winner, FF change,
casualty injuries, per-player PE awards, petty cash, weather).

**Gaps for a match view.** Key missing data today:
- **No persisted chronological event timeline.** The timeline needs ordered match events
  (TDs, fouls, casualties with timestamps/minutes). Only totals persist per player
  (via PE; raw action counts like touchdowns/fouls/completions are NOT stored — only the
  PE derived from them and the casualties, both inside the versioned `scores` snapshot).
- **No turns/half/clock** for the top-bar turn tracks and elapsed clocks.
- **MVP grantee** is not persisted explicitly; only the PE snapshot with the MJP's +4 PE
  is in `scores.home.pe`, so the MVP grantee row is the entry with `pe` including the +4
  bonus — inferable but not a named field.
- **Dedicated Fans / Winnings per team** are derivable: pre/post FF live in the snapshot
  (`postFf`), winnings were applied to `Team.treasury` (only the aggregate, not per-match).

**API surface.** Existing routes (`app/api/leagues/...`): `GET /[id]` (detail, user-scoped),
`/[id]/teams` (POST assign), `/[id]/members/[teamId]` (DELETE expel/leave),
`/[id]/start`, `/[id]/fixtures/[fixtureId]/propose`, `/proposals`, `/accept`, `/forfeit`,
`/result` (POST load / PUT correct). HTTP semantics: unauth → 401 (no write), foreign
user → 404 via `findFirst` + role checks (no existence leak), permission on correct by
captain → 403, already-played/forfeit → 409. `app/api/teams/[id]` is a read-only scouting
detail returning `roster`, `coaching`, `leagueId` — **it does NOT return the enriched
`Player` rows** (name, positionalKey, pe, skills, injuries) needed for MVP cards.

**No dedicated match view page** exists. The closest is `MatchCard`
(`features/leagues/MatchCard.tsx`), rendered per fixture in the `Jornadas` round grid of
`features/leagues/LeagueDetail.tsx`. It shows home/away names, owners, a `VS`, status
badge, score (`formatMatchScore`), winner, footer, and admin/captain action buttons
(`Cargar resultado`, `Corregir resultado`, `Otorgar victoria`). It is a card, not a
dedicated page/route.

**Realtime.** `package.json` has no SSE/WebSocket/streaming lib (deps: next 16.3.0, react
19.2.8, next-auth 5 beta, prisma, @aws-sdk/client-s3, sharp, react-easy-crop. devDeps:
vitest, playwright, tailwind v4). Grep found zero `text/event-stream`/`EventSource`/
`ReadableStream`/`setInterval` usage in app code. **No realtime pattern exists.**
Next.js 16 route handlers (App Router) do support streaming `ReadableStream`/SSE responses
in the Node runtime without extra deps; polling is also trivially feasible (client
`fetch` on an interval). `AUTH_MODE=local` (anonymous, LocalStorage store) vs
`AUTH_MODE=auth` (Auth.js Credentials + JWT cookie) affects the auth gate but not the
route-handler streaming capability — an SSE/polling endpoint would still run `auth()`
and 401 unauthenticated, so live updates are orthogonal to the two store modes.

**UI layer.** Tailwind v4 CSS-first (no `tailwind.config`, `globals.css` = one
`@import "tailwindcss"`). Design tokens are canonical rulebook-light (app-shell spec):
navy `#12225a`, red `#d11938`, bg `#f8fafc`, border `#e2e8f0`, shadow alpha 0.1, zebra
`#e6eef5`. The app-shell spec explicitly requires "No page content MUST depend on a dark
body for legibility." Colors are applied via **inline arbitrary values** (verified:
`bg-[#12225a]`, `text-[#d11938]`, `border-[#e2e8f0]` across `features/leagues/*`).
No icon library — no lucide-react, no Font Awesome (confirmed in package.json); the app
uses text/SVG-less glyphs (e.g. `✕` in ForfeitModal, `VS` in MatchCard). Avatars via
`components/UserAvatar.tsx` (`<img>`, renders nothing when no src).
Reusable: `MatchCard`, `TeamSide` (inline in MatchCard), `ResultModal`, `ForfeitModal`,
`NegotiationPanel`, `StartLeagueModal`, `UserAvatar`, the league-detail navy hero header
pattern (`LeagueDetail` lines 142-177). `getRaceById` (`features/teams/data/races.ts`)
resolves race display names (used in LeagueDetail/MemberList). There is no race
subtype/logo field today (`Race` = id, name, rerollCost, positionals[]).

**Navigation/shell.** `proxy.ts` is the Next 16 route protection (`export { auth as
proxy }`); `lib/auth-mode.ts` gates `AUTH_MODE`. Pages are plain App Router files under
`app/`. UI copy: league/detail/matchday sections are **Spanish** ("Partido {round}",
"Jornada {round}", "Cargar resultado", "Otorgar victoria"); home chrome is English.
A match-view page under `app/leagues/[id]/fixtures/[fixtureId]` would follow the
league-section Spanish copy + rulebook-light styling.

**Tests.** Vitest unit/integration: `features/leagues/*.test.{ts,tsx}` (api, MatchCard,
LeagueDetail, ResultModal, ForfeitModal, NegotiationPanel, StartLeagueModal), route
tests under `app/api/leagues/**/route.test.ts`, `lib/result.test.ts`. Playwright e2e:
`e2e/leagues.spec.ts`, `e2e/league-matchday.spec.ts`, `e2e/league-season.spec.ts`,
`e2e/match-report.spec.ts`, `e2e/full-league-flow.spec.ts`. Commands: `pnpm test`
(vitest), `AUTH_MODE=local pnpm exec playwright test` (local e2e), `pnpm lint`,
`npx tsc --noEmit`, `pnpm run test:e2e:auth` (needs Docker + Postgres).
e2e asserts exact labels/regions/aria — new page must not break `Jornadas` selectors.

## Approaches

1. **Static match-view page (slice 1, recommended)** — New App Router page
   `app/leagues/[id]/fixtures/[fixtureId]/page.tsx` rendering a client `MatchView`
   component from a **new/dedicated GET** (extend league detail or a new
   `/api/leagues/[id]/fixtures/[fixtureId]` route) that enriches fixture + `MatchResult`
   snapshot + team rosters.
   - Pros: matches existing patterns; no schema change; buildable from current
     post-match data; testable with existing vitest + a new e2e.
   - Cons: turn tracks / half / clocks must render a "not live" or placeholder state
     (no live state exists); timeline limited to casualty events + inferred TDs.
   - Effort: Medium.

2. **Match-view page + minimal live-read model** — Add an event/turn data model (new
   Prisma models) AND the view. Realtime still out of scope but the view renders a
   richer "reported summary" from a persisted event feed.
   - Pros: timeline becomes first-class; realtime becomes a later delta on top.
   - Cons: schema migration + event-write path design now; larger PR; conflicts with
     "first slice = the view" scoping; likely exceeds the 400-line PR budget → chaining.
   - Effort: High.

3. **Full realtime (SSE/polling) in slice 1** — data model for turns/half/clock/events +
   streaming API + reconciliation.
   - Pros: delivers the actual "partido en vivo".
   - Cons: requires new Prisma models, server-owned clock/turn state machine, write path,
     streaming + reconnect handling, dual-mode auth considerations. Far beyond a first
     reviewable slice. **Not recommended for slice 1.**
   - Effort: Very High.

## Recommendation

Ship **slice 1 = the static match-view page** (Approach 1), adapted to rulebook-light
tokens. Rationale: a post-match summary can already be rendered from the persisted
`MatchResult.scores` snapshot + fixture + team rosters — no schema change required. The
dark mockup's turn tracks / half / clock / event timeline map to placeholder/derived
states for a non-live fixture and become real once the live data model is added as a
later change. Real-time sync is a separate, explicitly-scoped change and must NOT be
folded into this first slice. The timeline should start from what IS persisted
(casualty injury events from `ResolvedCasualty[]`) and show a "not reported" path for
scheduled/pending fixtures.

### Affected Areas (slice 1)
- `prisma/schema.prisma` — unchanged (no migration needed). `MatchResult.scores` shape
  is the source of the post-match summary.
- `app/api/leagues/[id]/route.ts` — `enrichFixture` may need to also expose the
  `MatchResult` snapshot (the current GET include does NOT select `result`); or add a
  dedicated per-fixture GET.
- `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts` — (new) GET for a single match
  (fixture + result + teams), reusing the auth/404 pattern.
- `features/leagues/MatchView.tsx` — (new) client page component; sections from the mock.
- `features/leagues/api.ts` — (new) `getMatchDetail` + types for the summary shape.
- `features/leagues/LeagueDetail.tsx` / `MatchCard.tsx` — add a way to open/match-link
  to the new page (e.g. navigate to `/leagues/[id]/fixtures/[fixtureId]`).
- `components/UserAvatar.tsx`, `features/teams/data/races.ts` — reused for coach
  avatars and race names.
- Tests: new vitest for MatchView + route; extend `e2e/league-matchday` or
  `e2e/match-report.spec.ts`; do not break existing `Jornadas`/MatchCard selectors.

## Risks

- **Realtime scope creep (CRITICAL)** — The mockup is a live-match view; without a live
  model the turn tracks, half, and clock are non-functional. Must scope slice 1 to the
  static/summary view and gate live plumbing behind a separate change, or the PR explodes.
- **Design-system adaptation (WARNING)** — The mockup is dark-themed; app-shell mandates a
  light body and rules out dark-dependent content. The navy `#12225a` hero + white panels
  are the closest fit; turn-track "current turn highlighted" must use the red `#d11938`
  accent on light. Budget dev time for this reinterpretation.
- **Data-model gaps (WARNING)** — No event timeline, no turns/half/clock, no persisted
  per-player raw action counts (only PE), MVP grantee only inferable, and team-detail API
  does not expose `Player` rows (needed for MVP cards). A slice-1 summary must derive what
  it can from the `MatchResult` snapshot and fill gaps with placeholders rather than a new
  schema.
- **MVP-card data not exposed (WARNING)** — `app/api/teams/[id]` returns no `players`;
  the match endpoint must include `Player` rows (or the MVP cards render from roster only).
- **Icon/logo absence (SUGGESTION)** — No icon library and no race subtype/logo field;
  color-coded icons and team logos must be added (inline SVG or a small icon set) or
  dropped.

## Ready for Proposal

Yes. The first-slice scope is clear (static match-view page from existing result data,
rulebook-light, Spanish league copy), the data gaps are catalogued, and realtime must be
explicitly excluded so the proposal can bound the change. Tell the user: a match summary
page is buildable today with no schema change; the live turn/clock/timeline model is a
separate change, and the strategy should be "view first, live later."
