# Proposal: match-edit-redesign (RAU-122)

## Intent
`ResultModal.tsx` renders ~224 inputs, owns server dice, and correct mode opens blank. Rebuild it as a 7-step "Acta del partido" wizard with one entry point.

## Scope

### In Scope
- `MatchActaWizard` Steps 0–6: Contexto, Marcador, Acciones, MVP, Bajas, Final, Revisar.
- Step 0 context/FF/inducements/never-held-ball; Step 1 score; Step 2 actions (casualties feed Step 4); Step 3 direct MVP; Step 4 derived casualties + 1D16/permanent 1D6; Step 5 read-only winnings + fan 1D6; Step 6 validations/save.
- `MatchCard`: one primary "Acta del partido" + `···` overflow; guards preserved.
- Additive server contract; correction recompute (treasury delta); full prefill snapshot; non-live fan-delta write; `permanentAttribute()` wiring.

### Out of Scope
- Stale AGENTS.md rule 5 / token stories (report only); random MVP; forfeit/reset internals; research phase.

## Capabilities

### New Capabilities
- `match-acta-wizard`: 7-step capture, derived casualties, read-only winnings, validations, correct-mode prefill.

### Modified Capabilities
- `match-result`: additive input (FF, fan/injury rolls, direct MVP, duration, inducements); winnings recomputed from FF; correction recomputes + treasury delta; snapshot stores full input.

## Approach
New component reusing `computeWinnings`, `postMatchFanFactor`, `permanentAttribute`, PE. Extend `TeamResultInput` additively (`ff`, `neverHeld`, `fanRoll`, `injuryRoll`/`permanentRoll`, `mvp.grantee`, `duration`, `inducements`); `heldBall = !neverHeld`. Snapshot into `MatchResult.scores` JSON.

## Affected Areas

| Area | Impact |
|------|--------|
| `features/leagues/MatchActaWizard.tsx` + steps | New |
| `features/leagues/{MatchCard,ResultModal,LeagueDetail,api}.ts(x)` | Modified/Removed |
| `app/api/.../result/route.ts` | Modified |
| `lib/{result.ts,rules/*,i18n/dictionaries.ts}` | Modified |
| `features/leagues/*.test.tsx`, `e2e/*.spec.ts` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| MVP contract + client dice break live path/e2e | High | Optional old fields; helpers per slice |
| Correct-mode prefill needs snapshot extension | Med | Additive `scores` JSON; legacy blank |
| Winnings recompute changes treasury/audit | Med | Delta + `MatchResultCorrection` |
| Permanent-injury persistence touches `Player`/audit | Med | Reuse `permanentAttribute`; unit tests |

## Rollback Plan
Revert slice PRs; snapshot additive (no destructive migration); keep `ResultModal` until parity.

## Success Criteria
- [ ] Steps 0–6; Σ anotaciones == marcador and MVP-complete block save.
- [ ] Winnings read-only/server-computed; corrections recompute + treasury delta.
- [ ] Correct mode fully prefilled.
- [ ] One primary "Acta del partido" + `···`; guards preserved.
- [ ] Fan delta + permanent-attribute roll applied non-live; all test gates green.

## Forecast
Exceeds 400 lines → **stacked-to-main** chained PRs (<400/slice):
- S1 server contract + route tests · S2 wizard shell + Steps 0–2 · S3 Steps 3–5 · S4 Step 6 + MatchCard · S5 prefill + test/e2e updates + retire `ResultModal`.

`Decision needed before apply: Yes`
`Chained PRs recommended: Yes`
`400-line budget risk: High`

## Follow-up Triage
- Non-live POST never writes `coaching.dedicatedFans` → **IN**: Step 5's fan delta needs it.
- `permanentAttribute()` unwired in result route → **IN**: Step 4's permanent 1D6 is otherwise discarded.
- AGENTS.md/Storybook token drift → **OUT** (report only).

## Dependencies
None external; preview gitignored; no `openspec/config.yaml`.
