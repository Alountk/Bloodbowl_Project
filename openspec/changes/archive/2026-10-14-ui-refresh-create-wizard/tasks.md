# Tasks: ui-refresh — Create Wizard V2 Seam

## Review Workload Forecast

Decision needed before apply: No (chain strategy decided: stacked-to-main)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main (PR 2 base = PR 1 branch)
400-line budget risk: Medium

Estimated changed lines: ~680 (Slice 1 ~350 · Slice 2 ~330; each <400). Delivery strategy: ask-on-risk; chain decided by precedent #326→#328, #335, #339→#341.

**LEGACY = VERIFY-ONLY**: no legacy test/heading/label/id edits; `features/teams/create/CreateTeamForm.tsx`, `RosterTable.tsx`, `PlayerAvailabilityTable.tsx` and `app/teams/create/page.test.tsx` untouched; new tests in NEW files; `e2e/create-team.spec.ts` and the 23 flag-OFF specs untouched; `createTeamAndOpenList` helper frozen.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Seam + functional V2 core + flag-ON baseline | PR 1 (base = main) | `pnpm exec vitest run features/teams/create app/teams/create` | Playwright local: cookie before goto (`e2e/ui-refresh-roster.spec.ts`) | Revert `page.tsx` branch, `CreateTeamFormV2.tsx`, e2e additions |
| 2 | Full V2 + coaching + component/mobile tests | PR 2 (base = PR 1 branch) | `pnpm exec vitest run features/teams/create/CreateTeamFormV2.test.tsx` | Playwright desktop + inline 390×844 | Revert V2 content + tests/e2e; seam falls back to slice-1 core |

## Slice 1 — Seam + functional V2 core + flag-ON baseline (~350 lines)

- [x] 1.1 RED: Create `features/teams/create/CreateTeamFormV2.test.tsx`: `UiFlagProvider initialUiFlag` → `page.tsx` seam mounts `CreateTeamFormV2` (`ui-v2-create-step1`); absent → `CreateTeamForm` (`#team-name` present, `ui-v2-create-*` count 0); never both. — UIR-2. Verify: `pnpm exec vitest run features/teams/create app/teams/create` (fails).
- [x] 1.2 GREEN: Modify `app/teams/create/page.tsx`: `"use client"` + `uiV2 = useUiFlag()`; `uiV2 ? <CreateTeamFormV2/> : <CreateTeamForm/>`; zero legacy edits, never both. — UIR-2. Verify: `npx tsc --noEmit`; `pnpm lint`.
- [x] 1.3 Create `features/teams/create/CreateTeamFormV2.tsx` FUNCTIONAL core: step 1 (name + dice + race + `Next →`, labels from `create.*` keys) and step 2 (reuses `RosterTable` + `PlayerAvailabilityTable`, budget bar, error alerts, race-change dialog, `create.createTeam` submit) via `useCreateTeamForm` + `useApp().addTeam` + `router.push("/")` — enough for the UNEDITED `createTeamAndOpenList` to create a team end-to-end; testids `ui-v2-create-*`. — UIR-2. Verify: `pnpm exec vitest run features/teams/create`.
- [x] 1.4 Extend `e2e/ui-refresh-roster.spec.ts`: flag-ON `/teams/create` desktop (`ui-v2-create-step1` visible, `#team-name` count 0, helper completes); triangulate `bb-ui=legacy` + absent cookie → legacy markers, V2 count 0. — UIR-2, UIR-4. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [x] 1.5 VERIFY-ONLY: `pnpm test` + `AUTH_MODE=local pnpm exec playwright test` flag-OFF, zero legacy edits (`app/teams/create/page.test.tsx` still green: no provider → legacy fallback). — UIR-3.

**Close-out**: `feat(ui-refresh): add create wizard V2 seam (refs #343)`.

## Slice 2 — Full V2 + coaching + tests + mobile (~330 lines)

- [x] 2.1 RED: Extend `CreateTeamFormV2.test.tsx`: step-1 contract (labels resolvable by the harness names in EN locale), step-2 zones (roster, availability, budget, coaching, submit), race-change dialog, validation errors identical to legacy (min players, budget, name required), success navigates to `/`. — UIR-2. Verify: `pnpm exec vitest run features/teams/create` (fails).
- [x] 2.2 GREEN: Finish `CreateTeamFormV2.tsx` per Stitch "Crear Equipo (Paso 1)" / "(Paso 2: Roster)" / `M 06` / `M 07`: headers + responsive CSS, coaching section restyled on the SAME `computeCoachingCostItems` data, reuse `RosterTable`/`PlayerAvailabilityTable`; new i18n keys only where no `create.*` exists (both locales). — UIR-2. Verify: `pnpm exec vitest run features/teams/create`; `npx tsc --noEmit`; `pnpm lint`.
- [x] 2.3 Add mobile e2e case (390×844, flag ON → `ui-v2-create-*` visible, `#team-name` count 0). — UIR-4. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [x] 2.4 VERIFY-ONLY: rerun `pnpm test` + local Playwright; grep `useUiFlag()` at exactly FOUR seams (`app/teams/[teamId]/page.tsx`, `app/teams/page.tsx`, `features/dashboard/HomeDashboard.tsx`, `app/teams/create/page.tsx`); NO flip; modal embed flag-free. — UIR-3, UIR-5.

**Close-out**: `feat(ui-refresh): translate create wizard V2 desktop and mobile (refs #343)`.

## Out of scope (do not touch)

Legacy tests/headings/labels/ids, `createTeamAndOpenList` helper, `CreateLeagueTeamModal` embed, default flips, theme tokens, other screens, cookie writer.
