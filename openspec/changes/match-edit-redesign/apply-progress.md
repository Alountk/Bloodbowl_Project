# Apply Progress: match-edit-redesign (RAU-122)

## Slice S1 — Server contract + route

- **Branch**: `feat/match-edit-redesign-pr1`
- **Mode**: Strict TDD (RED → GREEN → TRIANGULATE)
- **Chain strategy**: `stacked-to-main` (PR 1 of 6)
- **Boundary**: starts from `feat/match-edit-redesign` (planning artifacts commit); ends with the
  additive server contract + POST route behavior. S2–S6 untouched.
- **Rollback boundary**: revert `features/leagues/api.ts`, `lib/result.ts`,
  `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` and their tests. The legacy
  payload shape (6-nomination MVP + server dice) remains accepted, so nothing else depends on
  the new fields yet.

## Completed Tasks

- [x] 1.1 Additive `TeamResultInput` (`ff`, `neverHeld`, `fanRoll`, `injuryRoll`, `permanentRoll`,
  `mvp.grantee`), `ResultPayload` (`duration`, `inducements`) and `MatchScoreboard` snapshot keys
  in `features/leagues/api.ts`.
- [x] 1.2 `resolveCasualtyOutcomes` extended with optional `permanentRolls` → `outcome.attribute`
  via `permanentAttribute()` for `permanent` victims only (no new helper).
- [x] 1.3 RED → GREEN `lib/result.test.ts` for the permanent attribute + non-permanent/legacy cases.
- [x] 1.4 `parseTeamResult` accepts `ff`, `neverHeld`→`heldBall`, `fanRoll`, `injuryRoll`,
  `permanentRoll`, direct `mvp.grantee`; top-level `duration` + `inducements` parsed.
- [x] 1.5 POST computes winnings from input FF (no 1D3), direct MVP, applies the dedicated-fans
  delta (`tx.team.updateMany`), persists the permanent `attribute`, and stores the extended snapshot.
- [x] 1.6 RED → GREEN `route.test.ts` for direct MVP, input-FF winnings, fan-delta write,
  permanent attribute persist, 400 invalid grantee, and the unchanged legacy path.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `features/leagues/api.ts` | Modified | Additive result-contract + snapshot types |
| `lib/result.ts` | Modified | `resolveCasualtyOutcomes` permanent-attribute support |
| `lib/result.test.ts` | Modified | 3 new unit tests (permanent band, cursor alignment, legacy) |
| `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` | Modified | Parse new fields; input-FF winnings; direct MVP; fan delta; permanent persist; extended snapshot; non-live inducements |
| `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` | Modified | 5 new route tests + `team.updateMany` mock |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.2/1.3 | `lib/result.test.ts` | Unit | ✅ 12/12 | ✅ Written (2 failed: attribute missing) | ✅ 15/15 passed | ✅ 3 cases (permanent, cursor alignment, legacy/no-roll) | ✅ Clean |
| 1.4/1.5/1.6 | `route.test.ts` | Route/Integration | ✅ 45/45 | ✅ Written (6 failed → 400/NaN/no write) | ✅ 50/50 passed | ✅ 5 cases (direct MVP, invalid grantee 400, FF winnings + neverHeld, fan delta, permanent attr) | ✅ Clean |

- **Total tests written**: 8 (3 unit + 5 route); **passing**: 8/8 in the two focused files.
- **Layers used**: Unit (3), Route/Integration (5), E2E (0 — out of S1 scope).
- **Pure functions created**: 0 (extended existing `resolveCasualtyOutcomes`; no new helper).
- **Approval tests (refactoring)**: the existing 45 legacy route tests + 12 result tests served as
  the safety net and remain green (legacy payload accepted unchanged).

## Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run lib/result.test.ts "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → **2 files, 65 tests passed** |
| Runtime harness command/scenario and exact result | `AUTH_MODE=local pnpm exec playwright test e2e/match-report.spec.ts` → **N/A (ports busy, as forecast in tasks.md)**. Route behavior is proven at the route-test layer with a mocked Prisma `$transaction`. |
| Rollback boundary | Revert `api.ts` + `lib/result.ts` + `route.ts` and their tests; legacy payload path unchanged so no downstream consumer breaks. |

## Verification (exact commands / observed results)

- `pnpm exec vitest run lib/result.test.ts` → **15 passed (1 file)**
- `pnpm exec vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → **50 passed (1 file)**
- `pnpm test` → **180 files, 2667 tests passed**
- `pnpm lint` → **clean (no output)**
- `npx tsc --noEmit` → **clean (no output)**

## Changed Lines

- `added=348 removed=51 total=399` (< 400 budget).

## Deviations from Design

- None material. `resolveCasualtyOutcomes` indexes `permanentRolls` by a permanent-victim cursor
  (one 1D6 per permanent-band victim), matching the design's "1D6 per permanent victim" comment;
  the route builds that cursor array (client roll, server `rollD6` fallback) in
  `resolveReportedCasualties`.
- The route also applies the shared resolver on PUT (direct grantee + client/permanent rolls) for
  contract consistency; PUT winnings/treasury recompute stays in S5.
- Non-live POST persists the payload's per-side `inducements` (live fixtures keep the cart snapshot
  for parity). Correction inducement precedence remains S5 (F1).

## Issues Found

- None. All new fields are additive and the legacy 6-nomination + server-dice path is unchanged.

## Slice S2 — Wizard shell + Steps 0–2

- **Branch**: `feat/match-edit-redesign-pr2` (stacked on `feat/match-edit-redesign-pr1`)
- **Mode**: Strict TDD (RED → GREEN)
- **Chain strategy**: `stacked-to-main` (PR 2 of 6)
- **Boundary**: starts from the S1 contract on the pr1 branch; ends with the unwired wizard
  shell + pure state. `MatchCard`/`LeagueDetail`/`ResultModal` are untouched — the wizard is
  NOT wired into the app in this slice (S4/S6).
- **Rollback boundary**: delete `features/leagues/acta/` and `features/leagues/MatchActaWizard.tsx`
  and their co-located tests. Nothing imports them yet, so the revert is self-contained.

## Completed Tasks (S2)

- [x] 2.1 `features/leagues/acta/actaState.ts`: `ActaState`, `ActaTeamDraft`, `ActaActionLine`,
  `emptyActaState()`, `aggregateActions()`, `buildActaPayload()`, and the `actaPrefill(snapshot)`
  skeleton (the SINGLE prefill home, design F2 — `resultPrefill.ts` gained nothing).
- [x] 2.2 `features/leagues/acta/deriveCasualties.ts`: pure `deriveCasualtyEntries({home,away})`
  + `casualtiesFromActions()` mapping Step-2 casualty lines → victim entries (no re-entry).
- [x] 2.3 RED → GREEN `actaState.test.ts` (6) + `deriveCasualties.test.ts` (5): payload assembly
  (FF/neverHeld inversion/duration/inducements/direct grantee/aggregated actions/derived victims).
- [x] 2.4 `features/leagues/MatchActaWizard.tsx`: 7-step `<nav aria-label="Acta del partido">` with
  `aria-current="step"`, `role="dialog" aria-modal="true"`, Tab focus trap, Esc close, focus restore.
- [x] 2.5 `acta/StepContexto.tsx` (MAW-2): editable weather, duration, per-team FINAL FF entered
  directly (no 1D3, no dedicated-fans derivation), inducements per team, "NUNCA tuvo el balón".
- [x] 2.6 `acta/StepMarcador.tsx` (MAW-3): home/away score inputs.
- [x] 2.7 `acta/StepAcciones.tsx` (MAW-4): free-form player + action + quantity lines with a victim
  selector on casualty lines; the casualty count feeds `deriveCasualtyEntries`.
- [x] 2.8 RED → GREEN `acta/MatchActaWizard.test.tsx` (8): dialog/nav semantics, step gating,
  Esc close, Tab trap + wrap, focus restore, Contexto/Marcador/Acciones capture.

## Files Changed (S2)

| File | Action | What Was Done |
|------|--------|---------------|
| `features/leagues/acta/actaState.ts` | Created | Wizard state shape + pure payload assembly + prefill skeleton |
| `features/leagues/acta/deriveCasualties.ts` | Created | Pure Step-2 casualties → victims mapping |
| `features/leagues/acta/actaState.test.ts` | Created | 6 unit tests (payload assembly) |
| `features/leagues/acta/deriveCasualties.test.ts` | Created | 5 unit tests (counts → victims) |
| `features/leagues/MatchActaWizard.tsx` | Created | Dialog shell: step nav, focus trap, Esc, focus restore |
| `features/leagues/acta/StepContexto.tsx` | Created | MAW-2 Contexto step |
| `features/leagues/acta/StepMarcador.tsx` | Created | MAW-3 Marcador step |
| `features/leagues/acta/StepAcciones.tsx` | Created | MAW-4 Acciones step |
| `features/leagues/acta/MatchActaWizard.test.tsx` | Created | 8 component tests (shell + capture) |

## TDD Cycle Evidence (S2)

| Task | Test File | Layer | Safety Net | RED | GREEN |
|------|-----------|-------|------------|-----|-------|
| 2.1/2.2/2.3 | `actaState.test.ts`, `deriveCasualties.test.ts` | Unit | ✅ 2667 suite | ✅ Written first (module-not-found) | ✅ 11/11 passed |
| 2.4–2.8 | `MatchActaWizard.test.tsx` | Component (jsdom) | ✅ 2678 suite | ✅ Written first (module-not-found) | ✅ 8/8 passed |

- **Total tests written**: 19 (11 unit + 8 component); **passing**: 19/19.
- **Layers used**: Unit (11), Component/jsdom (8), E2E (0 — out of S2 scope).
- **Pure functions created**: `emptyActaState`, `aggregateActions`, `buildActaPayload`, `actaPrefill`,
  `casualtiesFromActions`, `deriveCasualtyEntries`.
- Two RED-phase test corrections (test-side, not implementation): the payload field is `ballHeld`
  (not `heldBall`), and a checkbox is toggled with `click` (React maps checkbox `onChange` to click).

## Work Unit Evidence (S2)

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues/acta` → **3 files, 19 tests passed** |
| Runtime harness command/scenario and exact result | Component render harness (jsdom) `features/leagues/acta/MatchActaWizard.test.tsx` → **8 passed**. No route/DB boundary in S2 (wizard unwired). |
| Rollback boundary | Delete `features/leagues/acta/` + `features/leagues/MatchActaWizard.tsx` and tests; no consumer imports them. |

## Verification (S2 — exact commands / observed results)

