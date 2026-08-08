# Delta for create-team

## MODIFIED Requirements

### Requirement: Native Select Wrapper with Chevron Element

In `CreateTeamForm`, the Race select (step 1) MUST be wrapped in a relative-positioned div containing a separate chevron element with `pointer-events: none` — NOT a background-image — so the chevron renders on Samsung Android. The native `select` MUST use `font-size: 16px` to prevent iOS auto-zoom. The league-type select MUST NOT exist in the coaching section (removed) and therefore has no wrapper or chevron.
(Previously: both the Race select and the League type select each required a wrapper + chevron; the League type select carried `aria-label="League type"` and the `LEAGUE_TYPES` options.)

#### Scenario: Race select has wrapper+chevron

- GIVEN step 1 renders the Race select
- WHEN its wrapper renders
- THEN a wrapper div with a child chevron (`pointer-events: none`) is present
- AND the select has `font-size: 16px` and still calls `changeRace`

#### Scenario: No league-type select in coaching

- GIVEN step 2 renders the coaching section
- WHEN the section renders
- THEN no element with `aria-label="League type"` or a league-type `<select>` is present

### Requirement: Coaching Staff English Labels

The Coaching Staff section MUST keep English labels (Rerolls, Dedicated Fans, Assistant Coaches, Cheerleaders, Apothecary), light styling, unchanged `formatGold` `{X}k gc` strings, and region `aria-label="Coaching Staff"`. There MUST be no "League type" field.
(Previously: the section also included a `League type` select with a `LEAGUE_TYPES` mapping.)

#### Scenario: Labels and cost strings

- GIVEN the Coaching Staff renders
- THEN the five English labels (Rerolls, Dedicated Fans, Assistant Coaches, Cheerleaders, Apothecary) appear reachable via `getByLabel`
- AND the total is shown in `{X}k gc` format
- AND no "League type" label or select is present

### Requirement: Submit Team

Step 2 MUST render a navy "Create Team" submit button. On submit the form reuses the existing validation (name required, at least 3 players, budget not exceeded) and clears the form on success. The submission MUST create the team through the session-backed store (`ApiTeamStore` when authenticated), which persists it via GET/POST `/api/teams`. The created team MUST have `leagueId: null`. If the session is lost or the API returns an error, the submission MUST NOT clear the form and the error MUST be surfaced.
(Previously: the team was saved only to localStorage via the local store, with no server round-trip, and the POST payload carried a `leagueType`.)

#### Scenario: Submit valid

- GIVEN step 2 with a valid roster and an authenticated session
- WHEN "Create Team" is clicked
- THEN the team is created via the API with `leagueId: null` and the form resets to step 1

#### Scenario: Submit blocked when over budget

- GIVEN a roster over the 1,000,000 gc budget
- WHEN "Create Team" is clicked
- THEN the submission is blocked and "Roster exceeds the 1,000,000 gc budget" is shown

#### Scenario: API failure keeps form state

- GIVEN an authenticated form and an API error on submit
- WHEN "Create Team" is clicked
- THEN the error is surfaced and the form is not cleared
