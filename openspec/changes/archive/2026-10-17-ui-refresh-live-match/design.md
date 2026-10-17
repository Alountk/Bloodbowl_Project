# Design: ui-refresh — Live Match V2 Seam

## Technical Approach

Repeat the archived designs (`2026-10-11-ui-refresh` — `UiFlagProvider`/`useUiFlag()`, in main; `2026-10-12-ui-refresh-teams-list`, `2026-10-13-ui-refresh-dashboard`, `2026-10-14-ui-refresh-create-wizard`, `2026-10-16-ui-refresh-leagues` — seam shape) on screen #6: `app/leagues/[id]/fixtures/[fixtureId]/page.tsx` becomes the sixth declared seam with one branch. New decisions only; UIR-1/3/4/5 inherited. Satisfies MODIFIED UIR-2.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Seam location | route page vs inside `MatchView` vs wrapper | **`app/leagues/[id]/fixtures/[fixtureId]/page.tsx` gains one `useUiFlag()` branch** (precedent of all five predecessors) | The page is a thin server component that only unwraps `params` and delegates — the single-caller surface. `MatchView.tsx` (~1900 lines) never reads the flag; a branch inside it would put flag logic into the tested legacy surface. The page becomes `"use client"` (precedent `app/leagues/page.tsx`) so `use()` on the params promise + `useUiFlag()` coexist |
| Props contract | lift props vs mirror legacy | **both surfaces take `{leagueId, fixtureId}`; the route passes both** | Identical by construction; legacy keeps its exact contract |
| Data channel | lift fetch into seam vs reuse machinery | **V2 reuses the legacy surface's OWN machinery**: `useMatchDetail`-style flow via `getMatchDetail`, `useLiveMatch` (SSE), `useLiveClock`, `useLeague`, `sendLiveCommand`, `resetLiveMatch`, `createShareLink`, `buildMatchSummary`/`buildSummaryFeedRows` | Presentation-only (UIR-2): zero new endpoints, zero new channels; the live fixture REST surface (`/fixtures/[fixtureId]/live`, `/result`, `/reset`, `/share`) is untouched |
| Atom reuse | reimplement timeline/dock/acta vs reuse | **reuse `MatchTimelineBar` + `LiveActionDock` + `LiveEventCardsActa` + `HeaderEmblem` + `MatchResolveModal` + `ResetLiveMatchModal` unchanged** | Same precedent as the dashboard reusing `PendingAttention`/`LeagueCard` and the leagues list reusing `LeagueCard`/`CreateLeagueModal`: V2 reskins the PAGE chrome (header, layout, zones), not the shared atoms with their tested logic |
| Surface size strategy | one-shot full V2 vs staged | **staged: slice 1 = skeleton covering the states the flag-ON baseline asserts (pending/ready consent + live header zones); slice 2 = full Stitch chrome + remaining states + mobile** | The legacy surface spans pending/ready/live/finished + inducements + report; a ~350-line slice cannot honestly restate all of it. Staging keeps each PR <400 (chained-pr) |
| Testid vocabulary | reuse legacy ids vs new | **`ui-v2-match-*`**: `-header`, `-score`, `-timeline`, `-acta`, `-consent`, `-dock-zone`, `-not-found` | Never-both asserts `ui-v2-match-*` vs legacy `rulebook-header`, `mini-strip`, `score-*`, `summary-row`, `share-link` |
| i18n | new `matchV2.*` keys vs reuse | **reuse existing `match.*` keys** (ES+EN already complete for every state: `match.consent.*`, `match.concede.*`, `match.loadError`, `match.notFound`, `match.liveBadge`…); new keys only where no `match.*` equivalent exists (both locales) | Copy for detail/match screens is Spanish (AGENTS.md); identical labels keep both surfaces' accessible contract stable |
| Responsive strategy | `useIsDesktop` vs CSS | **Tailwind breakpoints** (Stitch `M` mobile frames) | Same as every predecessor seam; no hook needed |
| Harness strategy (S7) | V2 preserves contract vs adapt helper | **no flag-ON test walks the fixture route today (traced)**: `createTeamAndOpenList` ends on `/teams`; the roster spec's dashboard flag-ON cases assert `ui-v2-dashboard-next-match` but never click the `DashboardV2.tsx:78` fixture link; the 9 specs that reach `/leagues/.../fixtures/...` (`full-league-flow`, `inducement-purchase`, `league-matchday`, `live-match`, `live-resolution`, `match-report`, `match-view`, `roster-table`, `watch`) are ALL flag-OFF | No helper edits. Slice 1 adds direct flag-ON fixture cases (cookie before first goto — hard constraint, local store dies on reload). The dashboard V2 "Next match" link becomes the future flag-ON walk; V2 keeps fixture URLs identical so the link stays valid |

