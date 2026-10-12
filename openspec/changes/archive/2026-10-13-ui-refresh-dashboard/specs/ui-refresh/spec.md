# Delta for ui-refresh

Context (unchanged, not duplicated): UIR-1, UIR-3, UIR-4 and UIR-5 remain valid as written in `openspec/specs/ui-refresh/spec.md`. This change touches only the seam requirement.

## MODIFIED Requirements

### Requirement: UIR-2 · Declared Seams

The declared seams MUST be: team detail — `app/teams/[teamId]/page.tsx` (`TeamDetailView` vs `TeamDetailViewV2`) — teams list — `app/teams/page.tsx` (`TeamsPage` vs `TeamsListViewV2`) — and dashboard — `features/dashboard/HomeDashboard.tsx` (`Dashboard` vs `DashboardV2`). At each seam flag ON MUST render the V2 surface, flag OFF MUST render the legacy surface, never both. Both surfaces at a seam MUST receive an identical props contract (teams list: both take no props; dashboard: both take `{authenticated, userName}`), and V2 MUST be presentation-only — no NEW data-fetching, mutation, or behavior paths beyond those the legacy surface already uses (shared providers, or for the dashboard the legacy surface's own hooks). The dashboard seam MUST sit inside the authenticated dashboard render only: the anonymous Landing branch of `/` in `app/page.tsx` MUST NOT consult the flag.

(Previously: UIR-2 declared two seams — team detail and teams list — with no dashboard seam and no flag-free landing guarantee.)

#### Scenario: Flag ON selects V2

- GIVEN `bb-ui=next`
- WHEN a declared seam renders
- THEN exactly one surface mounts: `TeamDetailViewV2` on team detail with the same props `TeamDetailView` gets, `TeamsListViewV2` on `/teams` with the same (empty) props `TeamsPage` gets, or `DashboardV2` on the dashboard with the same `{authenticated, userName}` props `Dashboard` gets

#### Scenario: Flag OFF selects legacy

- GIVEN no `bb-ui` cookie
- WHEN a declared seam renders
- THEN the legacy component (`TeamDetailView`, `TeamsPage`, or `Dashboard`) renders with its current props and behavior

#### Scenario: Never both surfaces at a seam

- GIVEN either flag value
- WHEN one declared seam renders
- THEN only one of its two components is mounted — no `ui-v2-*` marker alongside that seam's legacy surface (e.g. no `ui-v2-dashboard-*` beside the legacy dashboard), and no legacy marker alongside V2

#### Scenario: Behavior identical across variants

- GIVEN either surface at the same seam
- WHEN a user runs an action available on that surface (e.g. the hire flow on detail, search or "Crear equipo" on the list, the dashboard's team-summary link)
- THEN requests and results are identical; only markup differs

#### Scenario: Landing unaffected by the flag

- GIVEN `bb-ui=next` and an anonymous visitor in auth mode
- WHEN `/` renders
- THEN the public Landing renders unchanged — the flag is consulted only inside the authenticated dashboard branch
