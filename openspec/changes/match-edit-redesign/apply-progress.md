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



