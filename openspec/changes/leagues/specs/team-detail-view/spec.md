# Delta for team-detail-view

## MODIFIED Requirements

### Requirement: Identity Display

The system MUST display the team identity in a navy (`#12225a`) hero: team name as primary heading (white, 26px, weight 900), meta line `<b>{race name}</b> · {league name or "Sin liga"}`. The league label MUST be the team's resolved league name when the team is assigned to a league, or the literal Spanish "Sin liga" when `leagueId` is null; the raw `leagueType` enum and its `LEAGUE_LABELS` map MUST no longer exist or render. Below `md` the hero heading MUST use responsive text tokens (e.g. `text-2xl md:text-[28px]`) and the hero padding MUST tighten so the name and tags stay legible at 375px.
(Previously: the meta line showed "{race name} · {Spanish league label}" derived from a `LEAGUE_LABELS` map of the `leagueType` enum — `leagueType` did not exist as a relation.)

#### Scenario: Displaying a valid team

- GIVEN a valid team is found
- WHEN the detail view renders
- THEN the hero shows the team name, bold race, plus the league name or "Sin liga"
- AND tags "Equipo listo" and "Tesorería: 750 000" appear

#### Scenario: Unassigned team shows Sin liga

- GIVEN a team with `leagueId: null`
- WHEN the hero renders
- THEN the meta line shows "Sin liga"
- AND no raw token or legacy league-type label appears

#### Scenario: Superhero league name

- GIVEN a team assigned to a league
- WHEN the hero renders
- THEN the meta line shows the league's display name
- AND "Sin liga" does not appear

#### Scenario: Hero heading responsive

- GIVEN a viewport below `md`
- WHEN the hero heading renders
- THEN it uses the smaller base token that steps up at `md`
