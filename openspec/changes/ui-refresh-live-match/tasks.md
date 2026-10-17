# Tasks: ui-refresh — Live Match V2 Seam

## Review Workload Forecast

Decision needed before apply: No (chain strategy decided: stacked-to-main)
Chained PRs recommended: Yes
Chain strategy: stacked-to-main (PR 2 base = PR 1 branch)
400-line budget risk: Medium

Estimated changed lines: ~680 (Slice 1 ~350 · Slice 2 ~330; each <400). Delivery strategy: ask-on-risk; chain decided by precedent #344→#345, #348→#349; `size:exception` standing rule per user (2026-10-14).

**LEGACY = VERIFY-ONLY**: no legacy test/heading/id edits; `features/leagues/MatchView.tsx`, its subcomponents and `app/leagues/[id]/fixtures/[fixtureId]/page.test.tsx` (if any) untouched; new tests in NEW files; the 9 flag-OFF specs that navigate to the fixture untouched; `createTeamAndOpenList` helper untouched (no flag-ON test walks the fixture route).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Seam + V2 skeleton + flag-ON baseline | PR 1 (base = main) | `pnpm exec vitest run features/leagues` | Playwright local: cookie before goto (`e2e/ui-refresh-roster.spec.ts`) | Revert `page.tsx` branch, `MatchViewV2.tsx`, e2e additions |
| 2 | Full V2 chrome + component/mobile tests | PR 2 (base = PR 1 branch) | `pnpm exec vitest run features/leagues/MatchViewV2.test.tsx` | Playwright desktop + inline 390×844 | Revert V2 content + tests/e2e; seam falls back to skeleton |

## Slice 1 — Seam + V2 skeleton + flag-ON baseline (~350 lines)

- [x] 1.1 RED: Create `features/leagues/MatchViewV2.test.tsx`: `UiFlagProvider initialUiFlag` → page seam mounts `MatchViewV2` (`ui-v2-match-*`); absent → `MatchView` (`rulebook-header` present, `ui-v2-match-*` count 0); never both; both receive `{leagueId, fixtureId}`. — UIR-2. Verify: `pnpm exec vitest run features/leagues` (fails).
- [x] 1.2 GREEN: Modify `app/leagues/[id]/fixtures/[fixtureId]/page.tsx`: `"use client"` + `uiV2 = useUiFlag()`; branch with identical `{leagueId, fixtureId}` props both ways; zero legacy edits, never both. — UIR-2. Verify: `npx tsc --noEmit`; `pnpm lint`.
- [x] 1.3 Create `features/leagues/MatchViewV2.tsx` functional skeleton: sticky rulebook header (emblem, league name via `useLeague`, fixture meta), score strip, not-found/error parity with legacy (`match.notFound` / `match.loadError`); loads detail through the REUSED `getMatchDetail` channel; testids `ui-v2-match-*`. — UIR-2. Verify: `pnpm exec vitest run features/leagues`.
- [x] 1.4 Extend `e2e/ui-refresh-roster.spec.ts`: flag-ON fixture desktop case (cookie BEFORE first goto; direct `goto` — the local suite is anonymous so no fixture is built; pin the V2 surface through the fixture GET's own 401 answer: `ui-v2-match-error` visible, EXACTLY ONE error panel (never both — the legacy error panel has no testid), legacy testids count 0); triangulate `bb-ui=legacy` + absent cookie → legacy error panel, V2 count 0. — UIR-2, UIR-4. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [x] 1.5 VERIFY-ONLY: `pnpm test` + `AUTH_MODE=local pnpm exec playwright test` flag-OFF, zero legacy edits (the 9 fixture specs unmodified and green). — UIR-3.

**Close-out**: `feat(ui-refresh): add live match V2 seam (refs #351)`.

## Slice 2 — Full V2 chrome + tests + mobile (~330 lines)

- [x] 2.1 RED: Extend `MatchViewV2.test.tsx`: consent/ready zone, acta feed through `LiveEventCardsActa` reuse, timeline parity via `MatchTimelineBar`, finished summary rows; presentation-only source check (no direct `fetch(` in source, no legacy testids in source, only the machinery whitelist imported); share-link state parity. — UIR-2. Verify: `pnpm exec vitest run features/leagues` (fails).
- [x] 2.2 GREEN: Finish `MatchViewV2.tsx` per Stitch "Partido en Directo (Acta en Vivo)": full chrome across pending/ready/live/finished states, wiring the shared atoms (`LiveActionDock`, `MatchTimelineBar`, `LiveEventCardsActa`, modals); reuse `match.*` i18n keys (new keys only where none exists, both locales). — UIR-2. Verify: `pnpm exec vitest run features/leagues`; `npx tsc --noEmit`; `pnpm lint`.
- [x] 2.3 Add mobile e2e case (390×844, flag ON → `ui-v2-match-*` visible, legacy markers 0, no horizontal overflow). — UIR-4. Verify: `AUTH_MODE=local pnpm exec playwright test e2e/ui-refresh-roster.spec.ts`.
- [x] 2.4 VERIFY-ONLY: rerun `pnpm test` + local Playwright; grep `useUiFlag()` at exactly SIX seams (`app/teams/[teamId]/page.tsx`, `app/teams/page.tsx`, `features/dashboard/HomeDashboard.tsx`, `app/teams/create/page.tsx`, `app/leagues/page.tsx`, `app/leagues/[id]/fixtures/[fixtureId]/page.tsx`); NO flip; `/watch/[token]` flag-free. — UIR-3, UIR-5.

**Close-out**: `feat(ui-refresh): translate live match V2 desktop and mobile (refs #351)`.

## Out of scope (do not touch)

Legacy tests/headings/testids, `MatchView.tsx` + subcomponents (VERIFY-ONLY), the 9 flag-OFF fixture specs, `createTeamAndOpenList` helper, `/watch/[token]` route, default flips, theme tokens, cookie writer.
