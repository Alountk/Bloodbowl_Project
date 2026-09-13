# Delta for match-result

> Note on headings: the existing `match-result` spec uses name-only requirement headings (no numeric IDs). This delta preserves those exact names so the archive "match by name" merge stays unambiguous.

## MODIFIED Requirements

### Requirement: Score Validation

The sum of a team's TD actions (anotaciones entered in the wizard's Acciones step) MUST equal that team's final score; a mismatch MUST return 400 with no mutation. The winner MUST be derived from the final scores (equal scores → draw, no winner).
(Previously: score was validated against per-player TD credits entered directly on roster inputs.)

#### Scenario: Valid scores accepted

- GIVEN home action lines totalling 2 TDs and `homeScore: 2`
- WHEN the result is validated
- THEN it is accepted and the winner is derived from the scores

#### Scenario: Mismatched scores rejected

- GIVEN action-line TDs summing to 3 but `homeScore: 2`
- WHEN the result is validated
- THEN it returns 400 and nothing is persisted

### Requirement: Atomic Result Transaction

Loading a result MUST persist, in ONE transaction: fixture scores and winner, winnings computed from the FINAL input FF per team (used as-is, no 1D3 roll), post-match FF changes, PE awards (including the direct MVP's ★4 PE), injury outcomes from client-supplied 1D16 (plus the permanent 1D6 when the band is Permanente), petty cash equal to the TV difference awarded to the lower-TV team, the per-side inducement snapshot (`scores.home|away.inducements`), and the full wizard-input snapshot (input FF, action lines, neverHeld, raw rolls, duration, inducements). Any failure MUST roll back all changes.
(Previously: the report persisted only top-level `pettyCash` with no per-side inducement snapshot.)
(Previously: winnings used server-rolled FF; injuries and MVP were server-rolled; duration and the full input snapshot were not persisted.)

#### Scenario: All rewards applied atomically

- GIVEN a valid result payload
- WHEN it is loaded
- THEN scores, winnings, FF, PE, injuries, petty cash, inducements, and the input snapshot are all persisted together or none are

#### Scenario: Petty cash from TV difference

- GIVEN team A TV 1.200.000 and team B TV 1.050.000
- WHEN the result loads
- THEN the report records 150.000 petty cash for team B

#### Scenario: Per-side inducements persisted

- GIVEN a live match whose lower-TV coach purchased a cart
- WHEN the result closes (result POST, resolveLiveMatch, or runWizardClose)
- THEN `scores.home.inducements` and `scores.away.inducements` carry per-side `{ budget, cards }` with names resolved from the catalog

### Requirement: MVP Event Write on Result Load

When a result is loaded for a fixture that has a `LiveMatch`, the result route MUST append TWO `mvp` events (home grantee, away grantee) to that LiveMatch's event list inside the result transaction, using the DIRECTLY SELECTED grantee `rosterPlayerId` per team (`mvp.grantee`). The next `seq` MUST be read as `max(seq)` inside the transaction and bumped consistently so the `@@unique([liveMatchId, seq])` constraint cannot collide. A fixture with NO LiveMatch (legacy/walkover) MUST NOT write any `mvp` event.
(Previously: the grantee was MJP-computed by a server 1D6 over exactly six nominations.)

#### Scenario: Home and away MVP appended

- GIVEN a fixture with a finished LiveMatch and a valid result payload
- WHEN the result POST commits
- THEN two `mvp` events (home + away grantee) are appended with monotonic seq

#### Scenario: Concurrent seq writes never collide

- GIVEN two transactions appending events to the same LiveMatch
- WHEN both read `max(seq)` inside their transaction
- THEN no `@@unique([liveMatchId, seq])` collision occurs and both persist distinct seqs

#### Scenario: No LiveMatch, no MVP

- GIVEN a legacy or walkover fixture without a LiveMatch
- WHEN a result POST commits
- THEN no `mvp` event is written and the fixture is unchanged

### Requirement: Correction Authorization with Audit

Corrections MUST be accepted from the league admin, a `leagues.manage` holder (developer/admin), OR the two participant coaches; any other actor MUST receive 403 (foreign users 404). Forfeit/award-walkover MUST remain admin-only or a `leagues.manage` holder: a non-admin, non-privileged participant attempting it MUST receive 403 and no mutation. Each correction MUST record an audit entry with before/after snapshot, actor, and `correctedAt`, MUST re-run the PE rules against the corrected payload, and MUST recompute winnings from the corrected FF/TD/neverHeld data and adjust each team's treasury by the winnings delta (new − old). PE already spent MUST NOT be revoked by a correction.
(Previously: corrections were admin-only; participants could not correct, while forfeit was already admin-only.)
(Previously: corrections were admin/captain only and forfeit admin-only, with no privileged override.)
(Previously: a correction copied the prior winnings forward and never recomputed them nor adjusted treasury.)

> **Rename note** (from RENAMED requirement): `Admin-Only Correction with Audit` → `Correction Authorization with Audit`. Reason: corrections are no longer admin-only — the two participant coaches may correct; forfeit stays admin-only. Migration: match-report e2e and ResultModal tests asserting captain-403 for correction must flip to captain-200; forfeit assertions stay 403 for non-admin. The full updated block is this one.

#### Scenario: Correction audited

- GIVEN an admin or participant coach corrects a played result
- WHEN the correction commits
- THEN an audit row stores the before/after snapshot, actor, and `correctedAt`, with PE deltas re-run and winnings recomputed + treasury adjusted by delta

#### Scenario: Forfeit denied to non-admin participants

- GIVEN a played fixture and a non-admin participant
- WHEN they attempt forfeit/award-walkover
- THEN it returns 403 and no mutation occurs

#### Scenario: Spent PE never revoked

- GIVEN a player spent 6 PE before a correction
- WHEN the re-run awards fewer PE
- THEN previously spent PE is not revoked by the correction

#### Scenario: Participant correction e2e

- GIVEN the auth-suite match-report e2e
- WHEN it corrects a played result
- THEN the correction is driven by a participant coach and succeeds

#### Scenario: Privileged corrects a result

- GIVEN a `developer`/`admin` session and a played result
- WHEN they PUT a correction
- THEN it returns 200, the correction applies, and the audit row records the actor

### Requirement: Inducement Snapshot Parity and Copy-Forward

The THREE close paths (result POST, `resolveLiveMatch`, `runWizardClose`) MUST each write the SAME per-side `scores.home|away.inducements` shape (additive JSON inside `scores`, no `MatchResult` migration), so a resolved live match and a wizard-closed match persist inducements identically. A result correction (PUT) MUST persist the inducements from the wizard input (prefilled from the snapshot); a correction MUST NOT drop inducements a prior report persisted. Legacy rows without per-side inducements stay untouched (single-row `pettyCash` fallback).
(Previously: a correction copied the prior per-side inducements forward "exactly as it does winnings"; winnings no longer copy forward — they recompute.)

#### Scenario: All three paths persist the same shape

- GIVEN a fixture with a finished LiveMatch carrying a lower-TV cart
- WHEN it closes via result POST, resolveLiveMatch, or runWizardClose
- THEN each path persists `scores.*.inducements` with identical `{ budget, cards }` values

#### Scenario: Correction preserves inducements

- GIVEN a played result with persisted per-side inducements
- WHEN a coach/admin corrects the result
- THEN the rebuilt `scores.*.inducements` are not dropped

#### Scenario: Legacy row untouched

- GIVEN a legacy result with top-level `pettyCash` but no per-side inducements
- WHEN it is corrected or re-read
- THEN no inducements key is invented and the single-row fallback stays

## ADDED Requirements

### Requirement: Winnings Computed from Input Fan Factor

The result route MUST compute winnings from the FINAL FF entered per team in the wizard, used as-is. It MUST NOT roll a 1D3 nor derive FF from dedicated fans for this input. Formula stays authoritative: `((FF_home + FF_away)/2 + own TDs + (1 if the team NEVER held the ball)) × 10.000`. Winnings MUST be computed server-side; the client MUST NOT compute or transmit the winnings amount.

#### Scenario: Input FF used as-is

- GIVEN home FF 5, away FF 3, home 2 TDs, home held the ball
- WHEN winnings are computed
- THEN home gains 60.000 with no 1D3 roll

#### Scenario: Never-held-ball bonus

- GIVEN a team marked "NUNCA tuvo el balón" (mapped `heldBall = !neverHeld`)
- WHEN winnings are computed
- THEN that team gains +10.000 over the base formula

### Requirement: Direct MVP Selection

Each team MUST supply exactly ONE MVP grantee (`mvp.grantee`). Because `mvp.grantee` is a single scalar field, a team cannot express more than one grantee. A grantee that is PRESENT but not a non-empty valid roster-player identifier MUST return 400. When no grantee is supplied, the route MUST fall back to the legacy path and require exactly SIX nominations, returning 400 for any other count. The MVP MUST receive ★4 PE. The wizard offers NO random-MVP mode; the server 1D6 over six nominations survives only as the backward-compatible fallback for legacy payloads.

#### Scenario: Exactly one grantee accepted

- GIVEN each team supplies exactly one valid `mvp.grantee`
- WHEN the result loads
- THEN both MVPs receive ★4 PE and no 1D6 roll is consumed

#### Scenario: Invalid grantee rejected

- GIVEN a team supplies an empty or non-roster `mvp.grantee`
- WHEN the result is validated
- THEN it returns 400 and nothing is persisted

#### Scenario: Legacy six-nomination fallback

- GIVEN neither team supplies `mvp.grantee` and each supplies exactly six nominations
- WHEN the result loads
- THEN the server rolls 1D6 over the nominations and each MVP receives ★4 PE

#### Scenario: Absent grantee with the wrong nomination count rejected

- GIVEN no `mvp.grantee` is supplied and a team supplies a nomination count other than six
- WHEN the result is validated
- THEN it returns 400 and nothing is persisted

### Requirement: Correct-Mode Prefill Snapshot

The persisted `MatchResult.scores` JSON MUST store the full wizard input — input FF, per-player action lines, neverHeld, raw rolls (fan 1D6, injury 1D16, permanent 1D6), duration, and inducements — so correcting an existing result opens the wizard FULLY PREFILLED. Legacy rows without the extended snapshot MAY open partially prefilled.

#### Scenario: Correction opens fully prefilled

- GIVEN a played result whose snapshot stores the full wizard input
- WHEN the wizard opens in correct mode
- THEN every step is prefilled from the snapshot

#### Scenario: Legacy row partially prefilled

- GIVEN a legacy result whose snapshot lacks the extended input
- WHEN the wizard opens in correct mode
- THEN it opens with only the fields present in the legacy snapshot

### Requirement: Post-Match Dedicated Fans Applied

The non-live result path MUST apply the post-match dedicated-fans change (`coaching.dedicatedFans`) derived from the fan-factor 1D6 roll, exactly as the live-resolution path does. The fan delta (fans won/lost) MUST be derived server-side from the roll against the dedicated-fans attribute.

#### Scenario: Non-live fan delta applied

- GIVEN a winning team with dedicated fans 3 and a fan 1D6 roll of 4
- WHEN the non-live result commits
- THEN `coaching.dedicatedFans` becomes 4 (never above 7)

### Requirement: Permanent Injury Attribute Persisted

When the injury band is Permanente, the route MUST persist the attribute reduction resolved from the client 1D6 via `permanentAttribute()` (1-2 ar, 3 mv, 4 ps, 5 ag, 6 st).

#### Scenario: Permanent attribute roll persisted

- GIVEN a casualty whose 1D16 band is Permanente and a 1D6 roll of 5
- WHEN the result commits
- THEN the player's `ag` attribute reduction is persisted

### Requirement: Additive Result Contract

`TeamResultInput` MUST additively accept `ff`, `neverHeld`, `fanRoll`, `injuryRoll`/`permanentRoll`, and `mvp.grantee`, plus top-level `duration` and `inducements`. Existing fields MUST remain accepted for backward compatibility during the slices.

#### Scenario: Legacy payload still accepted

- GIVEN a payload using only the pre-existing fields
- WHEN the result is POSTed
- THEN it remains accepted with no schema breakage
