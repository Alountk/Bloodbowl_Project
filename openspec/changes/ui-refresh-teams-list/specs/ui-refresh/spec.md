# Delta for ui-refresh

Context (unchanged, not duplicated): UIR-1, UIR-3, UIR-4 and UIR-5 remain valid as written in `openspec/specs/ui-refresh/spec.md`. This change touches only the seam requirement.

## MODIFIED Requirements

### Requirement: UIR-2 · Declared Seams

The declared seams MUST be: team detail — `app/teams/[teamId]/page.tsx` (`TeamDetailView` vs `TeamDetailViewV2`) — and teams list — `app/teams/page.tsx` (`TeamsPage` vs `TeamsListViewV2`). At each seam flag ON MUST render the V2 surface, flag OFF MUST render the legacy surface, never both. Both surfaces at a seam MUST receive an identical props contract (teams list: both take no props), and V2 MUST be presentation-only — no data-fetching, mutation, or behavior paths beyond those the legacy surface already uses through shared providers.

(Previously: UIR-2 declared only the single team detail seam in `app/teams/[teamId]/page.tsx`, hardwired to `TeamDetailView`/`TeamDetailViewV2`.)

#### Scenario: Flag ON selects V2

- GIVEN `bb-ui=next`
- WHEN a declared seam renders
- THEN exactly one surface mounts: `TeamDetailViewV2` on team detail with the same props `TeamDetailView` gets, or `TeamsListViewV2` on `/teams` with the same (empty) props `TeamsPage` gets

#### Scenario: Flag OFF selects legacy

- GIVEN no `bb-ui` cookie
- WHEN a declared seam renders
- THEN the legacy component (`TeamDetailView` or `TeamsPage`) renders with its current props and behavior

#### Scenario: Never both surfaces at a seam

- GIVEN either flag value
- WHEN one declared seam renders
- THEN only one of its two components is mounted — no `ui-v2-teams-*` marker alongside the legacy `/teams` surface, and no legacy marker alongside V2

#### Scenario: Behavior identical across variants

- GIVEN either surface at the same seam
- WHEN a user runs an action available on that surface (e.g. the hire flow on detail, search or "Crear equipo" on the list)
- THEN requests and results are identical; only markup differs

## RENAMED Requirements

- FROM: `### Requirement: UIR-2 · Single Team Detail Seam`
- TO: `### Requirement: UIR-2 · Declared Seams`

(Reason: UIR-2 now covers every declared seam — team detail AND teams list — not only the team detail screen.)
(Migration: requirement title only; references keyed by the UIR-2 ID are unaffected. The MODIFIED block above carries the full updated content.)
