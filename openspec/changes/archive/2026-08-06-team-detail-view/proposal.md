# Proposal: Team Detail View

## Intent

Users need a way to view their created teams after creation. This change introduces a read-only team detail view that displays the team identity, roster, coaching staff, and derived treasury, accessible via a link from the home page.

## Scope

### In Scope
- Create a read-only team detail view at `app/teams/[teamId]/page.tsx` as a Client Component.
- Add navigation links from `TeamList` team cards to the new detail route.
- Display team identity (name, race, league type).
- Display read-only roster using the existing `RosterTable` component (`readOnly={true}`).
- Display a full per-item breakdown of coaching costs (reusing `computeCoachingCostItems`).
- Display derived treasury (`STARTING_TREASURY - totalCost`).
- Handle unknown teams with a dedicated segment-level `not-found.tsx` page.
- Handle async hydration of the team store with a loading state to prevent premature 404s.

### Out of Scope
- Editing or deleting teams from the detail view.
- Changes to the `Team` model or persistence layer.
- New context methods (e.g., `getTeamById`); lookup will be inline.
- Routing changes to existing pages other than adding links in `TeamList`.

## Capabilities

### New Capabilities
- `team-detail-view`: A read-only detail view for a stored team, accessible by ID, displaying roster and coaching staff summaries.
- `team-not-found`: A segment-level error page for invalid team IDs.

### Modified Capabilities
- `team-list`: Added navigation links to team detail pages.

## Approach

Create a dynamic route `app/teams/[teamId]/page.tsx` as a Client Component. Because params are asynchronous in this version of Next.js, use `React.use(params)` to extract the `teamId`. The page will wait for `isHydrated` from `useApp()`, show a loading state while false, and then attempt to find the team via `teams.find()`. If not found, it calls `notFound()` to trigger a new `app/teams/[teamId]/not-found.tsx` segment. 

The UI will be delegated to a new feature component `features/teams/detail/TeamDetailView.tsx`. This component will compose the existing `RosterTable` with `readOnly={true}` and display a full breakdown of coaching costs (matching `CreateTeamForm` conventions). The treasury is derived on the fly.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/teams/[teamId]/page.tsx` | New | Route page (client component) |
| `app/teams/[teamId]/page.test.tsx` | New | Tests for route logic |
| `app/teams/[teamId]/not-found.tsx` | New | Not found error UI |
| `features/teams/detail/TeamDetailView.tsx` | New | Extracted feature UI |
| `features/teams/detail/TeamDetailView.test.tsx` | New | Component tests |
| `features/teams/TeamList.tsx` | Modified | Add link to team detail |
| `features/teams/TeamList.test.tsx` | Modified | Assert links |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `isHydrated` false at render time causes premature 404 | Medium | Explicitly render loading skeleton until `isHydrated` is true before checking team existence. |
| Next.js App Router params as Promise | Medium | Strict usage of `React.use(params)` per the updated framework conventions. |
| Derived treasury logic mismatch | Low | Reuse existing pure functions (`computeRosterCostFromPlayers`, `computeCoachingCostItems`). |

## Rollback Plan

Revert the commits introducing the new files in `app/teams/[teamId]` and `features/teams/detail`. Remove the `<Link>` additions in `TeamList.tsx` and related tests.

## Dependencies

- Existing pure functions in `features/teams/roster.ts`.
- `RosterTable` component (must support `readOnly`).

## Delivery Context

- **Review Budget**: 400 lines (estimated well under budget).
- **Delivery Strategy**: `ask-on-risk`. 

## Success Criteria

- [ ] Clicking a team card in `TeamList` navigates to `/teams/[teamId]`.
- [ ] Detail view correctly displays read-only roster and per-item coaching staff breakdown.
- [ ] Detail view displays derived treasury correctly based on starting budget minus total cost.
- [ ] Visiting an invalid `/teams/[invalid-id]` displays the segment-level not-found UI, but only after hydration is complete.