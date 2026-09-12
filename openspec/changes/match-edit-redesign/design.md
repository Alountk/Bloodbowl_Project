# Design: match-edit-redesign (RAU-122)

## Technical Approach

Replace the 224-input `ResultModal.tsx` with a 7-step "Acta del partido" wizard (`MatchActaWizard`) and one card entry point, while keeping the server the sole authority over dice **results** (winnings, PE, injury bands) but accepting client-supplied **rolls and FINAL values** where the product now directs them (FF, fan 1D6, injury 1D16, permanent 1D6, direct MVP). The server contract grows **additively** — old payload fields stay accepted so the live-resolution path (`MatchResolveModal`, `lib/liveStore.ts`) and legacy tests keep compiling/running across the slice chain. Winnings are **computed and persisted server-side** from the editable FF; corrections **recompute** winnings and adjust treasury by delta. The persisted `MatchResult.scores` JSON is extended (additively) to store the full wizard input so correct-mode prefills.

## Architecture Decisions

| Decision | Option | Tradeoff | Chosen |
|---|---|---|---|
| Wizard structure | One `MatchActaWizard.tsx` + step files under `features/leagues/acta/` | Flat co-located steps match `MatchResolveModal` precedent; a single 1000-line file is unreviewable | `MatchActaWizard.tsx` (shell) + `acta/*.tsx` steps + pure `actaState.ts` |
| Payload | Additive `TeamResultInput`/`ResultPayload` | Additive keeps live path + tests compiling; a breaking re-type would force all e2e churn into S1 | Additive (`ff`, `neverHeld`, `fanRoll`, `injuryRoll`, `permanentRoll`, `mvp.grantee`, top-level `duration`/`inducements`) |
| Winnings authority | Server computes from editable FF | Client-computed winnings violate AGENTS.md rule 3; server-only keeps audit + treasury single-source | Server recomputes; read-only client render |
| MVP grantee | Wizard sends exactly one scalar `mvp.grantee`; legacy/live sends 6 `mvp.nominations` + server 1D6 | Random-MVP is out of scope (spec MAW-5 / match-result L153); the additive contract keeps the legacy payload accepted across slices | `grantee` non-empty string wins; 400 if present-but-invalid; absent → require exactly 6 nominations, else 400 |
| Casualty derivation | Pure `deriveCasualtyEntries` from Step 2 | Step 2 owns counts+victim refs; Step 4 only adds rolls (1D16/1D6) — no re-entry, no drift | `features/leagues/acta/deriveCasualties.ts` + co-located test |
| Correct-mode prefill source | `getMatchDetail` → `match.result.scores` | `FixtureDraft` in the list omits `result.scores` (lean list); `ResultModalFor` **already fetches** `getMatchDetail` — no new surface | `actaPrefill(result)` from `getMatchDetail` |
| Fan delta (bug a) | Write `coaching.dedicatedFans` in POST/PUT | Live path (`resolutionFanRoll`) already writes it; non-live parity required for Step 5 | Route applies `postMatchFanFactor` + `team.update` |
| Permanent attribute (bug b) | `permanentAttribute(1D6)` in route, persist `{kind:"permanent", attribute}` | `resolveCasualtyOutcomes` carries only `kind` today; attribute must survive for audit | Extend `ResolvedCasualty.outcome` + `persistCasualtyOutcomes` |
| Treasury delta on correction | `increment: new − old`, no floor (negative allowed) | Copy-forward loses edits; recompute keeps audit consistent; `Team.treasury` is a signed `Int @default(0)` accumulator (`prisma/schema.prisma` L327) whose spendable balance is `startingTreasury + treasury − costs` (L328–330), so a negative `increment` is safe and the user approved "recompute winnings and adjust treasury by the delta" | Delta recompute in the PUT transaction; never clamp at 0 |

## Data Flow

