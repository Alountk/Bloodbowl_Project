# Design: ui-refresh — Create Wizard V2 Seam

## Technical Approach

Repeat the archived designs (`2026-10-11-ui-refresh` — `UiFlagProvider`/`useUiFlag()`, in main; `2026-10-12-ui-refresh-teams-list` and `2026-10-13-ui-refresh-dashboard` — seam shape) on screen #4: `app/teams/create/page.tsx` becomes the fourth declared seam with one branch. New decisions only; UIR-1/3/4/5 inherited. Satisfies MODIFIED UIR-2.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Seam location | route page vs inside `CreateTeamForm` vs wrapper | **`app/teams/create/page.tsx` gains one `useUiFlag()` branch** (precedent: `app/teams/page.tsx`) | `CreateTeamForm` has a SECOND caller — `features/leagues/CreateLeagueTeamModal.tsx:66` — which must stay legacy (UIR-2 modal clause). A branch inside the form would flip the modal; the route page is the single-caller surface |
| Props contract | richer data vs mirror legacy | **both surfaces take `CreateTeamFormProps` (`{ruleset?, leagueId?, onCreated?}`) with defaults; the route passes none** | Identical contract by construction; the modal (legacy-only) keeps passing its real props untouched |
| Data channel | lift into seam vs reuse hook | **V2 reuses the legacy surface's OWN machinery**: `useCreateTeamForm` (state machine + validation), `useApp().addTeam`, `RosterTable`, `PlayerAvailabilityTable`, `randomTeamName`, `computeCoachingCostItems` | Presentation-only (UIR-2): zero new fetch/mutation paths; validation errors and budget math stay byte-identical |
| i18n | new `createV2.*` keys vs reuse `create.*` | **reuse the existing `create.*` keys** (`lib/i18n/dictionaries.ts:111-140` ES, `:1030-1059` EN) | The flag-ON harness asserts BY LABEL ("Team name", "Race", "Next →", "Add Human Lineman", "Create team") — same keys ⇒ same accessible names in both surfaces, helper needs no edits. New copy (per Stitch) may add narrowly-scoped keys only where no `create.*` key exists |
| Harness strategy (S7) | V2 preserves contract vs adapt helper | **V2 preserves the accessible contract; `createTeamAndOpenList` stays UNEDITED** | Seam rule (lesson from seam 2): all 6 flag-ON tests in `e2e/ui-refresh-roster.spec.ts` walk the wizard with `bb-ui=next` already set — editing the helper would churn every existing flag-ON case |
| Testid vocabulary | reuse legacy ids vs new | **`ui-v2-create-*`**: `-step1`, `-step2`, `-roster`, `-availability`, `-coaching`, `-budget`, `-submit` | No collision with detail/list/dashboard V2; never-both asserts `ui-v2-create-*` vs legacy `#team-name` (the step-1 input id) |
| V2 subcomponents | reimplement tables vs reuse | **reuse `RosterTable` + `PlayerAvailabilityTable` unchanged** | 474 + 235 lines of tested budget/availability logic; Stitch re-skins the surrounding chrome, not the table payload (dashboard precedent: reuse `PendingAttention`/`LeagueCard`) |
| Responsive strategy | `useIsDesktop` vs CSS | **Tailwind breakpoints** (Stitch `M 06`/`M 07`) | Same as legacy and seams 2-3; no hook needed |

## Data Flow

```
bb-ui cookie → app/layout.tsx → UiFlagProvider            (archived, unchanged)
                  └─ useUiFlag() in app/teams/create/page.tsx   (seam #4)
                         true  → <CreateTeamFormV2/>   ui-v2-create-*, same hook
                         false → <CreateTeamForm/>     default, frozen legacy contract
features/leagues/CreateLeagueTeamModal.tsx → <CreateTeamForm …/>  (never reads the flag)
```

## E2E navigation trace (flagged seam rule)

24 spec files reference `teams/create`; exactly ONE sets `bb-ui` (`e2e/ui-refresh-roster.spec.ts`, via `setUiFlag` before the first goto):

- **Flag-OFF specs (23, unaffected — legacy renders)**: `auth`, `avatar`, `create-team`, `delete-team`, `full-league-flow`, `full-match-journey`, `hire-fire`, `inducement-purchase`, `isolation`, `landing-dashboard`, `league-matchday`, `league-season`, `leagues`, `live-match`, `live-resolution`, `match-report`, `match-view`, `matches-page`, `mobile`, `profile`, `roster-table`, `teams-page`, `watch`. All run without the cookie → UIR-3 frozen.
- **Flag-ON path (must stay green, helper frozen)**: `createTeamAndOpenList` (`e2e/ui-refresh-roster.spec.ts:64`) → `goto("/teams/create")` → `getByLabel("Team name", {exact:true})` → `getByLabel("Race")` → `Next →` → 11× `Add Human Lineman` → `Create team` → expects URL `/` → clicks the dashboard "ready to improve" link (seam-3 contract). Consumed by 6 flag-ON tests (detail ×3, list ×2… + delete).
- **Consequence**: slice-1 V2 must be FUNCTIONAL end-to-end (not a display-only skeleton): the helper creates and submits a real team through the V2 surface. Step-1 labels, `Next →`, `create.addAction` buttons and the `create.createTeam` submit MUST come from the same `create.*` keys.
- Cookie-before-goto stays a hard constraint: no storage writes in V2; flag resolution untouched (UIR-1).

