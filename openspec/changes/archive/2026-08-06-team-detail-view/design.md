# Design: Team Detail View

## Technical Approach

Add a client-side dynamic route `app/teams/[teamId]/page.tsx` that unwraps `params` via `React.use()` (per Next.js docs `01-app/03-api-reference/03-file-conventions/page.md`, lines 207–220), gates rendering on `isHydrated`, then either calls `notFound()` or renders `<TeamDetailView>`. The feature UI lives in `features/teams/detail/TeamDetailView.tsx` which receives the resolved `team` and `race` from the route page and composes `RosterTable`, coaching breakdown, and treasury display using existing pure functions. `TeamList` is modified to wrap each card in a `<Link>`.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Race resolution location | A) Page resolves and passes `race` prop. B) `TeamDetailView` calls `getRaceById` itself | **A — Page resolves** | Keeps `TeamDetailView` presentational; easier to test with plain props; consistent with container/presenter split. |
| Client vs Server Component for page | Server Component (`await params`). Client Component (`use(params)`) | **Client Component** | Required by proposal; `useApp()` (client context) cannot be called from a Server Component. |
| `not-found.tsx` type | Client Component. Static (no `"use client"`) | **Static** (no directive) | Only renders static UI + `<Link>` — no client state needed. Simpler, lighter. |
| Computed values memoization | Inline `useMemo`. Plain inline derive (no memo) | **Plain inline derive** | Values depend on `team` which is stable reference from context; no performance concern in read-only view. Avoids over-engineering. |
| `TeamDetailView` props shape | `{ teamId }` (pulls from context). `{ team, race }` (pure props) | **`{ team, race }`** | Presentational; testable without context wrapper; race resolution already done in parent. |

## Data Flow

```
URL /teams/[teamId]
  └── app/teams/[teamId]/page.tsx  (Client Component)
        │  use(params) → teamId
        │  useApp() → { teams, isHydrated }
        │
        ├─ isHydrated=false → <LoadingSkeleton data-testid="team-detail-skeleton">
        │
        ├─ team not found → notFound()  ──→  app/teams/[teamId]/not-found.tsx
        │
        └─ team found
             │  getRaceById(team.raceId) → race | undefined
             └─ <TeamDetailView team={team} race={race ?? fallback} />
                   │
                   ├─ Header: team.name, race.name ?? team.raceId, team.leagueType
                   ├─ <RosterTable readOnly players={team.roster} race={race} />
                   ├─ computeCoachingCostItems(race, team.coaching) → per-item list
                   └─ treasury = STARTING_TREASURY - rosterCost - coachingCost
```

## File Changes

| File | Action | Description |
|---|---|---|
| `app/teams/[teamId]/page.tsx` | Create | Route page: `use(params)`, hydration gate, `teams.find()`, `notFound()`, renders `<TeamDetailView>` |
| `app/teams/[teamId]/page.test.tsx` | Create | Route tests: hydration gate, team found, notFound for unknown ID |
| `app/teams/[teamId]/not-found.tsx` | Create | Static segment UI: error message + `<Link href="/">` |
| `features/teams/detail/TeamDetailView.tsx` | Create | Presentational component: identity, RosterTable, coaching breakdown, treasury |
| `features/teams/detail/TeamDetailView.test.tsx` | Create | Component tests: all spec scenarios |
| `features/teams/TeamList.tsx` | Modify | Wrap each `<li>` card content in `<Link href={\`/teams/${team.id}\`}>` |
| `features/teams/TeamList.test.tsx` | Modify | Add assertions for rendered `<a href="/teams/{id}">` elements |

## Interfaces / Contracts

```tsx
// features/teams/detail/TeamDetailView.tsx
interface TeamDetailViewProps {
  team: Team;
  race: Race; // caller passes getRaceById(team.raceId) ?? FALLBACK_RACE
}
// FALLBACK_RACE: synthetic Race with id=team.raceId, name=team.raceId, rerollCost=0, positionals=[]
// ensures RosterTable always gets a valid Race shape; name fallback = raw raceId (spec requirement)

// app/teams/[teamId]/page.tsx
// Loading skeleton contract:
// <div data-testid="team-detail-skeleton" aria-label="Loading team" role="status" />

// not-found.tsx — no props, static export
```

