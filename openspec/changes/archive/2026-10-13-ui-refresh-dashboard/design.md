# Design: ui-refresh — Dashboard V2 Seam

## Technical Approach

Repeat the archived designs (`2026-10-11-ui-refresh` — `UiFlagProvider`/`useUiFlag()`, in main; `2026-10-12-ui-refresh-teams-list` — seam shape) on screen #3: `features/dashboard/HomeDashboard.tsx` becomes the third declared seam with one branch. New decisions only; UIR-1/3/4/5 inherited. Satisfies MODIFIED UIR-2.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Seam location | `app/page.tsx` vs `HomeDashboard` vs new seam component | **`features/dashboard/HomeDashboard.tsx` gains one `useUiFlag()` branch** | Already `"use client"` (the server page can't call client context) and the SINGLE `Dashboard` caller; `app/page.tsx` picks Landing before HomeDashboard mounts — anon Landing structurally flag-free |
| Props contract | richer data vs mirror legacy | **both surfaces take `DashboardProps {authenticated, userName}`** | Legacy fetches its own data; identical props = identical contract, zero legacy edits |
| Data channel | lift fetches into seam vs reuse hooks | **V2 self-fetches via the SAME hooks legacy uses**: `useApp`, `useSession`, `useI18n`, `useLeagues`, `useDashboardInbox` (`GET /api/me/dashboard`), `useCareerStats` (`GET /api/me/stats`), plus `isOwnerEquivalent`/`formatRulebookCost`/`formatMatchDate` | Mirrors legacy exactly — no new endpoints, no paths outside UIR-2's constraint |
| Testid vocabulary | reuse `ui-v2-*` vs scoped | **`ui-v2-dashboard-*`**: `-attention`, `-next-match`, `-stats`, `-teams`, `-leagues` | No collision with detail/list V2; never-both asserts `ui-v2-dashboard-*` vs `#dashboard-teams-heading`/`#dashboard-next-match-heading` |
| Responsive strategy | `useIsDesktop` vs CSS | **Tailwind breakpoints**, like legacy | M 04 = stacked zones + 2×2 stat cards via CSS; no hook needed |
| V2 subcomponents | reuse `PendingAttention`/`LeagueCard` vs reimplement | **reuse when markup fits, reimplement when Stitch differs — same payload** | No new data paths either way; decide per zone in slice 2 |

## Data Flow

```
bb-ui cookie → app/layout.tsx → UiFlagProvider            (archived, unchanged)
                  └─ useUiFlag() in HomeDashboard.tsx     (seam #3)
                         true  → <DashboardV2/>   ui-v2-dashboard-*, same hooks
                         false → <Dashboard/>     default, frozen legacy contract
app/page.tsx: no session → <Landing/>   (never reads the flag)
```

## E2E navigation trace (flagged seam-2 pattern)

Only `e2e/ui-refresh-roster.spec.ts` sets `bb-ui`; its helper `createTeamAndOpenList` lands on `/` after the wizard and clicks `getByRole("link", { name: /ready to improve/i })` to reach `/teams` — flag ON now renders `DashboardV2` there. **Slice-1 harness fix: the V2 skeleton MUST render the "Your teams" summary link with the legacy "ready to improve" copy**, keeping existing flag-ON tests green without edits. `landing-dashboard.spec.ts`/`mobile.spec.ts` assert dashboard content but run WITHOUT the cookie (flag OFF → legacy); URL-only `toHaveURL("/")` assertions are unaffected.

## File Changes

| File | Action | Description |
|---|---|---|
| `features/dashboard/HomeDashboard.tsx` | Modify | `useUiFlag()` branch; no legacy-feature edits |
| `features/dashboard/DashboardV2.tsx` | Create | attention, next match, stats, your teams, my leagues; `ui-v2-dashboard-*` |
| `features/dashboard/DashboardV2.test.tsx` | Create | seam + markup tests (wraps `UiFlagProvider`, stubs fetch) |
| `e2e/ui-refresh-roster.spec.ts` | Modify | flag-ON `/` cases: desktop, mobile 390×844, triangulation |

## Interfaces / Contracts

```ts
// seam — identical props by construction, inside the shell only
const uiV2 = useUiFlag();
return uiV2
  ? <DashboardV2 authenticated={authenticated} userName={userName} />
  : <Dashboard authenticated={authenticated} userName={userName} />;

// DashboardV2: "use client". MAY import the legacy surface's OWN hooks/helpers
// (useApp, useSession, useLeagues, useDashboardInbox, useCareerStats,
// isOwnerEquivalent, formatRulebookCost, formatMatchDate, PendingAttention,
// LeagueCard); MUST NOT fetch beyond /api/me/dashboard and /api/me/stats.
// English home chrome (repo convention). Stitch hand-translated, project
// 16023060193335379804: desktop "04 dashboard", mobile "M 04 dashboard".
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Existing (untouched) | `pnpm test` + local Playwright, flag OFF | zero legacy edits (UIR-3); `Dashboard.test.tsx` unmodified |
| Component (new) | `DashboardV2.test.tsx` | `UiFlagProvider initialUiFlag` → V2 markers, absent → legacy; zone contents per payload; fetch stub counts only the two legacy endpoints |
| E2E (extended) | `e2e/ui-refresh-roster.spec.ts` | reuse `setUiFlag`; desktop: `ui-v2-dashboard-*` visible, `#dashboard-teams-heading` count 0; skeleton link keeps `createTeamAndOpenList` green; mobile 390×844; triangulate `bb-ui=legacy` AND absent → legacy markers, V2 count 0 |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration; flag stays OFF. Rollback: revert the 2 chained PRs in reverse (V2 → seam); `/` returns to legacy immediately. No cookie writer ships (archived open question unchanged).

## Slices / PRs (2 stacked PRs, each <400 authored lines)

- **Slice 1 — seam + V2 skeleton + flag-ON baseline** (~180): `HomeDashboard` branch, `DashboardV2` skeleton with `ui-v2-dashboard-*` AND the navigable "Your teams" link, desktop e2e + triangulation. Depends on: none (flag plumbing in main).
- **Slice 2 — full V2 + tests + mobile** (~350): full Stitch `04`/`M 04` translation, component tests RED→GREEN, mobile e2e, VERIFY-ONLY legacy gate, `useUiFlag()` grep (UIR-5, no flip). Depends on: Slice 1.

## Open Questions

- [x] Chain strategy: RESOLVED as stacked-to-main (2 PRs, each <400) — precedent #326→#328, #335; ask-on-risk satisfied.
- [x] Zone-by-zone reuse of `PendingAttention`/`LeagueCard` vs Stitch re-skin — RESOLVED in slice 2: both reused (`DashboardV2.tsx:204` PendingAttention, `:345` LeagueCard), same payload (per verify-report Coherence + SUGGESTION).
