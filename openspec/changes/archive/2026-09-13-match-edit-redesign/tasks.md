# Tasks: match-edit-redesign (RAU-122)

> Slice-plan note: `proposal.md` forecast 5 coarse slices and `design.md` first refined them into 6 (S1–S6). S2 then landed at **1,459 changed lines against a ~350 forecast (4.17×)**, so the remaining work was re-forecast into **13 stacked slices** (s3a–s6e). `design.md`'s Slice Plan is authoritative; the proposal's 5-slice forecast and the original S3–S6 estimates are superseded. The completed S1/S2 history below is unchanged.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | S1 ≈380 (actual) · S2 **1,459 actual** (≈350 forecast, 4.17×) · remaining 13 slices **≈3,900** (approved envelope; gross per-slice sum ≈4,340, of which ≈500 is the two low-confidence e2e slices) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | S1 → S2 → s3a → s3b → s3c → s4a → s4b → s4c → s5a → s5b → s6a → s6b → s6c → s6d → s6e (each stacked on the previous) |
| Delivery strategy | stacked-to-main |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Re-forecast rationale

The original S3–S6 estimates were unit-blind and wrong for UI work. Calibration from the S2 diff (1,459 changed lines vs ~350 forecast = **4.17×**; tests were 32% of the total, test/code ratio ≈0.48×) yields these per-unit baselines:

- shell `MatchActaWizard.tsx`: ~250
- simple 5-field step `StepContexto.tsx`: ~168 (~30 lines/field)
- trivial 2-input step `StepMarcador.tsx`: ~62
- dynamic-list step `StepAcciones.tsx`: ~231
- pure state module `actaState.ts`: ~229
- small pure helper `deriveCasualties.ts`: ~49

Structural constraints proven by the S2 diff drive the slicing:

- (a) `MatchActaWizard.tsx` statically imports every step and renders them through an `if/else` chain ending in a placeholder, so **adding a step requires editing the shell AND its test**;
- (b) a step cannot ship before the shell supports it;
- (c) tests must stay with the unit they verify.

A step slice therefore costs step + test + shell branch + shell test, and the remaining plan is 13 slices (s3a–s6e). `s6c` MUST NOT be folded with anything: retiring `ResultModal.tsx` (a large deletion) and rewriting e2e specs are different review concerns. `s3b` is the one slice expected to exceed budget; it splits cleanly into `bajasPlan.ts` (~140) + `StepBajas` + shell (~320).

### Suggested Work Units