- `pnpm exec vitest run features/leagues/acta` → **3 files, 19 tests passed**
- `pnpm test` → **183 files, 2686 tests passed**
- `pnpm lint` → **clean (no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

## Changed Lines (S2)

- Code only (both code commits): `added=1318 removed=0 total=1318`.
  - `dbe8bac` (state + derivation + tests): `added=493`.
  - `aaa3ef3` (shell + steps + tests): `added=825`.
- **Over the 400-line review budget** (design forecast S2 ≈350). Per `sdd-apply`, the diff was NOT
  minified to fit; the honest cohesive slice is reported with a `size:exception` recommendation (or
  split S2 into S2a pure-state / S2b shell+steps, which the two commits already delimit).

## Deviations from Design (S2)

- `ActaTeamDraft` also carries the S3/S4 fields (`fanRoll`, `injuryRoll`, `permanentRoll`) so
  `buildActaPayload` is complete now and S3 only fills them via its steps.
- A casualty action line is one casualty against one victim (the wizard appends a line per casualty);
  `deriveCasualtyEntries` therefore does not multiply by `quantity`. This keeps the derived victim
  list exactly aligned with the payload's casualty entries.
- Step copy is literal neutral Spanish in S2; the `acta.*` i18n keys land in S6 (task 6.4). The
  `RosterPlayerRef` type is imported from `MatchResolveModal` (the design's canonical home); S6
  reconciles the duplicate `RosterPlayerRef` in `ResultModal`.
- Steps 3–6 render a "se completa en una porción posterior" placeholder; the shell's submit is S4.

## Issues Found (S2)

- None functional. The only flag is the **changed-line overage** above.
- Branch topology: the SDD planning artifacts live on `docs/match-edit-redesign` (with the S1
  record), not on this code branch. They were materialized locally to read/update; only `tasks.md`
  and `apply-progress.md` are committed here.

## S2 corrective pass (post-verify, bounded)

The independent verify PASSED S2 (2.1–2.8 genuinely implemented, all gates green, no protected file
touched, a11y real) and raised four bounded defects. This pass fixes exactly those four; no
re-architecture, no re-formatting, no protected file touched.

- **Mode**: Strict TDD (RED → GREEN).
- **Code commit**: `4d5befc` — `fix(leagues): align acta casualty counts, FF payload, step focus and copy`.

### FIX-1 · One casualty line = one casualty (medium, correctness)

- **What**: `aggregateActions` (`actaState.ts` L138–150) now adds exactly `1` per casualty line
  (and `0` when the line names no victim) instead of `Math.max(0, quantity)`; `StepAcciones.tsx`
  (L156–173) no longer offers the `Cantidad` control for `casualty` lines (placeholder `<span/>`
  keeps the grid). `aggregateActions`, `casualtiesFromActions` and the Step 2 counter now agree by
  construction, so PE (`casualties * PE_CASUALTY`) can never exceed the derived victim list.
- **Tests**: `actaState.test.ts` "awards ONE casualty worth of PE per casualty line despite a stale
  quantity" (asserts `casualties === 1`, `awardPeForActions === PE_CASUALTY`, one derived victim)
  and "does not credit a casualty line that names no victim"; `deriveCasualties.test.ts` "derives
  exactly ONE victim per casualty line despite a stale quantity"; `MatchActaWizard.test.tsx` "hides
  the quantity control on a casualty line".
- **RED**: `h1.casualties` was `3` (expected `1`); victim-less line credited `1` (expected `0`);
  `Cantidad 1` still rendered for a casualty line. **GREEN**: all pass.

### FIX-2 · Spanish copy (low)

- **What**: `StepContexto.tsx` legend + both labels now read "Incentivos" (L104, L112, L120),
  matching `lib/i18n/dictionaries.ts` (`match.incentives` / `match.inducements.title`). Swept the
  other S2 step files (`StepMarcador`, `StepAcciones`, `MatchActaWizard`) — no other English
  user-facing string found.
- **Test**: `MatchActaWizard.test.tsx` "labels the inducement fields with the Spanish term"
  (asserts zero `/inducements/i` matches and both `Incentivos · {team}` labels exist).
- **RED**: the English "Inducements" text matched. **GREEN**: passes.

### FIX-3 · Focus-first-on-step-change (low–medium, explicit design requirement)

- **What**: `MatchActaWizard.tsx` adds `stepRef` and an effect on `[open, step]` that focuses the
  active step body; the body wrapper is now `role="group" aria-label={STEP_LABELS[step]}
  tabIndex={-1}` so the new step is both focused and announced. The existing Tab trap, Esc close
  and focus-restore are unchanged (the `-1` wrapper is excluded from `FOCUSABLE_SELECTOR`).
- **Test**: `MatchActaWizard.test.tsx` "moves focus into the newly rendered step when the step
  changes" (after "Siguiente", `document.activeElement` is the `Marcador` group and it contains the
  Marcador input).
- **RED**: `getByRole("group", { name: "Marcador" })` threw (no focus target). **GREEN**: passes.

### FIX-4 · Unset FF (and duration) must not be sent as 0 (medium, correctness)

- **What**: `ActaTeamDraft.ff` and `ActaState.duration` are now `undefined` until entered
  (`emptyTeamDraft`/`emptyActaState` omit them); `buildActaPayload` omits `ff`/`duration` when
  undefined (conditional spread); `StepContexto.tsx` maps empty/0 input to `undefined`. The route's
  `home.ff ?? preMatchFanFactor(...)` fallback is now reached for an untouched form.
- **Duration reasoning**: 0 minutes is not a meaningful sentinel (a match never lasts 0 minutes),
  and there is no server fallback for duration — omitting it makes the snapshot store `null` instead
  of a false `0`, keeping correct-mode prefill honest. So duration gets the same treatment as `ff`.
- **Test**: `actaState.test.ts` "omits ff and duration when the user has not entered them" (asserts
  the keys are absent from `buildActaPayload(emptyActaState())`).
- **RED**: `"ff" in payload.home` was `true` (default 0). **GREEN**: passes.

### Deferred (NOT in this pass) · Inducement persistence gap → S4/S5

- **Gap (recorded verbatim)**: "`buildActaPayload` always emits `cards: []` and the route's
  `parseInducements` returns null when `cards.length === 0`, so inducements never persist. This is
  a genuine DESIGN GAP (how does 'money spent per team' in Step 0 map to the `{budget, cards}`
  snapshot for a non-live match?) and belongs to S4/S5, not S2."
- Added as deferred task **5.4** in `tasks.md` (S5). No payload shape was invented here.

### Verification (S2 corrective pass — exact commands / observed results)

- `pnpm exec vitest run features/leagues/acta` → **RED: 2 files failed, 6 failed | 20 passed (26)**;
  after the fix → **3 files, 26 passed**.
- `pnpm test` → **183 files, 2693 passed**.
- `pnpm lint` → **clean (no output, exit 0)**.
- `npx tsc --noEmit` → **clean (exit 0, no output)**.

### Changed Lines (S2 corrective pass)

- Code only: `added=90 removed=37 total=127` (under the 400-line budget).
- Tests included in the same commit: `added=91 removed=3 total=94`; overall commit
  `added=181 removed=40 total=221`.

## Slice s3a — `StepMvp` + shell branch (MAW-5)

- **Branch**: `feat/match-edit-redesign-s3a`
- **Mode**: Strict TDD (RED → GREEN)
- **Chain strategy**: `stacked-to-main` (slice 3a of the re-forecast 13-slice plan; stacked on S2)
- **Boundary**: starts from the S2 wizard shell + Steps 0–2; ends with Step 3 (MVP) rendering the
  real direct-selection step. Steps 4–6 stay placeholders (s3b/s3c/s4).
- **Rollback boundary**: revert `features/leagues/acta/StepMvp.tsx` + its test and the `step === 3`
  branch + import in `MatchActaWizard.tsx` (+ the shell test case). No protected file touched.
- **Code commit**: `a780e6c` — `feat(leagues): add direct MVP step to acta wizard`.

### Completed Tasks

- [x] 3.1 (s3a) `features/leagues/acta/StepMvp.tsx` (MAW-5): DIRECT single MVP per team
  (`mvp.grantee`); ★4 PE note; shell branch + shell test.

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `features/leagues/acta/StepMvp.tsx` | Created | Native radio group per team → one grantee per team; ★`PE_MVP` note; no random mode, no 6-nomination list |
| `features/leagues/acta/StepMvp.test.tsx` | Created | One grantee per team; second pick replaces the first; ★4 PE note; payload carries `mvp.grantee` |
| `features/leagues/MatchActaWizard.tsx` | Modified | `StepMvp` import + `step === 3` render branch (steps 4–6 untouched placeholders) |
| `features/leagues/acta/MatchActaWizard.test.tsx` | Modified | New step-3 case: real MVP step renders, captures both grantees, survives a step change |

### actaState — no change required

`ActaTeamDraft.mvpGrantee` already existed (S2) and `buildActaPayload` already emits it as
`mvp.grantee` (with `nominations: []`), so s3a is additive **without** touching `actaState.ts`. The
scope's "extend if needed" condition did not fire; adding a second field would have duplicated the
existing grantee.

### Roster Source

`StepMvp` consumes the **existing** `homeRoster`/`awayRoster` (`RosterPlayerRef[]`) props that the
shell already receives and passes to `StepAcciones`. No new fetch and no new prop were introduced;
the roster list reaches the shell the same way `MatchResolveModal` builds it (alive + available
players mapped to `{ id, name }`), so the wizard inherits the live-resolution precedent.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | REFACTOR |
|------|-----------|-------|------------|-----|-------|----------|
| 3.1 | `StepMvp.test.tsx` | Component (jsdom) | ✅ 27 acta tests | ✅ Written (`Failed to resolve import "./StepMvp"`) | ✅ 4/4 passed | ✅ Clean |
| 3.1 (shell) | `MatchActaWizard.test.tsx` | Component (jsdom) | ✅ 11 shell tests | ✅ Covered by the new step-3 case | ✅ 12/12 passed | ✅ Clean |

- **Total tests written**: 5 (4 step + 1 shell); **passing**: 5/5 in the two focused files.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues/acta` → **4 files, 31 tests passed** |
| Runtime harness command/scenario and exact result | `pnpm exec vitest run features/leagues/acta/MatchActaWizard.test.tsx` → **12 passed (jsdom render of the real step 3)** |
| Rollback boundary | Revert `acta/StepMvp.tsx` + `acta/StepMvp.test.tsx` and the `step === 3` branch + import in `MatchActaWizard.tsx`; steps 0–2 and 4–6 unaffected. |

### Verification (exact commands / observed results)

- `pnpm exec vitest run features/leagues/acta` → **4 files, 31 passed**
- `pnpm test` → **184 files, 2698 passed**
- `pnpm lint` → **clean (no output)**
- `npx tsc --noEmit` → **clean (no output)**

### Changed Lines (s3a)

- Code only (all four files are code/tests): `added=243 removed=1 total=244` (< 400 budget; ≈310
  estimate).

### Deviations from Design

- None. MAW-5 says "exactly one MVP per team"; the step uses a native radio group per team (a
  labelled, keyboard-operable control) rather than clickable divs, matching the accessibility
  constraint and the `MatchResolveModal` MVP picker's `aria-label` precedent. The unset ("— Sin
  MVP") option mirrors the preview's default option and lets `mvpGrantee` start empty, as S2 defined.

### Issues Found (s3a)

- None functional. The route rejects an ABSENT grantee by requiring exactly six nominations
  (`grantee: null` → 400), so the wizard's s4a Revisar step must block save until both teams have a
  grantee — already captured as MAW-8/`StepRevisar` in the s4a plan; no change needed in s3a.

## Slice s3b — `StepBajas` + `bajasPlan` + shell branch (MAW-6)

- **Branch**: `feat/match-edit-redesign-s3b`
- **Mode**: Strict TDD (RED → GREEN)
- **Chain strategy**: `stacked-to-main` (slice 3b of the re-forecast 13-slice plan; stacked on s3a)
- **Boundary**: starts from the s3a wizard (Steps 0–3 real); ends with Step 4 (Bajas) rendering the
  derived read-only victim list + 1D16/permanent 1D6 inputs. Steps 5–6 stay placeholders (s3c/s4a).
- **Rollback boundary**: revert `features/leagues/acta/bajasPlan.ts` (+ test), `acta/StepBajas.tsx`
  (+ test) and the `step === 4` branch + import in `MatchActaWizard.tsx` (+ the shell test case).
  Steps 0–3 and 5–6 unaffected; no protected file touched.

### Code commits

- `72545e7` — `feat(leagues): plan derived casualty rolls per causing team` (pure logic + test).
- `97f4f9c` — `feat(leagues): add derived Bajas step with injury rolls` (UI + shell wiring + tests).

### Completed Tasks

- [x] 3.2 (s3b) `features/leagues/acta/bajasPlan.ts` (+ co-located test) binding each victim's
  1D16/1D6 rolls to the **causing** team's draft, and `features/leagues/acta/StepBajas.tsx`
  (MAW-6): derived read-only victims list; 1D16 per casualty + 1D6 only when the band is
  Permanente; shell branch + shell test.

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `features/leagues/acta/bajasPlan.ts` | Created | Pure planner: groups derived casualties by CAUSING team, resolves the band via `resolveInjury`, maps the compressed permanent index, and exposes `setInjuryRoll`/`setPermanentRoll` writing to the correct draft |
| `features/leagues/acta/bajasPlan.test.ts` | Created | 7 unit tests: causing-team grouping (victim's team ≠ causing team), band resolution, compressed permanent index, correct-side writes |
| `features/leagues/acta/StepBajas.tsx` | Created | MAW-6 step: read-only derived list per causing team; 1D16 input + 1D6 only for Permanente; band + attribute shown |
| `features/leagues/acta/StepBajas.test.tsx` | Created | 6 component tests: read-only list, permanent gating, correct-side 1D16/1D6 binding, out-of-range clearing, empty state |
| `features/leagues/MatchActaWizard.tsx` | Modified | `StepBajas` import + `step === 4` render branch (steps 5–6 untouched placeholders) |
| `features/leagues/acta/MatchActaWizard.test.tsx` | Modified | New step-4 case: real Bajas step renders and derives the victim recorded in Step 2 |

### THE alignment constraint — how it is resolved

`deriveCasualtyEntries` returns a COMBINED list tagged with the VICTIM's team, but the payload's
`injuryRoll`/`permanentRoll` live on the CAUSING team's draft. `planBajas` is the explicit bridge:
it calls `casualtiesFromActions` **per side** (the SAME mapping `buildActaPayload` emits) and tags
each entry with `causingTeam` = that side, so `injuryRoll[i]` aligns with the causing team's i-th
derived casualty and `permanentRoll` is compressed to permanent-band victims only — mirroring the
route's `resolveReportedCasualties`. `setInjuryRoll`/`setPermanentRoll` write to
`state[causingTeam]`, so the UI cannot bind a roll to the victim's draft.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | REFACTOR |
|------|-----------|-------|------------|-----|-------|----------|
| 3.2 (helper) | `bajasPlan.test.ts` | Unit | ✅ 31 acta tests | ✅ Written first (`Failed to resolve import "./bajasPlan"`) | ✅ 7/7 passed | ✅ Clean |
| 3.2 (step) | `StepBajas.test.tsx` | Component (jsdom) | ✅ 38 acta tests | ✅ Written first (`Failed to resolve import "./StepBajas"`) | ✅ 6/6 passed | ✅ Clean |
| 3.2 (shell) | `MatchActaWizard.test.tsx` | Component (jsdom) | ✅ 12 shell tests | ✅ Covered by the new step-4 case | ✅ 13/13 passed | ✅ Clean |

- **Total tests written**: 14 (7 unit + 6 step + 1 shell); **passing**: 14/14 in the focused files.
- **Layers used**: Unit (7), Component/jsdom (7), E2E (0 — out of s3b scope).
- **Pure functions created**: `planBajas`, `setInjuryRoll`, `setPermanentRoll`.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues/acta` → **6 files, 45 tests passed** |
| Runtime harness command/scenario and exact result | `pnpm exec vitest run features/leagues/acta/MatchActaWizard.test.tsx` → **13 passed (jsdom render of the real step 4)** |
| Rollback boundary | Revert `acta/bajasPlan.ts` (+ test), `acta/StepBajas.tsx` (+ test) and the `step === 4` branch + import in `MatchActaWizard.tsx`; steps 0–3/5–6 unaffected. |

### Verification (exact commands / observed results)

- `pnpm exec vitest run features/leagues/acta` → **6 files, 45 passed**
- `pnpm test` → **186 files, 2712 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Changed Lines (s3b)

- Pure logic commit (`72545e7`): `added=322 removed=0 total=322`.
- UI + wiring commit (`97f4f9c`): `added=429 removed=1 total=430`.
- **Combined: `added=751 removed=1 total=752`** (≈460 forecast; tests are 411 of the 752).
- Per-PR view: the pure-logic commit is under the 400-line budget (322); the UI commit is 30 lines
  over (430). The split was kept as designed (helper-then-step); the diff was NOT minified, so the
  UI commit carries a `size:exception` recommendation.

### Deviations from Design

- None material. The design's `StepBajas alignment risk (s3b)` note prescribed exactly this pure
  `bajasPlan.ts` helper; the implementation groups by causing side, resolves the band with
  `resolveInjury`, and writes rolls with the two pure setters.
- `planBajas` reuses `casualtiesFromActions` per side rather than re-filtering `actions`, so the
  rendered list is guaranteed to match the payload's casualty entries.
- The step does not re-render the CAUSER's name (the preview shows "Baja de X sobre Y"); MAW-6 only
  requires the derived list + the two rolls, and `deriveCasualtyEntries` carries no causer identity.
  The causing team is the section header, which is the alignment-relevant attribution.
- Spanish copy is literal in the step (like S2/s3a); the `acta.*` i18n keys land in s6b.

### Issues Found (s3b)

- **Changed-line overage** (report, not minify): 752 total vs the ≈460 estimate. The overage is
  almost entirely test lines (411/752) required by the prompt's explicit assertions; the
  implementation itself (`bajasPlan.ts` 145 + `StepBajas.tsx` 182 = 327) is at the design's
  per-unit estimate. Recommend `size:exception` for the UI commit, or accept the two-commit split
  as two stacked PRs (322 + 430).
- Steps 5–6 remain "se completa en una porción posterior" placeholders (s3c/s4a) — intentional.

### s3b corrective pass (post-verify, bounded)

The independent verify FAILED s3b with one blocking defect (reachable by normal form use, not a
crafted payload). This pass fixes exactly that defect and closes the test blind spot that hid it;
no re-architecture, no reformatting, and no protected file (`MatchCard`/`LeagueDetail`/
`ResultModal`/`MatchResolveModal`/`lib/liveStore.ts`/`lib/rules/*`) was touched. `bajasPlan`'s
public API and the `injuryRoll`/`permanentRoll` field names are unchanged.

- **Mode**: Strict TDD (RED → GREEN) for FIX-1; FIX-2 is a coverage guard (see below).
- **Code commits**: `3545b8f` — `fix(api): preserve sparse roll positions when parsing result
  payloads` (route + route test); `2fe96e5` — `test(leagues): cover non-trailing casualty roll hole
  in StepBajas`.

#### FIX-1 (blocking) · Preserve roll positions through the parser

- **Defect**: `numberArrayOrNull` in `app/api/.../result/route.ts` filtered non-numbers out, so a
  `null` hole at a NON-trailing index collapsed and later values shifted down. A user who filled the
  SECOND casualty's 1D16 first sent `[null, 13]`; the route parsed `[13]`, and casualty 0 (the WRONG
  player) received `13` while casualty 1 got a server-rolled D16. Identical failure for
  `permanentRoll`.
- **What**: `numberArrayOrNull` now maps a non-numeric entry to an `undefined` HOLE, keeping the
  array LENGTH and POSITIONS; `TeamResultBody.injuryRoll`/`permanentRoll` are typed
  `(number | undefined)[] | null`. The per-index `?? rollD16()` / `?? rollD6()` fallbacks then roll
  the unset slot instead of shifting later values. DENSE numeric arrays parse exactly as before.
- **Where**: `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` L54–55 (type) and L70–76
  (`numberArrayOrNull`). No other route behavior changed.
- **Tests**: `route.test.ts` — "keeps a non-trailing 1D16 hole so a later client roll lands on its
  own victim" and "keeps a non-trailing 1D6 permanent hole so a later client roll lands on its own
  victim". The existing route tests only exercised DENSE arrays, so this path was uncovered.
- **RED**: `2 failed | 50 passed` — `expected 'permanent' to be 'bruise'` (av1 wrongly received the
  client 13) and `expected { attribute: 'ag' } to deeply equal { attribute: 'mv' }` (the permanent
  hole shifted onto the first victim). **GREEN**: `52 passed`.

#### FIX-2 · Close the StepBajas test blind spot

- **What**: `StepBajas.test.tsx` gained a two-casualty adversarial case (home causes TWO casualties
  to away AND away causes one to home, so home's slot 1 is NON-trailing). It fills only the SECOND
  casualty's 1D16 and asserts the later value stays at its own index (`home.injuryRoll[1] === 13`),
  index 0 stays a hole, and the first victim's input is untouched.
- **Where**: `features/leagues/acta/StepBajas.test.tsx` (new `homeTwoAwayOne` fixture + the
  "keeps a later casualty's roll at its own index when an earlier one is left unset" case).
- **RED/GREEN**: this case is **GREEN on arrival** (`7 passed`). The client `withIndex` already
  emits the positional wire payload `[null, 13]` — the defect lived ONLY in the route parser, which
  FIX-1 corrects. The test closes the coverage blind spot (the previous single-casualty case could
  not even express a non-trailing hole) and guards the client contract; it is not a client fix.

#### FIX-3 · Known positional hazard (recorded, NOT fixed here)

- **Hazard**: the result payload is POSITIONAL. Deleting an EARLIER casualty line in Step 2 shifts
  every remaining `injuryRoll`/`permanentRoll` entry onto a different victim, because roll slots are
  aligned by array index with the derived casualty list and the roll arrays carry no stable victim
  key. FIX-1 makes the parser honor positions; it does not make positions survive a reorder/delete.
- **Owner**: a later slice (candidate s3c/s6a, where the wizard re-derives victims and the prefill
  reconstructs them). Do NOT fix in this pass.

#### Verification (s3b corrective pass — exact commands / observed results)

- `pnpm exec vitest run features/leagues/acta` → **6 files, 46 passed**
- `pnpm exec vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → **52 passed**
- `pnpm test` → **186 files, 2715 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

#### Changed Lines (s3b corrective pass)

- Code only (`route.ts`): `added=13 removed=5 total=18`.
- Tests: `route.test.ts` `+83`; `StepBajas.test.tsx` `+48`.
- Overall: `added=144 removed=5 total=149` (under the 400-line budget).

## Slice s3c — `StepFinal` + shell branch (MAW-7)

- **Branch**: `feat/match-edit-redesign-s3c`
- **Mode**: Strict TDD (RED → GREEN)
- **Chain strategy**: `stacked-to-main` (slice 3c of the re-forecast 13-slice plan; stacked on s3b)
- **Boundary**: starts from the s3b wizard (Steps 0–4 real); ends with Step 5 (Final) rendering the
  read-only winnings preview + the fan 1D6 inputs. Step 6 stays a placeholder (s4a).
- **Rollback boundary**: revert `features/leagues/acta/StepFinal.tsx` (+ test) and the `step === 5`
  branch + import in `MatchActaWizard.tsx` (+ the shell test case). Steps 0–4 and 6 unaffected; no
  protected file touched.

### Code commits

- `7abda13` — `feat(leagues): add read-only winnings preview to acta final step` (step + test).
- `b9a7c10` — `feat(leagues): wire the Final step into the acta wizard` (shell + shell test).

### Completed Tasks

- [x] 3.3 (s3c) `features/leagues/acta/StepFinal.tsx` (MAW-7): READ-ONLY winnings breakdown with the
  visible `(FF_home + FF_away)/2` term, the team's own TDs and the "nunca tuvo el balón" bonus,
  computed with the SAME pure `computeWinnings`; fan-factor 1D6 input per team → `fanRoll`; shell
  branch + shell test.
- [x] 3.4 (s3a–s3c) winnings preview + fan roll covered by `StepFinal.test.tsx` (the s3a/s3b parts
  landed in their own slices).

### THE recorded decision — how it is honoured

- The winnings breakdown is a **client PREVIEW** only: Step 5 precedes submit, so no server value
  exists to fetch. `computeWinnings` (`lib/rules/winnings.ts`) is reused **as-is** — no formula is
  re-implemented.
- The **client transmits NO amount**: `buildActaPayload` was NOT changed and carries no `winnings`
  field. The server stays authoritative on submit.
- **No new API surface** was added.
- The ONLY manual input is the **fan-factor 1D6 per team**, written to `ActaTeamDraft.fanRoll`, which
  `buildActaPayload` already emits as `fanRoll`.
- **FAN_DELTA_DECISION**: the derived fan delta (fans won/lost) is NOT rendered. The wizard props are
  `homeName`/`awayName`/`homeRoster`/`awayRoster` (roster entries are `{ id, name }` only) — the
  teams' dedicated-fans value is **not available to the wizard**, and the design forbids inventing it
  or adding a fetch. The preview therefore shows only the read-only winnings breakdown and the fan
  roll input; the delta stays server-side.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | REFACTOR |
|------|-----------|-------|------------|-----|-------|----------|
| 3.3/3.4 | `StepFinal.test.tsx` | Component (jsdom) | ✅ 45 acta tests | ✅ Written first (`Failed to resolve import "./StepFinal"`) | ✅ 5/5 passed | ✅ Clean |
| 3.3 (shell) | `MatchActaWizard.test.tsx` | Component (jsdom) | ✅ 13 shell tests | ✅ Covered by the new step-5 case | ✅ 14/14 passed | ✅ Clean |

- **Total tests written**: 6 (5 step + 1 shell); **passing**: 6/6 in the focused files.
- **Layers used**: Component/jsdom (6), E2E (0 — out of s3c scope).
- **Pure functions created**: none (reuses `computeWinnings` and `aggregateActions`; the step adds
  only local `formatGold`/`formatUnits`/`parseFanRoll` presentation helpers).

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues/acta` → **7 files, 52 tests passed** |
| Runtime harness command/scenario and exact result | `pnpm exec vitest run features/leagues/acta/MatchActaWizard.test.tsx` → **14 passed (jsdom render of the real step 5)** |
| Rollback boundary | Revert `acta/StepFinal.tsx` (+ test) and the `step === 5` branch + import in `MatchActaWizard.tsx`; steps 0–4/6 unaffected. |

### Verification (exact commands / observed results)

- `pnpm exec vitest run features/leagues/acta` → **7 files, 52 passed**
- `pnpm test` → **187 files, 2721 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Changed Lines (s3c)

- Step + test commit (`7abda13`): `added=323 removed=0 total=323` (≈370 estimate).
- Shell wiring commit (`b9a7c10`): `added=23 removed=1 total=24` (≈40 estimate).
- Combined: `added=346 removed=1 total=347` — under the 400-line budget.

### Deviations from Design

- None. The design's Step-5 decision (client preview via the SAME `computeWinnings`, no amount in
  the payload, no new API surface) is implemented exactly.
