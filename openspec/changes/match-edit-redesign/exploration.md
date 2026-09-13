## Exploration: RAU-122 — match-edit-redesign ("Acta del partido" wizard)

### Current State

**Entry point.** `features/leagues/MatchCard.tsx` (354 lines) renders up to four header buttons directly: `Cargar resultado` (scheduled, participant/admin, not live), `Corregir resultado` (played, participant/admin, not finished league), `Otorgar victoria` (forfeit, admin only, not played), `Reiniciar partido` (reset, owner/`live.manage`, resettable live match). Each has its own visibility guard (`canLoadResult`, `showReset`, `played`, `leagueFinished`). `LeagueDetail.tsx` (`Jornadas` → `MatchCard` → `ResultModalFor`) owns the modals and the `load`/`correct` mode state.

**Current result form.** `features/leagues/ResultModal.tsx` (459 lines) renders two `TeamResultSection`s, each with 7 numeric inputs per roster player (~224 inputs for 22 players), 6 MVP `<select>` slots per team, score input, `Mantuvo el balón` checkbox (`ballHeld`), and victim selects derived from total caused casualties. Exports `buildResultPayload`, `sumDraftedTds`, `ResultTeamDraft`, `emptyTeamDraft` (inner function). Client guards: Σ TD == score and exactly 6 distinct MVP nominations.

**Server contract.** `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` (722 lines). POST and PUT both parse `{ weather?, home, away }` where each side is `{ score, ballHeld, players[], mvp:{nominations[]}, casualties[] }`. The server **owns all dice**: it rolls pre-match FF (`rollD3` + `dedicatedFans`), the post-match fan 1D6 (`postMatchFanFactor`), the MVP 1D6 (`computeMvpGrantee` over 6 nominations), and the per-victim 1D16 (`resolveCasualtyOutcomes` + `resolveInjury`). Winnings are computed server-side via `computeWinnings` and **persisted** into `MatchResult.scores.*.winnings`; treasury is incremented in the same transaction. PUT copies prior `winnings`, `postFf`, and `inducements` forward and never recomputes them.

**Answers to the specific questions**

1. **Server contract fit — NO, it needs extension.** The payload lacks: per-team **FF** (server rolls 1D3+dedicatedFans today), per-team **fan 1D6 roll** (server rolls), **injury 1D16 roll** and the **permanent extra 1D6** (server rolls; `permanentAttribute()` exists in `lib/rules/injuries.ts` but is **not wired into the result route**), **duration/end** (not modeled anywhere; `MatchResult` has no duration column), **inducements spent per team** (server derives from the `LiveMatch` cart only), and a **direct MVP grantee** (route requires exactly 6 nominations + server roll). `weather` is already accepted (`MatchResult.weather`). `ballHeld` exists but with **inverted semantics** vs the new "NUNCA tuvo el balón" checkbox (map `ballHeld = !neverHeld`). Winnings are **computed and persisted server-side, never derived on read** — so editable FF means the route must recompute them. **Gap found:** the POST transaction computes `postFf` and snapshots it but **never writes `coaching.dedicatedFans`**; only the live-resolution path (`lib/liveStore.ts:2773`) applies the Hinchas change. The non-live result path therefore never applies Step 5's fan delta today.

2. **Reopen/correct path — MAJOR GAP: no prefill.** `ResultModalFor` only prefills from a **finished live match** (`getMatchDetail` → `buildResultPrefill`). On a played fixture in `correct` mode `initial` is `undefined`, so the modal opens blank; the e2e correction test fills every field from scratch. `MatchResult.scores` stores `score`, `postFf`, `winnings`, resolved `casualties`, `pe`, `inducements`, and `mvp:{home,away}` — but **not** the input FF, per-player action breakdown, `ballHeld`/`neverHeld`, raw rolls, or duration. The `FixtureDraft` returned by `/api/leagues/[id]` carries only scores/winner/status (no `result.scores`), while `getMatchDetail` (`MatchDetail.result`) does expose the result. A correct-mode prefill therefore needs a new data source and/or an extended snapshot that stores the full wizard input.

