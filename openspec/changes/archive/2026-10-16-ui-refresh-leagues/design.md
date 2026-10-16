# Design: ui-refresh — Leagues V2 Seam

## Technical Approach

Repeat the archived designs (`2026-10-11-ui-refresh` — `UiFlagProvider`/`useUiFlag()`, in main; `2026-10-12-ui-refresh-teams-list`, `2026-10-13-ui-refresh-dashboard`, `2026-10-14-ui-refresh-create-wizard` — seam shape) on screen #5: `app/leagues/page.tsx` becomes the fifth declared seam with one branch. New decisions only; UIR-1/3/4/5 inherited. Satisfies MODIFIED UIR-2.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Seam location | route page vs inside `LeagueList` vs wrapper | **`app/leagues/page.tsx` gains one `useUiFlag()` branch** (precedent `app/teams/page.tsx`, `app/teams/create/page.tsx`) | `LeagueList.tsx` has a SECOND export (`LeagueCard`) consumed by `features/dashboard/Dashboard.tsx` AND `DashboardV2.tsx` — a branch inside the file would put flag logic where shared cards live; the route is the single-caller surface. Route becomes `"use client"` |
| Props contract | richer data vs mirror legacy | **both surfaces take no props; the route passes none** | Identical contract by construction; `app/leagues/page.test.tsx` keeps passing unmodified (no `UiFlagProvider` → `useUiFlag()` falls back to `false` → legacy) |
| Data channel | lift fetch into seam vs reuse hooks | **V2 reuses the legacy surface's OWN machinery**: `useLeagues()` (single `GET /api/leagues`), `useSession`, `isOwnerEquivalent`, plus the shared `LeagueCard`/`StatusBadge`/`CreateLeagueModal` exports | Presentation-only (UIR-2): zero new endpoints, zero duplicated filtering (the `myLeagues`/`openLeagues` split stays byte-identical) |
| Card/ badge reuse | reimplement vs reuse | **reuse `LeagueCard` + `StatusBadge` + `CreateLeagueModal` unchanged** | Same precedent as dashboard reusing `PendingAttention`/`LeagueCard`; V2 reskins the PAGE (hero, sections, spacing), not the shared atoms |
| Testid vocabulary | reuse legacy ids vs new | **`ui-v2-leagues-*`**: `-hero`, `-create-cta`, `-section-my`, `-section-open`, `-empty`, `-error` | Never-both asserts `ui-v2-leagues-*` vs legacy `#leagues-heading` / `#my-leagues-heading` / `#open-leagues-heading` |
| i18n | new `leaguesV2.*` keys vs reuse | **reuse existing `leagues.*` keys** (`myLeagues`, `openLeagues`, `heroSubtitle`, `newLeague`, `empty`, `myEmpty`, `openEmpty`, `status.*`); new keys only where no `create.*`-style equivalent exists (both locales) | Copy is Spanish (leagues chrome per AGENTS.md); identical labels keep the surface contract stable |
| Responsive strategy | `useIsDesktop` vs CSS | **Tailwind breakpoints** (Stitch `M 09`) | Same as every predecessor seam; no hook needed |
| Harness strategy (S7) | V2 preserves contract vs adapt helper | **no flag-ON test walks `/leagues` today (traced: `grep goto("/leagues" e2e/ui-refresh-roster.spec.ts` → NONE)**; the V2 dashboard links there (`DashboardV2.tsx:336 href="/leagues"`) but no flag-ON test clicks it yet | Slice 1 adds direct `goto("/leagues")` flag-ON cases; the helper `createTeamAndOpenList` is NOT extended (it doesn't reach leagues). If a future flag-ON test walks dashboard→leagues, V2 must keep the "Ver" card links reachable — covered by reusing `LeagueCard` |

## Data Flow

```
bb-ui cookie → app/layout.tsx → UiFlagProvider            (archived, unchanged)
                  └─ useUiFlag() in app/leagues/page.tsx        (seam #5)
                         true  → <LeaguesListViewV2/>   ui-v2-leagues-*, same hooks
                         false → <LeagueList/>          default, frozen legacy contract
features/leagues/LeagueList.tsx: LeagueCard/StatusBadge exported — consumed by BOTH
  dashboards; the file itself NEVER reads the flag.
app/leagues/[id]/page.tsx → LeagueDetail: never reads the flag (UIR-2 new scenario).
```

## E2E navigation trace (flagged seam rule)

19 spec files `goto("/leagues")` — ALL flag-OFF (only `e2e/ui-refresh-roster.spec.ts` ever sets `bb-ui`): auth, avatar, full-league-flow, full-match-journey, inducement-purchase, landing-dashboard, league-matchday, league-season, leagues, live-match, live-resolution, match-report, match-view, matches-page, profile, roster-table, rulesets, teams-page, watch → UIR-3 frozen, zero edits.

- **Flag-ON path**: NONE exists today — `createTeamAndOpenList` ends on `/teams`; no flag-ON test clicks the dashboard V2 "My leagues" link. S7 resolved: no helper edits; slice 1 adds three direct flag-ON cases (`goto("/teams/create")`-style: cookie before goto) — desktop visible, `bb-ui=legacy` triangulation, no-cookie default — plus a mobile 390×844 case in slice 2.
- Cookie-before-goto stays a hard constraint (local store dies on reload); V2 performs no storage writes.

## File Changes

| File | Action | Description |
|---|---|---|
| `app/leagues/page.tsx` | Modify | `"use client"` + `useUiFlag()` branch; no legacy-feature edits |
| `features/leagues/LeaguesListViewV2.tsx` | Create | hero + sections, `ui-v2-leagues-*`, reuses `LeagueCard`/`StatusBadge`/`CreateLeagueModal`/`useLeagues` |
| `features/leagues/LeaguesListViewV2.test.tsx` | Create | seam + markup + never-both + presentation-only tests |
| `e2e/ui-refresh-roster.spec.ts` | Modify | flag-ON `/leagues` cases: desktop, triangulation, mobile |

## Interfaces / Contracts

```ts
// seam — identical props by construction, route passes none
const uiV2 = useUiFlag();
return uiV2 ? <LeaguesListViewV2 /> : <LeagueList />;

// LeaguesListViewV2: "use client". MAY import the legacy surface's OWN
// machinery (useLeagues, useSession, isOwnerEquivalent, LeagueCard,
// StatusBadge, CreateLeagueModal, leagues.* i18n keys); MUST NOT fetch
// beyond `useLeagues`'s single GET /api/leagues, MUST NOT duplicate the
// myLeagues/openLeagues filter logic differently from legacy. Stitch
// hand-translated, project 16023060193335379804: desktop "Blood Bowl 2025 —
// Ligas (/leagues)", mobile "M 09 leagues — Ligas (Móvil)".
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Existing (untouched) | `pnpm test` + local Playwright, flag OFF | zero legacy edits (UIR-3); `app/leagues/page.test.tsx` renders without provider → legacy fallback keeps it green unmodified; `LeagueList.test.tsx` (legacy) untouched |
| Component (new) | `LeaguesListViewV2.test.tsx` | `UiFlagProvider initialUiFlag` → V2 markers, absent → legacy `#leagues-heading`; seeded leagues split into both sections identically; create-league modal opens; fetch stub counts only `GET /api/leagues`; source test: no `features/leagues/api` import beyond the legacy hook, no legacy ids |
| E2E (extended) | `e2e/ui-refresh-roster.spec.ts` | reuse `setUiFlag`; desktop: `ui-v2-leagues-hero` visible, `#leagues-heading` count 0; triangulate `bb-ui=legacy` AND absent → legacy markers, V2 count 0; slice 2: mobile 390×844 |

## Threat Matrix

N/A — no routing protection, auth, shell, subprocess, VCS/PR automation, or process-integration boundary changes; flag plumbing and proxy untouched.

## Migration / Rollout

No migration; flag stays OFF (UIR-5 never flipped here). Rollback: revert the 2 chained PRs in reverse (V2 → seam); `/leagues` returns to legacy immediately. No cookie writer ships.

## Slices / PRs (2 stacked PRs, each <400 authored lines)

- **Slice 1 — seam + V2 skeleton + flag-ON baseline** (~350): `page.tsx` branch, `LeaguesListViewV2` functional (hero + CTA opening the reused modal + both sections rendering real `LeagueCard`s + empty/error states), component test RED→GREEN, desktop e2e + triangulation. Depends on: none (flag plumbing in main).
- **Slice 2 — full V2 + tests + mobile** (~330): Stitch chrome complete ("Ligas (/leagues)" / "M 09" responsive layout), expanded component tests (modal create flow, owner/member filters parity), mobile e2e 390×844, VERIFY-ONLY legacy gate, `useUiFlag()` grep at exactly FIVE seams (UIR-5, no flip). Depends on: Slice 1.

## Open Questions

- [x] Chain strategy: RESOLVED as stacked-to-main (2 PRs, each <400) — precedent #340→#341, #344→#345; ask-on-risk satisfied (`size:exception` standing per user 2026-10-14).
- [x] S6-equivalent modal scope: N/A — the leagues seam reuses `CreateLeagueModal` (shared atom, legacy-identical); `CreateLeagueTeamModal` stays legacy under UIR-2's existing clause.
- [x] S7 harness: RESOLVED — no flag-ON test walks `/leagues` (traced); direct `goto` cases added, helper untouched; dashboard V2's `href="/leagues"` becomes the future walk path.
- [x] `LeagueList` dual role: RESOLVED — seam in the ROUTE, `LeagueList.tsx` never edited (VERIFY-ONLY), so `LeagueCard` consumers (both dashboards) are structurally unaffected.
