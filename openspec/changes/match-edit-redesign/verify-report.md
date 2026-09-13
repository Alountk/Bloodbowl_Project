```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:34127f70b3f68fbbe28aca67b3a9df88647b1beb9ef09a0cf031657f147ae366
verdict: fail
blockers: 0
critical_findings: 1
requirements: 20/20
scenarios: 37/38
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:cd2d6c9e653fcce81df2764de109a689b257317b11b92972ff7083ad65261a04
build_command: npx tsc --noEmit
build_exit_code: 0
build_output_hash: sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

## Verification Report

**Change**: match-edit-redesign (RAU-122)
**Version**: N/A (2 delta domains: `match-acta-wizard` [new], `match-result` [MODIFIED + ADDED])
**Mode**: Standard (Strict TDD inactive — no `openspec/config.yaml`)
**Scope**: terminal end-to-end verification of the whole change on branch `chore/match-edit-redesign-finalize`, HEAD `c182d0b`, working tree clean. No code, spec, or artifact modified during verification; this report is the only file created.
**Evidence revision**: sha256 of `HEAD | test_output_hash | lint_output_hash | tsc_output_hash | local-e2e_hash | auth-six_hash | auth-full_hash`.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 41 |
| Tasks complete | 41 |
| Tasks incomplete | 0 |
| ActionContext mode | standard change (not workspace-planning) |

All 41 task checkboxes are `[x]`; zero unchecked. Full spec-driven verification is therefore permitted.

### Build & Tests Execution

**Build / type-check**: ✅ Passed (`npx tsc --noEmit`, exit 0, zero output)
```text
npx tsc --noEmit → exit 0 — no diagnostics (empty output, hash e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855)
pnpm lint        → exit 0 — eslint clean (only the 3-line pnpm banner; hash 85b37f071cd58af45049ea2371c5b16c077b6d0eb5997fc63e5c3888a5f1b639)
```

**Tests**: ✅ 2754 passed / ❌ 0 failed / ⚠️ 0 skipped (189 files)
```text
pnpm test → exit 0 (hash cd2d6c9e653fcce81df2764de109a689b257317b11b92972ff7083ad65261a04)
  Test Files  189 passed (189)
       Tests  2754 passed (2754)
    Duration  60.88s
```

**E2E — local suite (AUTH_MODE=local)**: ✅ 22 passed, exit 0
```text
pkill -f "next dev"; pkill -f "next-server"   (port 3000 confirmed free before every Playwright run)
AUTH_MODE=local pnpm exec playwright test --reporter=line → exit 0
  22 passed (25.5s)   [create-team, delete-team, mobile]
```

**E2E — the six rewritten specs against real Postgres (auth config)**: ✅ 26 passed, exit 0
```text
pnpm exec playwright test --config playwright.config.auth.ts \
  e2e/match-report.spec.ts e2e/match-view.spec.ts e2e/full-league-flow.spec.ts \
  e2e/league-matchday.spec.ts e2e/profile.spec.ts e2e/roster-table.spec.ts --reporter=line
→ exit 0
  26 passed (5.1m)
```
(The `CredentialsSignin` line in the web-server log is the expected wrong-password case asserted by `profile.spec.ts`, not a failure.)

**E2E — full auth gate (optional, run)**: ⚠️ 68 passed / 2 failed / 1 flaky, exit 1
```text
pnpm exec playwright test --config playwright.config.auth.ts --reporter=line → exit 1
  68 passed (10.7m) · 2 failed · 1 flaky (hash c4de7fb718d12780978e8f1c3bd940c1ee170f22bd0529b1d3646bfa46858cbb)
  Failed: e2e/inducement-purchase.spec.ts:147 (PRE-EXISTING — base-proven)
          e2e/locale.spec.ts:107 (PRE-EXISTING flake — base-proven)
  Flaky (retry-green): e2e/live-resolution.spec.ts:620 (PRE-EXISTING flake, untouched file)
