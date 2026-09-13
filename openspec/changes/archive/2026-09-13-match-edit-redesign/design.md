# Design: match-edit-redesign (RAU-122)

## Technical Approach

Replace the 224-input `ResultModal.tsx` with a 7-step "Acta del partido" wizard (`MatchActaWizard`) and one card entry point, while keeping the server the sole authority over dice **results** (winnings, PE, injury bands) but accepting client-supplied **rolls and FINAL values** where the product now directs them (FF, fan 1D6, injury 1D16, permanent 1D6, direct MVP). The server contract grows **additively** — old payload fields stay accepted so the live-resolution path (`MatchResolveModal`, `lib/liveStore.ts`) and legacy tests keep compiling/running across the slice chain. Winnings are **computed and persisted server-side** from the editable FF; corrections **recompute** winnings and adjust treasury by delta. At Step 5 the breakdown is a **client preview** using the SAME pure `computeWinnings` (`lib/rules/winnings.ts`) — the acta has not been submitted, so no server value exists to fetch; the client transmits **no amount** and the server stays authoritative on submit. The persisted `MatchResult.scores` JSON is extended (additively) to store the full wizard input so correct-mode prefills.

## Architecture Decisions

| Decision | Option | Tradeoff | Chosen |
|---|---|---|---|
| Wizard structure | One `MatchActaWizard.tsx` + step files under `features/leagues/acta/` | Flat co-located steps match `MatchResolveModal` precedent; a single 1000-line file is unreviewable | `MatchActaWizard.tsx` (shell) + `acta/*.tsx` steps + pure `actaState.ts` |
| Payload | Additive `TeamResultInput`/`ResultPayload` | Additive keeps live path + tests compiling; a breaking re-type would force all e2e churn into S1 | Additive (`ff`, `neverHeld`, `fanRoll`, `injuryRoll`, `permanentRoll`, `mvp.grantee`, top-level `duration`/`inducements`) |
| Winnings authority | Server computes from editable FF | Client-computed winnings violate AGENTS.md rule 3; server-only keeps audit + treasury single-source | Server recomputes; Step-5 display is a client preview of the same pure function, client transmits no amount |
| Step-5 winnings display | Reuse pure `computeWinnings` as a client preview | MAW-7 says winnings are "computed server-side and rendered read-only", but Step 5 precedes submit so there is no server value to fetch; a preview must not become client authority | Client preview via the SAME `lib/rules/winnings.ts` `computeWinnings`; server remains authoritative on submit; **no new API surface**, no amount in the payload |
| MVP grantee | Wizard sends exactly one scalar `mvp.grantee`; legacy/live sends 6 `mvp.nominations` + server 1D6 | Random-MVP is out of scope (spec MAW-5 / match-result L153); the additive contract keeps the legacy payload accepted across slices | `grantee` non-empty string wins; 400 if present-but-invalid; absent → require exactly 6 nominations, else 400 |
| Casualty derivation | Pure `deriveCasualtyEntries` from Step 2 | Step 2 owns counts+victim refs; Step 4 only adds rolls (1D16/1D6) — no re-entry, no drift | `features/leagues/acta/deriveCasualties.ts` + co-located test |
| Correct-mode prefill source | `getMatchDetail` → `match.result.scores` | `FixtureDraft` in the list omits `result.scores` (lean list); `ResultModalFor` **already fetches** `getMatchDetail` — no new surface | `actaPrefill(result)` from `getMatchDetail` |
| Fan delta (bug a) | Write `coaching.dedicatedFans` in POST/PUT | Live path (`resolutionFanRoll`) already writes it; non-live parity required for Step 5 | Route applies `postMatchFanFactor` + `team.update` |
| Permanent attribute (bug b) | `permanentAttribute(1D6)` in route, persist `{kind:"permanent", attribute}` | `resolveCasualtyOutcomes` carries only `kind` today; attribute must survive for audit | Extend `ResolvedCasualty.outcome` + `persistCasualtyOutcomes` |
| Treasury delta on correction | `increment: new − old`, no floor (negative allowed) | Copy-forward loses edits; recompute keeps audit consistent; `Team.treasury` is a signed `Int @default(0)` accumulator (`prisma/schema.prisma` L327) whose spendable balance is `startingTreasury + treasury − costs` (L328–330), so a negative `increment` is safe and the user approved "recompute winnings and adjust treasury by the delta" | Delta recompute in the PUT transaction; never clamp at 0 |
| Non-live inducement snapshot | Budget-only `{ budget, cards? }` | A non-live acta has no cart cards; today `buildActaPayload` emits `cards: []` and `parseInducements` returns `null` on `cards.length === 0`, so inducements never persist (the S2 gap) | Persist `budget` = money spent, `cards` may be empty; `parseInducements` accepts a present budget with empty cards; live path (real cards) unchanged |