3. **Tests that lock current behavior (will break, intentional updates).**
   - `features/leagues/ResultModal.test.tsx` — dialog names `Cargar resultado`/`Corregir resultado`, `Goles <team>`, `Anotaciones <player>`, `MVP 1..6 <team>`, `Mantuvo el balón`, `Guardar resultado`, ΣTD and exact-6 MVP guards, victim selects.
   - `features/leagues/MatchCard.test.tsx` — `Cargar resultado`, `Corregir resultado`, `Otorgar victoria`, `Reiniciar partido` header buttons; finished-league visibility.
   - `features/leagues/LeagueDetail.test.tsx` (lines ~607–894) — same buttons + modal dialogs + prefill path.
   - `e2e/match-report.spec.ts`, `e2e/full-league-flow.spec.ts` — `loadResultViaModal` helpers use the old labels, section `Resultado <team>`, 6 MVP selects, `Guardar resultado`.
   - `e2e/league-matchday.spec.ts` (~571), `e2e/profile.spec.ts` (~184), `e2e/full-league-flow.spec.ts` (~649) — `Otorgar victoria` entry point (moves to overflow menu).
   - `features/leagues/ForfeitModal.test.tsx` — modal itself unchanged, but entry point moves.
   - `features/leagues/resultPrefill.test.ts` — may be reused/extended.
   - **Not affected:** `features/leagues/designLock.test.tsx` (locks event cards / MatchView geometry, not the result modal), `lib/rules/winnings.test.ts`, `lib/rules/fanFactor.test.ts`.
   - Stories referencing `MatchCard` (`MatchCard.stories.tsx`, `stories/directions-preview.stories.tsx`) may need prop updates.

4. **Permissions / guards to preserve.** POST: 401 no session; 404 fixture/league mismatch; 409 finished league; 404 non-started league; allow league owner OR fixture captain OR `leagues.manage` holder, else 404 (no leak); 409 already-played. PUT: same auth, 409 finished league, 409 no result. Display gates on the card: owner-equivalent via `canManageLeague` (`league.canManage` / `isOwnerEquivalent`) passed as `isLeagueOwner`; participant = team owner; `leagueFinished` hides everything; live-active hides result load; forfeit stays admin-only; reset stays owner/`live.manage` + live not finished. The new overflow menu must reproduce every one of these.

5. **Gaps we missed.** Forfeit (`ForfeitModal` + `/forfeit`) and reset (`ResetLiveMatchModal` + `/reset`) entry points move to `···` but their modals/routes are untouched. Prisma: `MatchResult` (`weather`, `scores` JSON, `pettyCash`, `loadedBy`), `MatchResultCorrection` (audit `before`/`after`), `Player` (`pe`, `skills`, `injuries` JSON, `alive`, `missNextMatch`, `valueBonus`, `improvements`, `attributeIncreases`), `Fixture` (`homeScore`/`awayScore`/`winnerId`), `LiveMatch` (`winnings`, `pendingResolution`, `mvpNominations`, `resolutionState`, `inducements`). **Permanent-injury attribute roll is not persisted by the result route today** (`resolveCasualtyOutcomes` only carries `kind`; `persistCasualtyOutcomes` appends `{kind}` and suspension flags). The finished-live prefill path (LM-9) must survive the wizard replacement. PE constants: TD 3, MVP 4, INT 2, CAS 2, COMP 1, TTM 1, LANDED 1 (`lib/rules/pe.ts`).

6. **Design tokens — AGENTS.md rule 5 and `stories/design-tokens.stories.tsx` are STALE.** `app/globals.css` `@theme` default ("Reglamento vintage") is navy `#1d2a4d`, red `#b3282d`, panel `#fdfaf2`, background `#f6f1e6`, ink `#2b2618`, slate `#6b6254`, border `#ddd3bf`; a `[data-theme="scoreboard"]` variant restores navy `#12225a` / bg `#f8fafc`. AGENTS.md rule 5 still states `#12225a` as the token and forbids new variants; the Storybook token sheet still shows `#12225a`/`#f8fafc` as the base. The preview study (`previews/match-edit-redesign.html`, gitignored, local-only) uses the **correct** default palette. Report this drift to the user; do not "fix" AGENTS.md as part of this change without confirmation.

### Affected Areas

- `features/leagues/MatchCard.tsx` — replace up-to-4 header buttons with one `Acta del partido` primary + `···` overflow (forfeit/correct/reset). Preserve every visibility guard.
- `features/leagues/ResultModal.tsx` — retired or refactored into the wizard; exports `buildResultPayload`/`ResultTeamDraft` are consumed by `LeagueDetail.tsx`, `resultPrefill.ts`, and tests.
- `features/leagues/LeagueDetail.tsx` — modal wiring, `resultMode`, `ResultModalFor` prefill (needs correct-mode prefill).
- New `features/leagues/MatchActaWizard.tsx` (proposed) + step components + co-located tests.
- `features/leagues/api.ts` — `ResultPayload`/`TeamResultInput`/`ResultPlayerAction` extension.
- `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` — accept client FF/fan roll/injury rolls/direct MVP/duration/inducements; apply dedicated-fans change; recompute winnings from FF.
- `lib/result.ts`, `lib/rules/winnings.ts`, `lib/rules/fanFactor.ts`, `lib/rules/injuries.ts` — pure helpers reused/extended.
- `lib/i18n/dictionaries.ts` — `result.*` copy (reword `heldBall` → "Nunca tuvo el balón", add wizard/step/validation keys).
- `prisma/schema.prisma` — only if duration/inducements/input snapshot require a column (prefer additive JSON in `MatchResult.scores`).
- `openspec/specs/match-result/spec.md` (primary), possibly `openspec/specs/leagues/spec.md`.
- Tests: `ResultModal.test.tsx`, `MatchCard.test.tsx`, `LeagueDetail.test.tsx`, `ForfeitModal.test.tsx`, `resultPrefill.test.ts`, `e2e/match-report.spec.ts`, `e2e/full-league-flow.spec.ts`, `e2e/league-matchday.spec.ts`, `e2e/profile.spec.ts`.