## Data Flow

```
bb-ui cookie → app/layout.tsx → UiFlagProvider            (archived, unchanged)
                  └─ useUiFlag() in app/leagues/[id]/fixtures/[fixtureId]/page.tsx  (seam #6)
                         true  → <MatchViewV2 leagueId fixtureId/>  ui-v2-match-*, same machinery
                         false → <MatchView leagueId fixtureId/>    default, frozen legacy contract
app/watch/[token]/page.tsx → WatchMatchView: never reads the flag (UIR-2 new scenario).
```

## E2E navigation trace (flagged seam rule)

9 spec files navigate to the fixture route — ALL flag-OFF (only `e2e/ui-refresh-roster.spec.ts` ever sets `bb-ui`): `full-league-flow`, `inducement-purchase`, `league-matchday`, `live-match`, `live-resolution`, `match-report`, `match-view`, `roster-table`, `watch` → UIR-3 frozen, zero edits. Nav entries into the route: `MatchCard.tsx:385`, `UpcomingMatchCard.tsx:29`, `Dashboard.tsx:62/223`, `PendingAttention.tsx:33`, `DashboardV2.tsx:78`.

- **Flag-ON path**: NONE reaches the fixture today — `createTeamAndOpenList` ends on `/teams`; no flag-ON test clicks the dashboard V2 next-match card. S7 resolved: no helper edits; slice 1 adds flag-ON cases with direct `goto("/leagues/{id}/fixtures/{fid}")` (cookie before goto). The roster spec runs ONLY in the local anonymous suite (present in `playwright.config.ts`, absent from the auth config's `testMatch`), so no real fixture can be built there: the baseline pins the seam through the SAME fixture GET answer the legacy surface gets in that suite — `ui-v2-match-error` on the 401 (`auth()` precedes the fixture lookup; the merged seam-5 case pins `GET /api/leagues` → 401 in this suite) — and never-both is proven by EXACTLY ONE error panel on the page, because the legacy error panel carries no testid. The heavy real-fixture helpers (`loadFixtureContext` / `scheduleFixture`) live in `e2e/live-match.spec.ts` under `playwright.config.auth.ts`; loaded-state rendering is covered by the component tests (stubbed detail) plus the 9 flag-OFF auth-suite specs (UIR-3).
- Cookie-before-goto stays a hard constraint; V2 performs no storage writes.

## File Changes

| File | Action | Description |
|---|---|---|
| `app/leagues/[id]/fixtures/[fixtureId]/page.tsx` | Modify | `"use client"` + `useUiFlag()` branch; no legacy-feature edits |
| `features/leagues/MatchViewV2.tsx` | Create | redesigned live match, `ui-v2-match-*`, reuses hooks + atoms listed above |
| `features/leagues/MatchViewV2.test.tsx` | Create | seam + markup + never-both + presentation-only tests |
| `e2e/ui-refresh-roster.spec.ts` | Modify | flag-ON fixture cases: desktop, triangulation, mobile |

## Interfaces / Contracts

```ts
// seam — identical props by construction, route passes both
const uiV2 = useUiFlag();
return uiV2
  ? <MatchViewV2 leagueId={id} fixtureId={fixtureId} />
  : <MatchView leagueId={id} fixtureId={fixtureId} />;

// MatchViewV2: "use client". MAY import the legacy surface's OWN machinery
// (useLiveMatch, useLiveClock, useLeague, getMatchDetail, sendLiveCommand,
// resetLiveMatch, createShareLink, MatchTimelineBar, LiveActionDock,
// LiveEventCardsActa, matchSummary builders, MatchResolveModal,
// ResetLiveMatchModal, match.* i18n keys); MUST NOT open new endpoints or
// reimplement the live command protocol. Stitch hand-translated, project
// 16023060193335379804: desktop "Partido en Directo (Acta en Vivo)".
```

## Slicing

- **Slice 1 — seam + V2 skeleton + flag-ON baseline** (~350): RED seam tests, seam branch, `MatchViewV2.tsx` skeleton rendering real detail via `getMatchDetail` (header, score, not-found/error parity), flag-ON desktop e2e + triangulation, VERIFY-ONLY gate.
- **Slice 2 — full V2 + tests + mobile** (~330): Stitch chrome complete (consent/acta/dock zones wired to the shared atoms, finished summary), expanded component tests, mobile 390×844 e2e case, VERIFY-ONLY legacy gate, `useUiFlag()` grep at exactly SIX seams (UIR-5, no flip), watch-route flag-free proof.

## Out of scope (do not touch)

`MatchView.tsx` and its subcomponents (VERIFY-ONLY), the 9 flag-OFF fixture specs, `app/watch/[token]/`, live API routes, default flips, theme tokens, cookie writer.