```

**Coverage**: ➖ Not available (no coverage tool/threshold configured; `openspec/config.yaml` absent)

### Spec Compliance Matrix

Counts read from the two delta specs: `match-acta-wizard` = 9 requirements / 11 scenarios; `match-result` = 11 requirements / 27 scenarios. Total = 20 requirements / 38 scenarios.

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| MAW-1 Single Entry Point with Preserved Guards | Primary action only on scheduled fixture | `MatchCard.test.tsx > renders exactly ONE primary 'Acta del partido' on a scheduled fixture for a participant` | ✅ COMPLIANT |
| MAW-1 | Destructive actions gated in overflow | `MatchCard.test.tsx > gates 'Corregir resultado' to participant/admin on a played fixture`; `> gates 'Otorgar victoria' to the league admin and hides it from participants`; `> hides the reset control from a participant/spectator without reset rights`; `> hides the correction affordance on a played fixture of a finished league` | ✅ COMPLIANT |
| MAW-2 Step 0 Contexto | Contexto captured | `MatchActaWizard.test.tsx > captures the Contexto fields across step changes`; `actaState.test.ts > maps the Contexto fields and the neverHeld → heldBall inversion`; `StepContexto.test.tsx` (locale labels) | ✅ COMPLIANT |
| MAW-3 Step 1 Marcador | Score captured | `MatchActaWizard.test.tsx > captures the Marcador scores across step changes` | ✅ COMPLIANT |
| MAW-4 Step 2 Acciones | Casualties derived from actions | `MatchActaWizard.test.tsx > captures an Acciones casualty line and surfaces it as a derived victim`; `deriveCasualties.test.ts` (6); `StepBajas.test.tsx > lists each casualty under the team that CAUSED it` | ✅ COMPLIANT |
| MAW-5 Step 3 MVP | One MVP per team | `StepMvp.test.tsx > selects exactly one MVP per team and emits it as mvp.grantee`; `> replaces the previous MVP when a second player is selected`; `MatchActaWizard.test.tsx > renders the real MVP step at step 3 and captures one grantee per team` | ✅ COMPLIANT |
| MAW-6 Step 4 Bajas | Permanent roll shown only for Permanente | `StepBajas.test.tsx > shows the permanent 1D6 input ONLY for a Permanente band`; `> writes the permanent 1D6 to the CAUSING team's draft`; `bajasPlan.test.ts > maps the compressed permanent 1D6 list to the permanent victims only` | ✅ COMPLIANT |
| MAW-7 Step 5 Final | Read-only winnings | `StepFinal.test.tsx > has no editable winnings amount — the fan 1D6 is the only input`; `> renders the breakdown and total matching computeWinnings for a known input`; `> captures the 1D6 roll per team and emits it as fanRoll` | ✅ COMPLIANT (see WARNING 2 — preview is client-computed per approved design) |
| MAW-8 Step 6 Revisar | Save blocked on invalid state | `MatchActaWizard.test.tsx > blocks submit while a team has no MVP selected`; `> blocks submit when Σ anotaciones differs from the marcador`; `StepRevisar.test.tsx > blocks saving when Σ anotaciones differs`; `> blocks saving when a team has no MVP selected`; `> names every problem...` | ✅ COMPLIANT |
| MAW-8 | Save allowed on valid state | `MatchActaWizard.test.tsx > renders the real Revisar step at step 6 and submits the built payload`; `StepRevisar.test.tsx > allows saving a valid acta: Σ anotaciones == marcador and both MVPs selected` | ✅ COMPLIANT |
| MAW-9 Correct-Mode Prefill | Full prefill | `actaState.test.ts > prefills every extended snapshot key for correct mode (MAW-9)`; `LeagueDetail.test.tsx > opens the acta wizard PREFILLED from the persisted snapshot on correct (s6a)`; `e2e/match-report.spec.ts:464` (correction walks the prefilled wizard) | ✅ COMPLIANT |
| match-result Score Validation | Valid scores accepted | `route.test.ts > lets a captain (home owner) load a result in one transaction`; `lib/result.test.ts > accepts a report when per-player TDs equal each final score` | ✅ COMPLIANT |
| match-result Score Validation | Mismatched scores rejected | `route.test.ts > returns 400 when TDs do not sum to the reported score`; `lib/result.test.ts > rejects a report when a team's TDs mismatch its final score` | ✅ COMPLIANT |
| match-result Atomic Result Transaction | All rewards applied atomically | `route.test.ts > achieves atomicity through a single $transaction`; `> lets a captain ... one transaction`; `> persists per-victim injury outcomes on the Player rows in the same transaction`; `> persists winnings and the MVP grantees inside the scores snapshot (D4)` | ✅ COMPLIANT |
| match-result Atomic Result Transaction | Petty cash from TV difference | `route.test.ts > lets a captain ... (pettyCash 150_000)`; `lib/result.test.ts > computes petty cash as the team-value difference for the lower-TV team` | ✅ COMPLIANT |
| match-result Atomic Result Transaction | Per-side inducements persisted | `route.test.ts > LM-30/S3: carries the lower-TV cart into scores.*.inducements`; `> RAU-122/s4c: persists a non-live BUDGET-ONLY inducement snapshot`; `lib/liveStore.inducements.test.ts` | ✅ COMPLIANT |
| match-result MVP Event Write on Result Load | Home and away MVP appended | `route.test.ts > appends home+away mvp events with monotonic seq inside the result transaction (D20)` | ✅ COMPLIANT |
| match-result MVP Event Write on Result Load | Concurrent seq writes never collide | `route.test.ts > returns 409 when the concurrent double-write hits @@unique([liveMatchId, seq]) (P2002, D20)` (the constraint is the in-tx arbiter; `max(seq)` read inside the transaction at `route.ts:528-534`) | ✅ COMPLIANT |
| match-result MVP Event Write on Result Load | No LiveMatch, no MVP | `route.test.ts > appends no mvp events for a fixture WITHOUT a LiveMatch (legacy/walkover)` | ✅ COMPLIANT |
| match-result Correction Authorization with Audit | Correction audited | `route.test.ts > records an audit correction with before/after snapshot for an admin` (actor + `correctedAt` in `route.ts:897-905`) | ✅ COMPLIANT |
| match-result Correction Authorization with Audit | Forfeit denied to non-admin participants | `forfeit/route.test.ts > returns 403 for a participant (non-admin) and mutates nothing` | ✅ COMPLIANT |
| match-result Correction Authorization with Audit | Spent PE never revoked | `route.test.ts > never revokes spent PE on a correction that awards fewer PE` (`Math.max(0, new - prev)`, `route.ts:928`) | ✅ COMPLIANT |
| match-result Correction Authorization with Audit | Participant correction e2e | `route.test.ts > accepts a correction from a participant captain (admin OR captain, 200)` — route-level participant correction passes; the auth `e2e/match-report.spec.ts:464` correction is driven by the ADMIN, not a participant coach | ⚠️ PARTIAL |
| match-result Correction Authorization with Audit | Privileged corrects a result | `route.test.ts > lets a leagues.manage holder correct a foreign played result and records the actor (LAC-3)` | ✅ COMPLIANT |
| match-result Inducement Snapshot Parity and Copy-Forward | All three paths persist the same shape | `route.test.ts > LM-30/S3: carries the lower-TV cart into scores.*.inducements`; `lib/liveStore.inducements.test.ts > produces the lower-TV side's {budget, cards} with ES names resolved from the catalog`; all three close paths call the shared `buildInducementSnapshot` (`lib/liveStore.ts:1405`, used at `:1937` resolveLiveMatch and `:2213` runWizardClose) | ✅ COMPLIANT |
| match-result Inducement Snapshot Parity and Copy-Forward | Correction preserves inducements | `route.test.ts > RAU-122/s5b: PUT persists the wizard-INPUT inducements — input wins over the prior snapshot`; `> PUT falls back to the prior per-side inducements when the payload omits them` | ✅ COMPLIANT |
| match-result Inducement Snapshot Parity and Copy-Forward | Legacy row untouched | `route.test.ts > RAU-122/s5b: PUT omits inducements for legacy rows with neither input nor snapshot`; `> RAU-122/s4c: a non-live payload with NO inducements persists no key` | ✅ COMPLIANT |
| match-result Winnings Computed from Input Fan Factor | Input FF used as-is | `route.test.ts > computes winnings from the input FF (no 1D3) and applies the never-held-ball bonus` (60.000/50.000, no `rollD3`) | ✅ COMPLIANT |
| match-result Winnings Computed from Input Fan Factor | Never-held-ball bonus | `route.test.ts > computes winnings ... never-held-ball bonus` (triangulation → 70.000); `> PUT recomputes the never-held-ball winnings bonus from neverHeld (s5a)` | ✅ COMPLIANT |
| match-result Direct MVP Selection | Exactly one grantee accepted | `route.test.ts > accepts a direct mvp.grantee with no server roll and grants the ★4 PE` | ✅ COMPLIANT |
| match-result Direct MVP Selection | Invalid grantee rejected | `route.test.ts > returns 400 for a present-but-invalid grantee even with six nominations` | ✅ COMPLIANT |
| match-result Direct MVP Selection | Legacy six-nomination fallback | `route.test.ts > keeps the legacy 6-nomination payload accepted with server dice` | ✅ COMPLIANT |
| match-result Direct MVP Selection | Absent grantee with the wrong nomination count rejected | (none found) — branch exists at `route.ts:177-179` but no route test posts an absent-grantee payload with a non-six nomination count | ❌ UNTESTED |
| match-result Correct-Mode Prefill Snapshot | Correction opens fully prefilled | `actaState.test.ts > prefills every extended snapshot key for correct mode (MAW-9)`; `LeagueDetail.test.tsx > opens the acta wizard PREFILLED from the persisted snapshot on correct (s6a)` | ✅ COMPLIANT |
| match-result Correct-Mode Prefill Snapshot | Legacy row partially prefilled | `actaState.test.ts > opens a legacy snapshot partially prefilled without throwing`; `> leaves the MVP grantee empty when a legacy row carries no mvp map` | ✅ COMPLIANT |
| match-result Post-Match Dedicated Fans Applied | Non-live fan delta applied | `route.test.ts > computes winnings from the input FF ...` (asserts `team.updateMany` writes `coaching.dedicatedFans` 2 for the home win with roll 4 and 1 for the away loss) | ✅ COMPLIANT |
| match-result Permanent Injury Attribute Persisted | Permanent attribute roll persisted | `route.test.ts > persists the permanent attribute resolved from the client 1D6 rolls` (1D16 13 + 1D6 5 → `attribute: "ag"`); `lib/result.test.ts > resolves the permanent attribute from the 1D6` | ✅ COMPLIANT |
| match-result Additive Result Contract | Legacy payload still accepted | `route.test.ts > keeps the legacy 6-nomination payload accepted with server dice`; `> accepts the client-contract ballHeld field (ResultPayload), not just heldBall` | ✅ COMPLIANT |

