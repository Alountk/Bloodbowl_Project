# Delta for create-team

## MODIFIED Requirements

### Requirement: Submit Team

Step 2 MUST render a navy "Create Team" submit button. On submit the form reuses the existing validation (name required, at least 3 players, budget not exceeded) and clears the form on success. The submission MUST create the team through the session-backed store (`ApiTeamStore` when authenticated), which persists it to the signed-in user's account via the `/api/teams` POST route. If the session is lost or the API returns an error, the submission MUST NOT clear the form and the error MUST be surfaced.
(Previously: the team was saved only to localStorage via the local store, with no server round-trip.)

#### Scenario: Submit valid

- GIVEN step 2 with a valid roster and an authenticated session
- WHEN "Create Team" is clicked
- THEN the team is created via the API and the form resets to step 1

#### Scenario: Submit blocked when over budget

- GIVEN a roster over the 1,000,000 gc budget
- WHEN "Create Team" is clicked
- THEN the submission is blocked and "Roster exceeds the 1,000,000 gc budget" is shown

#### Scenario: API failure keeps form state

- GIVEN an authenticated form and an API error on submit
- WHEN "Create Team" is clicked
- THEN the error is surfaced and the form is not cleared