### Approaches

1. **New wizard component + additive server contract (recommended).** Build `MatchActaWizard` as a new stepped component (7 steps), reusing pure helpers (`computeWinnings`, `postMatchFanFactor`, `permanentAttribute`, action→PE). Extend `TeamResultInput` additively with `ff`, `neverHeld`/`ballHeld`, `fanRoll`, `injuryRoll`/`permanentRoll`, `mvp.grantee`, and top-level `duration`/`inducements`; keep old fields optional for backward compatibility during the slice. Retire `ResultModal`.
   - Pros: clean separation from the 459-line legacy form; additive contract keeps other callers (live resolution, tests) compiling; pure rules stay authoritative server-side.
   - Cons: touches route + types + all locked tests in one change; needs chained PRs.
   - Effort: High.

2. **Refactor `ResultModal` in place into steps.** Add step state and new inputs to the existing component.
   - Pros: fewer new files; reuses existing test scaffolding.
   - Cons: keeps dense legacy structure; harder to slice; high regression surface in one file.
   - Effort: Medium-High.

3. **Client-computed winnings + read-only server trust.** Have the wizard compute winnings and POST the number.
   - Pros: simplest UI.
   - Cons: violates "business rules server-side"; rejected by AGENTS.md rule 3. Not viable.
   - Effort: Low but non-compliant.

### Recommendation

Approach 1, delivered as chained/stacked PRs (the change will exceed 400 lines). Suggested slices: (a) server contract extension + pure-rule wiring + route tests; (b) wizard shell + Steps 0–2; (c) Steps 3–4 (MVP direct + derived casualties with manual injury/permanent rolls); (d) Steps 5–6 (auto winnings + fan roll + review) and `MatchCard` entry point + overflow; (e) prefill/correct path + i18n + intentional test updates. Keep `computeWinnings` authoritative server-side; pass `heldBall = !neverHeld`. Confirm with the user two open design decisions before spec: (1) on **correction**, do edited FF/score **recompute** winnings (and adjust treasury) or preserve the original award as today's PUT does? (2) Does Step 0's FF represent the pre-match **attendance factor** (1D3+dedicatedFans, as the preview's "(FF 4+3)/2" implies) or the dedicated-fans attribute? Also fix the latent bug that the non-live result path never applies the post-match dedicated-fans change.

### Risks

- **Correct-mode prefill is missing** — the wizard cannot reopen an existing result without a new prefill source; if `MatchResult.scores` does not store the full input, corrections will still start blank.
- **Breaking API change** for MVP (6 nominations → direct grantee) and server-owned dice → client-supplied rolls affects the live-resolution path and every e2e helper; coordinate with `MatchResolveModal` / `lib/liveStore.ts`.
- **Winnings recompute on correction** may change persisted treasury semantics and the `MatchResultCorrection` audit contract.
- **Permanent-injury attribute roll** is not persisted today; adding it touches `Player.injuries`/`attributeIncreases` and the correction audit.
- **Test churn is large** (component + 4 e2e specs); the "tests must stay green" rule requires intentional, same-PR updates.
- **Design-token drift**: AGENTS.md rule 5 and the Storybook token sheet are stale; a new component must consume the live `@theme` tokens, not the documented `#12225a`.
- `openspec/config.yaml` is absent from `openspec/` (only `specs/`, `changes/`, `notes/` exist) — downstream phases should not assume a config file.

### Ready for Proposal

Yes. The product decisions are locked; the open items are the two server-semantics questions above plus confirming the correct-mode prefill strategy. The orchestrator should tell the user: (1) the redesign is feasible but requires an **additive server-contract extension** (client FF, fan roll, injury/permanent rolls, direct MVP, duration, inducements) and (2) the **"corregir" path currently does not prefill** — the wizard needs a new prefill source, and we must decide whether a correction recomputes winnings. Also flag the AGENTS.md/Storybook token drift.
