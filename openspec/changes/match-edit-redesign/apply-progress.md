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





