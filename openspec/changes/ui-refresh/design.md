# Design: ui-refresh

## Technical Approach

Cookie V2 flag mirroring `bb-locale`/`bb-theme`: pure resolver in `lib/ui-flag/` → server read in `app/layout.tsx` → `UiFlagProvider` seeds the client → one branch in `app/teams/[teamId]/page.tsx` picks `TeamDetailViewV2` vs `TeamDetailView` via an identical props object → presentation-only V2 from the approved Stitch screens. Legacy stays default; suites run flag-OFF unedited. Satisfies UIR-1…UIR-5.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Flag module | one file vs `lib/theme/` split | **`lib/ui-flag/flag.ts`**: pure `resolveUiFlag(cookieUi?: string \| null): boolean`; ON iff exact `"next"` (absent/`""`/`NEXT`/other → `false`, never throws), `UI_FLAG_COOKIE="bb-ui"`. **`lib/ui-flag/index.tsx`**: `"use client"` `UiFlagProvider({children, initialUiFlag})` + `useUiFlag(): boolean`, no provider → `false` | Mirrors `theme.ts`/`serverTheme.ts`/`index.tsx` + `useTheme` fallback; tests like `lib/auth-mode.test.ts`. Env rejected: cookie-only (no `NEXT_PUBLIC_*`) |
| Server read | layout vs per-page | **`app/layout.tsx`**: `resolveUiFlag((await cookies()).get("bb-ui")?.value)` beside `bb-locale`/`bb-theme` (lines 42–44); `<UiFlagProvider initialUiFlag>` nested in `ThemeProvider` around `SessionAppProvider` | UIR-1 mandates the layout read; one read point ⇒ server/client agree |
| Transport layout → seam | `document.cookie` in seam vs prop through page vs context | **Provider context** — `initialUiFlag` as RSC-serialized prop | Server DOES need the value (UIR-1 + first-render agreement). Layouts cannot pass props to pages (App Router). `document.cookie` in the seam works only via the `isHydrated` skeleton gate; a future seam without it (UIR-5) would SSR legacy and hydrate V2 — wrong-surface flash, violating UIR-1. Provider makes anti-FOUC structural, like `ThemeProvider`/`I18nProvider` |
| Default-FOUC | flip default vs OFF | **OFF default; no cookie writer** (dev toggle undecided per proposal) | Absent → server AND client `false` → legacy first paint, zero flash. ON → SSR paints V2, hydration seeds same `true` → no flash. Only drift: cookie changed mid-session (healed by next navigation's SSR) |
| Seam shape | inline ternary vs shared object | **shared `viewProps: TeamDetailViewProps` spread into exactly ONE component** in `app/teams/[teamId]/page.tsx` (file stays `"use client"`) | Guarantees UIR-2 identical-props + never-both; one branch, zero legacy edits |
| V2 props | duplicate vs re-export | **`export type TeamDetailViewV2Props = TeamDetailViewProps`** | Single source of truth for the props contract |
| Mobile/desktop | CSS vs hook | **reuse `features/teams/hooks/useIsDesktop.ts`** | Legacy `TeamDetailView` uses it; SSR-defaults desktop (no Flash of Mobile Content), `matchMedia` tracks `md` |

## Data Flow

```
bb-ui cookie ─► layout.tsx:42-44 cookies().get("bb-ui") ─► resolveUiFlag ─► initialUiFlag
                                                    ▼
        <UiFlagProvider initialUiFlag> ─RSC prop─► useUiFlag() in the team detail page
              true → <TeamDetailViewV2 {...viewProps}/>  (ui-v2-* testids)
              false → <TeamDetailView  {...viewProps}/>  (default, frozen testids)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `lib/ui-flag/flag.ts` + `flag.test.ts` | Create | cookie key, pure `resolveUiFlag` + unit tests |
| `lib/ui-flag/index.tsx` + `index.test.tsx` | Create | provider + `useUiFlag`, seed/fallback tests (mirror `lib/theme/index.test.tsx`) |
| `app/layout.tsx` | Modify | read `bb-ui` beside `bb-locale`/`bb-theme`; mount provider |
| `app/teams/[teamId]/page.tsx` | Modify | seam: hoist `viewProps`, branch on `useUiFlag()`; stays `"use client"` |
| `features/teams/detail/TeamDetailViewV2.tsx` | Create | presentation-only container (hero, coaching, treasury) |
| `features/teams/detail/v2/RosterV2.tsx` | Create | V2 roster: desktop table / mobile cards via `useIsDesktop` |
| `features/teams/detail/TeamDetailViewV2.test.tsx` | Create | V2 markup component tests |
| `e2e/ui-refresh-roster.spec.ts` | Create | flag-ON e2e (desktop + mobile) |

## Interfaces / Contracts

```ts
// lib/ui-flag/flag.ts — pure, injectable cookie input (no env)
export function resolveUiFlag(cookieUi?: string | null): boolean; // true ONLY for "next"
// lib/ui-flag/index.tsx ("use client") — mirror of useTheme
export function useUiFlag(): boolean; // no provider → false

// seam — props identical by construction
const viewProps: TeamDetailViewProps = { team, race, leagueName, progression, onImprove,
  onRename, onReorder, onHire, onFire, reorderError, shieldControl };
return useUiFlag() ? <TeamDetailViewV2 {...viewProps} /> : <TeamDetailView {...viewProps} />;

// TeamDetailViewV2.tsx — presentation-only: MAY import pure helpers (features/teams/roster.ts,
// format.ts), useIsDesktop, useI18n; MUST NOT import features/teams/api or AppProvider —
// behavior arrives via props only. Testids ui-v2-* (e.g. ui-v2-roster), never legacy names.
// Stitch (hand-translated, never imported): projects/16023060193335379804 —
// desktop "08 team detail", mobile "M 08 team detail" (M-prefix = MOBILE, verified).
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Existing (untouched) | `pnpm test` + local Playwright, flag OFF | no cookie → legacy; **zero legacy test edits** (UIR-3) |
| Unit (new) | `lib/ui-flag/flag.test.ts` | `"next"`→true; absent/`null`/`""`/`"NEXT"`/`"v2"`→false, no throw |
| Unit (new) | `lib/ui-flag/index.test.tsx` | provider seed honored; bare `useUiFlag()` → `false` |
| Component (new) | `TeamDetailViewV2.test.tsx` | V2 renders from shared props; no api/AppProvider imports |
| E2E (new) | `e2e/ui-refresh-roster.spec.ts` — local mode, **not** in `playwright.config.ts` `testIgnore` | cookie before first `goto`: `page.context().addCookies([{ name:"bb-ui", value:"next", url:"http://localhost:3000" }])` (`e2e/locale.spec.ts:69`); team via `create-team.spec.ts` wizard. **Desktop**: `ui-v2-roster` visible AND `team-roster-table` count 0 (UIR-4). **Mobile**: `page.setViewportSize({ width: 375, height: 812 })` (mobile project matches only `mobile.spec.ts`) → V2 cards. **Triangulate**: `bb-ui=legacy` → legacy surface (UIR-1) |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Risks / Mitigations

| Risk | Mitigation |
|---|---|
| Dual-surface drift | shared `viewProps`; V2 never imports `features/teams/api` — mutations flow through legacy-tested prop callbacks (UIR-2 parity) |
| FOUC / wrong surface | provider seeded from the single layout read; OFF default; seam never re-derives the cookie |
| Cookie/SSR mismatch | layout is the sole `bb-ui` read; seam consumes only `useUiFlag()` context |
| e2e flake | cookie before navigation; proven wizard helpers; inline viewport; retries config-owned |

## Migration / Rollout

No migration. Cookie additive — older builds ignore `bb-ui`. Rollback: revert chained PRs in reverse (V2 → seam → flag); legacy is default, so behavior returns immediately.

## Slices / PRs (3 stacked PRs, each <400 authored lines)

- **Slice 1 — flag plumbing** (~150): `lib/ui-flag/*` + tests, `app/layout.tsx` wiring. Depends on: none. Autonomous: resolver/provider green, layout SSRs the provider.
- **Slice 2 — seam + V2 skeleton + e2e harness** (~200): `page.tsx` branch with `viewProps`, `TeamDetailViewV2.tsx` skeleton with `ui-v2-*` testids, first flag-ON desktop assertion. Depends on: Slice 1.
- **Slice 3 — V2 desktop + mobile polish** (~350): full Stitch translation (container + `v2/RosterV2.tsx`), component tests, mobile e2e + `bb-ui=legacy` triangulation. Depends on: Slice 2.

## Open Questions

- [ ] Visible dev toggle for setting `bb-ui` — undecided per proposal; no writer ships in this change.
- [ ] Final V2 testid vocabulary (`ui-v2-*` proposed) — fix before Slice 2's e2e lands.