- The preview needs BOTH teams' FF; when one is still unset the server falls back to its own rolled
  FF, so the step renders "—" plus a hint ("Introduce el Factor fan de ambos equipos (paso 0)…")
  instead of inventing a value. The fan-roll input and the read-only breakdown structure stay
  visible regardless.
- Spanish copy is literal in the step (like S2/s3a/s3b); the `acta.*` i18n keys land in s6b.

### Issues Found (s3c)

- None functional. The derived fan delta cannot be shown because the wizard does not receive the
  teams' dedicated-fans value (recorded above as FAN_DELTA_DECISION); this is a known product
  limitation, not a defect.
- Step 6 remains a "se completa en una porción posterior" placeholder (s4a) — intentional.

## Slice s4a — `StepRevisar` + shell submit (MAW-8)

- **Branch**: `feat/match-edit-redesign-s4a`
- **Mode**: Strict TDD (RED → GREEN)
- **Chain strategy**: `stacked-to-main` (slice 4a of the re-forecast 13-slice plan; stacked on s3c)
- **Boundary**: starts from the s3c wizard (Steps 0–5 real, Step 6 a placeholder); ends with Step 6
  rendering the real `StepRevisar` and the footer offering a gated "Guardar acta" that invokes the
  `onSubmit` prop with `buildActaPayload(state)`. The wizard is STILL not wired into the app
  (`onSubmit` is a prop; wiring lands in s4c).
- **Rollback boundary**: revert `features/leagues/acta/StepRevisar.tsx` (+ test) and the `step === 6`
  branch + footer button + import in `MatchActaWizard.tsx` (+ the shell test cases). Steps 0–5
  unaffected; no protected file (`MatchCard`/`LeagueDetail`/`ResultModal`/`MatchResolveModal`/
  `liveStore`/route/`lib/rules/*`) touched.

### Code commits

- `f5c3b8e` — `feat(leagues): add Revisar step with save-block validations` (step + test).
- `8ab1e2a` — `feat(leagues): wire the Revisar step and gated submit into the acta wizard` (shell + shell test).

### THE critical forward dependency — how it is honoured

- The S1 route requires, per team, EITHER a valid non-empty `mvp.grantee` OR exactly six nominations
  (`parseTeamResult`: present-but-empty grantee → 400; absent grantee → six nominations required).
  The wizard emits `mvp.grantee` with an EMPTY `nominations` array, so a team with no MVP selected
  would make the POST receive a **400**.
- Therefore `validateActa` blocks save unless **BOTH** hold: **Σ anotaciones == marcador** AND
  **both teams have an MVP selected**. The step renders the failing reason in a `role="alert"`, and
  the shell's "Guardar acta" button is `disabled` while `!validation.ok`.
- **Σ anotaciones parity**: `sumAnotaciones` sums the SAME `aggregateActions` per-player TD rows the
  payload emits, mirroring the server's `scoresMatchReportedTotals`, so the client block matches the
  server's 400 exactly (a TD line with no player selected is not credited by either side).

### Completed Tasks

- [x] 4.1 (s4a) `features/leagues/acta/StepRevisar.tsx` (MAW-8): readable summary of context, score,
  actions, MVP, derived casualties with their 1D16/1D6 rolls and bands, and the winnings preview;
  plus the validation state. `validateActa` (exported) blocks save unless Σ anotaciones == marcador
  AND both MVPs are selected, naming each failing team. Shell renders the real step and gates the
  footer "Guardar acta" (calls `onSubmit(buildActaPayload(state))` only when valid); "Atrás" and the
  focus trap/Esc/focus-restore are unchanged.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | REFACTOR |
|------|-----------|-------|------------|-----|-------|----------|
| 4.1 (step) | `StepRevisar.test.tsx` | Component (jsdom) | ✅ 52 acta tests | ✅ Written first (`Failed to resolve import "./StepRevisar"`) | ✅ 5/5 passed | ✅ Clean |
| 4.1 (shell) | `MatchActaWizard.test.tsx` | Component (jsdom) | ✅ 14 shell tests | ✅ 3 failed (`Unable to find button "Guardar acta"`; step-6 still a placeholder) | ✅ 17/17 passed | ✅ Clean |

- **Total tests written**: 8 (5 step + 3 shell); **passing**: 8/8 in the focused files.
- **Layers used**: Component/jsdom (8), E2E (0 — out of s4a scope).
- **Pure functions created**: 1 (`validateActa`, exported from the step; the summary reuses
  `aggregateActions`, `planBajas` and `computeWinnings` — no formula or mapping is re-implemented).

### SAVE_BLOCK_PROOF

- **TD/score block**:
  - `StepRevisar.test.tsx` → "blocks saving when Σ anotaciones differs from the marcador"
    (asserts `validateActa(...).ok === false` and the `role="alert"` names `anotaciones` + the team).
  - `MatchActaWizard.test.tsx` → "blocks submit when Σ anotaciones differs from the marcador"
    (asserts `save.disabled === true`, `onSubmit` NOT called, alert names `anotaciones`).
- **Missing-MVP block**:
  - `StepRevisar.test.tsx` → "blocks saving when a team has no MVP selected"
    (asserts `validateActa(...).ok === false` and the alert names `MVP` + the team).
  - `MatchActaWizard.test.tsx` → "blocks submit while a team has no MVP selected"
    (asserts `save.disabled === true`, `onSubmit` NOT called, alert names `MVP` + the team).