## Data Flow

```
MatchCard "Acta del partido" ──▶ LeagueDetail sets mode (load|correct)
        │  ··· ──▶ Otorgar victoria / Corregir resultado / Reset (guards preserved)
        ▼
MatchActaWizard (7 steps)
  S0 Contexto (weather, FF, duration, inducements, neverHeld)
  S1 Marcador · S2 Acciones (casualties → derive) · S3 MVP (grantee)
  S4 Bajas (derived victims + 1D16 + permanent 1D6) · S5 Final (client-preview winnings via computeWinnings + fan 1D6)
  S6 Revisar ──POST/PUT──▶ /api/.../result/route.ts
        │
        ▼ server: computeWinnings(FF) → treasury · postMatchFanFactor → coaching.dedicatedFans
        │          permanentAttribute(1D6) → Player.injuries · correction → recompute + treasury delta
        ▼
MatchResult.scores (extended snapshot) ──▶ actaPrefill (correct mode)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `features/leagues/api.ts` | Modify | `TeamResultInput` + `ff`,`neverHeld`,`fanRoll`,`injuryRoll`,`permanentRoll`,`mvp.grantee`; `ResultPayload` + `duration`,`inducements`; extend `MatchScoreboard` with snapshot keys |
| `lib/result.ts` | Modify | Extend `resolveCasualtyOutcomes` with optional `permanentRolls` (1D6 per permanent victim) + `ResolvedCasualty.outcome.attribute?: PermanentAttribute`; NO new helper |
| `app/api/.../result/route.ts` | Modify | `parseTeamResult` accepts new fields (direct MVP, `heldBall = !neverHeld` w/ `ballHeld` fallback); winnings from FF; fan-delta write; permanent attribute persist; correction recompute + treasury delta; extended snapshot |
| `features/leagues/MatchActaWizard.tsx` | Create | Step shell: nav, focus trap, Esc close, `aria-current="step"`, submit on S6 |
| `features/leagues/acta/actaState.ts` | Create | `ActaState`, `ActaTeamDraft`, `emptyActaState()`, `buildActaPayload()`, `actaPrefill(snapshot)` — the SINGLE home for correct-mode prefill |
| `features/leagues/acta/deriveCasualties.ts` | Create | `deriveCasualtyEntries(home,away)` pure (Step 2 → Step 4) |
| `features/leagues/acta/StepContexto.tsx`…`StepRevisar.tsx` | Create | 7 step components (0–6) |
| `features/leagues/MatchCard.tsx` | Modify | One primary "Acta del partido" + `···` overflow (Otorgar victoria / Corregir resultado / Reset); guards preserved |
| `features/leagues/LeagueDetail.tsx` | Modify | Wire wizard (mode dispatch `load`/`correct`); extend `ResultModalFor` prefill to correct mode |
| `features/leagues/resultPrefill.ts` | Modify | Keep `buildResultPrefill` (finished-live load path); becomes the new home for `ResultTeamDraft`/`ResultPlayerDraft`/`ResultCasualtyDraft` moved out of `ResultModal.tsx` (S6) |
| `lib/i18n/dictionaries.ts` | Modify | `acta.*` keys; reword `heldBall` → "Nunca tuvo el balón" |
| `features/leagues/ResultModal.tsx` | Delete | Retired in S6 after parity; first move `ResultTeamDraft`/`ResultPlayerDraft`/`ResultCasualtyDraft` to `resultPrefill.ts` and drop `RosterPlayerRef` (already duplicated in `MatchResolveModal.tsx` L27) — see S6 |
| Tests | Modify/Create | `actaState.test.ts`, `deriveCasualties.test.ts`, route tests, `MatchCard.test.tsx`, `LeagueDetail.test.tsx`, `resultPrefill.test.ts`, `ResultModal.test.tsx` (retire), 5 e2e specs |

## Interfaces / Contracts

```ts
// features/leagues/api.ts (additive)
export interface TeamResultInput {
  score: number; ballHeld: boolean; players: ResultPlayerAction[];
  mvp: { nominations: string[]; grantee?: string | null };
  casualties: { team: "home"|"away"; rosterPlayerId: string }[];
  // NEW (all optional for backward compat):
  ff?: number | null;          // FINAL attendance FF (winnings input, as-is)
  neverHeld?: boolean | null;  // heldBall = !neverHeld
  fanRoll?: number | null;     // Step 5 post-match 1D6 (dedicated-fans change)
  injuryRoll?: number[] | null;  // per-victim 1D16, aligned with casualties[]
  permanentRoll?: number[] | null; // per-victim 1D6, aligned with permanent-band victims
}
export interface ResultPayload {
  weather?: string; home: TeamResultInput; away: TeamResultInput;
  duration?: number | null;    // minutes
  inducements?: InducementSnapshot | null; // { home: InducementSnapshotSide|null, away: ... } (lib/liveStore.ts L1377)
}
```

```ts
// lib/result.ts (extended)
export interface ResolvedCasualty extends CasualtyVictim {
  outcome: InjuryOutcome & { attribute?: PermanentAttribute };
}
export function resolveCasualtyOutcomes(
  victims: readonly CasualtyVictim[],
  rolls: readonly number[],
  permanentRolls?: readonly number[],  // NEW: 1D6 per permanent victim
): ResolvedCasualty[];
```

```ts
// deriveCasualties.ts
export function deriveCasualtyEntries(state: {
  home: ActaTeamDraft; away: ActaTeamDraft;
}): { team: "home"|"away"; rosterPlayerId: string }[]; // victims, from Step-2 casualty counts
```

**StepBajas alignment risk (s3b)** — `deriveCasualtyEntries` returns a COMBINED victim list tagged with the **victim's** team, while the payload's `injuryRoll`/`permanentRoll` live on the **causing** team's draft. `StepBajas` must therefore iterate per side (or extract a pure helper) so each roll binds to the correct draft; a flat single-pass list would misalign rolls and permanent attributes. Recommended approach: extract a pure `features/leagues/acta/bajasPlan.ts` helper (with a co-located test) that groups victims by causing side and pairs each with its 1D16/1D6 rolls. This also enables the s3b split (helper ≈140 + step+shell ≈320), keeping both PRs under budget.

**Route parse (MVP + neverHeld mapping)** — the non-obvious branches:
```ts
const heldBall = team.neverHeld != null ? !team.neverHeld
  : typeof team.ballHeld === "boolean" ? team.ballHeld : team.heldBall;
