# Tasks: ui-refresh

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700 total (Slice 1 ~150 · Slice 2 ~200 · Slice 3 ~350) |
| 400-line budget risk | Medium (change total; each slice < 400) |
| Chained PRs recommended | Yes (3 slices) |
| Suggested split | PR 1 flag plumbing → PR 2 seam+skeleton → PR 3 V2 translation |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

> Chain strategy supplied by the parent task + proposal forecast (3 stacked PRs, slice N depends on N-1); no further chain decision before apply.

**LEGACY TEST CONTRACT = VERIFY-ONLY**: tasks marked VERIFY-ONLY run the existing suites; NO edits to legacy tests, testids (`team-roster-table`, `roster-row-*`, `spp-pe-*`, `open-hire-dialog`) or headings ("Plantilla", "Cuerpo técnico", "Tesorería") are allowed anywhere in this change (UIR-3).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Flag plumbing: resolver + provider + layout wiring | PR 1 (base = main) | `pnpm exec vitest run lib/ui-flag` | `pnpm dev` → SSR first paint with/without `bb-ui=next` (FOUC evidence) | Revert `lib/ui-flag/` + `app/layout.tsx`; cookie ignored by older builds |
| 2 | Seam + V2 skeleton + flag-ON e2e harness | PR 2 (base = PR 1 branch) | `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts` | Playwright local: cookie before `goto`, wizard-created team | Revert `app/teams/[teamId]/page.tsx` branch + `TeamDetailViewV2.tsx` skeleton + new spec; PR 1 unaffected |
| 3 | Full V2 desktop + mobile translation | PR 3 (base = PR 2 branch) | `pnpm exec vitest run features/teams/detail/TeamDetailViewV2.test.tsx` | Playwright local desktop + inline 375×812 viewport | Revert `features/teams/detail/v2/` + V2 container + e2e additions; seam falls back to legacy |

## Slice 1 — Flag plumbing (~150 lines)

- [x] 1.1 RED: Create `lib/ui-flag/flag.test.ts` (style of `lib/auth-mode.test.ts`): `"next"`→true; absent/`null`/`""`/`"NEXT"`/`"v2"`→false, never throws. — UIR-1. Verify: `pnpm exec vitest run lib/ui-flag/flag.test.ts` (fails: module missing).
- [x] 1.2 GREEN: Create `lib/ui-flag/flag.ts`: `UI_FLAG_COOKIE = "bb-ui"` + pure `resolveUiFlag(cookieUi?: string | null): boolean` (true ONLY for exact `"next"`). — UIR-1. Verify: `pnpm exec vitest run lib/ui-flag/flag.test.ts` (passes).
- [x] 1.3 RED: Create `lib/ui-flag/index.test.tsx` (mirror `lib/theme/index.test.tsx`): provider seed honored; bare `useUiFlag()` with no provider → `false`. — UIR-1. Verify: `pnpm exec vitest run lib/ui-flag/index.test.tsx` (fails: module missing).
- [x] 1.4 GREEN: Create `lib/ui-flag/index.tsx` (`"use client"`): `UiFlagProvider({children, initialUiFlag})` + `useUiFlag(): boolean`. — UIR-1. Verify: `pnpm exec vitest run lib/ui-flag/index.test.tsx` (passes); `npx tsc --noEmit`.
- [x] 1.5 Modify `app/layout.tsx`: read `resolveUiFlag((await cookies()).get("bb-ui")?.value)` beside `bb-locale`/`bb-theme`; nest `<UiFlagProvider initialUiFlag>` inside `ThemeProvider` around `SessionAppProvider`. — UIR-1. Verify: `pnpm exec vitest run lib/ui-flag`; `pnpm lint`; `npx tsc --noEmit`.
- [x] 1.6 Capture FOUC analysis evidence for the PR description: no cookie → server AND client resolve OFF → legacy first paint; `bb-ui=next` → SSR V2, hydration seeds same value (only drift = mid-session cookie change, healed by next navigation). — UIR-1. Verify: `pnpm exec vitest run lib/ui-flag` (seed/fallback tests green).

**Close-out (Slice 1)**: commit `feat(ui-refresh): add bb-ui flag plumbing (refs #325)`. PR 1 stacks directly on `main` (no dependency). VERIFY-ONLY gate: `pnpm test`, `pnpm lint`, `npx tsc --noEmit`.

## Slice 2 — Seam + V2 skeleton + e2e harness (~200 lines)

