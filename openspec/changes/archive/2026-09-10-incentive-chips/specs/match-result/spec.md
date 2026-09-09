# Delta for match-result

## MODIFIED Requirements

### Requirement: Atomic Result Transaction

Loading a result MUST persist, in ONE transaction: fixture scores and winner, winnings per the bb2025-rules formula, post-match FF changes, PE awards (including MJP 4 PE), injury outcomes, and petty cash equal to the team-value difference awarded to the lower-TV team and persisted in the report, PLUS the per-side inducement snapshot (`scores.home|away.inducements = { budget, cards: [{name,count}] }`) resolved from the lower-TV cart at close. Any failure MUST roll back all changes.
(Previously: the report persisted only the top-level `pettyCash`, with no per-side inducement snapshot.)

#### Scenario: All rewards applied atomically

- GIVEN a valid result payload
- WHEN it is loaded
- THEN scores, winnings, FF, PE, injuries, petty cash, and inducements are all persisted together or none are

#### Scenario: Petty cash from TV difference

- GIVEN team A TV 1.200.000 and team B TV 1.050.000
- WHEN the result loads
- THEN the report records 150.000 petty cash for team B

#### Scenario: Per-side inducements persisted

- GIVEN a live match whose lower-TV coach purchased a cart
- WHEN the result closes (result POST, resolveLiveMatch, or runWizardClose)
- THEN `scores.home.inducements` and `scores.away.inducements` carry per-side `{ budget, cards }` with names resolved from the catalog

## ADDED Requirements

### Requirement: Inducement Snapshot Parity and Copy-Forward

The THREE close paths (result POST, `resolveLiveMatch`, `runWizardClose`) MUST each write the SAME per-side `scores.home|away.inducements` shape (additive JSON inside `scores`, no `MatchResult` migration), so a resolved live match and a wizard-closed match persist inducements identically. A result correction (PUT) MUST copy the prior per-side `inducements` forward exactly as it does `winnings` (forward-only: copied when present, omitted when absent); a correction MUST NOT drop inducements a prior report persisted. Legacy rows without per-side inducements stay untouched (single-row `pettyCash` fallback).

#### Scenario: All three paths persist the same shape

- GIVEN a fixture with a finished LiveMatch carrying a lower-TV cart
- WHEN it closes via result POST, resolveLiveMatch, or runWizardClose
- THEN each path persists `scores.*.inducements` with identical `{ budget, cards }` values

#### Scenario: Correction preserves inducements

- GIVEN a played result with persisted per-side inducements
- WHEN a coach/admin corrects the result
- THEN the rebuilt `scores.*.inducements` are copied forward and not dropped

#### Scenario: Legacy row untouched

- GIVEN a legacy result with top-level `pettyCash` but no per-side inducements
- WHEN it is corrected or re-read
- THEN no inducements key is invented and the single-row fallback stays
