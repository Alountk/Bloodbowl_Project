# Design: ui-refresh — Teams List V2 Seam

## Technical Approach

Repeat the archived design (`openspec/changes/archive/2026-10-11-ui-refresh/design.md` — `UiFlagProvider`/`useUiFlag()`/shared-props seam, in main via slices 1–3) on screen #2: `app/teams/page.tsx` becomes the second declared seam with one branch. Only NEW decisions are specified; UIR-1/3/4/5 mechanics are inherited. Satisfies MODIFIED UIR-2.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Seam location | inline branch in `app/teams/page.tsx` vs new seam component | **`app/teams/page.tsx` gains `"use client"` + one branch** (mirror `app/teams/[teamId]/page.tsx:115,282`) | File is an 11-line wrapper; reference seam is client-side; `app/teams/page.test.tsx` still passes (bare `useUiFlag()` → `false` → legacy) |
| Props contract | explicit `{}` vs none | **both surfaces take zero props** — `TeamsPage()` / `TeamsListViewV2()` called bare | Legacy takes no props today; identical-by-construction contract, zero legacy edits |
| V2 data/behavior | props injection (detail pattern) vs shared providers | **shared providers only** (`useApp`, `useLeagueNameMap`, `useI18n`, `TeamSearch`); MUST NOT import `features/teams/api` | Identical inputs ARE the providers legacy uses; no NEW data/mutation paths (UIR-2 presentation-only) |
| Responsive strategy | `useIsDesktop` vs CSS | **Tailwind breakpoints** (grid `sm:`/`lg:`), like legacy | List degrades gracefully; detail needed `useIsDesktop` only for table-vs-cards swap |
| Mobile hamburger | render inside V2 | **none** — `AppNav` owns hamburger + drawer on every route (`components/AppNav.tsx:72–75`, `md:hidden`) | Stitch `M 05` shows shell chrome; a second hamburger would duplicate nav `aria-label`s |
| Testid vocabulary | reuse `ui-v2-*` vs scoped | **`ui-v2-teams-*`**: `ui-v2-teams-grid`, `ui-v2-teams-section-{unassigned,assigned}`, `ui-v2-teams-card-<id>`, `ui-v2-teams-create-cta`, `ui-v2-teams-empty`, `ui-v2-teams-no-match` | Never collides with detail's `ui-v2-*`; never reuses legacy markers (`teams-unassigned-heading`, `team-ctv`, `team-treasury`) → never-both assertions |
| Delete control in V2 | include vs omit | **include** (parity rule approved in slice 3 of #325: "la V2 no esconde nada" — a feature hidden behind the flag would be a regression for flag-ON testers); card delete reuses the SAME channel legacy uses (store handlers — no legacy file edits) | Parity precedent #328 supersedes the literal issue enumeration |

## Data Flow

```
bb-ui cookie → app/layout.tsx → UiFlagProvider            (archived slice 1, unchanged)
                  └─ useUiFlag() in app/teams/page.tsx     (seam #2)
                         true  → <TeamsListViewV2/>  ui-v2-teams-*, same providers
                         false → <TeamsPage/>        default, frozen legacy contract
```

## File Changes

| File | Action | Description |
|---|---|---|
| `app/teams/page.tsx` | Modify | `"use client"` + `useUiFlag()` branch; no legacy-feature edits |
| `features/teams/list/TeamsListViewV2.tsx` | Create | sections, card grid, league badge, search (reuse `TeamSearch`), CTA, empty states; `ui-v2-teams-*` |
| `features/teams/list/TeamsListViewV2.test.tsx` | Create | seam + markup tests (wraps `AppProvider` + `I18nProvider` + `UiFlagProvider`) |
| `e2e/ui-refresh-roster.spec.ts` | Modify | flag-ON `/teams` cases: desktop, mobile 390×844, triangulation |

## Interfaces / Contracts

```ts
// seam — both surfaces take NO props (identical contract by construction)
const uiV2 = useUiFlag();
return uiV2 ? <TeamsListViewV2 /> : <TeamsPage />;

// TeamsListViewV2: "use client". MAY import useApp, useLeagueNameMap, useI18n,
// TeamSearch, getRaceById; MUST NOT import features/teams/api (no new data paths).
// i18n keys: teams.unassigned/inLeague/createNew/empty/noMatch. Testids
// ui-v2-teams-* ONLY (delete control: INCLUDED per parity — see decisions table).
// Stitch (hand-translated, never imported), project 16023060193335379804:
// desktop "Blood Bowl 2025 — Lista de Equipos" (= 05 teams, screen 22e6b0e5…),
// mobile "M 05 teams — Equipos (Móvil)" (screen a7486836…, deviceType MOBILE).
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Existing (untouched) | `pnpm test` + local Playwright, flag OFF | zero legacy edits (UIR-3); `app/teams/page.test.tsx` passes via no-provider → legacy |
| Component (new) | `TeamsListViewV2.test.tsx` | seam: `UiFlagProvider initialUiFlag` → V2, absent → legacy; sections by `leagueId`, search filters, CTA `/teams/create`, `ui-v2-teams-*` present, no legacy markers, no `features/teams/api` import |
| E2E (extended) | `e2e/ui-refresh-roster.spec.ts` | reuse `setUiFlag` + local-mode wizard (client-side nav to `/teams`; local store dies on reload); desktop: `ui-v2-teams-grid` visible + `#teams-unassigned-heading` absent; mobile: inline `setViewportSize({width:390,height:844})` → `ui-v2-teams-card-*`; triangulate `bb-ui=legacy` AND absent cookie → legacy headings, `ui-v2-teams-*` count 0 |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration; flag stays OFF. Rollback: revert the 2 chained PRs in reverse (V2 → seam); `/teams` returns to legacy immediately. No cookie writer ships (archived open question unchanged).

## Slices / PRs (2 stacked PRs, each <400 authored lines)

- **Slice 1 — seam + V2 skeleton + flag-ON baseline** (~180): page branch, `TeamsListViewV2` skeleton with `ui-v2-teams-*`, desktop e2e + triangulation. Depends on: none (flag plumbing in main).
- **Slice 2 — full V2 translation + tests** (~350): full translation (sections, cards, badge, search, CTA, empty states), component tests RED→GREEN, mobile e2e, VERIFY-ONLY legacy gate, `useUiFlag()` grep (UIR-5, no flip). Depends on: Slice 1.

## Open Questions

- [x] Delete parity: RESOLVED as include — parity rule from #328 slice 3 ("la V2 no esconde nada"); wired through the same handler channel legacy uses, zero legacy edits (tasks 2.5).
- [x] Chain strategy: RESOLVED as stacked-to-main (2 PRs, each <400) — same strategy the maintainer approved for the ui-refresh chain (#326→#328); ask-on-risk satisfied by precedent.