| Slice | Goal | Files touched | Focused test command | Runtime harness | Rollback boundary | Est. Δ lines |
|------|------|---------------|----------------------|-----------------|-------------------|---------------|
| S1 | Additive server contract + route | `features/leagues/api.ts`, `lib/result.ts`, `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts`, `lib/result.test.ts`, `route.test.ts` | `pnpm exec vitest run lib/result.test.ts app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` | `AUTH_MODE=local pnpm exec playwright test e2e/match-report.spec.ts` — N/A (ports busy) | revert route + type change; legacy payload still accepted | ≈380 |
| S2 | Wizard shell + Steps 0–2 | `features/leagues/MatchActaWizard.tsx`, `features/leagues/acta/actaState.ts`, `features/leagues/acta/deriveCasualties.ts`, `acta/StepContexto/Marcador/Acciones.tsx`, co-located unit tests | `pnpm exec vitest run features/leagues/acta` | component render — `pnpm exec vitest run features/leagues/acta/MatchActaWizard.test.tsx` (jsdom) | delete `acta/` dir; feature unwired | **1,459 actual** (350 forecast) |
| s3a | `StepMvp` + shell wiring | `features/leagues/acta/StepMvp.tsx`, `features/leagues/MatchActaWizard.tsx` (+ shell test) | `pnpm exec vitest run features/leagues/acta` | `pnpm exec vitest run features/leagues/acta` (jsdom) | delete step + shell branch | ≈310 |
| s3b | `StepBajas` + `bajasPlan` helper + shell wiring | `features/leagues/acta/StepBajas.tsx`, `features/leagues/acta/bajasPlan.ts`, `features/leagues/MatchActaWizard.tsx` (+ tests) | `pnpm exec vitest run features/leagues/acta` | `pnpm exec vitest run features/leagues/acta` (jsdom) | delete files + shell branch | ≈460 — `size:exception` unless split (≈140 helper + ≈320 step) |
| s3c | `StepFinal` + shell wiring (winnings client preview) | `features/leagues/acta/StepFinal.tsx`, `features/leagues/MatchActaWizard.tsx` (+ tests) | `pnpm exec vitest run features/leagues/acta` | `pnpm exec vitest run features/leagues/acta` (jsdom) | delete step + shell branch | ≈370 |
| s4a | `StepRevisar` + shell submit | `features/leagues/acta/StepRevisar.tsx`, `features/leagues/MatchActaWizard.tsx` (+ tests) | `pnpm exec vitest run features/leagues/acta` | `pnpm exec vitest run features/leagues/acta` (jsdom) | delete step + submit wiring | **645 actual** (≈440 forecast, 1.47×) — `size:exception` |
| s4b | `MatchCard` single "Acta del partido" + `···` overflow | `features/leagues/MatchCard.tsx`, `MatchCard.test.tsx` | `pnpm exec vitest run features/leagues/MatchCard.test.tsx` | `pnpm exec vitest run features/leagues` (jsdom) | revert entry point; guards restored 1:1 | ≈245 |
| s4c | `LeagueDetail` wizard wiring + budget-only inducement shape (task 5.4) | `features/leagues/LeagueDetail.tsx`, `LeagueDetail.test.tsx`, `acta/actaState.ts` (`buildActaPayload`), `app/api/.../result/route.ts` (`parseInducements`) | `pnpm exec vitest run features/leagues/LeagueDetail.test.tsx app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` | `pnpm exec vitest run features/leagues` (jsdom) | revert wiring + parse change; `ResultModal` still reachable | ≈310 |
| s5a | PUT recompute + treasury delta + extended snapshot | `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` (PUT), `route.test.ts` | `pnpm exec vitest run app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` | route integration (vitest) | revert PUT change; winnings copy-forward restored | ≈310 |
| s5b | PUT inducement precedence (F1) | `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` (PUT), `route.test.ts` | `pnpm exec vitest run app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` | route integration (vitest) | revert precedence; copy-forward restored | ≈120 |
| s6a | Move result draft types + full `actaPrefill` | `features/leagues/resultPrefill.ts`, `features/leagues/acta/actaState.ts` (+ tests) | `pnpm exec vitest run features/leagues/resultPrefill.test.ts features/leagues/acta` | `pnpm exec vitest run features/leagues` (jsdom) | revert move + prefill | ≈290 |
| s6b | `acta.*` i18n keys ES+EN | `lib/i18n/dictionaries.ts` | `pnpm test` (i18n + `designLock.test.tsx`) | — | revert keys | ≈120 |
| s6c | Retire `ResultModal.tsx` + its test, update imports | `features/leagues/ResultModal.tsx` (delete), `ResultModal.test.tsx` (delete), `LeagueDetail.tsx`, `resultPrefill.ts` | `pnpm test` | — | restore file + imports | ≈865 (deletion-dominated) — `size:exception`; deletion-atomic, do not fold |
| s6d | e2e rewrites (match-report + match-view) | `e2e/match-report.spec.ts`, `e2e/match-view.spec.ts` | `AUTH_MODE=local pnpm exec playwright test e2e/match-report.spec.ts e2e/match-view.spec.ts` | Playwright | revert specs | ≈250 (low confidence) |
| s6e | e2e rewrites (full-league-flow + league-matchday + profile) | `e2e/full-league-flow.spec.ts`, `e2e/league-matchday.spec.ts`, `e2e/profile.spec.ts` | `AUTH_MODE=local pnpm exec playwright test e2e/full-league-flow.spec.ts e2e/league-matchday.spec.ts e2e/profile.spec.ts` | Playwright | revert specs | ≈250 (low confidence) |