// MVP acceptance rule (matches match-result L153): the wizard sends exactly ONE
// scalar `mvp.grantee` (MAW-5/MAW-8 enforce a single selection, so "more than one"
// cannot be serialized); the legacy/live path sends six `mvp.nominations` + a
// server 1D6. Random-MVP mode stays out of scope but the legacy payload is kept.
const grantee = typeof mvp?.grantee === "string" ? mvp.grantee : null;
if (grantee != null) {
  if (grantee === "" || isJourneymanId(grantee)) return null; // 400: zero/invalid grantee
} else if (nominations.length !== 6) {
  return null; // 400: legacy path requires exactly six nominations (incl. "zero grantee")
}
// homeMvp = grantee ?? computeMvpGrantee(home.nominations, rollD6())
```

**PUT inducements (F1)** — `route.ts` today copies `prevScores.*.inducements` forward (L646–648 comment, L654/L662). Replace with wizard-input-first:
```ts
const ind = parseInducements(raw.inducements); // { home: InducementSnapshotSide|null|undefined, away: ... }
// scoreboard.home:
//   ...(ind.home != null ? { inducements: ind.home }
//     : prevScores?.home?.inducements != null ? { inducements: prevScores.home.inducements } : {})
```
Wizard input (prefilled from the snapshot) wins; when the payload omits it, fall back to the prior snapshot (never drop a persisted inducement); when neither exists (legacy single-row `pettyCash`), the key is omitted — no invention.

**Inducement snapshot for a non-live acta (DECIDED)** — a non-live acta persists a **budget-only** snapshot: `budget` is the money spent and `cards` may be empty. `parseInducements` must stop returning `null` when a budget is present but `cards` is empty (the S2 gap: `buildActaPayload` emits `cards: []`, so the null return dropped inducements entirely); the live path, which carries real cards, is unchanged. No new payload shape is invented beyond the existing `InducementSnapshotSide`.

## Snapshot Extension (additive `MatchResult.scores`)

`scores.home`/`scores.away` gain `ff?`, `neverHeld?`, `fanRoll?`, `injuryRoll?`, `permanentRoll?`, and `actions?` (per-player action lines `{ rosterPlayerId, tds, casualties, completions, interceptions, fouls, throwTeamMates, landedSafe }[]`); top-level gains `duration?` and keeps `inducements` (per-side `InducementSnapshotSide`, same shape the live cart already writes — parity). The existing top-level `mvp?: { home, away }` map (api.ts L574) is REUSED to store the direct grantee — no new per-side `mvpGrantee` key. The route must populate these from the parsed payload (`ff` from input, `actions` from `players`, raw rolls from `fanRoll`/`injuryRoll`/`permanentRoll`); today it only stores derived `pe` (api.ts L568), not raw action counts — the old "score/actions prefill from what exists" claim was false. `actaPrefill` maps the extended keys → wizard state; legacy rows (no `actions`, no `ff`, no rolls) open partially prefilled (score + resolved-casualty identity + `mvp` only). `buildResultPrefill` (finished-live) stays for the load path. Correction inducements handled per the F1 block above.

## Testing Strategy

| Layer | What | Approach (RED/GREEN, `pnpm test`) |
|---|---|---|
| Unit | `deriveCasualtyEntries` (counts→victims, no re-entry) | `features/leagues/acta/deriveCasualties.test.ts` |
| Unit | `actaPrefill` legacy vs extended snapshot; `buildActaPayload` → payload | `features/leagues/acta/actaState.test.ts` |
| Unit | `resolveCasualtyOutcomes` with `permanentRolls` → `attribute` | `lib/result.test.ts` |
| Route | Direct MVP coexists with 6-nomination; winnings from FF; fan-delta write; permanent persist; correction recompute + treasury delta; 401/404/409 | route tests (extend existing result route suite) |
| Component | Wizard step gating, ΣTD==score + MVP-complete block save; MatchCard single action + overflow guards | `MatchActaWizard.test.tsx`, `MatchCard.test.tsx`, `LeagueDetail.test.tsx` |
| E2E | `loadResultViaModal` helpers rewritten to wizard; correction prefilled; overflow entry points | `e2e/{match-report,match-view,full-league-flow,league-matchday,profile}.spec.ts` |
| Regression | `designLock.test.tsx`, `winnings.test.ts`, `fanFactor.test.ts` stay green | existing suites |

## Guard Map (preserved 1:1)

| Guard (today) | New location |
|---|---|
| `canLoadResult` (scheduled, participant/admin, !live, !finished) | Primary "Acta del partido" |
| Correct (played, participant/admin, !finished) | `···` → "Corregir resultado" |
| Forfeit (admin, !played, !finished) | `···` → "Otorgar victoria" |
| `showReset` (owner/`live.manage`, resettable live, !finished) | `···` → "Reset" |
| `leagueFinished` hides all | Gates every item above |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. (HTTP authz is covered by the route tests above.)

## Migration / Rollout

Additive only — no destructive migration, no schema column (snapshot lives in `MatchResult.scores` JSON; `prisma/schema.prisma` **unchanged**). `ResultModal` retired last (S6) once parity holds. Rollback = revert slice PRs; legacy rows read as blank FF (user re-enters on correct).

## Slice Plan (stacked-to-main; per-slice budget with explicit exceptions)

Re-forecast after S2 (1,459 actual vs ~350 forecast = 4.17×). See `tasks.md` → "Re-forecast rationale" for the per-unit baselines. Branch pattern: `feat/match-edit-redesign-<slice>`, each stacked on the previous.

| Slice | Goal | Files | Focused test | Rollback | Est. Δ lines |
|---|---|---|---|---|---|
| S1 | Server contract + route (done) | `api.ts`, `route.ts`, `lib/result.ts`, route tests | `pnpm test` (route + `lib/result.test.ts`) | revert; old payload still accepted | ~380 |
| S2 | Wizard shell + Steps 0–2 (done) | `MatchActaWizard.tsx`, `acta/actaState.ts`, `acta/deriveCasualties.ts`, `StepContexto/Marcador/Acciones.tsx`, unit tests | `pnpm test` (acta units) | feature unwired | **1,459 actual** |
| s3a | `StepMvp` + shell branch | `acta/StepMvp.tsx`, shell + tests | `pnpm test` (acta) | delete step + branch | ~310 |
| s3b | `StepBajas` + `bajasPlan` + shell branch | `acta/StepBajas.tsx`, `acta/bajasPlan.ts`, shell + tests | `pnpm test` (acta) | delete files + branch | ~460 (`size:exception` unless split) |
| s3c | `StepFinal` + shell branch (winnings client preview) | `acta/StepFinal.tsx`, shell + tests | `pnpm test` (acta) | delete step + branch | ~370 |
| s4a | `StepRevisar` + shell submit | `acta/StepRevisar.tsx`, shell + tests | `pnpm test` (acta) | delete step + submit | ~440 (`size:exception`) |
| s4b | `MatchCard` single entry + overflow | `MatchCard.tsx` + test | `pnpm test` | revert entry point | ~245 |
| s4c | `LeagueDetail` wiring + budget-only inducement shape (task 5.4) | `LeagueDetail.tsx` + tests, `actaState.ts`, `route.ts` | `pnpm test` | revert wiring + parse | ~310 |
| s5a | PUT recompute + treasury delta + snapshot | `route.ts` PUT + tests | `pnpm test` (route) | revert PUT change | ~310 |
| s5b | PUT inducement precedence (F1) | `route.ts` PUT + tests | `pnpm test` (route) | revert precedence | ~120 |
| s6a | Move draft types + full `actaPrefill` | `resultPrefill.ts`, `actaState.ts` + tests | `pnpm test` | revert move + prefill | ~290 |
| s6b | `acta.*` i18n keys ES+EN | `dictionaries.ts` | `pnpm test` | revert keys | ~120 |
| s6c | Retire `ResultModal.tsx` + its test | `ResultModal.tsx` (delete), `ResultModal.test.tsx` (delete), imports | `pnpm test` | restore file + imports | ~865 (deletion-dominated; `size:exception`) |
| s6d | e2e rewrites (match-report + match-view) | `e2e/match-report.spec.ts`, `e2e/match-view.spec.ts` | `AUTH_MODE=local pnpm exec playwright test` | revert specs | ~250 (low confidence) |
| s6e | e2e rewrites (full-league-flow + league-matchday + profile) | 3 e2e specs | `AUTH_MODE=local pnpm exec playwright test` | revert specs | ~250 (low confidence) |

Total remaining ≈3,900 changed lines (approved envelope; gross per-slice sum ≈4,340). `s6c` MUST NOT be folded with anything: a large deletion and e2e rewrites are different review concerns.

`Decision needed before apply: Yes` · `Chained PRs recommended: Yes` · `400-line budget risk: High`

## UI/UX Tokens

Consume live `@theme` tokens (`bg-navy` #1d2a4d, `text-red`/`bg-red` #b3282d, `bg-panel` #fdfaf2, `bg-background` #f6f1e6, `text-ink` #2b2618, `text-slate` #6b6254, `border-border` #ddd3bf; `font-display` Fraunces + `font-sans` Space Grotesk). `#12225a` as an OPAQUE navy token exists only in `[data-theme="scoreboard"]`; the default `@theme` ("Reglamento vintage") navy is `#1d2a4d`, and the SAME RGB (18,34,90) appears in the default theme only as translucent accent/shadow alphas (e.g. `--color-accent-home: rgba(18,34,90,0.18)` at globals.css L85) — never hard-code `#12225a`. Dialog uses the existing `role="dialog" aria-modal="true"` pattern (ResultModal/MatchResolveModal) plus a step progress `<nav aria-label="Acta del partido">` with `aria-current="step"`, focus-first-on-step-change, Esc-close, and focus restore. Spanish copy via `acta.*` keys. Visual intent: gitignored `previews/match-edit-redesign.html` (reference only, not committed).

## Open Questions

None — all previously-open semantics are closed: (1) negative treasury delta is allowed with no floor (Architecture Decisions); (2) inducements-on-correction and the non-live **budget-only** snapshot are decided (F1 block); (3) Step 5 winnings are a client preview, server-authoritative on submit (Architecture Decisions); (4) `duration` persists to snapshot JSON only, no `MatchResult` column (Migration); (5) AGENTS.md/Storybook token drift is report-only (UI/UX Tokens above).