- The valid-state counterpart ("renders the real Revisar step at step 6 and submits the built
  payload") proves the block is not vacuous: the enabled button calls `onSubmit` once with
  `home.mvp.grantee === "h1"` / `away.mvp.grantee === "a1"`.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues/acta` → **8 files, 60 tests passed** |
| Runtime harness command/scenario and exact result | `pnpm exec vitest run features/leagues/acta/MatchActaWizard.test.tsx` → **17 passed (jsdom render of the real step 6 + gated submit)** |
| Rollback boundary | Revert `acta/StepRevisar.tsx` (+ test) and the `step === 6` branch + footer button + import in `MatchActaWizard.tsx`; steps 0–5 unaffected. |

### Verification (exact commands / observed results)

- `pnpm exec vitest run features/leagues/acta` → **8 files, 60 passed**
- `pnpm test` → **188 files, 2729 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Changed Lines (s4a)

- Step + test commit (`f5c3b8e`): `added=482 removed=0 total=482` (`StepRevisar.tsx` 315 + test 167).
- Shell + test commit (`8ab1e2a`): `added=150 removed=13 total=163` (`MatchActaWizard.tsx` +49/−13,
  test +101).
- Combined: `added=632 removed=13 total=645` vs the ≈440 forecast (**1.47×**) → **`size:exception`**.
  The diff was NOT minified; the step + its test are the cohesive MAW-8 unit and stay together.

### Deviations from Design

- `validateActa` and the summary live in `StepRevisar.tsx` (an in-scope file); the shell imports the
  validator from the step. `actaState.ts` was NOT touched, so the slice stays inside its file set.
- `onSubmit` is an OPTIONAL prop so every existing render site/test keeps compiling; the app wiring
  lands in s4c. The footer both natively `disabled`s the button and re-guards inside the click handler.
- The winnings preview reuses `computeWinnings` with a local `formatGold` (same presentation as
  `StepFinal`); no winnings amount rides the payload.

### Issues Found (s4a)

- **size:exception**: 645 changed lines vs the ≈440 forecast (1.47×). Within the tasks.md s4a row's
  pre-acknowledged `size:exception`.
- **Step-2/Step-6 Σ display divergence (recorded, NOT fixed here)**: `StepAcciones` displays Σ
  anotaciones counting TD lines even when no player is selected, while the server (and therefore
  `StepRevisar`'s save-block) credits only per-player rows via `aggregateActions`. A playerless TD
  line thus shows a Step-2 sum the save-block rejects. Fixing the Step-2 display is out of s4a scope
  and would change `StepAcciones.tsx` + its test; recorded for a later slice.

## Actions tally parity fix (post-verify corrective, bounded)

Independent verification of s4a found the Step-2 display could lie about what the payload would
submit (the s4a "Issues Found" entry above recorded it, unfixed). This bounded pass makes the
display provably equal to the payload. No protected file (`MatchCard`/`LeagueDetail`/`ResultModal`/
`MatchResolveModal`/`lib/liveStore.ts`/the API route/`lib/rules/*`) was touched, and
`aggregateActions`, `casualtiesFromActions`, `deriveCasualtyEntries`, `bajasPlan`, `buildActaPayload`,
`validateActa` and every payload field are unchanged — the payload is the source of truth and the
display now conforms to it.

- **Mode**: Strict TDD (RED → GREEN), code commit `3b0de74` —
  `fix(leagues): align acta acciones tally with submitted payload`.

### Defect

`StepAcciones` computed the displayed Σ anotaciones / bajas causadas with its own `filter`/`reduce`
rules: it summed EVERY `td` line's `Math.max(0, quantity)` and counted EVERY `casualty` line with a
victim, both IGNORING `rosterPlayerId`. `aggregateActions` (the function `buildActaPayload` uses)
skips any line with no `rosterPlayerId`. A playerless `td` line therefore inflated the Step-2 sum
while contributing nothing to the payload, so `validateActa` (which mirrors the payload) blocked a
save the display had implied was valid. The same class of defect affected the displayed bajas.

### What

`features/leagues/acta/StepAcciones.tsx` now derives BOTH counters by summing the `tds` and
`casualties` fields of `aggregateActions(draft.actions)` — the same function that builds the
transmitted rows — so display/payload drift is impossible by construction. It adds a one-sentence
hint ("Las acciones sin jugador no se contabilizan.") rendered only when the raw line totals exceed
the counted totals, so a dropped line is never a silent mystery. UI copy is neutral Spanish; code and
comments are English.

### Tests

New `features/leagues/acta/StepAcciones.test.tsx` (component/jsdom): a fixture with a playerless `td`
line (qty 3) and a playerless `casualty` line (victim set) alongside valid lines, asserting the
displayed counters equal `aggregateActions(...)` totals (2 tds / 1 casualty, NOT the raw 5 / 2), plus
the hint present when lines are dropped and absent when they are not.

- **RED** (against the old display logic, `87a41e7`): `2 failed` —
  `expected { tds: 5, casualties: 2 } to deeply equal { tds: 2, casualties: 1 }` and
  `expected '...' to match /sin jugador/i`. **GREEN**: `2 passed`.

### Verification (actions tally parity fix — exact commands / observed results)

- `pnpm exec vitest run features/leagues/acta` → **9 files, 62 passed**
- `pnpm test` → **189 files, 2731 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Changed Lines (actions tally parity fix)

- Code only (`StepAcciones.tsx`): `added=26 removed=5 total=31`.
- Tests (`StepAcciones.test.tsx`): `+111`.
- Overall: `added=137 removed=5 total=142` (under the 400-line budget and the 150-line fix target).

## Slice s4b — `MatchCard` single entry + `···` overflow (MAW-1)

- **Branch**: `feat/match-edit-redesign-s4b`
- **Mode**: Strict TDD (RED → GREEN)
- **Chain strategy**: `stacked-to-main` (slice 4b of the re-forecast 13-slice plan; stacked on s4a)
- **Boundary**: starts from the s4a wizard (Steps 0–6 real, submit gated) and the four legacy
  `MatchCard` header buttons; ends with ONE primary "Acta del partido" (`canLoadResult` guard) plus a
  keyboard-accessible `···` overflow holding Otorgar victoria / Corregir resultado / Reiniciar
  partido. `LeagueDetail` wiring, the modals and the wizard remain untouched (s4c).
- **Rollback boundary**: revert `features/leagues/MatchCard.tsx`, `MatchCard.test.tsx` and the
  entry-point assertions in `LeagueDetail.test.tsx`. The `onLoadResult`/`onCorrectResult`/
  `onForfeit`/`onReset` props are unchanged, so `LeagueDetail.tsx` needs no revert.

### Code commit

- `c9a4955` — `feat(leagues): collapse match card actions into one acta entry point`.

### Completed Tasks

- [x] 4.2 (s4b) `features/leagues/MatchCard.tsx`: ONE primary "Acta del partido" (`canLoadResult`)
  + `···` overflow (Otorgar victoria / Corregir resultado / Reiniciar partido); every guard
  preserved 1:1. `MatchCard.test.tsx` repointed; `LeagueDetail.test.tsx` entry-point assertions
  repointed (test-only — `LeagueDetail.tsx` untouched).
- [ ] 4.4 (s4b–s4c) — the s4b half is done (single action on scheduled + overflow gates); the s4c
  half (save-block on invalid state, budget-only inducements round-trip) stays open with s4c.

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `features/leagues/MatchCard.tsx` | Modified | Primary action + accessible `···` menu; four guards preserved 1:1 |
| `features/leagues/MatchCard.test.tsx` | Modified | Repointed every guard assertion; new MAW-1 entry-point + overflow a11y tests |
| `features/leagues/LeagueDetail.test.tsx` | Modified | Test-only entry-point repoint (open overflow for forfeit; "Acta del partido" for load) |

### GUARD_MAP (preserved 1:1)

| Guard | OLD condition | NEW location | Test |
|---|---|---|---|
| Result load | `!leagueFinished && status === "scheduled" && !liveActive && (isParticipant \|\| isLeagueOwner)` | primary "Acta del partido" | "renders exactly ONE primary 'Acta del partido'…"; "hides the primary action from a non-participant spectator"; "restores the load-result path once the live match is finished" |
| Correct | `!leagueFinished && (isLeagueOwner \|\| isParticipant) && status === "played"` | `···` → "Corregir resultado" | "shows 'Corregir resultado' to a participant captain…"; admin case; "hides 'Corregir resultado' on a non-played…" |
| Forfeit | `!leagueFinished && isLeagueOwner && status !== "played"` | `···` → "Otorgar victoria" | "gates 'Otorgar victoria' to the league admin…"; "shows 'Otorgar victoria' to the admin in the overflow"; "keeps the forfeit action admin-only…" |
| Reset | `showReset = !leagueFinished && canResetLive && live != null && live.status !== "finished"` | `···` → "Reiniciar partido" | reset describe (6 cases) |
| `leagueFinished` hides all | every guard begins `!leagueFinished` | no primary, no `···` trigger | finished-league describe (2 cases) |
| Live-active hides load | `!liveActive` inside `canLoadResult` | no primary | "shows the pulsing EN VIVO badge…" |

### Accessibility (the overflow is not a click-only div)

- Trigger: `<button aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Más acciones">`.
- Menu: `role="menu" aria-label="Más acciones"`; items are native `<button role="menuitem">`.
- Focus moves to the first item on open; ArrowDown/ArrowUp rove with wrap; Home/End jump.
- Escape closes and restores focus to the trigger; outside `mousedown` closes.
- Tests: `aria-haspopup`/`aria-expanded` toggle; Escape + focus restore; outside-click close;
  Arrow roving over two items.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.2 | `MatchCard.test.tsx` | Component (jsdom) | ✅ 38/38 | ✅ Written first (`Unable to find button "Más acciones"`; 15 failed \| 35 passed) | ✅ 50/50 passed | ✅ 15 new/updated cases (entry point, each guard, a11y) | ✅ Clean |
| 4.2 (consumer) | `LeagueDetail.test.tsx` | Integration (jsdom) | ✅ 30/30 | ✅ Covered by the entry-point repoint | ✅ 30/30 passed | ✅ forfeit open-overflow + load primary | ✅ Clean |

- **Total tests written/changed**: 15 MatchCard cases + 5 LeagueDetail assertion groups; all passing.
- **Layers used**: Component/jsdom (MatchCard), Integration/jsdom (LeagueDetail), E2E (0 — out of s4b).
- **Pure functions created**: none — the slice is a structural refactor of existing guards; the
  guards are asserted, not extracted.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues/MatchCard.test.tsx` → **1 file, 50 tests passed** |
| Runtime harness command/scenario and exact result | `pnpm exec vitest run features/leagues` → **41 files, 629 tests passed** (jsdom render of the real overflow in the LeagueDetail flow) |
| Rollback boundary | Revert `MatchCard.tsx` + `MatchCard.test.tsx` + the entry-point assertions in `LeagueDetail.test.tsx`; props unchanged so `LeagueDetail.tsx` is untouched. |

### Verification (exact commands / observed results)

- `pnpm exec vitest run features/leagues/MatchCard.test.tsx` → **1 file, 50 passed**
- `pnpm exec vitest run features/leagues` → **41 files, 629 passed**
- `pnpm test` → **189 files, 2743 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Changed Lines (s4b)

- Code only (`MatchCard.tsx`): `added=113 removed=29 total=142` (well under the ≈245 estimate).
- Tests: `MatchCard.test.tsx` `+191/−25`; `LeagueDetail.test.tsx` `+33/−13`.
- Overall: `added=337 removed=67 total=404` — **4 lines over the 400 budget** → `size:exception`.
  The overage is test-side (the mandated a11y coverage + the forced cross-file repoint); the
  production diff is 142 lines. The diff was NOT minified.

### Deviations from Design

- The primary label "Acta del partido" is literal neutral Spanish, matching the
  `MatchActaWizard` precedent; the `acta.*` i18n keys land in s6b (task 6.4).
- `LeagueDetail.test.tsx` was repointed (test-only) because its entry-point assertions
  (`getByRole("button", { name: "Cargar resultado" / "Otorgar victoria" })`) encode the OLD header
  buttons and `pnpm exec vitest run features/leagues` is a mandatory s4b gate. No production
  `LeagueDetail.tsx` change was made.
- Outside-click close does not force focus back to the trigger (the user's new focus target wins,
  per the APG menu-button pattern); the keyboard close path (Escape) does restore focus.

### Issues Found (s4b)

- None functional. `size:exception` recorded above (404 vs 400; 142 production lines).
- The `LeagueDetail.tsx` wizard wiring (mode load/correct, retiring `ResultModal`) remains s4c, so
  the primary action still opens the existing `ResultModal` until then.

## Slice s4c — `LeagueDetail` wizard wiring + budget-only inducement shape (task 5.4)

- **Branch**: `feat/match-edit-redesign-s4c`
- **Mode**: Strict TDD (RED → GREEN)
- **Chain strategy**: `stacked-to-main` (slice 4c of the re-forecast 13-slice plan; stacked on s4b)
- **Boundary**: starts from the s4b single "Acta del partido" entry point (still opening the legacy
  `ResultModal`) and the S2 `buildActaPayload` budget-only snapshot; ends with the LOAD path opening
  `MatchActaWizard` (submitting through the SAME `submit` helper) and the route persisting a
  non-live budget-only inducement snapshot. The CORRECT path keeps `ResultModalFor`/`ResultModal`
  unchanged (retired in s6c; correct-mode prefill is s6a).
- **Rollback boundary**: revert `features/leagues/LeagueDetail.tsx` (+ test) and the
  `parseInducements` change in the result route (+ its test). `MatchActaWizard`, `ResultModal`,
  `MatchResolveModal`, `lib/liveStore.ts` and `lib/rules/*` are untouched.

### Code commits

- `b1b2153` — `fix(leagues): persist budget-only inducements for non-live acta results` (route + route test).
- `02e3755` — `feat(leagues): open the acta wizard on the result load path` (LeagueDetail + test).

### Completed Tasks

- [x] 4.3 (s4c) `LeagueDetail.tsx`: new `MatchActaWizardFor` mounts `MatchActaWizard` (`mode="load"`)
  with the fixture's team names + home/away rosters built exactly like `ResultModalFor`; its
  `onSubmit` calls the existing `submit` helper (`onSubmitResult` → POST + league refresh) and closes
  on success. The `resultFixture` render branches by `resultMode`: `correct` → `ResultModalFor`
  (unchanged), `load` → `MatchActaWizardFor`. `Jornadas`' `onSubmitResult`/`onCorrectResult` props
  are now typed `Promise<void>` so the wizard can await the real submit.
- [x] 4.4 (s4b–s4c) RED → GREEN `LeagueDetail.test.tsx`: the load-path test now drives the wizard
  (dialog "Acta del partido") through Contexto inducements + one MVP per team to the gated
  "Guardar acta" and asserts the POST body (`mvp.grantee` + the budget-only `inducements` snapshot).
  The LM-9 finished-live prefill test was repointed to the CORRECT path (where `ResultModal` lives).
- [x] 5.4 (s4c) `parseInducements` in the result route no longer returns `null` when a budget is
  present but `cards` is empty; the non-live POST persists the payload's `{ budget, cards: [] }` per
  side. `buildActaPayload` already emitted the budget-only snapshot (S2) — no `actaState.ts` change.

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `features/leagues/LeagueDetail.tsx` | Modified | Load path → `MatchActaWizardFor`; correct path unchanged; submit props typed `Promise<void>` |
| `features/leagues/LeagueDetail.test.tsx` | Modified | Load-path test rewritten to the wizard; LM-9 prefill test moved to the correct path |
| `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` | Modified | `parseInducements` accepts a present budget with empty `cards` |
| `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` | Modified | Budget-only round-trip + absent-inducements no-key cases |

### INDUCEMENT_SHAPE (task 5.4)

- **Payload a non-live acta sends**: `inducements: { home: { budget: <money spent>, cards: [] },
  away: { budget: <money spent>, cards: [] } }` — emitted by `buildActaPayload` (S2, unchanged).
- **Route behaviour**:
  - budget present + empty `cards` → `{ budget, cards: [] }` PERSISTS into
    `scores.home|away.inducements` (round-trips).
  - genuinely absent (`inducements` key missing / not an object / neither side present) → `null` →
    no key invented (legacy rows untouched).
  - malformed side (non-number budget / non-array cards) → `null` for that side.
  - live path (fixture has a `liveMatch`) → `buildInducementSnapshot` cart snapshot, UNCHANGED.

### CORRECT_PATH (unchanged)

- `ResultModalFor`/`ResultModal` are untouched and still mounted for `resultMode === "correct"`.
  The correct-mode PUT flow, its guards, and its prefill behaviour are exactly as before; only the
  LOAD branch changed. `ResultModal.tsx` was not edited.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | REFACTOR |
|------|-----------|-------|------------|-----|-------|----------|
| 5.4 (route) | `route.test.ts` | Route integration (vitest) | ✅ 52 route tests | ✅ `expected undefined to deeply equal { budget: 50000, cards: [] }` | ✅ 54/54 passed | ✅ Clean |
| 4.3/4.4 (wiring) | `LeagueDetail.test.tsx` | Integration (jsdom) | ✅ 30 LeagueDetail tests | ✅ `Unable to find role "dialog" name "Acta del partido"` (load path still opened ResultModal) | ✅ 30/30 passed | ✅ Clean |

- **Total tests added/rewritten**: 2 route + 2 LeagueDetail (one rewritten, one repointed); all passing.
- **Layers used**: Route integration (2), Integration/jsdom (2), E2E (0 — knowingly red on the chain).

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues/LeagueDetail.test.tsx` → **30 passed**; `pnpm exec vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → **54 passed** |
| Runtime harness command/scenario and exact result | `pnpm exec vitest run features/leagues` → **41 files, 629 passed** (jsdom render of the real wizard in the LeagueDetail flow) |
| Rollback boundary | Revert `LeagueDetail.tsx` + `LeagueDetail.test.tsx` and the `parseInducements` change in `route.ts` + its test; the wizard, modals and live store are untouched. |

### Verification (exact commands / observed results)

- `pnpm exec vitest run features/leagues` → **41 files, 629 passed**
- `pnpm exec vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → **54 passed**
- `pnpm test` → **189 files, 2745 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Changed Lines (s4c)

- Code only: `added=159 removed=47 total=206` (≈310 estimate) — under the 400-line budget.
  - `b1b2153`: `added=41 removed=2`.
  - `02e3755`: `added=118 removed=45`.

### Deviations from Design

- **Load-only wizard (prompt-scoped)**: tasks.md 4.3 says "wire wizard (mode `load`/`correct`)" but the
  s4c prompt scopes the wizard to the LOAD path and keeps `ResultModal` for CORRECT (retired in s6c,
  prefill in s6a). Implemented as scoped; the task line carries the note.
- `MatchActaWizardFor` opens with NO `initial` prefill: the wizard's `initial` is `ActaState` and the
  finished-live `buildResultPrefill` returns `ResultTeamDraft`; the bridge (`actaPrefill`) is s6a.
  The LM-9 prefill coverage moved with `ResultModal` to the correct path.
- `actaState.ts` was NOT touched: `buildActaPayload` already emitted the budget-only snapshot since S2.
- A failed load-path submit keeps the wizard open but is not surfaced in the dialog (the wizard has
  no error prop; error UI is not in s4c scope).

### Issues Found (s4c)

- None functional. E2E remains knowingly red on this chain (s6d/s6e); `pnpm test` is the s4c gate.

## Slice s4c — corrective pass (post-verify): load-path prefill + submit error surface

- **Branch**: `fix/match-edit-redesign-s4c-prefill` (stacked on s4c)
- **Mode**: Strict TDD (RED → GREEN) — a failing test FIRST for BOTH defects.
- **Scope**: two defects found by independent verification of s4c. No re-architecture; the CORRECT
  path, `ResultModal`, `MatchResolveModal`, `ForfeitModal`, `ResetLiveMatchModal`, `lib/liveStore.ts`,
  `lib/rules/*` and `features/leagues/api.ts` are untouched.

### DEFECT 1 — the finished-live load-path prefill was dropped

- The legacy `ResultModalFor` fetched `getMatchDetail(...)` and called `buildResultPrefill(match.live)`;
  the new `MatchActaWizardFor` passed NO `initial` and never fetched, so a scheduled fixture whose live
  match already finished opened the wizard EMPTY. The old load-path test had been repointed to the
  correct path, so nothing guarded it.
- **Fix**: `actaPrefill` in `features/leagues/acta/actaState.ts` (its ONLY home, design decision F2)
  now accepts the `buildResultPrefill` draft pair and adapts `ResultTeamDraft → ActaState`;
  `MatchActaWizardFor` fetches the fixture GET and passes
  `initial={actaPrefill(buildResultPrefill(match.live))}` on the load path only. The persisted-snapshot
  (correct-mode) prefill branch is left as the s6a skeleton.

#### PREFILL_MAPPING (live source → `ActaState`)

| `ActaState` field | Populated? | Source / reason |
|---|---|---|
| `home/away.score` | yes | `ResultTeamDraft.score` (the live `homeScore`/`awayScore`) |
| `home/away.neverHeld` | yes | `!ResultTeamDraft.ballHeld` (`buildResultPrefill` sets `ballHeld: true`) |
| `home/away.actions` | yes | per-player rows → `td` lines (plus completion/interception/foul/throwTeamMate/landedSafe when present) |
| `home/away.mvpGrantee` | no — unset (`""`) | the live draft carries up to six MJP nominations, not the wizard's single direct grantee; no honest scalar source |
| `home/away.ff` | no — unset | the live draft has no Factor Fan |
| `home/away.inducements` | no — `0` | no source on the live draft |
| `home/away.fanRoll` | no — `null` | no source |
| `home/away.injuryRoll` / `permanentRoll` | no — `[]` | no source (rolls are correct-mode/snapshot data) |
| `weather` | no — default `"Perfecto"` | the live match has no weather |
| `duration` | no — unset | the live draft has no duration |
| casualties | no — not mapped | the live draft's casualty count has no VICTIM binding and its victim list has no CAUSER attribution; inventing either would corrupt the payload |

### DEFECT 2 — a rejected submit was swallowed

- `MatchActaWizardFor` did `void onSubmitResult(...).then(...).catch(() => {})` and `MatchActaWizard`
  had no error state, so on a 400/409 the dialog stayed open with ZERO feedback.
- **Fix**: `MatchActaWizard` now catches a rejected `onSubmit`, renders a `role="alert"` (neutral
  professional Spanish: "No se pudo guardar el acta. Inténtalo de nuevo."), keeps the dialog open, and
  clears the message on the next attempt. `LeagueDetail.tsx` returns the submit promise (no `.catch`)
  so the rejection reaches the wizard. No pending/disabled-while-submitting state (out of scope).

### TDD Cycle Evidence (corrective)

| Defect | Test File | Layer | RED (test written first) | GREEN | REFACTOR |
|------|-----------|-------|--------------------------|-------|----------|
| 1 — load-path prefill | `LeagueDetail.test.tsx` | Integration (jsdom) | ✅ `expected '0' to be '2'` (the wizard opened empty) | ✅ 31/31 passed | ✅ Clean |
| 2 — rejected submit | `MatchActaWizard.test.tsx` | Component (jsdom) | ✅ `Unable to find role="alert"` (the rejection was swallowed) | ✅ 18/18 passed | ✅ Clean |

### Files Changed (corrective)

| File | Action | What Was Done |
|------|--------|---------------|
| `features/leagues/acta/actaState.ts` | Modified | `actaPrefill` gains the load-path `ResultTeamDraft → ActaState` adapter (union with the s6a snapshot skeleton) |
| `features/leagues/LeagueDetail.tsx` | Modified | `MatchActaWizardFor` fetches the fixture GET and passes the prefill; the load-path `onSubmit` no longer swallows rejections |
| `features/leagues/MatchActaWizard.tsx` | Modified | `submitError` state + `role="alert"`; `onSubmit` may return a promise |
| `features/leagues/LeagueDetail.test.tsx` | Modified | Regression guard: a scheduled fixture with a finished live match opens PREFILLED |
| `features/leagues/acta/MatchActaWizard.test.tsx` | Modified | A rejecting `onSubmit` shows the alert and keeps the dialog open |

### REGRESSION_GUARD

- `LeagueDetail.test.tsx` → "opens the acta wizard PREFILLED for a scheduled fixture whose live match
  finished (s4c corrective)". It opens the wizard for a `scheduled` fixture whose `getMatchDetail`
  returns a `finished` live match and asserts the Marcador inputs are `2`/`1` and the Acciones line for
  `h1` carries quantity `2`. Dropping the load-path prefill again fails it with `expected '0' to be '2'`.

### Work Unit Evidence (corrective)

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues/acta/MatchActaWizard.test.tsx features/leagues/LeagueDetail.test.tsx` → **49 passed** (RED before the fix: 2 failed) |
| Runtime harness command/scenario and exact result | `pnpm exec vitest run features/leagues` → **41 files, 631 passed** (jsdom render of the real wizard on the load path) |
| Rollback boundary | Revert the three production files (`actaState.ts`, `LeagueDetail.tsx`, `MatchActaWizard.tsx`) and their two tests; no other slice artifact depends on the corrective change. |

### Verification (exact commands / observed results)

- `pnpm exec vitest run features/leagues` → **41 files, 631 passed**
- `pnpm test` → **189 files, 2747 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Changed Lines (s4c corrective)

- Code only: `added=124 removed=29 total=153`; with tests: `added=230 removed=30 total=260` — under the
  300-line corrective target.

### Code commits (corrective)

- `d2ed094` — `fix(leagues): restore acta load-path prefill and surface submit errors` (actaState.ts,
  LeagueDetail.tsx, MatchActaWizard.tsx + their tests).

## Slice s5a — PUT recompute + treasury delta + extended snapshot

- **Branch**: `feat/match-edit-redesign-s5a`
- **Mode**: Strict TDD (RED → GREEN)
- **Chain strategy**: `stacked-to-main` (slice s5a, stacked on s4c)
- **Boundary**: starts from the s4c copy-forward PUT; ends with a correction that RECOMPUTES winnings
  from the corrected payload, moves each treasury by the delta, persists the extended wizard snapshot,
  and audits the recomputed `after`. The inducement PRECEDENCE (F1) is explicitly s5b — the PUT's
  inducement behaviour (copy-forward) is left byte-for-byte as it was.
- **Rollback boundary**: revert `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` (PUT only)
  and its `route.test.ts`; the copy-forward PUT is restored with no other slice depending on it.

### Code commit

- `54ac960` — `feat(leagues): recompute winnings and treasury delta on result correction`
  (`route.ts` PUT + `route.test.ts`).

### Completed Tasks

- [x] 5.1 (s5a) PUT recomputes winnings via `computeWinnings` (input FF as-is, no 1D3; own TDs;
  `heldBall = !neverHeld`) and moves each treasury by `new − old` with NO floor; the audit `after`
  snapshot carries the recomputed winnings.
- [ ] 5.3 (s5a half) RED → GREEN route tests for recompute + treasury delta + negative delta + the
  extended snapshot. The s5b half (inducement precedence) is untouched/pending.

### What changed (honest reconciliation of the old PUT)

The old PUT at L631–840 copied `winnings` and `inducements` forward from `prevScores` and REBUILT
`scores` without the extended keys (dropping `ff`, `neverHeld`, `fanRoll`, `injuryRoll`,
`permanentRoll`, `actions`, `duration`), and it never touched `Team.treasury`. s5a:

1. Recomputes `homeWinnings`/`awayWinnings` with `computeWinnings` (imported already), using
   `homeFf = home.ff ?? prevScores?.home?.ff ?? 0` (and the away mirror) — the input FF is used as-is
   with NO `rollD3`, exactly as the POST does. `heldBall` is the parser's `!neverHeld` mapping.
2. Adds `tx.team.update({ treasury: { increment: homeWinningsDelta } })` (and away) inside the
   correction transaction, where `delta = new − prevScores.*.winnings ?? 0`. Negative deltas are
   applied verbatim — no `Math.max`/clamp.
3. Rebuilds `scores.home|away` with `winnings` (recomputed), `ff`, `neverHeld`, `fanRoll`,
   `injuryRoll`, `permanentRoll`, `actions`, and top-level `duration` — the extended snapshot keys
   the wizard needs for correct-mode prefill.
4. Records `correctedAt: new Date()` explicitly on the `MatchResultCorrection` row (actor already
   recorded); `before` is the prior snapshot and `after` is the rebuilt snapshot with recomputed
   winnings.
5. Leaves the PE `max(0, new − old)` loop, the authorization rule, the 409-finished/409-no-result/
   404-no-leak semantics, and the inducement copy-forward UNTOUCHED.

### RECOMPUTE_PROOF

| Test | What it proves | Exact numbers |
|------|----------------|---------------|
| `PUT recomputes winnings from the corrected payload and moves treasury by the delta (s5a)` | recompute REPLACES copy-forward; treasury delta; audit `after` | prior 45k/35k → corrected FF 5/3, TD 2/1 → **60k/50k**, treasury **+15k/+15k**, audit `after` = 60k/50k |
| `PUT allows a negative treasury delta with no floor (s5a)` | NEGATIVE delta applied verbatim, no clamp | prior 90k/80k → corrected FF 1/1, TD 2/1 → **30k/20k**, treasury **−60k/−60k** |
| `PUT recomputes the never-held-ball winnings bonus from neverHeld (s5a)` | `heldBall = !neverHeld` feeds the formula | home `neverHeld: true` → **70k** (60k base + 10k) |
| `PUT recomputes winnings for a legacy row from a blank FF (0) — no copy-forward` | legacy fallback is blank FF, not the old copy | no prior winnings/ff → **20k/10k**, treasury +20k/+10k |

### SNAPSHOT_KEYS (PUT now preserves)

Per side (`scores.home`, `scores.away`): `score`, `postFf`, **`winnings`** (recomputed), **`ff`**,
**`neverHeld`**, **`fanRoll`**, **`injuryRoll`**, **`permanentRoll`**, **`actions`**, `casualties`,
`pe`, and `inducements` (copy-forward, s5b). Top level: `winnerId`, `mvp`, **`duration`**.
The dedicated test asserts every one of `ff`, `neverHeld`, `fanRoll`, `injuryRoll`, `permanentRoll`,
`actions` is present on BOTH sides (no extended key dropped) plus top-level `duration`.

### PE_INVARIANT (spent PE still never revoked)

- The PE loop is unchanged: `delta = Math.max(0, award.pe − prev)` and `if (delta === 0) continue`.
  No negative PE increment is possible.
- Proof: the pre-existing test `never revokes spent PE on a correction that awards fewer PE` (prior
  p1 = 9 PE, corrected = 3 PE → delta 0) still passes, and asserts no PE increment is negative. The
  full `pnpm test` gate (2750 passed) is green.

### TDD Cycle Evidence (s5a)

| Task | Test File | Layer | Safety Net | RED | GREEN | REFACTOR |
|------|-----------|-------|------------|-----|-------|----------|
| 5.1/5.3 (s5a) | `app/api/.../result/route.test.ts` | Route/Integration | ✅ 52/57 existing PUT+POST tests | ✅ 5 tests written first → **5 failed / 52 passed** (undefined winnings, no treasury write) | ✅ **57/57 passed** | ✅ Clean |

### Work Unit Evidence (s5a)

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → **1 file, 57 passed** |
| Runtime harness command/scenario and exact result | `pnpm test` → **189 files, 2750 passed** (the route runs against a mocked Prisma `$transaction`; no live server boundary for this route slice) |
| Rollback boundary | Revert the PUT block in `route.ts` + the 5 s5a tests; restore copy-forward. No other file depends on the s5a change. |

### Verification (exact commands / observed results)

- `pnpm exec vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → **57 passed (57)**
- `pnpm test` → **189 files, 2750 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Changed Lines (s5a)

- Code only (`route.ts` + `route.test.ts`): `added=172 removed=30 total=202` — under the ~310 target.

### Deviations from Design

- None material. The design's F1 inducement block is intentionally deferred to s5b; the PUT keeps the
  copy-forward exactly as designed for this slice.
- The design said the extended snapshot stores "raw rolls"; the PUT stores the RESOLVED per-victim
  rolls (client value or the server fallback), matching the POST snapshot semantics (`scores.away`
  grouping by victim team). This is the value a later prefill can actually read back.

### Issues Found (s5a)

- Legacy rows carry no persisted `winnings`/`ff`; the delta is therefore computed against 0 and the
  winnings from a blank FF. This is the documented legacy limitation ("legacy rows read as blank FF")
  and is asserted explicitly rather than silently copied forward.

## Slice s5a — corrective pass (post-verify, bounded)

The independent verify FAILED s5a with a money-moving regression. This bounded pass fixes exactly the
four reported defects; no re-architecture, no inducement change (s5b stays byte-for-byte untouched),
and no file outside `route.ts` + `route.test.ts` touched.

- **Branch**: `feat/match-edit-redesign-s5a`
- **Mode**: Strict TDD (RED → GREEN)
- **Code commit**: `6a5db85` — `fix(leagues): guard correction winnings delta against unknown baselines`.
- **Governing principle**: never move money against an unknown baseline. A treasury delta is applied
  ONLY when BOTH the old and the new winnings are trustworthy; a missing input keeps the previously
  persisted value and applies a ZERO delta — never a guess.

### FIX-1 (HIGH) · legacy corrections must not recompute from FF 0

- **Defect**: `homeFf = home.ff ?? prevScores?.home?.ff ?? 0` recomputed winnings from FF 0 whenever
  neither the payload nor the snapshot carried an FF. The only correct-mode UI wired today is the
  legacy `ResultModal`, which sends no `ff`, and production snapshots persist per-side `winnings` but
  no `ff` — so a correction for an unrelated change applied `newWinnings(FF 0) − prevWinnings(real)`.
  Concrete: `winnings: 60000`, no `ff` → new 20000 → delta **−40000**.
- **Fix**: `route.ts` resolves `homeFf = home.ff ?? prevScores?.home?.ff` (away mirror) with **no 0
  fallback** (L789–790). `computeWinnings` couples both sides, so when EITHER side's FF is unknown
  neither side is recomputed: the side keeps `prevScores.*.winnings` (L792–797) and the in-tx delta
  is ZERO.
- **Test**: `s5a FIX-1: a legacy correction (winnings present, ff absent) keeps the winnings and never
  moves treasury` — prior 60k/50k, no FF anywhere, legacy body → snapshot stays 60k/50k and no
  treasury increment is non-zero.
- **RED**: winnings became 20k/10k and treasury moved −40k/−40k. **GREEN**: passes.

### FIX-2 (MEDIUM) · no windfall when the old winnings are unknown

- **Defect**: the delta defaulted `old` to 0, so a row with no persisted per-side `winnings` was paid
  the ENTIRE recomputed winnings again (POST already incremented treasury by winnings).
- **Fix**: the in-tx delta is applied only when `freshScores.*.winnings != null` (L868–875); otherwise
  it is 0. The recomputed winnings still persist to the snapshot; the treasury does not move.
- **Test**: `s5a FIX-2: no persisted prior winnings → ZERO delta even when the corrected FF is known
  (no windfall)` — prior has no `winnings`, corrected FF 5/3 → snapshot 60k/50k, no treasury movement.
  The old `PUT recomputes winnings for a legacy row from a blank FF (0)` test (which ENSHRINED the
  windfall by asserting +20k/+10k) was **rewritten** to this no-movement assertion.
- **RED**: treasury gained the full 60k/50k. **GREEN**: passes.

### FIX-3 (LOW) · omitted wizard-input keys are preserved, not nulled

- **Defect**: the PUT rebuilt `scores` from the payload, so an omitted extended key (`fanRoll`,
  top-level `duration`, rolls, actions) was written as `null`/absent, clobbering a persisted value.
- **Fix**: the COMPUTED fields (`score`, `winnings`, `postFf`, `casualties`, `pe`) are replaced by the
  correction; the wizard-INPUT keys MERGE over the prior snapshot (L820–852): `fanRoll` and `duration`
  fall back to the prior value when omitted, `injuryRoll`/`permanentRoll` keep the prior rolls only
  when the correction resolves NONE (rolls are grouped by the VICTIM's team via `mergeRolls`), and
  `actions` falls back when the payload omits `players`. `neverHeld` is always derived from the
  mandatory ball-held input, so it is never omitted.
- **Test**: `s5a FIX-3: a correction that omits fanRoll/duration preserves the prior snapshot values`
  — prior `fanRoll` 4/2 + `duration` 240, legacy body → all three survive.
- **RED**: `fanRoll`/`duration` were null. **GREEN**: passes.

### FIX-4 (concurrency) · read the previous snapshot inside the transaction

- **Defect**: `prevScores` was read OUTSIDE `$transaction`, so two in-flight corrections could both
  read the same baseline and both apply the same delta.
- **Fix**: the PUT re-reads the snapshot inside the correction transaction via
  `tx.fixture.findFirst({ where: { id: fixtureId }, include: { result: true } })` (L859–863) and
  computes BOTH deltas from that in-tx baseline; the audit `before` is that same in-tx snapshot.
- **Test**: `s5a FIX-4: reads the previous snapshot inside the transaction and computes the delta
  from it` — outer read winnings 60k/50k, in-tx read 10k/0, corrected FF 5/3 → delta 50k/50k (the
  in-tx baseline), and `before` records 10k.
- **RED**: one `findFirst` call, delta vs the stale outer baseline, `before` = outer. **GREEN**: passes.

### CONCURRENCY — what is actually achieved, and the residual risk

- **Achieved**: the baseline read and the treasury write now share ONE transaction; the delta is no
  longer computed from a snapshot read before the tx.
- **NOT fully solved**: Prisma's typed API exposes no `SELECT … FOR UPDATE` row lock, and the default
  Read Committed isolation does not lock the row on read — two concurrent corrections can still both
  read the same baseline and both commit their (identical) delta. This is recorded as residual risk,
  NOT claimed as resolved. A true close requires Serializable isolation (surfacing a P2034 conflict)
  or a raw `FOR UPDATE` lock, both deliberately out of this bounded pass's scope.

### TDD Cycle Evidence (s5a corrective)

| Task | Test File | Layer | Safety Net | RED | GREEN |
|------|-----------|-------|------------|-----|-------|
| FIX-1 | `route.test.ts` | Route/Integration | ✅ 56/60 existing | ✅ winnings 20k/10k + treasury −40k | ✅ |
| FIX-2 | `route.test.ts` | Route/Integration | ✅ 56/60 existing | ✅ treasury +60k/+50k windfall | ✅ |
| FIX-3 | `route.test.ts` | Route/Integration | ✅ 56/60 existing | ✅ fanRoll/duration null | ✅ |
| FIX-4 | `route.test.ts` | Route/Integration | ✅ 56/60 existing | ✅ 1 findFirst call, stale baseline | ✅ |

- **RED**: `pnpm exec vitest run "…/route.test.ts"` → **4 failed | 56 passed (60)** (exactly the four
  new tests). **GREEN**: **60 passed (60)**.

### Work Unit Evidence (s5a corrective)

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → **1 file, 60 passed** |
| Runtime harness command/scenario and exact result | `pnpm test` → **189 files, 2753 passed** (route exercised against a mocked Prisma `$transaction`; no live server boundary for this slice) |
| Rollback boundary | Revert the s5a corrective commit `6a5db85`; the s5a commit `54ac960` is restored. No other file depends on the change. |

### Verification (s5a corrective — exact commands / observed results)

- `pnpm exec vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → **60 passed (60)**
- `pnpm test` → **189 files, 2753 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Changed Lines (s5a corrective)

- Code only (`route.ts` + `route.test.ts`): `added=185 removed=58 total=243` — under the 400 budget.

### MONEY_SAFETY (the rule the code now follows)

A treasury delta is applied ONLY when BOTH the newly recomputed winnings AND the previously persisted
winnings are trustworthy; otherwise the persisted value is kept and the delta is ZERO. In code:
`canRecomputeWinnings = homeFf != null && awayFf != null`, and
`delta = canRecomputeWinnings && freshScores.*.winnings != null ? new − old : 0`. The proving test is
`s5a FIX-1: a legacy correction (winnings present, ff absent) keeps the winnings and never moves
treasury` (a production legacy row: `winnings` present, `ff` absent → winnings unchanged, treasury
does not move).

### Issues Found (s5a corrective)

- The prior s5a "Issues Found" note described the FF-0 fallback and the delta-vs-0 default as a
  "documented legacy limitation". That framing was WRONG: both silently moved money on production
  rows. This corrective pass supersedes it — the guards above replace both behaviours.
- Inducement handling was NOT touched (s5b owns it); the copy-forward tests still pass unchanged.

## Slice s5b — PUT inducement precedence (F1)

The PUT correction replaced the per-side inducement COPY-FORWARD with the design's F1
wizard-input-first precedence. No file outside `route.ts` + `route.test.ts` was touched, and the s5a
winnings/treasury-delta logic is byte-for-byte unchanged.

- **Branch**: `feat/match-edit-redesign-s5b`
- **Mode**: Strict TDD (RED → GREEN → TRIANGULATE)
- **Code commit**: `c13f895` — `feat(leagues): prefer wizard inducements on result correction`.
- **Governing rule (F1)**: the wizard INPUT wins; a payload that OMITS inducements falls back to the
  previously persisted `prevScores.*.inducements`; when NEITHER exists (legacy single-row `pettyCash`)
  the key is omitted — no invention. Reuses `parseInducements` (s4c budget-only shape); no duplicated
  parsing logic.

### The four rules and their proving tests

| Rule | Behavior | Proving test | Decisive assertion |
|---|---|---|---|
| 1. Input wins | payload inducements persist, replacing the snapshot | `RAU-122/s5b: PUT persists the wizard-INPUT inducements — input wins over the prior snapshot` | `expect(updateArg.data.scores.away.inducements).toEqual({ budget: 25_000, cards: [] })` against a prior `{ budget: 150_000, cards: [{ name: "Mago", count: 1 }] }` |
| 2. Fallback preserves | payload omits → prior snapshot kept | `RAU-122/s5b: PUT falls back to the prior per-side inducements when the payload omits them — a correction never drops the chips` | `away.inducements: { budget: 150_000, cards: [{ name: "Mago", count: 1 }] }`; `home` has no key |
| 3. Legacy omits | neither input nor snapshot → key omitted | `RAU-122/s5b: PUT omits inducements for legacy rows with neither input nor snapshot (omit-if-absent)` | `expect(updateArg.data.scores.home).not.toHaveProperty("inducements")` and the same for `away` |
| 4. Live unchanged | POST with a `liveMatch` uses the cart snapshot | `LM-30/S3: carries the lower-TV cart into scores.*.inducements when the fixture's liveMatch has one` (existing, unchanged) | `scores.away.inducements` equals the cart `{ budget: 150_000, cards: [{ name: "Mago", count: 1 }] }` even though the payload carries no cart |

Triangulation: `RAU-122/s5b: PUT resolves inducements PER SIDE — input wins on one side, the snapshot
survives on the other` supplies input for HOME only (real cards) over a prior AWAY cart → asserts
`home` = payload `{ budget: 40_000, cards: [{ name: "Chef", count: 1 }] }` AND `away` = prior
`{ budget: 150_000, cards: [{ name: "Mago", count: 1 }] }`, proving the two branches are independent
per side.

### Implementation (route.ts PUT)

```ts
const ind = parseInducements(raw.inducements);
// per side:
...(ind?.home != null
  ? { inducements: ind.home }
  : prevScores?.home?.inducements != null
    ? { inducements: prevScores.home.inducements }
    : {}),
```

### TDD Cycle Evidence (s5b)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 5.2 | `route.test.ts` | Route/Integration | ✅ 60/60 existing | ✅ input-wins test written first → **1 failed / 60 passed** (got 150k copy-forward, expected 25k input) | ✅ **61/61 passed** | ✅ per-side mixed case (input home + snapshot away) → **62/62** | ✅ None needed |

- **Total tests written**: 2 (input-wins + per-side triangulation); **passing**: 2/2 in the focused file.
- **Layers used**: Route/Integration (2); Unit (0); E2E (0 — s6d/s6e own it).
- **Pure functions created**: 0 (reused `parseInducements`; no duplicated parsing logic).

### Work Unit Evidence (s5b)

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → **1 file, 62 passed** |
| Runtime harness command/scenario and exact result | `pnpm test` → **189 files, 2755 passed** (route exercised against a mocked Prisma `$transaction`; no live server boundary for this slice) |
| Rollback boundary | Revert commit `c13f895`; the s5a copy-forward behavior is restored. No other file depends on the change. |

### Verification (s5b — exact commands / observed results)

- `pnpm exec vitest run "app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts"` → **62 passed (62)**
- `pnpm test` → **189 files, 2755 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Changed Lines (s5b)

- Code only (`route.ts` + `route.test.ts`): `added=82 removed=11 total=93` — under the ~120 target.

### Deviations from Design

- None material. The implementation matches the design's F1 block exactly: `parseInducements` is
  reused (no duplicated parsing), the wizard input wins, the snapshot is the fallback, and the key is
  omitted when neither exists.
- The PUT handler does not fetch `liveMatch`, so rule 4 ("the live path is unchanged") is satisfied by
  NOT touching the POST live branch (`fixture.liveMatch ? buildInducementSnapshot(...) : ...`) and by
  the fallback preserving any previously persisted cart snapshot. No `liveMatch` branch was added to
  the PUT — the design's F1 block does not specify one.

### Issues Found (s5b)

- The two former copy-forward tests were retitled to the fallback/legacy semantics they now prove;
  their assertions were already correct for the fallback branch and remain green.
- Preserved invariants (untouched): PE never revoked, audit before/after, authorization (owner OR
  captain OR `leagues.manage`), 401 / 404 no-leak / 409 finished / 409 no result, and the s5a
  money-safety guards.

## Slice s6a — Move result draft types + full `actaPrefill` (MAW-9)

- **Branch**: `feat/match-edit-redesign-s6a` (stacked on s5b, `c13f895`)
- **Mode**: Strict TDD (RED → GREEN)
- **Chain strategy**: `stacked-to-main`
- **Boundary**: starts from s5b; ends with (a) the accurate live-source comment, (b) the persisted
  `MatchResult.scores` → wizard prefill, (c) the draft types relocated to `resultPrefill.ts`, and
  (d) the CORRECT path wired to `MatchActaWizard` prefilled. `ResultModal.tsx` / `ResultModalFor`
  stay present and compiling for s6c.
- **Rollback boundary**: revert `f5e1f62`, `20a690f`, `6ea5e01`, `69dcaf6`; the legacy `ResultModal`
  correct path and the pre-s6a `actaPrefill` skeleton return. No route, schema, or payload-name change.

### Code commits

| Commit | Subject | Kind |
|---|---|---|
| `f5e1f62` | docs(leagues): correct the acta live-source prefill comment | comment |
| `20a690f` | feat(leagues): complete acta prefill from the persisted result snapshot | prefill |
| `6ea5e01` | refactor(leagues): move the result draft types into resultPrefill | types |
| `69dcaf6` | feat(leagues): open the acta wizard prefilled on result correction | wiring |

### Completed Tasks

- [x] 6.1 `ResultTeamDraft`/`ResultPlayerDraft`/`ResultCasualtyDraft` moved out of `ResultModal.tsx`
  into `resultPrefill.ts`; every importer repointed; the duplicate `RosterPlayerRef` dropped.
- [x] 6.2 `actaPrefill(snapshot)` maps the persisted `MatchResult.scores` snapshot → wizard state
  (MAW-9); legacy rows open partially prefilled without throwing.
- [x] 6.3 RED → GREEN `actaState.test.ts` (extended / legacy / null); `resultPrefill.test.ts` stays green.

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `features/leagues/acta/actaState.ts` | Modified | Accurate live-source comment; `actaPrefill` snapshot branch + `actionsFromSnapshot`/`teamFromSnapshot` |
| `features/leagues/acta/actaState.test.ts` | Modified | Extended-snapshot, legacy, no-mvp, and `undefined` prefill tests |
| `features/leagues/resultPrefill.ts` | Modified | Now the home of `ResultPlayerDraft`/`ResultCasualtyDraft`/`ResultTeamDraft` |
| `features/leagues/ResultModal.tsx` | Modified | Draft types imported from `resultPrefill.ts`; local `RosterPlayerRef` dropped (imported from `MatchResolveModal`) |
| `features/leagues/ResultModal.test.tsx` | Modified | Imports repointed to the new type homes |
| `features/leagues/LeagueDetail.tsx` | Modified | Type import repointed; CORRECT path opens `MatchActaWizardFor mode="correct"` prefilled; `ResultModalFor` kept (exported) for s6c |
| `features/leagues/LeagueDetail.test.tsx` | Modified | Correct-path test rewritten to assert the wizard + persisted-snapshot prefill |

### COMMENT_CORRECTION

My reading **matched** the orchestrator's. The old comment claimed "the live draft carries no casualty
VICTIM", which is true of `buildResultPrefill`'s `ResultTeamDraft` (per-player casualty COUNT only) but
false of the raw live source. Verified against `app/api/.../live/route.ts` `recordCasualty`: the
persisted casualty event payload carries `victimRosterId`, optional `causerRosterId`, `roll16`,
optional `roll6`, `band`, and `permanentAttribute`; `LiveMatchView` exposes `mvpGrantees`. The
corrected comment now states the limitation belongs to the DRAFT, not the live source, and that
`buildResultPrefill` discards every non-`td` event.

### PREFILL_MAPPING

**Populated** from the persisted snapshot (same-side unless noted):

| Snapshot key | Wizard field |
|---|---|
| `home/away.score` | `draft.score` |
| `home/away.neverHeld` | `draft.neverHeld` (`?? false`) |
| `home/away.ff` | `draft.ff` (only when non-null) |
| `home/away.fanRoll` | `draft.fanRoll` (`?? null`) |
| `home/away.inducements.budget` | `draft.inducements` (`?? 0`) |
| top-level `mvp.home`/`mvp.away` | `draft.mvpGrantee` (`?? ""`) |
| top-level `duration` | `state.duration` |
| `home/away.actions` (non-casualty counts) | `ActaActionLine[]` (td/completion/interception/foul/throwTeamMate/landedSafe) |
| **opponent** `casualties` + own `actions[].casualties` | casualty lines (victim bound to the reconstructed causer) |
| **opponent** `injuryRoll` / `permanentRoll` | `draft.injuryRoll` / `draft.permanentRoll` (transposed — see below) |

**Transposition (non-obvious):** the snapshot groups `casualties`/`injuryRoll`/`permanentRoll` by the
**VICTIM's** side (`route.ts` `side[victim.team].injuryRoll.push(...)`), while the wizard stores the
rolls on the **CAUSING** draft (`bajasPlan.ts`). `teamFromSnapshot` therefore reads the OPPONENT's
arrays. Verified by the route test's own comment: "Victims are grouped by the VICTIM's team".

**Genuinely absent — left unset (not invented):**

- `weather` — it is a `MatchResult` **column**, not inside `scores`; the prefill source is the snapshot,
  so the wizard keeps its `"Perfecto"` default. (Passing `result.weather` would be a follow-up.)
- The casualty **causer↔victim pairing** — the snapshot never persists which causer hit which victim.
  The victim set, per-player casualty counts (PE) and roll alignment ARE preserved exactly; the pairing
  is reconstructed from `actions[].casualties` counts in recorded victim order.
- **Legacy rows (no `actions`)** — no causer counts exist, so action lines, casualty lines and rolls are
  all left empty. Score, `neverHeld`, `mvp`, and any present `ff`/`fanRoll`/`duration` still prefill.
  NOTE: the design's "legacy → score + resolved-casualty identity + `mvp`" is only partially
  achievable — the victims exist in `scores.<side>.casualties`, but the wizard's casualty line requires
  a causer, so a legacy row cannot render them in the Bajas step. Recorded as an issue below.

### TYPE_MOVE

- `ResultPlayerDraft`, `ResultCasualtyDraft`, `ResultTeamDraft` now live in
  `features/leagues/resultPrefill.ts`.
- Importers: `ResultModal.tsx` (`ResultPlayerDraft`, `ResultTeamDraft`), `acta/actaState.ts`
  (`ResultTeamDraft`), `LeagueDetail.tsx` (`ResultTeamDraft`), `ResultModal.test.tsx`
  (`ResultTeamDraft`).
- `RosterPlayerRef`: the local `{ id, name }` in `ResultModal.tsx` was a structural subset of
  `MatchResolveModal.tsx`'s `{ id, name, dorsal?, positionalKey?, journeyman? }`. Dropped; `ResultModal.tsx`
  and `ResultModal.test.tsx` now import it from `./MatchResolveModal`. NOTE: the task called this a
  "re-export"; it was actually a separate local definition, but the dedup is safe (ResultModal only
  reads `id`/`name`, both present on the superset).
- `ResultModal.tsx` was NOT deleted (s6c owns retirement).

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 6.2/6.3 (prefill) | `actaState.test.ts` | Unit | ✅ 9/9 | ✅ Extended-snapshot test written first → **1 failed / 11 passed** (`fanRoll` null, expected 4) | ✅ **12/12 passed** | ✅ legacy + no-`mvp` + `undefined` cases | ✅ Helpers extracted (`actionsFromSnapshot`/`teamFromSnapshot`) |
| 6.4 (wiring) | `LeagueDetail.test.tsx` | Component | ✅ 30/31 | ✅ Correct-path test rewritten first → **1 failed / 30 passed** ("Corregir acta del partido" not found) | ✅ **31/31 passed** | ✅ Step 0 FF + Step 1 scores both asserted | ✅ None needed |
| 6.1 (types) | — | Compile | ✅ `tsc --noEmit` + 118 focused tests | ✅ Type move verified by `tsc` + the existing suites (no new behavior) | ✅ Green | ✅ `ResultModal.test.tsx` + `resultPrefill.test.ts` stay green | ✅ Duplicate `RosterPlayerRef` removed |

- **Total tests written**: 4 (3 unit prefill + 1 rewritten component); all green.
- **Layers used**: Unit (3), Component (1), E2E (0 — s6d/s6e own it).
- **Pure functions created**: 2 (`actionsFromSnapshot`, `teamFromSnapshot`; both pure).

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues/acta` → **9 files, 66 passed**; `pnpm exec vitest run features/leagues` → **41 files, 634 passed** |
| Runtime harness command/scenario and exact result | `pnpm test` → **189 files, 2758 passed** (jsdom + route tests; the wizard's correct-mode prefill is exercised through `LeagueDetail.test.tsx` with a mocked `getMatchDetail`) |
| Rollback boundary | Revert `f5e1f62`, `20a690f`, `6ea5e01`, `69dcaf6`; `ResultModal` correct path + pre-s6a `actaPrefill` skeleton return. No route/schema dependency. |

### Verification (exact commands / observed results)

- `pnpm exec vitest run features/leagues/acta` → **9 files, 66 passed**
- `pnpm exec vitest run features/leagues` → **41 files, 634 passed**
- `pnpm test` → **189 files, 2758 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Changed Lines

| Commit | Added | Removed | Total |
|---|---|---|---|
| `f5e1f62` (comment) | 10 | 4 | 14 |
| `20a690f` (prefill) | 253 | 18 | 271 |
| `6ea5e01` (types) | 42 | 45 | 87 |
| `69dcaf6` (wiring) | 58 | 50 | 108 |
| **Total (code)** | **363** | **117** | **480** |

**480 changed lines vs the ~350 target (1.37×) and the ~290 s6a estimate (1.66×)** — over the
400-line review budget. The overage is test-dominated (≈220 of the 480 lines are test code); the
implementation was not minified. Recommendation: `size:exception` for the s6a stacked PR, OR let the
orchestrator split the PR (prefill = `f5e1f62`+`20a690f`; types+wiring = `6ea5e01`+`69dcaf6`).

### Deviations from Design

- The design's File Changes table is followed; there is **no "F7" block** in
  `openspec/changes/match-edit-redesign/design.md` on the docs branch (grepped). The type-move
  instruction comes from task 6.1 + the File Changes table, and is implemented as described.
- `actaPrefill`'s weather is NOT prefilled: `weather` is a `MatchResult` column, not a `scores` key,
  and the task scopes prefill to "the persisted `MatchResult.scores`". Left default; noted above.
- Casualty lines are reconstructed with a deterministic causer attribution because the causer↔victim
  pairing is not persisted. Counts/victims/roll alignment are exact; the attribution is the only
  reconstructed part and is documented in `actionsFromSnapshot`.

### Issues Found (s6a)

- **Legacy casualty identity is not renderable** (recorded, NOT invented): the design's legacy prefill
  claim ("score + resolved-casualty identity + `mvp`") cannot fully hold — without `actions` there is no
  causer to bind a wizard casualty line to, so `scores.<side>.casualties` cannot surface in the Bajas
  step. The victims remain in the snapshot for the summary/audit; only the wizard's derived list is empty.
- `ResultModalFor` is now unused by the render tree and was **exported** to keep it present and
  compiling without an unused-symbol lint error (s6c deletes it). `pnpm lint` stays clean.
- The e2e suite is knowingly red on this chain (s6d/s6e own it); `pnpm test` is the gate and is green.

## Slice s6a — corrective pass (post-verify, bounded)

Independent verification PASSED s6a but flagged two issues; this bounded pass fixes exactly those two.
No re-architecture: `ResultModal.tsx` stays untouched (s6c retires it), the result route,
`MatchResolveModal.tsx`, `ForfeitModal.tsx`, `ResetLiveMatchModal.tsx`, `lib/liveStore.ts` and
`lib/rules/*` are untouched, no payload field name changed, and the wizard's dialog a11y / save-block /
submit-error surface are preserved.

- **Branch**: `feat/match-edit-redesign-s6a`
- **Mode**: Strict TDD (RED → GREEN) — a failing test FIRST for BOTH fixes.
- **Code commits**: `ad8c3ff` (FIX-A), `cb90805` (FIX-B).

### FIX-A (medium) — `weather` is prefilled on correction

- **Defect**: `actaPrefill` received only `match.result.scores`, which carries no weather, so
  `emptyActaState()`'s "Perfecto" default survived. `buildActaPayload` ALWAYS sends `weather` and the
  PUT ALWAYS writes it, so correcting a "Lluvioso" match without touching the Clima select silently
  rewrote the persisted weather to the default.
- **Fix**: `actaPrefill` gains an optional second parameter `weather?: string | null`; the snapshot
  branch populates `ActaState.weather` from it (`weather ?? base.weather`). The correct-mode call site
  passes `match.result.weather`. The load-path branch and every existing caller are unchanged.
- **Files**: `features/leagues/acta/actaState.ts` (signature + doc), `features/leagues/LeagueDetail.tsx`
  (call site).
- **Tests**: `actaState.test.ts` "prefills the persisted result weather…"; `LeagueDetail.test.tsx`
  correct-path test now asserts the `Clima` select value is "Lluvioso".

### SIGNATURE_CHOICE (FIX-A)

I extended `actaPrefill` with an **optional second positional parameter** rather than widening the
source union (e.g. a `{ scores, weather }` wrapper). Why: `weather` is a `MatchResult` COLUMN living
next to `scores`, not inside it, and the source union (`MatchScoreboard | ActaLoadPrefill`) is the
load-path contract. A wrapper would have changed the shape for BOTH callers and every test, while an
optional second argument leaves the existing signature contract byte-for-byte compatible (all current
callers compile untouched), keeps the load path free of a field it cannot supply, and needs one call
site edit. Least invasive, no double meaning.

### FIX-B (data-loss guard, maintainer-approved) — warn when a legacy acta's casualties cannot be rebuilt

- **Defect**: a legacy result row persists `casualties` but no `actions`. The wizard's model needs a
  causer per casualty line, so `actaPrefill` cannot reconstruct them and the Bajas step opened EMPTY.
  Saving without re-entering them sends `casualties: []`, clearing the persisted casualties and — via
  `persistCasualtyOutcomes` and the clear-then-reflag suspensions block — silently clearing served
  suspensions without re-flagging the original lasting victims.
- **Fix (maintainer chose: visible warning, do NOT block saving)**:
  1. `ActaState` gains an explicit, documented, display-only marker `casualtiesUnrecoverable?: boolean`
     (NOT an overload of an existing field). It is absent/false for a normal extended snapshot and is
     never sent in the payload.
  2. `hasUnrecoverableCasualties(own, opponent)` detects it: the opponent side carries victims but the
     causing side's `actions` has no row crediting a casualty. `actaPrefill` sets the marker from both
     sides.
  3. `StepBajas` renders a visible `role="alert"` in neutral professional Spanish when the marker is
     set; it does not disable or block the save button.
- **Files**: `features/leagues/acta/actaState.ts` (marker + detection), `features/leagues/acta/StepBajas.tsx`
  (warning).
- **Tests**: see WARNING_PROOF below.

### WARNING_PROOF (FIX-B)

| Assertion | Test | Exact result |
|---|---|---|
| Marker set for a legacy snapshot with victims and no `actions` | `actaState.test.ts` "flags unreconstructable casualties…" | `prefill.casualtiesUnrecoverable === true` |
| Marker clear for an extended snapshot whose actions attribute every casualty | `actaState.test.ts` "does not flag an extended snapshot…" | `false` |
| Marker clear with no persisted casualties | `actaState.test.ts` "does not flag a snapshot with no persisted casualties" | `false` |
| Warning renders for the legacy snapshot (via `actaPrefill`) | `StepBajas.test.tsx` "warns that a legacy acta has no stored actions…" | `role="alert"` text matches `/acciones guardadas/i` and `/borrarán las bajas/i` |
| Warning ABSENT for a normal extended snapshot | `StepBajas.test.tsx` "does not warn for a normal extended acta…" | `queryByRole("alert") === null` |
| Saving still possible with the warning present | `MatchActaWizard.test.tsx` "keeps the save enabled when the legacy-casualties warning is present" | step 4 shows the warning, step 6 "Guardar acta" `disabled === false` and `onSubmit` fires |

The warning uses `role="alert"` (the brief allowed `role="status"` or `role="alert"`); `role="status"`
collided with the test Harness's implicit `role="status"` `<output>` and is a weaker association for a
data-loss warning.

### TDD Cycle Evidence (s6a corrective)

| Fix | Test File | Layer | RED (test written first) | GREEN |
|-----|-----------|-------|--------------------------|-------|
| FIX-A | `actaState.test.ts`, `LeagueDetail.test.tsx` | Unit + Integration (jsdom) | ✅ `expected 'Perfecto' to be 'Lluvioso'` (2 failed / 43 passed) | ✅ 45/45 passed |
| FIX-B | `actaState.test.ts`, `StepBajas.test.tsx`, `MatchActaWizard.test.tsx` | Unit + Component (jsdom) | ✅ 5 failed / 40 passed — marker `undefined`, warning `Unable to find role "alert"` | ✅ 45/45 passed |

### Work Unit Evidence (s6a corrective)

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues/acta` → **9 files, 74 passed**; `pnpm exec vitest run features/leagues` → **41 files, 642 passed** |
| Runtime harness command/scenario and exact result | `pnpm test` → **189 files, 2766 passed** (jsdom: the wizard opens the correct-mode Clima select and Step 4 renders the warning) |
| Rollback boundary | Revert `ad8c3ff` (weather prefill) and/or `cb90805` (legacy-casualties warning); the s6a commits are restored. No route/schema/payload-name change. |

### Verification (s6a corrective — exact commands / observed results)

- `pnpm exec vitest run features/leagues/acta` → **9 files, 74 passed**
- `pnpm exec vitest run features/leagues` → **41 files, 642 passed**
- `pnpm test` → **189 files, 2766 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Changed Lines (s6a corrective)

- FIX-A (`ad8c3ff`): `added=28 removed=2 total=30`.
- FIX-B (`cb90805`): `added=169 removed=1 total=170`.
- **Total: `added=197 removed=3 total=200`** — under the 400-line budget.

### Deviations from Design

- None material. FIX-B adds one display-only `ActaState` marker (the design did not specify a warning;
  the maintainer approved it in this bounded pass). FIX-A threads the `MatchResult.weather` column that
  the s6a "Issues Found" note had recorded as a follow-up.

### Issues Found (s6a corrective)

- The s6a "Issues Found" note said the legacy casualty identity was "not renderable" and left the
  data-loss path silent. FIX-B closes the silent data loss with a visible, non-blocking warning; the
  casualties are still not reconstructable (the causer↔victim link is not persisted), so re-entry is
  required — now explicit to the coach.

## Slice s6b — `acta.*` i18n keys ES+EN (task 6.4)

- **Branch**: `feat/match-edit-redesign-s6b`
- **Mode**: Strict TDD (RED → GREEN). The slice is a mechanical copy extraction, so the cycle is:
  confirm the existing suite pins the exact Spanish labels → add ONE new test proving the wizard
  renders from the active locale (RED, because the copy was hardcoded) → move the copy → GREEN.
- **Chain strategy**: `stacked-to-main`
- **Boundary**: starts from `feat/match-edit-redesign-s6a`; ends with the wizard's copy sourced from
  `lib/i18n/dictionaries.ts`. No payload/behaviour/visual change; `ResultModal` untouched (s6c).
- **Rollback boundary**: revert `18d52cf` (keys) and/or `2314963` (wiring). Reverting both restores
  the hardcoded Spanish literals; no payload, route, schema or a11y change is involved.

### Completed Tasks

- [x] 6.4 (s6b) Add `acta.*` keys to `lib/i18n/dictionaries.ts` (ES + EN) and wire the wizard + its
  seven steps to `useI18n()`. **Deviation from the task text**: the task said to reword
  `result.heldBall` → "Nunca tuvo el balón". That was NOT done — see `LEGACY_NOTE` below.

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `lib/i18n/dictionaries.ts` | Modified | +87 `acta.*` keys per locale (ES + EN), 174 definitions |
| `features/leagues/MatchActaWizard.tsx` | Modified | Step labels/titles/nav/buttons/submit-error via `t` |
| `features/leagues/acta/StepContexto.tsx` | Modified | Weather/duration/FF/inducements/never-held labels via `t` |
| `features/leagues/acta/StepAcciones.tsx` | Modified | Action kinds, line labels, tally, "uncounted" hint via `t` |
| `features/leagues/acta/StepMvp.tsx` | Modified | MVP note + radio aria-labels via `t` |
| `features/leagues/acta/StepBajas.tsx` | Modified | Band labels, warning, intro, rolls, "Baja sobre" via `t` |
| `features/leagues/acta/StepFinal.tsx` | Modified | Intro/formula, breakdown labels, fan roll, gold unit via `t` |
| `features/leagues/acta/StepRevisar.tsx` | Modified | Summary + validation; `validateActa` returns error keys, pure helpers take `t` |
| `features/leagues/acta/MatchActaWizard.test.tsx` | Modified | +1 test: the wizard renders its copy from the active locale (s6b) |

### KEY_INVENTORY

87 keys per locale, grouped: `acta.title.*` (2), `acta.nav`/`acta.close`/`acta.back`/`acta.next`/
`acta.save`/`acta.saveError`/`acta.gold` (7), `acta.step.*` (7), `acta.contexto.*` (6),
`acta.neverHeld` (1), `acta.accion.*` (7), `acta.acciones.*` (11), `acta.mvp.*` (4), `acta.band.*` (5),
`acta.bajas.*` (8), `acta.final.*` (9), `acta.revisar.*` (18), `acta.validate.*` (2).

**Byte-identity**: every `es` value is copied verbatim from the literal it replaced (no wording
changes). The existing component/e2e assertions that pin "Acta del partido", "Más acciones"→
"Guardar acta", "Factor fan", "NUNCA tuvo el balón", the validation messages and the legacy-casualties
warning all remain green (see Verification). The `en` values are new, neutral-professional English.

**Pure-helper constraint honoured**: `validateActa` is hook-free, so it now returns structured
`ActaValidationError { key, params }` and `StepRevisar` translates at render (no dictionary reach-in).
`describeLine`/`describeCasualty` (StepRevisar) and `formatGold`/`formatWinnings` take the resolved
translator / unit as parameters, matching the repo's `authorDisplay(proposal, t)` precedent.

**Intentionally NOT keyed**: locale-invariant tokens — `vs` (StepMarcador separator, same convention as
`negotiation.title`), `✕`, `★`, `Σ`, `→`, `×`, `—`, `1D16`, `1D6`, `M.O.`-grouping separator, and the
`ACTA_WEATHER_OPTIONS` values (data, not copy). `StepMarcador.tsx` therefore needed no edit.

### LEGACY_NOTE — `result.heldBall` is UNCHANGED

`result.heldBall` remains **"Mantuvo el balón" (es) / "Held the ball" (en)**. The legacy
`ResultModal.tsx` checkbox genuinely means "held the ball", so rewording that key would put inverted
semantics on the legacy modal's label. The wizard's checkbox means the INVERSE ("NUNCA tuvo el balón")
and owns the new `acta.neverHeld` key. **s6c MUST remove `result.heldBall` together with
`ResultModal.tsx`** — do not reword it in place before the retirement.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | REFACTOR |
|------|-----------|-------|------------|-----|-------|----------|
| 6.4 | `features/leagues/acta/MatchActaWizard.test.tsx` | Component (jsdom) | ✅ 41 files / 642 passed (baseline) | ✅ Written first: `aria-label` was `"Acta del partido"`, expected `"Match report"` under an `I18nProvider initialLocale="en"` | ✅ 41 files / 643 passed | ✅ Clean |

- **RED evidence**: `MatchActaWizard shell > renders its copy from the active locale, not hardcoded
  literals (s6b)` failed with `expected 'Acta del partido' to be 'Match report'` before the wiring.
- The existing label-pinning suite (StepContexto/Marcador/Acciones/Mvp/Bajas/Final/Revisar tests) was
  confirmed green BEFORE the move and again after — that is the byte-identity safety net.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues/acta features/leagues/MatchActaWizard.test.tsx lib/i18n` → **12 files, 109 passed** (incl. the RED→GREEN s6b test and the es/en key-sync test) |
| Runtime harness command/scenario and exact result | `pnpm exec vitest run features/leagues` → **41 files, 643 passed** (jsdom: the wizard renders, steps navigate, submit block holds). E2E is knowingly red on this chain (s6d/s6e own it). |
| Rollback boundary | Revert `18d52cf` (dictionary keys) and/or `2314963` (component wiring); the hardcoded Spanish literals return. No payload name, route, schema or a11y change. |

### Verification (s6b — exact commands / observed results)

- `pnpm exec vitest run features/leagues` → **41 files, 643 passed**
- `pnpm test` → **189 files, 2767 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Changed Lines (s6b)

- Keys `18d52cf`: `added=195 removed=0 total=195`.
- Wiring `2314963`: `added=241 removed=171 total=412`.
- **Total: `added=436 removed=171 total=607`** — **over the ~200 target** (the tasks.md slice
  forecast was ~120; the real cost is 87 keys × 2 locales + 7 component wirings). This is a
  `size:exception` recommendation: the dictionary keys and the wiring are separate commits so the
  orchestrator can split the PR if needed. No diff was minified to hit a number.

### Deviations from Design

- Design says "Spanish copy via `acta.*` keys" and the task said to reword `result.heldBall`. The
  reword is a design defect (it would invert the legacy modal's label); `acta.neverHeld` was added
  instead and `result.heldBall` is left for s6c to delete. Recorded in `LEGACY_NOTE`.
- `validateActa` now returns structured error keys instead of pre-rendered strings, so the pure
  validator stays hook-free without reaching into the dictionary. The rendered output is identical.

### Issues Found (s6b)

- None functional. Note for s6c: `result.heldBall` is still referenced only by `ResultModal.tsx`;
  delete both together.

## Slice s6b — corrective pass (post-verify)

Independent verification FAILED s6b with ONE blocking defect: the weather LABELS were left hardcoded
Spanish. Under an English locale, `StepContexto` rendered the option labels from the
`ACTA_WEATHER_OPTIONS` values verbatim (`Perfecto`, `Calor asfixiante`, `Muy soleado`, `Lluvioso`,
`Ventisca`) and `StepRevisar` rendered `{state.weather}` raw — even though the shell, the `Clima` /
`Weather` label and every other string already resolved through `useI18n()`. The repo already solved
this for the summary: `lib/i18n/dictionaries.ts` carries `match.weather.perfect|heat|sunny|rain|
blizzard` in both locales and `features/leagues/matchSummary.ts` exports `weatherLabel(kind, fn)`.
The wizard was the outlier.

### FIXES_APPLIED

| File | Line | Change |
|------|------|--------|
| `features/leagues/acta/actaState.ts` | 103 | Add `WEATHER_KIND_BY_VALUE`: canonical persisted value → BB2025 kind (`Perfecto→perfect`, `Calor asfixiante→heat`, `Muy soleado→sunny`, `Lluvioso→rain`, `Ventisca→blizzard`). |
| `features/leagues/acta/actaState.ts` | 118 | Add `weatherOptionLabel(value, t)`: boundary adapter — looks up the kind and delegates to the EXISTING `weatherLabel(kind, t)`; an unknown/legacy value passes through unchanged (mirrors `weatherLabel`'s default). |
| `features/leagues/acta/StepContexto.tsx` | 56 | Render `{weatherOptionLabel(weather, t)}` as the option LABEL. The `<option value={weather}>` (L55) is unchanged. |
| `features/leagues/acta/StepRevisar.tsx` | 218 | Render `{weatherOptionLabel(state.weather, t)}` instead of the raw `{state.weather}`. |
| `features/leagues/MatchActaWizard.tsx` | 58–59 | Fix the stale comment that called the dialog "the Spanish 'Acta del partido' shell" — its copy is localized through `useI18n()`. |
| `features/leagues/acta/StepContexto.test.tsx` | new | Step-level locale test (RED → GREEN): the weather option labels follow the active locale while the option VALUES stay canonical. |
| `features/leagues/acta/StepRevisar.test.tsx` | new case | English-provider assertion that the Revisar weather label is `Perfect`, never `Perfecto`. |

**Approach chosen (boundary mapping, not a re-canonicalization)**: the wizard's option values and the
`MatchResult.weather` column are the canonical Spanish strings, while `weatherLabel` expects the
locale-independent `WeatherKind` codes (`heat|sunny|perfect|rain|blizzard`). Rather than translate the
stored value or change either side's canonical vocabulary, a small value→kind map lives in
`actaState.ts` (the single wizard-state home) and `weatherOptionLabel` adapts at render time.

### VALUE_VS_LABEL — the persisted value is unchanged

- `ACTA_WEATHER_OPTIONS` still holds the canonical Spanish strings (`actaState.ts` L87–93) and is
  untouched.
- `buildActaPayload` still emits `weather: state.weather` (`actaState.ts` L238) — the raw canonical
  value, byte-for-byte.
- `StepContexto`'s `<option value={weather}>` is unchanged (`StepContexto.tsx` L55): only the option
  *text* is localized.
- The route persists the received string verbatim (`app/api/.../result/route.ts` L581/L895,
  `weather: typeof raw.weather === "string" ? raw.weather : null`) and was NOT modified.
- New test proof: under BOTH locales the assertion
  `expect(optionValues(select)).toEqual([...ACTA_WEATHER_OPTIONS])` passes — the values stay
  `Perfecto · Calor asfixiante · Muy soleado · Lluvioso · Ventisca` while the labels become
  `Perfect · Scorching heat · Very sunny · Rainy · Blizzard` (en) / the canonical Spanish (es).

### TDD Cycle Evidence (s6b corrective)

| Task | Test File | Layer | Safety Net | RED | GREEN | REFACTOR |
|------|-----------|-------|------------|-----|-------|----------|
| 6.4a | `features/leagues/acta/StepContexto.test.tsx` | Component (jsdom) | ✅ 41 files / 643 passed (pre-fix baseline) | ✅ Written FIRST: under `I18nProvider initialLocale="en"` the option texts were `['Perfecto', 'Calor asfixiante', 'Muy soleado', 'Lluvioso', 'Ventisca']`, expected `['Perfect', 'Scorching heat', 'Very sunny', 'Rainy', 'Blizzard']` | ✅ 10 files / 78 passed (`features/leagues/acta`) | ✅ Clean |
| 6.4b | `features/leagues/acta/StepRevisar.test.tsx` (new case) | Component (jsdom) | ✅ same baseline | ✅ Same defect class at the Revisar render site (raw `{state.weather}`) | ✅ 10 files / 78 passed | ✅ Clean |

- **RED_PROOF (exact assertion)**: `StepContexto — weather locale (s6b corrective) > renders the
  English weather labels under an English provider, keeping the persisted values` failed with
  `expected [ Array(5) ] to deeply equal [ 'Perfect', 'Scorching heat', …(3) ]`; the received array
  was `['Perfecto', 'Calor asfixiante', 'Muy soleado', 'Lluvioso', 'Ventisca']`. The `Weather` label
  itself already resolved English (s6b wiring), which is exactly why the hardcoded option labels were
  the outlier.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues/acta` → **10 files, 78 passed** |
| Runtime harness command/scenario and exact result | `pnpm exec vitest run features/leagues` → **42 files, 646 passed** (jsdom: the wizard renders the Contexto select and the Revisar summary end-to-end). E2E is knowingly red on this chain (s6d/s6e own it). |
| Rollback boundary | Revert `1ce1e09` (or the four production files + two test files): the hardcoded Spanish labels return. No payload name, route, schema, persisted value or a11y change. |

### Verification (s6b corrective — exact commands / observed results)

- `pnpm exec vitest run features/leagues/acta` → **10 files, 78 passed**
- `pnpm exec vitest run features/leagues` → **42 files, 646 passed**
- `pnpm test` → **190 files, 2770 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Commits (s6b corrective)

- Code: `1ce1e09` — `fix(leagues): localize the acta wizard weather labels`
- Bookkeeping: `docs(match-edit-redesign): record s6b corrective pass` (this file + `tasks.md`)

### Changed Lines (s6b corrective)

- Code-only (production): **43** (`added=39 removed=4`) — `actaState.ts` 28, `StepContexto.tsx` 9,
  `StepRevisar.tsx` 3, `MatchActaWizard.tsx` 3.
- Tests: **86** (`added=86 removed=0`) — `StepContexto.test.tsx` 67, `StepRevisar.test.tsx` 19.
- **Total: `added=125 removed=4 total=129`** — well under the 400-line review budget.

### Deviations from Design

- None. The fix reuses the existing `weatherLabel` helper + `match.weather.*` keys exactly as the
  verifier prescribed; the canonical value vocabulary on both sides is unchanged.

### Issues Found (s6b corrective)

- `matchSummary.buildWeather` calls `weatherLabel(result.weather)` with the RAW persisted value. For a
  wizard-saved match the persisted value is the Spanish canonical string (e.g. `Perfecto`), which
  `weatherLabel` does not recognize as a kind and returns verbatim — so the match SUMMARY weather may
  also render Spanish under an English locale. Out of this corrective's scope (the defect was the
  wizard labels); recorded here for the orchestrator to route.

## Slice s6c — retire the legacy result modal (tasks 6.5/6.6)

- **Branch**: `feat/match-edit-redesign-s6c`
- **Mode**: Strict TDD, deletion variant. The slice removes dead code, so the cycle is: establish the
  green baseline → delete → prove the suite is STILL green (and delete the test whose only subject was
  `ResultModal`). There is no meaningful RED for a deletion: no new behaviour is introduced, and
  fabricating a failing test would be dishonest. The pre-deletion green run is the baseline.
- **Chain strategy**: `stacked-to-main` (s6c stacked on s6b)
- **Boundary**: starts from `feat/match-edit-redesign-s6b`; ends with `ResultModal.tsx` +
  `ResultModal.test.tsx` deleted, `ResultModalFor` removed from `LeagueDetail.tsx`, the dead
  `result.*` keys removed from BOTH locales, and every importer repointed/retired. e2e untouched.
- **Rollback boundary**: revert commit `7ba269c` — restores `ResultModal.tsx`, `ResultModal.test.tsx`,
  the `ResultModalFor` export, the `ResultModal` import and the deleted dictionary keys. No payload,
  route, schema, a11y or wizard behaviour is involved, so the rollback cannot remove unrelated work.

### Completed Tasks

- [x] 6.5 (s6c) Delete `features/leagues/ResultModal.tsx` + `ResultModal.test.tsx`; remove the
  `ResultModalFor` export and every reference from `LeagueDetail.tsx` (import + dead state type).
- [x] 6.6 (s6c) Retire `ResultModal.test.tsx` (16 tests) with the component; the sibling component
  tests (`MatchCard`, `LeagueDetail`, `ForfeitModal`, `resultPrefill`) already moved to the wizard in
  s4b/s4c and stay green unchanged.

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `features/leagues/ResultModal.tsx` | Deleted | 426 lines — the legacy modal + `buildResultPayload`/`sumDraftedTds`/`ResultModalProps` |
| `features/leagues/ResultModal.test.tsx` | Deleted | 363 lines — the only test whose subject was `ResultModal` |
| `features/leagues/LeagueDetail.tsx` | Modified | Removed the `ResultModal` import, the `ResultTeamDraft` type import, and the dead exported `ResultModalFor`; refreshed stale comments |
| `features/leagues/MatchCard.tsx` | Modified | Comments only: `onLoadResult`/`onCorrectResult` now name the acta wizard |
| `features/leagues/resultPrefill.ts` | Modified | Comment only: the moved draft types no longer claim a live `ResultModal.tsx` |
| `lib/i18n/dictionaries.ts` | Modified | Removed 26 dead `result.*` keys from ES + EN (52 definitions); kept `result.correctAction` + the 3 server-error keys |

### KEYS_REMOVED (26 keys, both locales)

Deleted only after `rg -l "result.<key>" features app components lib e2e stories` returned **0 files**
outside `lib/i18n/dictionaries.ts` and the deleted `ResultModal.*` (the only pre-deletion consumer).

`result.loadTitle`, `result.correctTitle`, `result.loadAction`, `result.saveAction`, `result.header`,
`result.close`, `result.local`, `result.visitor`, `result.sumMismatch`, `result.mvpExactlySix`,
`result.section`, `result.goals`, **`result.heldBall`**, `result.mvpSlot`, `result.mvpNote`,
`result.victims`, `result.victimSlot`, `result.homeTeam`, `result.awayTeam`, `result.action.tds`,
`result.action.casualties`, `result.action.completions`, `result.action.interceptions`,
`result.action.fouls`, `result.action.throwTeamMates`, `result.action.landedSafe`.

- **`result.heldBall`** was deleted (never reworded), per task 6.5 and the s6b `LEGACY_NOTE`. Its only
  consumer was `ResultModal.tsx`; the wizard owns `acta.neverHeld`. Grep evidence:
  `rg -l "result\.heldBall" features app components lib e2e stories` → only
  `lib/i18n/dictionaries.ts` + the deleted `ResultModal.tsx` → **0 remaining consumers**.
- `result.local` / `result.header` per-key greps are false-positive-safe: the raw `rg "result\.local"`
  also matches `result.locale`, and `rg "result\.header"` matches `result.headers` — both checked and
  excluded (the real keys had no consumer).

### KEYS_KEPT

| Key | Consumer | Evidence |
|-----|----------|----------|
| `result.correctAction` | `features/leagues/MatchCard.tsx:186` | The `···` overflow "Corregir resultado" item — the "action label still used elsewhere" the brief warns about. |
| `result.server.alreadyPlayed` | *(none found)* | The brief explicitly says the server-error keys MUST stay, so they are kept. Evidence: the only pre-deletion consumer was `ResultModal.tsx:72-74`; the wizard surfaces submit failures through `acta.saveError` (`MatchActaWizard.tsx:320`), so after retirement these three keys have **zero remaining consumers**. Flagged: the brief's premise ("still used elsewhere") does not hold for them. |
| `result.server.forbidden` | *(none found)* | same as above |
| `result.server.saveError` | *(none found)* | same as above |

### IMPORTERS

- `features/leagues/LeagueDetail.tsx` — removed `import { ResultModal } from "./ResultModal"`, dropped
  the now-unused `type ResultTeamDraft` import (kept `buildResultPrefill`, still used by
  `MatchActaWizardFor`), and deleted the exported `ResultModalFor` wrapper (its only callers were the
  two branches that s6a had already moved onto `MatchActaWizardFor`).
- `features/leagues/resultPrefill.ts` — confirmed it imports only `./api`; it never imported
  `ResultModal`. Its `ResultTeamDraft`/`ResultPlayerDraft`/`ResultCasualtyDraft` remain and are still
  consumed by `resultPrefill.ts` itself + `acta/actaState.ts`.
- `features/leagues/MatchCard.tsx` — did not import `ResultModal`; only comments referenced it (updated).
- `features/leagues/api.ts` — never imported `ResultModal`; untouched.
- `stories/` — no story referenced `ResultModal`; untouched.
- **`rg -n "ResultModal" features app components lib e2e stories`** after the change returns only:
  e2e spec comments (untouched by instruction), two historical `LeagueDetail.test.tsx` /
  `route.test.ts` comments, and the new dictionary comments. **No code imports `ResultModal` any more.**

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | REFACTOR |
|------|-----------|-------|------------|-----|-------|----------|
| 6.5/6.6 | `ResultModal.test.tsx` (deleted) | Component (jsdom) | ✅ 190 files / 2770 passed (pre-deletion baseline) | N/A — deletion slice; no new behaviour to drive RED. The pre-deletion green run is the baseline. | ✅ 189 files / 2754 passed (exactly `ResultModal.test.tsx` = 1 file / 16 tests removed) | ✅ Clean |

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues` → **41 files, 630 passed**; `pnpm exec vitest run lib/i18n` → **3 files, 34 passed** (es/en key parity) |
| Runtime harness command/scenario and exact result | `pnpm test` → **189 files, 2754 passed** (the wizard render/nav/submit-block integration suite in jsdom). E2E is knowingly red on this chain (s6d/s6e own it); not run. |
| Rollback boundary | Revert `7ba269c`: `ResultModal.tsx` + `ResultModal.test.tsx` return, `ResultModalFor`/import return, the 26×2 keys return. Nothing else in the chain depends on the deletion. |

### Verification (s6c — exact commands / observed results)

- `pnpm exec vitest run features/leagues` → **41 files, 630 passed**
- `pnpm exec vitest run lib/i18n` → **3 files, 34 passed**
- `pnpm test` → **189 files, 2754 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**
- `git diff HEAD --stat` (code commit) → **6 files changed, 28 insertions(+), 928 deletions(-)**

### Commits (s6c)

- Code: `7ba269c` — `refactor(leagues): retire the legacy result modal`
- Bookkeeping: `docs(match-edit-redesign): record s6c progress` (this file + `tasks.md`)

### Changed Lines (s6c)

- **Code: `added=28 removed=928 total=956`** — deletion-dominated, as forecast (~865). Per-file:
  `ResultModal.tsx` −426, `ResultModal.test.tsx` −363, `dictionaries.ts` −52 key lines + comment edits,
  `LeagueDetail.tsx` −84 net, `MatchCard.tsx` +2/−2, `resultPrefill.ts` +4/−4.
- **`size:exception` accepted by the plan** (tasks.md s6c row + design Slice Plan): the deletion is
  atomic and must not be folded with the s6d/s6e e2e rewrites. No diff was minified.

### Deviations from Design

- None functional. The design's S6 sequence ("retire `ResultModal` last once parity holds") is
  executed here as designed; the moved draft types stay in `resultPrefill.ts` (s6a) and are untouched.
- The `result.server.*` keys were kept despite having no consumer, because the apply brief explicitly
  marks them MUST-stay. Recorded in `KEYS_KEPT` for the verifier to confirm.

### Issues Found (s6c)

- The brief's premise that the `result.server.*` keys are "still used elsewhere" is **not supported by
  evidence** (grep: 0 consumers after `ResultModal` removal). They are now dead keys; kept only to
  honour the explicit MUST-stay instruction. The orchestrator may remove them in a follow-up if the
  instruction was an error.
- No other issues. e2e remains knowingly red on this chain (s6d/s6e).

## Slice s6d — e2e rewrites (match-report + match-view) (task 6.7a)

- **Branch**: `feat/match-edit-redesign-s6d`
- **Mode**: driver rewrite (no product change). The wizard replaced the legacy `ResultModal`
  (s4b/s6c), so the e2e specs that still drove the old flat modal were red; this slice rewrites the
  DRIVER only and keeps every product assertion's intent.
- **Chain strategy**: `stacked-to-main` (s6d stacked on s6c)
- **Boundary**: starts from `feat/match-edit-redesign-s6c`; ends with `e2e/match-report.spec.ts` +
  `e2e/match-view.spec.ts` driving the wizard. No component, route, dictionary or other spec touched.
- **Rollback boundary**: revert commit `69cb69d` — the two specs return to the legacy modal drivers.

### The RED baseline (measured)

`pnpm exec playwright test --config playwright.config.auth.ts e2e/match-report.spec.ts` → **3 failed**,
all on `waiting for getByRole('button', { name: 'Cargar resultado' }).first()` at
`loadResultViaModal` (`e2e/match-report.spec.ts:351`): s4b replaced the four header buttons with ONE
"Acta del partido" primary + a `···` overflow, and s6c deleted `ResultModal`, so the helpers drove a UI
that no longer exists.

### Completed Tasks

- [x] 6.7a (s6d) Rewrite `loadResultViaModal` in both specs to walk the wizard; drive the correction
  through the `···` overflow.

### Label / flow mapping applied (verified against the real components)

| Legacy driver | New driver |
|---|---|
| `Cargar resultado` button | `Acta del partido` primary (`MatchCard.tsx` L310) |
| `Cargar resultado` dialog | `role="dialog"` name `Acta del partido` (`MatchActaWizard` L146) |
| `Corregir resultado` button | `···` trigger `Más acciones` → `menuitem` `Corregir resultado` (`MatchCard.tsx` L186/L276) |
| `Corregir resultado` dialog | `role="dialog"` name `Corregir acta del partido` |
| `Guardar resultado` | `Guardar acta` (`acta.save`, shell L326) |
| `Otorgar victoria` / `Reiniciar partido` | `···` overflow items (`forfeit.title` / `reset.action`) |

### DRIVER_REWRITE — how `loadResultViaModal` drives the wizard

1. Click the primary `Acta del partido`; wait for the `Acta del partido` dialog.
2. **Contexto** → `Siguiente` (defaults are valid: Perfecto weather, no FF).
3. **Marcador** → fill the winner's score input (`getByLabel(winnerTeamName, { exact: true })`) and 0
   for the loser.
4. **Acciones** → inside the winner's `role="region"` (`aria-label` = team name): `Añadir acción ·
   {team}`, select `Jugador 1` = "Player 1", `Cantidad 1` = score. The loser records nothing (0 TDs).
5. **MVP** → `check()` the `MVP · {team} · Player 1` radio for BOTH teams. This is the MVP save-block
   fix: MAW-8 refuses to save unless Σ anotaciones == marcador AND both teams have an MVP, and the
   wizard's `mvp` payload is a single scalar `grantee` (no legacy six-nomination fallback), so a team
   left without an MVP would make the POST 400.
6. **Bajas** → `Siguiente` (no casualties). **Final** → `Siguiente` (fan 1D6 optional).
7. **Revisar** → `Guardar acta`; assert the dialog closes (the shell keeps it open until the async
   POST/PUT resolves).

The correction path (inline in test 2) opens `Más acciones` → `Corregir resultado`, then edits the
PREFILLED wizard (MAW-9): Marcador 1–1; Acciones — drop the home prefill line's `Cantidad 1` from 2 to
1 and add the away Player 1 TD so Σ anotaciones == 1 per side; re-confirm both MVP radios; save.

### ASSERTIONS_KEPT

All product assertions are unchanged in intent. One assertion was inverted because the PRODUCT
genuinely changed:

- `e2e/match-view.spec.ts` — `await expect(admin.getByText(/Clima/)).toBeHidden()` → **`toBeVisible()`**
  (+ `getByText("Perfecto")` visible). The legacy `ResultModal` never sent a weather value, so the
  section was hidden; the wizard's Step 0 ALWAYS persists weather (default "Perfecto"), so a
  wizard-saved result now renders it. This is required by MAW-2, not a weakened assertion.
- `e2e/match-report.spec.ts` — the finished-league check
  `getByRole("button", { name: "Corregir resultado" }).toHaveCount(0)` became the meaningful
  `getByRole("button", { name: "Más acciones" }).toHaveCount(0)` + `getByRole("menuitem", { name:
  "Corregir resultado" }).toHaveCount(0)`: the correction now lives in the overflow, and a finished
  league hides the whole overflow (MAW-1), so this asserts the SAME product outcome ("no correction
  affordance") against the new UI.

### Work Unit Evidence

| Evidence | Value |
|---|---|
| Focused test command and exact result | `pnpm exec playwright test --config playwright.config.auth.ts e2e/match-report.spec.ts e2e/match-view.spec.ts --reporter=line` → **5 passed (28.2s)**; confirmation re-run → **5 passed (26.4s)** |
| Runtime harness command/scenario and exact result | Playwright on real Postgres + `next dev` (AUTH_MODE=auth): load, correction, finished-season, match view and walkover all exercised end-to-end. |
| Rollback boundary | Revert `69cb69d`: the two specs return to the legacy `Cargar resultado`/`ResultModal` drivers. No production code is involved. |

### Verification (s6d — exact commands / observed results)

- `pnpm exec playwright test --config playwright.config.auth.ts e2e/match-report.spec.ts e2e/match-view.spec.ts --reporter=line` → **5 passed (28.2s)** (re-run **5 passed (26.4s)**)
- `pnpm test` → **189 files, 2754 passed**
- `pnpm lint` → **clean (exit 0, no output)**
- `npx tsc --noEmit` → **clean (exit 0, no output)**

### Commits (s6d)

- Code: `69cb69d` — `test(e2e): drive the acta wizard in the match-report and match-view specs`
- Bookkeeping: `docs(match-edit-redesign): record s6d progress` (this file + `tasks.md`)

### Changed Lines (s6d)

- Code-only (the two specs): **`added=164 removed=81 total=245`** — under the 400-line review budget.
  `match-report.spec.ts` +111/−60, `match-view.spec.ts` +53/−21.

### Deviations from Design

- None. The design's "e2e: `loadResultViaModal` helpers rewritten to wizard; correction prefilled;
  overflow entry points" is executed as written.

### Issues Found (s6d)

- `match-view.spec.ts` asserts `Clima` is now VISIBLE (see ASSERTIONS_KEPT) — the weather capture is a
  deliberate product change from MAW-2, not a regression.
- `tasks.md` 6.7 was split into 6.7a (s6d, done) and 6.7b (s6e, pending) so the s6d checkbox is
  honest; s6e owns the remaining three specs.






