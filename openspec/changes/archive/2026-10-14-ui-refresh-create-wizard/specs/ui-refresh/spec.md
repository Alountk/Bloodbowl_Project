# Delta for ui-refresh

Context (unchanged, not duplicated): UIR-1, UIR-3, UIR-4 and UIR-5 remain valid as written in `openspec/specs/ui-refresh/spec.md`. This change touches only the seam requirement.

## MODIFIED Requirements

### Requirement: UIR-2 · Declared Seams

The declared seams MUST be: team detail — `app/teams/[teamId]/page.tsx` (`TeamDetailView` vs `TeamDetailViewV2`) — teams list — `app/teams/page.tsx` (`TeamsPage` vs `TeamsListViewV2`) — dashboard — `features/dashboard/HomeDashboard.tsx` (`Dashboard` vs `DashboardV2`) — and create wizard — `app/teams/create/page.tsx` (`CreateTeamForm` vs `CreateTeamFormV2`). At each seam flag ON MUST render the V2 surface, flag OFF MUST render the legacy surface, never both. Both surfaces at a seam MUST receive an identical props contract (teams list: both take no props; dashboard: both take `{authenticated, userName}`; create wizard: both take `CreateTeamFormProps` with its defaults — the route passes none), and V2 MUST be presentation-only — no NEW data-fetching, mutation, or behavior paths beyond those the legacy surface already uses (shared providers; for the dashboard the legacy surface's own hooks; for the create wizard the legacy surface's own `useCreateTeamForm` hook, `useApp().addTeam`, and `RosterTable`/`PlayerAvailabilityTable`). The create wizard seam MUST be route-level: the `CreateTeamForm` embed inside `features/leagues/CreateLeagueTeamModal.tsx` MUST NOT consult the flag and MUST keep rendering the legacy surface with the flag ON. The dashboard seam MUST sit inside the authenticated dashboard render only: the anonymous Landing branch of `/` in `app/page.tsx` MUST NOT consult the flag.

(Previously: UIR-2 declared three seams — team detail, teams list and dashboard — with no create-wizard seam, no flag-free guarantee for the league-modal embed, and the flag-free landing guarantee.)

#### Scenario: Flag ON selects V2

- GIVEN `bb-ui=next`
- WHEN a declared seam renders
- THEN exactly one surface mounts: `TeamDetailViewV2` on team detail with the same props `TeamDetailView` gets, `TeamsListViewV2` on `/teams` with the same (empty) props `TeamsPage` gets, `DashboardV2` on the dashboard with the same `{authenticated, userName}` props `Dashboard` gets, or `CreateTeamFormV2` on `/teams/create` with the same `CreateTeamFormProps` defaults `CreateTeamForm` gets

#### Scenario: Flag OFF selects legacy

- GIVEN no `bb-ui` cookie
- WHEN a declared seam renders
- THEN the legacy component (`TeamDetailView`, `TeamsPage`, `Dashboard`, or `CreateTeamForm`) renders with its current props and behavior

#### Scenario: Never both surfaces at a seam

- GIVEN either flag value
- WHEN one declared seam renders
- THEN only one of its two components is mounted — no `ui-v2-*` marker alongside that seam's legacy surface (e.g. no `ui-v2-create-*` beside the legacy wizard's `#team-name` input), and no legacy marker alongside V2

#### Scenario: Behavior identical across variants

- GIVEN either surface at the same seam
- WHEN a user runs an action available on that surface (e.g. the hire flow on detail, search or "Crear equipo" on the list, the dashboard's team-summary link, or the wizard's full name→roster→create flow)
- THEN requests and results are identical; only markup differs

#### Scenario: League-modal embed unaffected by the flag

- GIVEN `bb-ui=next`
- WHEN `CreateLeagueTeamModal` renders its embedded `CreateTeamForm`
- THEN the legacy surface renders (no `ui-v2-create-*`), because only the route consults the flag

#### Scenario: Landing unaffected by the flag

- GIVEN `bb-ui=next` and an anonymous visitor in auth mode
- WHEN `/` renders
- THEN the public Landing renders unchanged — the flag is consulted only inside the authenticated dashboard branch
