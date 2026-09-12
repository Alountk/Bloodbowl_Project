# Tasks: match-edit-redesign (RAU-122)

> Slice-plan note: `proposal.md` Forecast listed 5 coarse slices; `design.md` refined them into **6 slices** (S1–S6 below). The design is authoritative — tasks are built from its 6-slice plan; the proposal's 5-slice forecast is superseded, not ignored.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | S1 ≈380 · S2 ≈350 · S3 ≈330 · S4 ≈280 · S5 ≈220 · S6 ≈380 · **total ≈1940** |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (S1) → PR 2 (S2) → PR 3 (S3) → PR 4 (S4) → PR 5 (S5) → PR 6 (S6) |
| Delivery strategy | stacked-to-main |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Slice | Goal | Files touched | Focused test command | Runtime harness | Rollback boundary | Est. Δ lines |
|------|------|---------------|----------------------|-----------------|-------------------|---------------|
| S1 | Additive server contract + route | `features/leagues/api.ts`, `lib/result.ts`, `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts`, `lib/result.test.ts`, `route.test.ts` | `pnpm exec vitest run lib/result.test.ts app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` | `AUTH_MODE=local pnpm exec playwright test e2e/match-report.spec.ts` — N/A (ports busy) | revert route + type change; legacy payload still accepted | ≈380 |
| S2 | Wizard shell + Steps 0–2 | `features/leagues/MatchActaWizard.tsx`, `features/leagues/acta/actaState.ts`, `features/leagues/acta/deriveCasualties.ts`, `acta/StepContexto/Marcador/Acciones.tsx`, co-located unit tests | `pnpm exec vitest run features/leagues/acta` | component render — `pnpm exec vitest run features/leagues/acta/MatchActaWizard.test.tsx` (jsdom) | delete `acta/` dir; feature unwired | ≈350 |
| S3 | Steps 3–5 (MVP/Bajas/Final) | `features/leagues/acta/StepMvp/Bajas/Final.tsx`, co-located tests | `pnpm exec vitest run features/leagues/acta` | `pnpm exec vitest run features/leagues/acta` (jsdom) | delete new step files; unwired | ≈330 |
| S4 | Step 6 + MatchCard single entry | `features/leagues/acta/StepRevisar.tsx`, `features/leagues/MatchCard.tsx`, `features/leagues/LeagueDetail.tsx`, `MatchCard.test.tsx`, `LeagueDetail.test.tsx` | `pnpm exec vitest run features/leagues/MatchCard.test.tsx features/leagues/LeagueDetail.test.tsx` | `pnpm exec vitest run features/leagues` (jsdom) | revert entry-point commit; guards restored | ≈280 |
| S5 | Correction recompute + treasury delta | `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` (PUT), `route.test.ts` | `pnpm exec vitest run app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts` | `AUTH_MODE=local pnpm exec playwright test e2e/match-report.spec.ts` — N/A (ports busy) | revert PUT change; winnings copy-forward restored | ≈220 |
| S6 | Prefill + i18n + e2e + retire `ResultModal` | `features/leagues/resultPrefill.ts`, `lib/i18n/dictionaries.ts`, `features/leagues/ResultModal.tsx` (delete), 4+ e2e specs, component tests | `pnpm test` + `AUTH_MODE=local pnpm exec playwright test` | `AUTH_MODE=local pnpm exec playwright test e2e/match-report.spec.ts e2e/full-league-flow.spec.ts e2e/league-matchday.spec.ts e2e/profile.spec.ts` | revert slice; `ResultModal` restored | ≈380 |

## Phase 1 (S1): Server contract + route

