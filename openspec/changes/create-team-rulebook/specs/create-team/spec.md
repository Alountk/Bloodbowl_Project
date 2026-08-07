# create-team Specification

## Purpose

Contract for the `CreateTeamForm` rulebook-light experience (navy hero, red-bordered headings, light fields, table-first roster builder) with byte-identical e2e contract strings.

## Requirements

### Requirement: Form Layout Order

The system MUST render the form in fixed order: team name, race select, optional race-change dialog, `Roster builder` (when a race is selected), `Coaching Staff`, error alerts, submit button.

#### Scenario: Happy path order

- GIVEN the page renders with a race selected
- WHEN the form renders
- THEN team name and race controls precede the Roster builder
- AND Coaching Staff and submit follow it

### Requirement: Table-First Roster Builder

The RosterTable MUST render BEFORE the budget bar and the role-group "Add" sections inside the `Roster builder` section.

#### Scenario: Table above budget bar

- GIVEN a race is selected
- WHEN the section renders
- THEN the RosterTable precedes the budget bar and add sections

#### Scenario: Empty state visible first

- GIVEN a race selected with no players
- WHEN the section renders
- THEN the "No players in roster yet." empty state appears above the budget bar

### Requirement: Rulebook Light Styling

The form MUST render in a white panel (max-w 900px) with a navy `#12225a` hero titled "Create Team" plus subtitle. Section headings MUST be 16px `#12225a` with a 3px `#d11938` bottom border; inputs and selects MUST be light (white background, slate border, dark text).

#### Scenario: Hero and headings

- GIVEN the form renders
- THEN a navy hero shows "Create Team" and subtitle
- AND section headings use the red-bordered 16px style

#### Scenario: Light fields

- GIVEN the form renders
- THEN inputs and selects use white backgrounds with dark text

### Requirement: Budget Bar Contract

The budget bar MUST keep byte-identical strings ("{n} player(s) · {cost}k / 1,000k gc", "{X}k remaining", "Over budget by {X}k"), restyled via classes only; the `formatGold` k-format MUST NOT change.

#### Scenario: Within budget

- GIVEN a roster costing 690k of 1,000k
- WHEN the budget bar renders
- THEN it shows "5 players · 690k / 1,000k gc" and "310k remaining"

#### Scenario: Over budget

- GIVEN a roster costing 110k over budget
- WHEN the budget bar renders
- THEN it shows "Over budget by 110k"

### Requirement: Editable Table Without CANT.

The form MUST render the RosterTable in editable mode without a `CANT.` header or qty cell — 11 columns (10 rulebook headers + blank trailing `th`) — keeping rename/remove aria-labels.

#### Scenario: Header set

- GIVEN an editable roster in the form
- WHEN the table header renders
- THEN 11 columns render without `CANT.`

#### Scenario: Remove control preserved

- GIVEN an editable roster
- WHEN a row renders
- THEN the remove button keeps `aria-label="Remove {name}"`

### Requirement: Coaching Staff English Labels

The Coaching Staff section MUST keep English labels (Rerolls, Dedicated Fans, Assistant Coaches, Cheerleaders, Apothecary, League type), light styling, and unchanged `formatGold` strings and aria-labels.

#### Scenario: Labels and aria

- GIVEN the Coaching Staff renders
- THEN the six English labels appear
- AND inputs stay reachable via `getByLabel("Rerolls")` etc.

#### Scenario: Cost strings

- GIVEN coaching quantities set
- WHEN the section renders
- THEN cost text stays in `{X}k gc` format (e.g. "150k gc")

### Requirement: Accessibility Contract Preservation

The restyle MUST NOT change region names ("Roster builder", "Coaching Staff"), "Add {name}" labels, "(n/max)" counters, "Create Team" heading, the race-change `role="alertdialog"`, or the `role="alert"` error texts.

#### Scenario: Regions and counters

- GIVEN the restyled form
- WHEN it renders
- THEN regions, "Add X" labels, and "(n/max)" counters match previous values exactly

#### Scenario: Errors unchanged

- GIVEN an invalid submission
- WHEN error alerts render
- THEN "Team name is required", "at least 3", and "Roster exceeds the 1,000,000 gc budget" texts are unchanged
