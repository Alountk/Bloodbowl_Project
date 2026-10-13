# Proposal: ui-refresh — Create Wizard V2 Seam (Screen 4)

## Intent

Seam 4 of `bb-ui=next` (#343): detail, list and dashboard are V2, but `/teams/create` — the entry point of every new team — still renders legacy with the flag ON. Fourth declared seam, following the three archived predecessors.

## Scope

### In Scope
- Seam in `app/teams/create/page.tsx`: flag ON → `CreateTeamFormV2`, flag OFF → `CreateTeamForm`, identical `CreateTeamFormProps` (defaults; the route passes none), never both; zero legacy edits (`features/teams/create/CreateTeamForm.tsx` is VERIFY-ONLY).
- `CreateTeamFormV2` from Stitch "Blood Bowl 2025 — Crear Equipo (Paso 1)" / "Blood Bowl 2025 — Crear Equipo (Paso 2: Roster)" / "M 06 create-team step1" / "M 07 create-team step2": two steps, the SAME `useCreateTeamForm` hook and the same `RosterTable` / `PlayerAvailabilityTable` payload; testids `ui-v2-create-*`.
- Flag-ON contract parity: V2 reuses the `create.*` i18n keys the existing harness touches ("Team name", "Race", "Next →", "Add {name}", "Create team"), so `createTeamAndOpenList` in `e2e/ui-refresh-roster.spec.ts` stays green with NO helper edits.
- Component tests (RED→GREEN) + flag-ON e2e desktop/mobile + triangulation in `e2e/ui-refresh-roster.spec.ts`.
- Delta: MODIFIED UIR-2 → declared seams (adds the create wizard and the league-modal boundary).

### Out of Scope
- Default flip (UIR-5); the `CreateLeagueTeamModal` embed of `CreateTeamForm` (belongs to the leagues seam); other screens; theme tokens; cookie writer/dev toggle; legacy edits (VERIFY-ONLY).

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `ui-refresh`: UIR-2 restated with the fourth seam (both surfaces take `CreateTeamFormProps`; V2 reuses the legacy surface's own hook and tables; the league-modal embed stays flag-free). UIR-1/3/4/5 unchanged.

## Approach

- One `useUiFlag()` branch in `app/teams/create/page.tsx` (5-line route → thin client page, precedent `app/teams/page.tsx`). The branch lives in the ROUTE, never inside `CreateTeamForm`, because that component has a second caller (`features/leagues/CreateLeagueTeamModal.tsx`) which must stay legacy.
- Slice 1 ships the FUNCTIONAL V2 core (step 1, roster step, budget, errors, race dialog, submit) — unlike the dashboard skeleton, the flag-ON helper completes a full team creation through the wizard, so a display-only skeleton cannot keep the harness green. The coaching section, full Stitch chrome and expanded tests land in slice 2 (both slices stacked and merged together).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/teams/create/page.tsx` | Modified | `useUiFlag()` seam branch (the only route file edited) |
| `features/teams/create/CreateTeamFormV2.tsx` (+ test) | New | redesigned wizard, `ui-v2-create-*` |
| `e2e/ui-refresh-roster.spec.ts` | Modified | flag-ON `/teams/create` cases |
| `.../specs/ui-refresh/spec.md` (delta) | New | MODIFIED UIR-2 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Flag-ON e2e walks the full wizard (all 6 flag-ON tests use `createTeamAndOpenList`) | High | contract parity on `create.*` keys + functional slice 1; helper never edited |
| Legacy wizard contract broken | Med | flag OFF default; VERIFY-ONLY; `app/teams/create/page.test.tsx` unmodified (no provider → legacy fallback) |
| Modal accidentally flipped | Med | flag read only in the route; `useUiFlag()` grep at exactly four seams (slice 2 verify) |
| Slice 1 exceeds 400 lines | Med | coaching section + expanded tests deferred to slice 2; ask-once `size:exception` as last resort (precedents) |

## Rollback Plan

Revert the 2 chained PRs in reverse (V2 → seam); flag OFF restores the legacy wizard immediately.

## Dependencies

- Archived `ui-refresh`, `ui-refresh-teams-list`, `ui-refresh-dashboard` in main: `lib/ui-flag/`, layout provider, three seams.

## Success Criteria

- [ ] Flag OFF: `/teams/create` suites pass unmodified (component + 23 flag-free e2e specs).
- [ ] Flag ON: e2e asserts `ui-v2-create-*` desktop + mobile; `#team-name` count 0; the unedited helper creates a team end-to-end.

## Forecast (400-line budget)

2 chained PRs: (1) seam + functional V2 core + baseline (~350); (2) coaching + full V2 + tests + mobile (~330); each <400.