## Phase 1 (S1): Server contract + route

- [x] 1.1 Extend `TeamResultInput` in `features/leagues/api.ts` (L403) additively: add optional `ff?`, `neverHeld?`, `fanRoll?`, `injuryRoll?`, `permanentRoll?`, and `mvp.grantee?`; extend `ResultPayload` (L418) with `duration?` + `inducements?`; extend `MatchScoreboard` (L562) home/away with `ff?`, `neverHeld?`, `fanRoll?`, `injuryRoll?`, `permanentRoll?`, `actions?` and top-level `duration?`.
- [x] 1.2 Extend `resolveCasualtyOutcomes` in `lib/result.ts` (L121) with optional `permanentRolls?: readonly number[]`; set `ResolvedCasualty.outcome.attribute?: PermanentAttribute` via `permanentAttribute()` (import from `./rules`) only for `kind === "permanent"` victims.
- [x] 1.3 RED then GREEN `lib/result.test.ts`: permanent 1D6 → attribute for the `permanent` band; non-permanent victims carry no `attribute`.
- [x] 1.4 Extend `parseTeamResult` in `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` (L86): accept `ff`, `neverHeld`→`heldBall = !neverHeld` (fallback `ballHeld`), `fanRoll`, `injuryRoll`, `permanentRoll`, direct `mvp.grantee` (400 on empty/journeyman grantee; absent → require exactly 6 nominations); parse top-level `duration` + `inducements`.
- [x] 1.5 Route POST: compute winnings from input FF (`computeWinnings({ffHome: home.ff, ...})`, no 1D3); direct MVP (`grantee ?? computeMvpGrantee(...)`); fan-delta write via `rollPostMatchFanFactor` + `tx.team.updateMany({ coaching: { ...coaching, dedicatedFans: after } })`; persist `attribute` in `persistCasualtyOutcomes` (L151); populate extended snapshot (`ff`, `neverHeld`, `fanRoll`, `injuryRoll`, `permanentRoll`, `actions` from `players`, `duration`).
- [x] 1.6 RED then GREEN `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts`: direct MVP coexists with 6-nomination legacy; winnings from input FF; fan-delta write; permanent attribute persisted; 401/404/409 + legacy payload accepted unchanged.

## Phase 2 (S2): Wizard shell + Steps 0–2

- [x] 2.1 Create `features/leagues/acta/actaState.ts`: `ActaState`, `ActaTeamDraft`, `emptyActaState()`, `buildActaPayload()`, and `actaPrefill(snapshot)` skeleton (single prefill home).
- [x] 2.2 Create `features/leagues/acta/deriveCasualties.ts`: pure `deriveCasualtyEntries({home,away})` mapping Step-2 casualty counts → victims (no re-entry).
- [x] 2.3 RED then GREEN `features/leagues/acta/actaState.test.ts` + `deriveCasualties.test.ts`: payload assembly and counts→victims.
- [x] 2.4 Create `features/leagues/MatchActaWizard.tsx` shell: step nav `<nav aria-label="Acta del partido">` with `aria-current="step"`, focus trap, Esc close, focus restore, `role="dialog" aria-modal="true"` (mirror `ResultModal` L199).
- [x] 2.5 Create `features/leagues/acta/StepContexto.tsx` (MAW-2): weather, duration, per-team FF, inducements, "NUNCA tuvo el balón" checkbox.
- [x] 2.6 Create `features/leagues/acta/StepMarcador.tsx` (MAW-3): home/away score inputs.
- [x] 2.7 Create `features/leagues/acta/StepAcciones.tsx` (MAW-4): free-form player + action + quantity lines; casualties feed `deriveCasualtyEntries`.
  - [x] 2.7a (corrective, post-verify) Derive the displayed Σ anotaciones / bajas causadas from `aggregateActions` so the Step-2 tally equals the submitted payload, and add the "acciones sin jugador" hint; add `StepAcciones.test.tsx` (RED → GREEN). Commit `3b0de74`. See the "Actions tally parity fix" section in `apply-progress.md`.