**Compliance summary**: 20/20 requirements and 37/38 scenarios have passing covering runtime tests. 36 scenarios ✅ COMPLIANT; 1 ⚠️ PARTIAL (participant-correction e2e drive); 1 ❌ UNTESTED (absent-grantee wrong-count rejection). 0 ❌ FAILING.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| MAW-1 | ✅ Implemented | `MatchCard.tsx:160-187` keeps `canLoadResult` as the single primary action and moves forfeit/correct/reset into `overflowItems`; every guard preserved 1:1 (Guard Map). `leagueFinished` hides both. |
| MAW-2 | ✅ Implemented | `StepContexto.tsx` (weather, duration, per-team FF, inducements, `neverHeld`); `actaState.ts:214` maps `ballHeld = !neverHeld`; FF/duration omitted when unset so the route falls back. |
| MAW-3 | ✅ Implemented | `StepMarcador.tsx` home/away score inputs. |
| MAW-4 | ✅ Implemented | `StepAcciones.tsx` free-form lines; `aggregateActions` (`actaState.ts:173`) + `casualtiesFromActions` (`deriveCasualties.ts`) feed Step 4 with no re-entry. |
| MAW-5 | ✅ Implemented | `StepMvp.tsx` one radio group per team; `actaState.ts:225` emits `mvp: { nominations: [], grantee }`; `PE_MVP = 4` (`lib/rules/pe.ts:7`). |
| MAW-6 | ✅ Implemented | `bajasPlan.ts` binds rolls to the causing draft; `StepBajas.tsx:144` renders the permanent 1D6 only when `band === "permanent"`. |
| MAW-7 | ✅ Implemented (deviation) | `StepFinal.tsx` renders a read-only breakdown and only a fan 1D6 input; the displayed total is computed client-side with the shared pure `computeWinnings` (approved in `design.md`); `buildActaPayload` sends no winnings amount. Server recomputes authoritatively (`route.ts:445-446`, `:792-797`). |
| MAW-8 | ✅ Implemented | `validateActa` (`StepRevisar.tsx:66`) gates both the step display and the shell footer button (`MatchActaWizard.tsx:224,317`). |
| MAW-9 | ✅ Implemented | `actaPrefill` (`actaState.ts:264`) maps the extended snapshot; `LeagueDetail.tsx:767` passes `match.result.scores` + `match.result.weather`. |
| match-result | ✅ Implemented | `route.ts` POST (`:435-510`) and PUT (`:782-863`) cover winnings-from-FF, fan-delta writes, direct MVP + legacy fallback, permanent attribute persistence, per-side inducements, extended snapshot, correction recompute + treasury delta, audit row, and the money-safety unknown-baseline guards (`:789-797`, `:881-888`). `lib/result.ts:129-143` extends `resolveCasualtyOutcomes` with `permanentRolls` → `attribute`. `features/leagues/api.ts:404-435` adds the fields additively. |
| i18n | ✅ Implemented | 87 `acta.*` keys present exactly twice (ES + EN; automated key-parity check over `dictionaries.ts` found no key missing from either locale); the wizard/steps render via `useI18n()`. `result.heldBall` deleted (only explanatory comments remain at `:522`, `:1417`). |
| ResultModal retirement | ✅ Implemented | `features/leagues/ResultModal.tsx` and `ResultModal.test.tsx` deleted; `rg "ResultModal" features app components lib e2e` returns only comments in `LeagueDetail.test.tsx:677,881`, `resultPrefill.ts:13`, and `result/route.test.ts:254,1208`. No code imports or references it. |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Shell + `acta/*` steps + pure `actaState.ts` | ✅ Yes | Files match `design.md` File Changes. |
| Additive `TeamResultInput`/`ResultPayload` | ✅ Yes | Old fields accepted; `ballHeld` fallback preserved (`route.ts:156-161`). |
| Server computes winnings; Step 5 is a client preview | ✅ Yes | Documented deviation; client transmits no amount; server authoritative. |
| Direct MVP grantee; legacy 6-nomination fallback | ✅ Yes | `route.ts:174-179`, `:450-451`. |
| Derived casualties via `bajasPlan` binding rolls to the causing draft | ✅ Yes | Matches the s3b alignment risk mitigation. |
| Correct-mode prefill from `getMatchDetail` → `scores` | ✅ Yes | `LeagueDetail.tsx:762-771`. |
| Fan-delta write parity with live resolution | ✅ Yes | `route.ts:443-444`, `:597-604`; uses dedicated-fans attribute as the comparison baseline. |
| Treasury delta on correction, no floor | ✅ Yes | `route.ts:910-921`; negative delta allowed and tested. |
| Money never moved against an unknown baseline | ✅ Yes | `canRecomputeWinnings` + `freshScores.*.winnings != null` gates the delta; tested (FIX-1/FIX-2). |
| Non-live budget-only inducement snapshot | ✅ Yes | `buildActaPayload` emits `{ budget, cards: [] }`; `parseInducements` accepts a present budget with empty cards (`route.ts:101-107`). |
| Additive-only, no schema migration | ✅ Yes | No `prisma/` file in the change set. |
| Spanish `acta.*` copy via i18n; no `result.heldBall` reword | ✅ Yes | `result.heldBall` deleted, not reworded; `acta.neverHeld` owns the inverse. |

