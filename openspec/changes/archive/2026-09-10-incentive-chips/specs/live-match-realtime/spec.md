# Delta for live-match-realtime

## ADDED Requirements

### Requirement: LM-30 · Inducement Purchase Command

The live route MUST accept `{ type: "purchaseInducements"; side: "home" | "away"; cards: { id: string; count: number }[] }` from a fixture coach while the match is `ready` (LM-11), and MUST return 409 when the match is any other status. ONLY the coach of the lower-TV side MAY purchase; the higher-TV/equal-TV coach, a spectator member, or a side-less admin MUST be rejected per the control gate (LM-2: spectator 403, foreign 404). The command MUST apply replace-cart semantics (IND-3), be seq-guarded (bump-or-409, LM-6), and validate that ids exist, that no count exceeds its `maxPerMatch`, that rule-gated ids are race-eligible, and that Σ effective cost ≤ budget (IND-1/IND-2/IND-3/IND-5). The cart MUST persist to the additive `LiveMatch.inducements Json?` column (row-scoped like `winnings`/`journeymen`), shaped `{ home: [{id,count}], away: [{id,count}] }`. The live-state DTO and the SSE snapshot (LM-8) MUST expose the per-side cart. `begin` MUST remain unchanged — it MUST still work when the cart is empty or the budget is 0.

#### Scenario: Lower-TV coach buys in ready

- GIVEN a `ready` match and the lower-TV coach
- WHEN they POST purchaseInducements within budget
- THEN it returns 200, the cart persists, and every subscriber's stream receives the new state

#### Scenario: Non-ready status rejected

- GIVEN a match whose status is not `ready`
- WHEN purchaseInducements arrives
- THEN it returns 409 and no cart changes

#### Scenario: Non-eligible side rejected

- GIVEN the higher-TV or equal-TV coach, a spectator member, or a side-less admin
- WHEN they POST purchaseInducements
- THEN the spectator is 403'd, the foreign user 404'd, and no mutation occurs

#### Scenario: Replace-cart and seq guard

- GIVEN a lower-TV coach with an existing cart
- WHEN they POST a new `{id,count}[]` list (or a concurrent command races the seq)
- THEN the persisted cart is REPLACED, and a stale-seq command returns 409 with no mutation

#### Scenario: Begin with empty cart or zero budget

- GIVEN a `ready` match where no purchase occurred or the budget is 0
- WHEN begin runs
- THEN it proceeds unchanged with no inducement data