- [x] 2.8 RED then GREEN `features/leagues/acta/MatchActaWizard.test.tsx`: step gating + Contexto/Marcador/Acciones capture.

## Phase 3 (s3a–s3c): Steps 3–5

- [x] 3.1 (s3a) Create `features/leagues/acta/StepMvp.tsx` (MAW-5): DIRECT single MVP per team (`mvp.grantee`); ★4 PE note; add the shell branch + shell test.
- [x] 3.2 (s3b) Extract pure `features/leagues/acta/bajasPlan.ts` (+ co-located test) binding each victim's 1D16/1D6 rolls to the **causing** team's draft, then create `features/leagues/acta/StepBajas.tsx` (MAW-6): derived victims list (read-only from Step 2); 1D16 injury roll + 1D6 permanent roll only when band is Permanente; add the shell branch + shell test. Splitting helper-then-step keeps each PR under budget (see the s3b alignment risk in `design.md`).
  - [x] 3.2a (s3b corrective, post-verify) Preserve sparse `injuryRoll`/`permanentRoll` positions in the route parser (`numberArrayOrNull` now keeps non-trailing holes; `?? rollD16()`/`?? rollD6()` fall back per index), add the route sparse-payload tests, and extend `StepBajas.test.tsx` with the two-casualty non-trailing-hole case. Commits `3545b8f` + `2fe96e5`. See the s3b corrective-pass section in `apply-progress.md`; the positional-reorder hazard is recorded there for a later slice (FIX-3).
- [x] 3.3 (s3c) Create `features/leagues/acta/StepFinal.tsx` (MAW-7): winnings breakdown as a **client preview** using the SAME pure `computeWinnings` from `lib/rules/winnings.ts` — Step 5 precedes submit, so there is no server value to fetch. The server stays authoritative on submit, the client transmits NO amount, and no new API surface is added. Plus fan 1D6 roll input per team; add the shell branch + shell test.
- [x] 3.4 (s3a–s3c) RED then GREEN `features/leagues/acta/*.test.tsx` + `bajasPlan.test.ts`: one-MVP-per-team, permanent-roll gating with victim→causing-draft binding, winnings preview + fan roll.

## Phase 4 (s4a–s4c): Step 6 + MatchCard single entry + LeagueDetail wiring

- [x] 4.1 (s4a) Create `features/leagues/acta/StepRevisar.tsx` (MAW-8): summary + validations; block save unless Σ anotaciones == marcador AND both MVPs selected; wire the shell submit.
- [x] 4.2 (s4b) Modify `features/leagues/MatchCard.tsx` (L200–235): ONE primary "Acta del partido" (`canLoadResult` guard) + `···` overflow with Otorgar victoria (`isLeagueOwner && !played`), Corregir resultado (`played`, participant/admin), Reset (`showReset`) — preserve every guard 1:1 (Guard Map).
- [x] 4.3 (s4c) Modify `features/leagues/LeagueDetail.tsx` (L530, `ResultModalFor` L712): wire wizard (mode `load`/`correct`) replacing `ResultModal`; keep `buildResultPrefill` for load path. Also implement the inducement shape (task 5.4): `buildActaPayload` emits a **budget-only** snapshot for a non-live acta (`budget` = money spent, `cards` may be empty), and `parseInducements` stops returning `null` when a budget is present but `cards` is empty — live path unchanged. **s4c scope note**: the wizard replaces `ResultModal` on the LOAD path only; the CORRECT path keeps `ResultModalFor`/`ResultModal` until s6c (correct-mode prefill is s6a). `buildActaPayload` already emitted the budget-only snapshot from S2 — no `actaState.ts` change was needed.
  - [x] 4.3a (s4c corrective, post-verify) Restore the finished-live load-path prefill (`actaPrefill` in `actaState.ts`, wired in `MatchActaWizardFor`) with a regression guard, and surface a rejected load-path submit in the wizard's `role="alert"` instead of swallowing it. See the "s4c corrective pass" section in `apply-progress.md`.