### Out-of-Scope Verification

| Item | Expected | Observed |
|------|----------|----------|
| Random-MVP mode | Out of scope | ✅ No random-MVP UI; server 1D6 survives only as the legacy fallback. |
| Forfeit/reset modal internals | Out of scope (entry point only) | ✅ `ForfeitModal`/`ResetLiveMatchModal` untouched; only their entry point moved to `···`. |
| AGENTS.md rule 5 / Storybook token drift | Report only | ✅ Not modified. |
| `openspec/config.yaml` | Absent | ✅ Confirmed absent; no `rules.verify` to apply. |
| Prisma schema/migration | None | ✅ No `prisma/` diff. |

### Pre-Existing Failures (proven not caused by this change)

A clean worktree at the change's base commit `95e9994` (`git worktree add`, `pnpm install --offline --frozen-lockfile`, `pnpm db:generate`) was used for the base proof. `e2e/inducement-purchase.spec.ts`, `e2e/locale.spec.ts`, and `e2e/live-resolution.spec.ts` are NOT in the change's diff (`git diff --name-only base..HEAD` does not list them).

| Failure | On the change branch | On committed base `95e9994` | Verdict |
|---------|----------------------|-----------------------------|---------|
| `e2e/inducement-purchase.spec.ts:147` | 1 failed / retry failed — `getByTestId('inducement-purchase')` element not found | 1 failed — identical assertion, identical element-not-found | PRE-EXISTING (base-proven) |
| `e2e/locale.spec.ts:107` | Full-suite: failed both attempts; isolated: 1 flaky (retry-green) | 1 flaky (failed then passed on retry) | PRE-EXISTING flake (base-proven). Root cause is the untouched `logoutEn` helper (`locale.spec.ts:54-60`) asserting the English heading `"Your league, in your pocket."` while the test sets `test.use({ locale: "es-ES" })`; it is a test-side race, not a dictionaries regression (the sibling locale scenarios pass, and all 87 `acta.*` keys parse in both locales). |
| `e2e/live-resolution.spec.ts:620` | 1 flaky (retry-green) | not separately run; untouched file, known flake | PRE-EXISTING flake (retry-green) |