- [ ] 2.1 FIX the V2 testid vocabulary (design open question resolved HERE): all V2 markers use prefix `ui-v2-` — `ui-v2-hero`, `ui-v2-coaching`, `ui-v2-treasury`, `ui-v2-roster`, `ui-v2-roster-card-*`; legacy testid names are NEVER reused in V2. — UIR-2, UIR-4. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [ ] 2.2 Modify `app/teams/[teamId]/page.tsx`: hoist `const viewProps: TeamDetailViewProps = {…}`; `return useUiFlag() ? <TeamDetailViewV2 {...viewProps}/> : <TeamDetailView {...viewProps}/>`; file stays `"use client"`; zero legacy edits; never both. — UIR-2. Verify: `npx tsc --noEmit`; `pnpm lint`.
- [ ] 2.3 Create `features/teams/detail/TeamDetailViewV2.tsx` skeleton: presentation-only container (hero/coaching/treasury placeholders with `ui-v2-*` testids per 2.1); `export type TeamDetailViewV2Props = TeamDetailViewProps`; MUST NOT import `features/teams/api` or `AppProvider`. — UIR-2, UIR-4. Verify: `npx tsc --noEmit`; `pnpm lint`.
- [ ] 2.4 Create `e2e/ui-refresh-roster.spec.ts` desktop case: `page.context().addCookies([{ name: "bb-ui", value: "next", url: "http://localhost:3000" }])` BEFORE first `goto` (pattern `e2e/locale.spec.ts:69`); team via `create-team.spec.ts` wizard; assert `ui-v2-roster` visible AND `team-roster-table` count 0; NOT added to `playwright.config.ts` `testIgnore`. — UIR-4, UIR-2. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [ ] 2.5 TRIANGULATE in the same spec: `bb-ui=legacy` → legacy surface (`team-roster-table` present). — UIR-1, UIR-4. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [ ] 2.6 VERIFY-ONLY: run `pnpm test` and `AUTH_MODE=local pnpm exec playwright test` flag-OFF; legacy testids/headings assert unchanged with ZERO legacy test edits. — UIR-3. Verify: those two exact commands.

**Close-out (Slice 2)**: commit `feat(ui-refresh): add team detail V2 seam and flag-ON e2e (refs #325)`. PR 2 base = Slice 1 PR branch (depends on Slice 1; retarget if its diff shows PR 1 changes).

## Slice 3 — Full V2 translation (~350 lines)

> Stitch source (hand-translated, never imported): `projects/16023060193335379804` — desktop screen `08 team detail` (current title "Blood Bowl 2025 — Gouged Eye Veterans (Detalle de Equipo)", deviceType DESKTOP); mobile screen `M 08 team detail` (deviceType MOBILE). NOTE: design.md prose maps these swapped; verified via Stitch metadata on 2026-10-11.

- [ ] 3.1 Create `features/teams/detail/v2/RosterV2.tsx`: desktop table / mobile cards via `features/teams/hooks/useIsDesktop.ts`, `ui-v2-*` testids per 2.1, presentation-only (pure helpers `features/teams/roster.ts`, `format.ts` allowed; `features/teams/api` forbidden). — UIR-2, UIR-4. Verify: `npx tsc --noEmit`; `pnpm lint`.
- [ ] 3.2 Complete `features/teams/detail/TeamDetailViewV2.tsx` (hero, coaching, treasury) from the same Stitch screens; behavior arrives only via props (hire/fire/reorder callbacks). — UIR-2. Verify: `npx tsc --noEmit`; `pnpm lint`.
- [ ] 3.3 RED→GREEN: Create `features/teams/detail/TeamDetailViewV2.test.tsx`: V2 renders from shared props, `ui-v2-*` markers present, no legacy testids, no `features/teams/api`/`AppProvider` imports. — UIR-2. Verify: `pnpm exec vitest run features/teams/detail/TeamDetailViewV2.test.tsx`.
- [ ] 3.4 Add the mobile case to `e2e/ui-refresh-roster.spec.ts`: same cookie setup + `page.setViewportSize({ width: 375, height: 812 })` (mobile Playwright project `testMatch` covers only `mobile.spec.ts`) → assert `ui-v2-roster-card-*` V2 cards. — UIR-4. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [ ] 3.5 VERIFY-ONLY: rerun `pnpm test` and `AUTH_MODE=local pnpm exec playwright test`; legacy suites still pass with NO legacy test edits. — UIR-3. Verify: those two exact commands.
- [ ] 3.6 Flip discipline: ship NO default flip; grep confirms `useUiFlag()` is consumed only by `app/teams/[teamId]/page.tsx`; document that flipping the default requires green `e2e/ui-refresh-roster.spec.ts` and stays a separate change. — UIR-5. Verify: `pnpm lint`; `npx tsc --noEmit`; `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.

**Close-out (Slice 3)**: commit `feat(ui-refresh): translate team detail V2 desktop and mobile (refs #325)`. PR 3 base = Slice 2 PR branch (depends on Slice 2).

## Out of scope (do not touch)

Legacy tests/assertions (VERIFY-ONLY), other screens' seams, theme/token files (`theme-switching` owns them), default flips, any cookie writer/dev toggle (open question).