## Testing Strategy

### `features/teams/detail/TeamDetailView.test.tsx`

| Test case | Spec requirement |
|---|---|
| Renders team name, race name, league type | Identity Display |
| Renders `RosterTable` with `readOnly` | Roster Display |
| Shows empty roster fallback text when `roster=[]` | Roster Display — empty |
| Renders per-item coaching breakdown with unit cost and total | Coaching Staff Display |
| Displays correct treasury = `STARTING_TREASURY - rosterCost - coachingCost` | Derived Treasury Display |
| Shows raw `raceId` when race not in catalog | Race-not-in-catalog Fallback |

Pattern: plain `render(<TeamDetailView team={...} race={...} />)` — no context needed.

### `app/teams/[teamId]/page.test.tsx`

| Test case | Spec requirement |
|---|---|
| Renders skeleton while `isHydrated=false` (ControlledStore) | Hydration Gating |
| Does not call `notFound()` while hydrating | Hydration Gating |
| Renders `TeamDetailView` after hydration with valid team | Route Resolution + Team Lookup |
| Calls `notFound()` after hydration for unknown teamId | Team Lookup — not found |

Pattern: `InMemoryTeamStore` + `AppProvider` + `waitFor`; `vi.mock('next/navigation')` to spy `notFound`.  
`use(params)` receives `Promise.resolve({ teamId: '...' })` as the `params` prop.

### `features/teams/TeamList.test.tsx` (additions)

| Test case | Spec requirement |
|---|---|
| Each team card renders `<a href="/teams/{id}">` after hydration | Detail Navigation Link |
| Search filter still works with links present | Preserved List Behavior |

## Threat Matrix

N/A — no routing framework changes, shell commands, subprocesses, VCS/PR automation, executable-file classification, or process-integration boundaries. This change adds a standard Next.js App Router dynamic segment using documented patterns.

## Acceptance Mapping

| Spec Requirement | File | Test description |
|---|---|---|
| Route Resolution (`use(params)`) | `app/teams/[teamId]/page.test.tsx` | "renders detail for known team after hydration" |
| Hydration Gating (skeleton while `isHydrated=false`) | `app/teams/[teamId]/page.test.tsx` | "renders skeleton while hydrating" |
| Hydration Gating (no notFound during hydration) | `app/teams/[teamId]/page.test.tsx` | "does not call notFound while hydrating" |
| Team Lookup — notFound for unknown ID | `app/teams/[teamId]/page.test.tsx` | "calls notFound after hydration for unknown teamId" |
| Identity Display (name, race, league) | `features/teams/detail/TeamDetailView.test.tsx` | "renders team identity" |
| Roster Display (readOnly RosterTable) | `features/teams/detail/TeamDetailView.test.tsx` | "renders RosterTable as readOnly" |
| Roster Display (empty state) | `features/teams/detail/TeamDetailView.test.tsx` | "shows empty roster fallback" |
| Coaching Staff Display (per-item breakdown) | `features/teams/detail/TeamDetailView.test.tsx` | "renders coaching cost breakdown" |
| Derived Treasury Display | `features/teams/detail/TeamDetailView.test.tsx` | "displays correct treasury" |
| Race-not-in-catalog Fallback | `features/teams/detail/TeamDetailView.test.tsx` | "shows raw raceId when race unknown" |
| Post-Hydration Trigger (not-found only after hydrated) | `app/teams/[teamId]/page.test.tsx` | combined with hydration gate tests |
| not-found Error Message + Link to `/` | `app/teams/[teamId]/not-found.tsx` (static, visual review) | no jsdom test needed — pure static markup |
| Detail Navigation Link on team cards | `features/teams/TeamList.test.tsx` | "each team card has a link to detail page" |
| Preserved List Behavior | `features/teams/TeamList.test.tsx` | "search filter works with links present" |

## Migration / Rollout

No migration required. New files only, plus additive change to `TeamList.tsx`. Fully reversible by revert.

## Open Questions

- None blocking. All decisions are resolved.