### Issues Found

**CRITICAL**:
1. **UNTESTED scenario — Direct MVP Selection "Absent grantee with the wrong nomination count rejected".** `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts:177-179` enforces `nominations.length !== 6 → return null` (400) when no `mvp.grantee` is supplied, but no route test posts an absent-grantee payload with a non-six count (the only two `toBe(400)` tests are the TD-mismatch at `route.test.ts:553` and the present-but-invalid grantee at `:1470`; no test omits `mvp` or supplies a short nomination list). The branch is statically verified but unexercised at runtime, so the scenario has no passing covering test — the skill's decision gate classifies this as CRITICAL UNTESTED and the validator refuses a passing verdict over incomplete evidence. A regression here could silently accept a malformed legacy payload. Fix: add a route test, e.g. `body.home.mvp = { nominations: ["p1","p2","p3","p4","p5"] }` (no grantee) → `400` with `prismaMock.$transaction` not called, plus the mirror case for the away side. This is the only blocker to archive.

**WARNING**:
1. **MAW-7 / "Winnings Computed from Input Fan Factor" literal deviation — the client computes the displayed winnings.** `StepFinal.tsx:90-92` and `StepRevisar.tsx:120-131` call the pure `computeWinnings` client-side to render the read-only preview. The spec says winnings "MUST be computed server-side" and "the client MUST NOT compute or transmit the winnings amount". This is a documented, deliberate design decision (`design.md` → "Step-5 winnings display"): Step 5 precedes submit so no server value exists to fetch; the server recomputes authoritatively on POST/PUT and the payload carries no amount. Functionally the requirement's intent (no client authority over persisted winnings) holds; the literal "client must not compute" is not satisfied for the preview. Non-blocking, but should be acknowledged by the user at archive.
2. **"Participant correction e2e" scenario is only partially met.** The scenario names the auth-suite `match-report` e2e as the participant-correction driver, but `e2e/match-report.spec.ts:464` drives the correction as the ADMIN. Participant-coach correction is covered at the route level by `route.test.ts:890`. Recommend either driving one e2e correction as a participant coach or rewording the scenario to reference the route test.