- [x] 4.4 (s4b–s4c) RED then GREEN `MatchCard.test.tsx` + `LeagueDetail.test.tsx`: single action on scheduled; overflow gates (forfeit/correct/reset); save-block on invalid state; budget-only inducements survive a round-trip.

## Phase 5 (s5a–s5b): Correction recompute + treasury delta + audit

- [x] 5.1 (s5a) Modify route PUT (L618+): recompute winnings from corrected FF (`computeWinnings`), then `tx.team.update({ treasury: { increment: new − old } })` — no floor (negative allowed); extend `after` snapshot with recomputed winnings.
  - [x] 5.1a (s5a corrective, post-verify) MONEY-SAFETY: never move money against an unknown baseline. Resolve FF as `payload.ff ?? prevSnapshot.ff` (no FF-0 fallback); when either side's FF is unknown OR the prior `winnings` is absent, keep the persisted winnings and apply a ZERO delta. Preserve omitted wizard-input keys (`fanRoll`, `duration`, rolls, actions) instead of nulling them. Read the previous snapshot INSIDE the correction transaction. See the "s5a corrective pass" section in `apply-progress.md`.
- [x] 5.2 (s5b) Modify route PUT inducements (F1): add `parseInducements(raw.inducements)` helper; wizard input wins → else fall back to `prevScores.*.inducements` → else omit key (never drop a persisted inducement).
- [x] 5.3 (s5a–s5b) RED then GREEN `route.test.ts`: correction recomputes winnings + treasury delta; negative delta allowed; inducements preserved; `MatchResultCorrection` before/after audit records actor. **s5a half DONE** (recompute + treasury delta incl. negative + extended snapshot + audit after-snapshot; s5a corrective adds the unknown-baseline guards — legacy `winnings`-present/`ff`-absent and no-prior-`winnings` cases assert ZERO treasury movement); **s5b half DONE** (inducement precedence — input-wins, snapshot-fallback, legacy-omit; the former copy-forward tests are retitled to the fallback semantics and still pass).
- [x] 5.4 (s4c) RESOLVED — inducement persistence shape decided: a non-live acta persists a **budget-only** snapshot (`budget` = money spent per team; `cards` may be empty). `parseInducements` must stop returning `null` when a budget is present but `cards` is empty; the live path (which carries real cards) is unchanged. Implemented with the wizard entry point in s4c. This supersedes the earlier "deferred, unresolved" framing.

## Phase 6 (s6a–s6e): Prefill + i18n + e2e + retire `ResultModal`

- [x] 6.1 (s6a) Move `ResultTeamDraft`/`ResultPlayerDraft`/`ResultCasualtyDraft` from `features/leagues/ResultModal.tsx` into `features/leagues/resultPrefill.ts`; drop duplicate `RosterPlayerRef` (use `MatchResolveModal` L27).
- [x] 6.2 (s6a) Implement `actaPrefill(result)` in `features/leagues/acta/actaState.ts` (MAW-9): map extended `scores` keys → wizard state; legacy rows partially prefilled (score + resolved-casualty identity + `mvp`).
- [x] 6.3 (s6a) RED then GREEN `actaState.test.ts` (legacy vs extended snapshot) + `resultPrefill.test.ts`.
  - [x] 6.3a (s6a corrective, post-verify) Prefill the persisted `MatchResult.weather` (optional second `actaPrefill` argument, wired in `LeagueDetail.tsx`) so a correction never rewrites it, and flag unreconstructable legacy casualties on the wizard state (`casualtiesUnrecoverable`) with a non-blocking `role="alert"` warning in `StepBajas`. Commits `ad8c3ff` + `cb90805`. See the "Slice s6a — corrective pass" section in `apply-progress.md`.