- [ ] 1.1 Extend `TeamResultInput` in `features/leagues/api.ts` (L403) additively: add optional `ff?`, `neverHeld?`, `fanRoll?`, `injuryRoll?`, `permanentRoll?`, and `mvp.grantee?`; extend `ResultPayload` (L418) with `duration?` + `inducements?`; extend `MatchScoreboard` (L562) home/away with `ff?`, `neverHeld?`, `fanRoll?`, `injuryRoll?`, `permanentRoll?`, `actions?` and top-level `duration?`.
- [ ] 1.2 Extend `resolveCasualtyOutcomes` in `lib/result.ts` (L121) with optional `permanentRolls?: readonly number[]`; set `ResolvedCasualty.outcome.attribute?: PermanentAttribute` via `permanentAttribute()` (import from `./rules`) only for `kind === "permanent"` victims.
- [ ] 1.3 RED then GREEN `lib/result.test.ts`: permanent 1D6 → attribute for `permanent` band; non-permanent victims carry no `attribute`.
- [ ] 1.4 Extend `parseTeamResult` in `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` (L86): accept `ff`, `neverHeld`→`heldBall = !neverHeld` (fallback `ballHeld`), `fanRoll`, `injuryRoll`, `permanentRoll`, direct `mvp.grantee` (400 on empty/journeyman grantee; absent → require exactly 6 nominations); parse top-level `duration` + `inducements`.
- [ ] 1.5 Route POST: compute winnings from input FF (`computeWinnings({ffHome: home.ff, ...})`, no 1D3); direct MVP (`grantee ?? computeMvpGrantee(...)`); fan-delta write via `rollPostMatchFanFactor` + `tx.team.updateMany({ coaching: { ...coaching, dedicatedFans: after } })`; persist `attribute` in `persistCasualtyOutcomes` (L151); populate extended snapshot (`ff`, `neverHeld`, `fanRoll`, `injuryRoll`, `permanentRoll`, `actions` from `players`, `duration`).
- [ ] 1.6 RED then GREEN `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.test.ts`: direct MVP coexists with 6-nomination legacy; winnings from input FF; fan-delta write; permanent attribute persisted; 401/404/409 + legacy payload accepted unchanged.

## Phase 2 (S2): Wizard shell + Steps 0–2

- [ ] 2.1 Create `features/leagues/acta/actaState.ts`: `ActaState`, `ActaTeamDraft`, `emptyActaState()`, `buildActaPayload()`, and `actaPrefill(snapshot)` skeleton (single prefill home).
- [ ] 2.2 Create `features/leagues/acta/deriveCasualties.ts`: pure `deriveCasualtyEntries({home,away})` mapping Step-2 casualty counts → victims (no re-entry).
- [ ] 2.3 RED then GREEN `features/leagues/acta/actaState.test.ts` + `deriveCasualties.test.ts`: payload assembly and counts→victims.
- [ ] 2.4 Create `features/leagues/MatchActaWizard.tsx` shell: step nav `<nav aria-label="Acta del partido">` with `aria-current="step"`, focus trap, Esc close, focus restore, `role="dialog" aria-modal="true"` (mirror `ResultModal` L199).
- [ ] 2.5 Create `features/leagues/acta/StepContexto.tsx` (MAW-2): weather, duration, per-team FF, inducements, "NUNCA tuvo el balón" checkbox.
- [ ] 2.6 Create `features/leagues/acta/StepMarcador.tsx` (MAW-3): home/away score inputs.
- [ ] 2.7 Create `features/leagues/acta/StepAcciones.tsx` (MAW-4): free-form player + action + quantity lines; casualties feed `deriveCasualtyEntries`.
- [ ] 2.8 RED then GREEN `features/leagues/acta/MatchActaWizard.test.tsx`: step gating + Contexto/Marcador/Acciones capture.

## Phase 3 (S3): Steps 3–5

- [ ] 3.1 Create `features/leagues/acta/StepMvp.tsx` (MAW-5): DIRECT single MVP per team (`mvp.grantee`); ★4 PE note.
- [ ] 3.2 Create `features/leagues/acta/StepBajas.tsx` (MAW-6): derived victims list (read-only from Step 2); 1D16 injury roll + 1D6 permanent roll only when band is Permanente.
- [ ] 3.3 Create `features/leagues/acta/StepFinal.tsx` (MAW-7): READ-ONLY winnings breakdown (server `computeWinnings` render) + fan 1D6 roll input per team.
- [ ] 3.4 RED then GREEN `features/leagues/acta/*.test.tsx`: one-MVP-per-team, permanent-roll gating, read-only winnings + fan roll.

## Phase 4 (S4): Step 6 + MatchCard single entry