**SUGGESTION**:
- The three `result.server.*` i18n keys (`alreadyPlayed`, `forbidden`, `saveError`) that existed on the base were deleted in s6c (verified: `git show 95e9994:lib/i18n/dictionaries.ts` had them; `rg "result.server"` on HEAD returns none), contrary to the `apply-progress.md` claim that they were kept. No code references them (the wizard surfaces failures via `acta.saveError`), so there is no functional impact — but the apply-progress statement is inaccurate and should be corrected or the keys restored.
- `features/leagues/MatchCard.tsx:316` carries a stale comment ("`acta.*` i18n keys land in s6b") and a hardcoded Spanish `"Acta del partido"` label while the wizard localizes through `acta.*`. Low impact (the league detail surface is Spanish by project convention), but the comment is misleading.
- `features/leagues/LeagueDetail.tsx:773` swallows a failed `getMatchDetail` with `.catch(() => {})`, so a correct-mode fetch failure opens the wizard empty instead of surfacing the error. Consider logging or showing a non-blocking notice.
- Petty cash is persisted as a single scalar (`route.ts:465`, `:583`); the requirement wording "awarded to the lower-TV team" has no per-team attribution or treasury credit. This is pre-existing (the base `route.ts` did the same) and unchanged by this delta; recorded for completeness, not as a regression.

### Verdict

**FAIL**
All 41 tasks are complete and every runtime gate is green except the one UNTESTED spec scenario. Independent runtime evidence: `pnpm test` 2754/2754 (189 files), `pnpm lint` exit 0, `npx tsc --noEmit` exit 0, local e2e 22/22, and the six rewritten auth specs 26/26 against real Postgres. All 20 requirements are implemented and have passing covering tests; 36/38 scenarios are fully COMPLIANT, 1 is PARTIAL, and 1 — Direct MVP Selection "Absent grantee with the wrong nomination count rejected" — has no passing covering test, so the change cannot be admitted as passing (`fail`, 1 CRITICAL). The substantive implementation is sound: the money path is safe (delta only against a known baseline; negative deltas allowed and tested), the wizard is coherent end-to-end across all seven steps (save-block, read-only winnings, correction recompute + treasury delta, full prefill), `ResultModal` is fully retired with no code references, `acta.*` keys exist in both locales, and `result.heldBall` is deleted (not reworded). The full auth gate's 2 failures and 1 flake are base-proven pre-existing and in untouched files. **Next**: add the one route test for the absent-grantee wrong-count rejection (and optionally address the two WARNINGs), then re-run verification; the change is otherwise archive-ready.