- [x] 6.4 (s6b) Add `acta.*` keys to `lib/i18n/dictionaries.ts` (ES + EN) and wire the wizard + its seven steps to `useI18n()`. **Do NOT reword `result.heldBall`**: it is the LEGACY `ResultModal.tsx` positive label ("Mantuvo el balón" = held the ball), while the wizard's checkbox means the INVERSE ("NUNCA tuvo el balón") and owns the new `acta.neverHeld` key. s6c MUST delete `result.heldBall` together with `ResultModal.tsx` — never reword it in place. See the s6b `LEGACY_NOTE` in `apply-progress.md`.
  - [x] 6.4a (s6b corrective, post-verify) Localize the weather LABELS left hardcoded Spanish: map the canonical `ACTA_WEATHER_OPTIONS` values → BB2025 kinds in `actaState.ts` and render them through the existing `weatherLabel` helper in `StepContexto` (option labels) + `StepRevisar` (summary), keeping the PERSISTED value the canonical Spanish string; fix the stale `MatchActaWizard` "Spanish shell" comment; add the step-level locale test (`StepContexto.test.tsx`) the verifier found missing. Commit `1ce1e09`. See the "Slice s6b — corrective pass (post-verify)" section in `apply-progress.md`.
- [x] 6.5 (s6c) Delete `features/leagues/ResultModal.tsx`; update imports in `LeagueDetail.tsx` (L16), `resultPrefill.ts` (L2), `ResultModal.test.tsx` (retire). Deletion-atomic: do not fold with the e2e rewrites.
- [x] 6.6 (s6c) Update component tests: retire `ResultModal.test.tsx`; update `MatchCard.test.tsx`, `LeagueDetail.test.tsx`, `ForfeitModal.test.tsx` (entry point moved to overflow), `resultPrefill.test.ts`.
- [x] 6.7a (s6d) Rewrite the `loadResultViaModal` helpers in `e2e/match-report.spec.ts` + `e2e/match-view.spec.ts` to drive the acta wizard (Contexto → Marcador → Acciones → MVP → Bajas → Final → Revisar), and drive the `Otorgar victoria`/`Corregir resultado`/`Reset` entry from the `···` overflow. E2E 5/5 green. See the "Slice s6d" section in `apply-progress.md`.
- [x] 6.7b (s6e) Rewrite the e2e helpers/entries in `e2e/full-league-flow.spec.ts` + `e2e/league-matchday.spec.ts` + `e2e/profile.spec.ts` (plus `e2e/roster-table.spec.ts`, added to the slice by the apply brief). All four drive the acta wizard / `···` overflow and are green (21 passed).
- [x] 6.8 Full gate at parity: `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `AUTH_MODE=local pnpm exec playwright test`; confirm `designLock.test.tsx`, `lib/rules/winnings.test.ts`, `lib/rules/fanFactor.test.ts` untouched and green. Full auth suite also run: 68 passed / 2 flaky (retry-green) / 1 pre-existing failure (`inducement-purchase.spec.ts`, proven failing on the committed base with the s6e diff stashed).

Threat matrix: N/A — no RED tasks (no shell/subprocess/VCS-automation boundary).

## Out of scope (report only — no tasks)

- `AGENTS.md` rule 5 / `stories/design-tokens.stories.tsx` token drift (navy `#12225a` vs live `@theme` `#1d2a4d`) — report, do not fix without confirmation.
- Random-MVP mode; forfeit/reset modal internals (only their entry point moves into `···`).
- `openspec/config.yaml` does not exist — no config reference.