- [ ] 4.1 Create `features/leagues/acta/StepRevisar.tsx` (MAW-8): summary + validations; block save unless Σ anotaciones == marcador AND both MVPs selected.
- [ ] 4.2 Modify `features/leagues/MatchCard.tsx` (L200–235): ONE primary "Acta del partido" (`canLoadResult` guard) + `···` overflow with Otorgar victoria (`isLeagueOwner && !played`), Corregir resultado (`played`, participant/admin), Reset (`showReset`) — preserve every guard 1:1 (Guard Map).
- [ ] 4.3 Modify `features/leagues/LeagueDetail.tsx` (L530, `ResultModalFor` L712): wire wizard (mode `load`/`correct`) replacing `ResultModal`; keep `buildResultPrefill` for load path.
- [ ] 4.4 RED then GREEN `MatchCard.test.tsx` + `LeagueDetail.test.tsx`: single action on scheduled; overflow gates (forfeit/correct/reset); save-block on invalid state.

## Phase 5 (S5): Correction recompute + treasury delta + audit

- [ ] 5.1 Modify route PUT (L618+): recompute winnings from corrected FF (`computeWinnings`), then `tx.team.update({ treasury: { increment: new − old } })` — no floor (negative allowed); extend `after` snapshot with recomputed winnings.
- [ ] 5.2 Modify route PUT inducements (F1): add `parseInducements(raw.inducements)` helper; wizard input wins → else fall back to `prevScores.*.inducements` → else omit key (never drop a persisted inducement).
- [ ] 5.3 RED then GREEN `route.test.ts`: correction recomputes winnings + treasury delta; negative delta allowed; inducements preserved; `MatchResultCorrection` before/after audit records actor.

## Phase 6 (S6): Prefill + i18n + e2e + retire `ResultModal`

- [ ] 6.1 Move `ResultTeamDraft`/`ResultPlayerDraft`/`ResultCasualtyDraft` from `features/leagues/ResultModal.tsx` into `features/leagues/resultPrefill.ts`; drop duplicate `RosterPlayerRef` (use `MatchResolveModal` L27).
- [ ] 6.2 Implement `actaPrefill(result)` in `features/leagues/acta/actaState.ts` (MAW-9): map extended `scores` keys → wizard state; legacy rows partially prefilled (score + resolved-casualty identity + `mvp`).
- [ ] 6.3 RED then GREEN `actaState.test.ts` (legacy vs extended snapshot) + `resultPrefill.test.ts`.
- [ ] 6.4 Add `acta.*` keys to `lib/i18n/dictionaries.ts` (ES + EN); reword `result.heldBall` → "Nunca tuvo el balón".
- [ ] 6.5 Delete `features/leagues/ResultModal.tsx`; update imports in `LeagueDetail.tsx` (L16), `resultPrefill.ts` (L2), `ResultModal.test.tsx` (retire).
- [ ] 6.6 Update component tests: retire `ResultModal.test.tsx`; update `MatchCard.test.tsx`, `LeagueDetail.test.tsx`, `ForfeitModal.test.tsx` (entry point moved to overflow), `resultPrefill.test.ts`.
- [ ] 6.7 Update e2e: rewrite `loadResultViaModal` helpers + `Otorgar victoria` overflow entry in `e2e/match-report.spec.ts`, `e2e/full-league-flow.spec.ts`, `e2e/league-matchday.spec.ts`, `e2e/profile.spec.ts`, `e2e/match-view.spec.ts`.
- [ ] 6.8 Full gate at parity: `pnpm test`, `pnpm lint`, `npx tsc --noEmit`, `AUTH_MODE=local pnpm exec playwright test`; confirm `designLock.test.tsx`, `lib/rules/winnings.test.ts`, `lib/rules/fanFactor.test.ts` untouched and green.

Threat matrix: N/A — no RED tasks (no shell/subprocess/VCS-automation boundary).

## Out of scope (report only — no tasks)

- `AGENTS.md` rule 5 / `stories/design-tokens.stories.tsx` token drift (navy `#12225a` vs live `@theme` `#1d2a4d`) — report, do not fix without confirmation.
- Random-MVP mode; forfeit/reset modal internals (only their entry point moves into `···`).
- `openspec/config.yaml` does not exist — no config reference.