```
MatchCard "Acta del partido" ──▶ LeagueDetail sets mode (load|correct)
        │  ··· ──▶ Otorgar victoria / Corregir resultado / Reset (guards preserved)
        ▼
MatchActaWizard (7 steps)
  S0 Contexto (weather, FF, duration, inducements, neverHeld)
  S1 Marcador · S2 Acciones (casualties → derive) · S3 MVP (grantee)
  S4 Bajas (derived victims + 1D16 + permanent 1D6) · S5 Final (read-only winnings + fan 1D6)
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
| Tests | Modify/Create | `actaState.test.ts`, `deriveCasualties.test.ts`, route tests, `MatchCard.test.tsx`, `LeagueDetail.test.tsx`, `resultPrefill.test.ts`, `ResultModal.test.tsx` (retire), 4 e2e specs |

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
| E2E | `loadResultViaModal` helpers rewritten to wizard; correction prefilled; overflow entry points | `e2e/{match-report,full-league-flow,league-matchday,profile}.spec.ts` |
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

## Slice Plan (stacked-to-main, <400 lines each)

| Slice | Goal | Files | Focused test | Rollback | Est. Δ lines |
|---|---|---|---|---|---|
| S1 | Server contract + route | `api.ts`, `route.ts`, `lib/result.ts`, route tests | `pnpm test` (route + `lib/result.test.ts`) | revert; old payload still accepted | ~380 |
| S2 | Wizard shell + Steps 0–2 | `MatchActaWizard.tsx`, `acta/actaState.ts`, `acta/deriveCasualties.ts`, `StepContexto/Marcador/Acciones.tsx`, unit tests | `pnpm test` (acta units) | feature unwired | ~350 |
| S3 | Steps 3–5 | `StepMvp/Bajas/Final.tsx`, unit tests | `pnpm test` | unwired | ~330 |
| S4 | Step 6 + MatchCard entry | `StepRevisar.tsx`, `MatchCard.tsx`, `LeagueDetail.tsx` | `pnpm test` + `MatchCard/LeagueDetail.test.tsx` | revert entry point | ~280 |
| S5 | Correction recompute + treasury delta + audit | `route.ts` PUT, route tests | `pnpm test` (route) | revert PUT change | ~220 |
| S6 | Prefill + i18n + e2e + retire `ResultModal` (move `ResultTeamDraft`/`ResultPlayerDraft`/`ResultCasualtyDraft` to `resultPrefill.ts` first) | `resultPrefill.ts`, `dictionaries.ts`, `ResultModal.tsx` (delete), 4 e2e + component tests | `pnpm test` + `AUTH_MODE=local pnpm exec playwright test` | revert slice | ~380 |

`Decision needed before apply: Yes` · `Chained PRs recommended: Yes` · `400-line budget risk: High`

## UI/UX Tokens

Consume live `@theme` tokens (`bg-navy` #1d2a4d, `text-red`/`bg-red` #b3282d, `bg-panel` #fdfaf2, `bg-background` #f6f1e6, `text-ink` #2b2618, `text-slate` #6b6254, `border-border` #ddd3bf; `font-display` Fraunces + `font-sans` Space Grotesk). `#12225a` as an OPAQUE navy token exists only in `[data-theme="scoreboard"]`; the default `@theme` ("Reglamento vintage") navy is `#1d2a4d`, and the SAME RGB (18,34,90) appears in the default theme only as translucent accent/shadow alphas (e.g. `--color-accent-home: rgba(18,34,90,0.18)` at globals.css L85) — never hard-code `#12225a`. Dialog uses the existing `role="dialog" aria-modal="true"` pattern (ResultModal/MatchResolveModal) plus a step progress `<nav aria-label="Acta del partido">` with `aria-current="step"`, focus-first-on-step-change, Esc-close, and focus restore. Spanish copy via `acta.*` keys. Visual intent: gitignored `previews/match-edit-redesign.html` (reference only, not committed).

## Open Questions

None — all previously-open semantics are closed: (1) negative treasury delta is allowed with no floor (Architecture Decisions); (2) inducements-on-correction is resolved (F1 block); (3) `duration` persists to snapshot JSON only, no `MatchResult` column (Migration); (4) AGENTS.md/Storybook token drift is report-only (UI/UX Tokens above).