## File Changes

| File | Action | Description |
|---|---|---|
| `app/teams/create/page.tsx` | Modify | `"use client"` + `useUiFlag()` branch; no legacy-feature edits |
| `features/teams/create/CreateTeamFormV2.tsx` | Create | two-step wizard, `ui-v2-create-*`, reuses `useCreateTeamForm` + tables |
| `features/teams/create/CreateTeamFormV2.test.tsx` | Create | seam + markup + contract tests (wraps `UiFlagProvider`, `AppProvider`) |
| `e2e/ui-refresh-roster.spec.ts` | Modify | flag-ON `/teams/create` cases: desktop, mobile 390×844, triangulation |

## Interfaces / Contracts

```ts
// seam — identical props by construction, route passes none
const uiV2 = useUiFlag();
return uiV2 ? <CreateTeamFormV2 /> : <CreateTeamForm />;

// CreateTeamFormV2: "use client". MAY import the legacy surface's OWN
// machinery (useCreateTeamForm, useApp, useI18n, useRouter, RACES,
// randomTeamName, RosterTable, PlayerAvailabilityTable,
// computeCoachingCostItems, roster constants); MUST NOT fetch or add
// behavior. Navigation on success identical to legacy:
// router.push("/") + router.refresh(). Stitch hand-translated, project
// 16023060193335379804: desktop "Blood Bowl 2025 — Crear Equipo (Paso 1)" /
// "(Paso 2: Roster)", mobile "M 06 create-team step1" / "M 07 create-team step2".
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Existing (untouched) | `pnpm test` + local Playwright, flag OFF | zero legacy edits (UIR-3); `app/teams/create/page.test.tsx` renders without provider → `useUiFlag()` falls back OFF → passes unmodified |
| Component (new) | `CreateTeamFormV2.test.tsx` | `UiFlagProvider initialUiFlag` → V2 markers, absent → legacy; step 1/2 content; reuse of the hook proven by validation/budget assertions; never-both |
| E2E (extended) | `e2e/ui-refresh-roster.spec.ts` | reuse `setUiFlag`; desktop: `ui-v2-create-*` visible, `#team-name` count 0, unedited `createTeamAndOpenList` completes; mobile 390×844; triangulate `bb-ui=legacy` AND absent → legacy markers, V2 count 0 |

## Threat Matrix

N/A — no routing protection, auth, shell, subprocess, VCS/PR automation, or process-integration boundary changes; flag plumbing and proxy untouched.

## Migration / Rollout

No migration; flag stays OFF (UIR-5 never flipped here). Rollback: revert the 2 chained PRs in reverse (V2 → seam); `/teams/create` returns to legacy immediately. No cookie writer ships.

## Slices / PRs (2 stacked PRs, each <400 authored lines)

- **Slice 1 — seam + functional V2 core + flag-ON baseline** (~350): `page.tsx` branch, `CreateTeamFormV2` functional (step 1, roster step reusing both tables, budget bar, errors, submit — enough for the unedited harness to create a team), component test RED→GREEN, desktop e2e + triangulation. Depends on: none (flag plumbing in main).
- **Slice 2 — full V2 + coaching + tests + mobile** (~330): Stitch chrome complete (headers, `M 06`/`M 07` responsive layout), `CoachingStaffSection` V2 restyle, expanded component tests, mobile e2e, VERIFY-ONLY legacy gate, `useUiFlag()` grep at exactly four seams (UIR-5, no flip). Depends on: Slice 1.

## Open Questions

- [x] Chain strategy: RESOLVED as stacked-to-main (2 PRs, each <400) — precedent #326→#328, #335, #339→#341; ask-on-risk satisfied.
- [x] S6 modal scope: RESOLVED — branch lives in the route, so `CreateLeagueTeamModal` structurally cannot flip; UIR-2 delta makes the guarantee explicit (new scenario).
- [x] S7 harness strategy: RESOLVED — V2 preserves the `create.*` accessible contract; helper frozen (see E2E navigation trace).
- [x] i18n: RESOLVED — reuse `create.*` keys; new keys only for genuinely new Stitch copy, both locales.
