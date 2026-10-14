# Tasks: ui-refresh — Leagues V2 Seam

## Review Workload Forecast

Decision needed before apply: No (chain strategy decided: stacked-to-main)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main (PR 2 base = PR 1 branch)
400-line budget risk: Medium

Estimated changed lines: ~680 (Slice 1 ~350 · Slice 2 ~330; each <400). Delivery strategy: ask-on-risk; chain decided by precedent #340→#341, #344→#345; `size:exception` standing rule per user (2026-10-14).

**LEGACY = VERIFY-ONLY**: no legacy test/heading/id edits; `features/leagues/LeagueList.tsx` and `app/leagues/page.test.tsx` untouched; new tests in NEW files; the 19 flag-OFF specs that `goto("/leagues")` untouched; `createTeamAndOpenList` helper untouched (no flag-ON test walks `/leagues`).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Seam + V2 skeleton + flag-ON baseline | PR 1 (base = main) | `pnpm exec vitest run features/leagues` | Playwright local: cookie before goto (`e2e/ui-refresh-roster.spec.ts`) | Revert `page.tsx` branch, `LeaguesListViewV2.tsx`, e2e additions |
| 2 | Full V2 + component/mobile tests | PR 2 (base = PR 1 branch) | `pnpm exec vitest run features/leagues/LeaguesListViewV2.test.tsx` | Playwright desktop + inline 390×844 | Revert V2 content + tests/e2e; seam falls back to skeleton |

## Slice 1 — Seam + V2 skeleton + flag-ON baseline (~350 lines)

- [ ] 1.1 RED: Create `features/leagues/LeaguesListViewV2.test.tsx`: `UiFlagProvider initialUiFlag` → `page.tsx` seam mounts `LeaguesListViewV2` (`ui-v2-leagues-*`); absent → `LeagueList` (`#leagues-heading` present, `ui-v2-leagues-*` count 0); never both. — UIR-2. Verify: `pnpm exec vitest run features/leagues` (fails).
- [ ] 1.2 GREEN: Modify `app/leagues/page.tsx`: `"use client"` + `uiV2 = useUiFlag()`; `uiV2 ? <LeaguesListViewV2 /> : <LeagueList />`; zero legacy edits, never both. — UIR-2. Verify: `npx tsc --noEmit`; `pnpm lint`.
- [ ] 1.3 Create `features/leagues/LeaguesListViewV2.tsx` functional skeleton: hero "Mis Ligas" + "+ Nueva liga" CTA opening the REUSED `CreateLeagueModal`, both sections (`ui-v2-leagues-section-my` / `-section-open`) rendering real `LeagueCard`s from `useLeagues()` with the SAME `myLeagues`/`openLeagues` split, empty/error states; testids `ui-v2-leagues-*`. — UIR-2. Verify: `pnpm exec vitest run features/leagues`.
- [ ] 1.4 Extend `e2e/ui-refresh-roster.spec.ts`: flag-ON `/leagues` desktop (`ui-v2-leagues-hero` visible, `#leagues-heading` count 0); triangulate `bb-ui=legacy` + absent cookie → legacy markers, V2 count 0. — UIR-2, UIR-4. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [ ] 1.5 VERIFY-ONLY: `pnpm test` + `AUTH_MODE=local pnpm exec playwright test` flag-OFF, zero legacy edits (`app/leagues/page.test.tsx` still green: no provider → legacy fallback). — UIR-3.

**Close-out**: `feat(ui-refresh): add leagues V2 seam (refs #347)`.

## Slice 2 — Full V2 + tests + mobile (~330 lines)

- [ ] 2.1 RED: Extend `LeaguesListViewV2.test.tsx`: hero + CTA + both sections + empty/error zones; create-league modal opens and creates through the shared channel (fetch stub = single `GET /api/leagues`); owner/member filter parity with legacy (`isOwnerEquivalent`); presentation-only source check (no direct fetch, no legacy ids in source). — UIR-2. Verify: `pnpm exec vitest run features/leagues` (fails).
- [ ] 2.2 GREEN: Finish `LeaguesListViewV2.tsx` per Stitch "Blood Bowl 2025 — Ligas (/leagues)" / "M 09": hero chrome, responsive grid (cards 1/2/3 across), section headers; reuse `LeagueCard`/`StatusBadge`/`CreateLeagueModal`; new i18n keys only where no `leagues.*` exists (both locales). — UIR-2. Verify: `pnpm exec vitest run features/leagues`; `npx tsc --noEmit`; `pnpm lint`.
- [ ] 2.3 Add mobile e2e case (390×844, flag ON → `ui-v2-leagues-*` visible, `#leagues-heading` count 0). — UIR-4. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [ ] 2.4 VERIFY-ONLY: rerun `pnpm test` + local Playwright; grep `useUiFlag()` at exactly FIVE seams (`app/teams/[teamId]/page.tsx`, `app/teams/page.tsx`, `features/dashboard/HomeDashboard.tsx`, `app/teams/create/page.tsx`, `app/leagues/page.tsx`); NO flip; league-detail route flag-free. — UIR-3, UIR-5.

**Close-out**: `feat(ui-refresh): translate leagues V2 desktop and mobile (refs #347)`.

## Out of scope (do not touch)

Legacy tests/headings/ids, `LeagueList.tsx` (VERIFY-ONLY), `createTeamAndOpenList` helper, `/leagues/[id]` detail route, default flips, theme tokens, cookie writer.
