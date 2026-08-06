# Exploration: team-detail-view

> Phase: explore | Change: team-detail-view | Date: 2026-08-06

---

## Current State

### App Routes (verified from `app/`)

| Path | File | Purpose |
|------|------|---------|
| `/` | `app/page.tsx` | Home — renders `<TeamList />` |
| `/teams/create` | `app/teams/create/page.tsx` | Renders `<CreateTeamForm />` |

No `/teams/[teamId]` route exists today. The `app/teams/` directory only contains `create/`.

### TeamList Today

`features/teams/TeamList.tsx` is a `"use client"` component that:
- Reads `{ teams, isHydrated, searchQuery }` from `useApp()`.
- Renders teams as a `<ul>` grid of card `<li>` elements.
- Each card shows: team name, race name, roster summary (via `summarizeRosterFromEntries`).
- **No navigation link exists** — cards are static, not interactive. No `<Link>` to a detail view.

### AppProvider / useApp

`app/providers/AppProvider.tsx` exposes via context:
```ts
interface AppContextValue {
  teams: Team[];        // all persisted teams
  isHydrated: boolean;  // async hydration flag (false until localStorage resolves)
  addTeam: (values) => Promise<void>;
  removeTeam: (id: string) => Promise<void>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}
```
- **There is no `getTeamById` method** — a single-team lookup must be done client-side via `teams.find(t => t.id === teamId)`.
- Hydration is async: `useEffect` calls `store.list()` and sets `isHydrated = true` on resolution.
- No server-side data fetching; all data lives in `localStorage` via `LocalStorageTeamStore`.

### Team Model (verified `features/teams/types.ts`)

```ts
interface Team {
  id: string;
  name: string;
  raceId: string;           // references Race in features/teams/data/races.ts
  roster: PlayerEntry[];    // each: { id, name, positionalKey }
  coaching: CoachingStaff;  // rerolls, dedicatedFans, assistantCoaches, cheerleaders, apothecary
  leagueType: TeamLeagueType; // "exhibition" | "open"
}
```
- No `treasury` field on `Team` itself — treasury is a **derived value**: `STARTING_TREASURY - totalCost`.
- No `startingSkills` field either — starting skills come from the `Positional` definition (via `Race`), not stored on the team.
- `Race.rerollCost` drives the per-reroll cost calculation (`computeCoachingCostItems` in `features/teams/roster.ts`).

### RosterTable Public API (verified `features/teams/roster-table/RosterTable.tsx`)

```ts
interface RosterTableProps {
  players: PlayerEntry[];
  race: Race;
  readOnly?: boolean;       // ✅ ALREADY EXISTS — defaults to false
  showTotals?: boolean;     // defaults to true
  onRename?: (id, name) => void;
  onRemove?: (id) => void;
  remainingBudget?: number;
}
```

**`readOnly` is already fully implemented:**
- When `readOnly = true`: renders player name as a `<span>` (not `<input>`), hides the remove `<button>` column, hides the `remainingBudget` cell in the tfoot.
- No changes to `RosterTable` are required for the detail view.

### Cost / Treasury Utility Functions (`features/teams/roster.ts`)

- `computeRosterCostFromPlayers(race, players)` → total player cost.
- `computeCoachingCostItems(race, coaching)` → coaching line items with unit/total costs.
- `STARTING_TREASURY = 1_000_000`, `APOTHECARY_COST = 50_000`.
- These are all pure functions usable directly in the detail view component.

---

## Routing Options

> Source: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`

### Option A — Dynamic route `app/teams/[teamId]/page.tsx` ✅ RECOMMENDED

Create `app/teams/[teamId]/page.tsx` as a **Client Component** (required because data comes from `useApp()` / `localStorage`, not server-side).

Per the Next.js docs, in a Client Component page:
- `params` is a `Promise<{ teamId: string }>` — must be unwrapped via `React.use(params)`.
- TypeScript helper: `PageProps<'/teams/[teamId]'>` types it correctly.
- `useParams()` hook is also available anywhere in the client component tree.

```tsx
// app/teams/[teamId]/page.tsx  (illustrative shape — NOT implementation code)
'use client'
import { use } from 'react'
// ... useApp, getRaceById, notFound from 'next/navigation'

export default function TeamDetailPage({ params }: PageProps<'/teams/[teamId]'>) {
  const { teamId } = use(params)
  // client-side lookup from hydrated store
}
```

Not-found handling: call `notFound()` from `'next/navigation'` when the team is not found. Per `not-found.md`, this triggers `not-found.js` in the nearest route segment (or global 404). A segment-level `app/teams/[teamId]/not-found.tsx` can provide a friendly message with a link back.

- **Pros**: Clean URL (`/teams/:id`), shareable/bookmarkable, consistent with `/teams/create` pattern already in place, standard Next.js App Router convention.
- **Cons**: As a pure client component, requires `useApp()` — which means the full `AppProvider` hydration must complete before the team can be displayed (same constraint as all other pages in this app).
- **Effort**: Low

### Option B — Inline expansion / modal on home page

Expand team cards in-place on `app/page.tsx` (e.g., a selected-team panel, a modal, or an accordion).

- **Pros**: No new route, no navigation, no URL change.
- **Cons**: No shareable URL; complicates `app/page.tsx` and `TeamList` with selection state; does not align with the existing route-per-feature pattern (`/teams/create`); harder to test in isolation.
- **Effort**: Medium

---

## Data Flow Options

### Option A — Client-side lookup via `useApp().teams` ✅ RECOMMENDED

Since all data lives in `localStorage` and is hydrated once at app startup via `AppProvider`, the simplest approach is:
1. Read `teamId` from URL params.
2. Wait for `isHydrated === true`.
3. Call `teams.find(t => t.id === teamId)`.
4. If undefined → `notFound()`.

No new store method, no new context surface needed.

**Hydration timing**: The page should render a loading skeleton (or null) while `!isHydrated` — same pattern used in `TeamList`. This avoids a flash of "not found" before data loads.

### Option B — Add `getTeamById(id)` to AppContextValue

Expose a helper on the context to encapsulate the lookup.

- **Pros**: Slightly cleaner consumer code.
- **Cons**: Adds surface to the shared context for a trivial `Array.find`; not worth it for this scope.
- **Effort**: Low but unnecessary

---

## Reuse Boundaries

| Need | Already Exists? | Action |
|------|----------------|--------|
| `RosterTable` in read-only mode | ✅ `readOnly` prop exists | Pass `readOnly={true}`, no edit callbacks |
| Roster cost calculation | ✅ `computeRosterCostFromPlayers` | Import and call directly |
| Coaching cost breakdown | ✅ `computeCoachingCostItems` + constants | Import and call directly |
| Race lookup by `raceId` | ✅ `getRaceById(id)` in `features/teams/data/races.ts` | Import directly |
| Skill label display | ✅ `getSkillById(id)` used inside RosterTable | Already handled by RosterTable |
| Team-not-found UI | ❌ Does not exist | Create `app/teams/[teamId]/not-found.tsx` |
| Team list link to detail | ❌ `TeamList` has no `<Link>` | Add `<Link href={\`/teams/${team.id}\`}>` to each card |

The detail view is a **net-new component** — something like `features/teams/detail/TeamDetailView.tsx` — that composes the above pieces. The route page (`app/teams/[teamId]/page.tsx`) stays thin, delegating rendering to this feature component.

---

## Testing Approach

The project uses strict TDD with co-located tests (`*.test.tsx` next to source), Vitest + `@testing-library/react`, and `InMemoryTeamStore` for isolation.

### Established Pattern (from `app/teams/create/page.test.tsx`)

```tsx
// Hydration probe pattern to avoid React act() warnings:
function HydrationProbe() {
  const { isHydrated } = useApp();
  return <div data-testid="hydration-probe" data-hydrated={String(isHydrated)} />;
}

act(() => {
  render(
    <AppProvider store={store}>
      <HydrationProbe />
      <ComponentUnderTest />
    </AppProvider>
  );
});
await waitFor(() => {
  expect(screen.getByTestId('hydration-probe')).toHaveAttribute('data-hydrated', 'true');
});
```

### Test Cases for `TeamDetailView`

**Feature component tests** (`features/teams/detail/TeamDetailView.test.tsx`):
1. Renders team name, race name, league type, and coaching staff when team is provided.
2. Renders `RosterTable` with `readOnly={true}` and correct `players` + `race` props.
3. Displays total roster cost (from `computeRosterCostFromPlayers`).
4. Displays coaching cost breakdown (from `computeCoachingCostItems`).
5. Renders "No players in roster yet." when roster is empty (delegated to RosterTable).
6. Apothecary is shown/hidden correctly based on `coaching.apothecary`.

**Route page tests** (`app/teams/[teamId]/page.test.tsx`):
1. Renders detail view for a stored team (wrap with AppProvider + InMemoryTeamStore seeded with team).
2. Calls `notFound()` (mock `'next/navigation'`) when teamId does not match any stored team.
3. Shows loading state / skeleton while `!isHydrated`.

**TeamList link tests** (add to `features/teams/TeamList.test.tsx`):
1. Each team card contains a `<Link>` pointing to `/teams/${team.id}`.

> **Note on `useParams` vs `use(params)`**: Since the page is a Client Component, both work. Using `use(params)` per the docs is the canonical approach when params come from props; `useParams()` is also valid from within deeper client components. Either pattern is testable with a mocked `next/navigation`.

---

## Risks and Edge Cases

| Risk | Severity | Notes |
|------|----------|-------|
| `isHydrated` false at render time | MEDIUM | Show loading state to avoid `notFound()` firing prematurely on first render before localStorage resolves |
| Team not found after hydration | MEDIUM | Call `notFound()` → Next.js 404 page; add segment-level `not-found.tsx` for good UX |
| Empty roster (`roster: []`) | LOW | RosterTable already handles this: renders "No players in roster yet." |
| Race not in catalog (`getRaceById` returns undefined) | LOW | Defensive: show `team.raceId` as fallback, same as `TeamList` today |
| `coaching.dedicatedFans` starts at 1 by DEFAULT_COACHING | LOW | Display raw value; cost calculations account for this via `DEDICATED_FANS_START` constant |
| `params` is a Promise in Next.js App Router (this version) | MEDIUM | Must use `use(params)` or `useParams()` — NOT synchronous access; sync access is deprecated per docs |
| Treasury display: no stored value | LOW | Derive: `STARTING_TREASURY - totalRosterCost - totalCoachingCost`; document this is a starting-budget view |
| i18n / label consistency | LOW | No i18n system in place; use same label conventions as `CreateTeamForm` (e.g. "Rerolls", "Dedicated Fans") |

---

## Scope Boundaries (Non-Goals)

- **No editing**: the detail view is strictly read-only.
- **No deletion from detail view**: deletion stays in `TeamList` (or can be a future phase).
- **No new Team model fields**: the current model is sufficient; treasury is derived.
- **No persistence changes**: `LocalStorageTeamStore` / `TeamStore` interface unchanged.
- **No new AppContextValue methods**: `getTeamById` is NOT needed; `teams.find()` in the component is sufficient.
- **No routing changes to existing pages**: `/teams/create` and `/` remain untouched.
- **No race/skill data changes**.

---

## Affected Areas

- `app/teams/[teamId]/page.tsx` — new file (route page, client component)
- `app/teams/[teamId]/page.test.tsx` — new file (route-level tests)
- `app/teams/[teamId]/not-found.tsx` — new file (team-not-found UI)
- `features/teams/detail/TeamDetailView.tsx` — new file (feature component)
- `features/teams/detail/TeamDetailView.test.tsx` — new file (component tests)
- `features/teams/TeamList.tsx` — minor change: add `<Link>` to each team card
- `features/teams/TeamList.test.tsx` — add link assertion tests

**Unchanged**:
- `features/teams/roster-table/RosterTable.tsx` — no changes needed
- `app/providers/AppProvider.tsx` — no new surface needed
- `features/teams/types.ts` — no new fields
- `features/teams/store/` — unchanged

---

## Recommendation

**Approach**: Dynamic route `app/teams/[teamId]/page.tsx` (Option A) + client-side lookup from `useApp()` (Data Flow Option A).

**Rationale**:
- `readOnly` already exists on `RosterTable` — the primary reuse concern is already solved.
- A dedicated route is consistent with `/teams/create`, gives a shareable URL, and is the most testable shape.
- `params` must be treated as a Promise in this Next.js version; use `use(params)` in the client component page, or `useParams()` from within the feature component (both valid, per docs).
- The only meaningful new code is: a thin feature component (`TeamDetailView`) composing existing utilities, the route page, the not-found segment, and a link in `TeamList`.
- Total scope is small: ~5 new files, 1 minor edit to `TeamList`.

---

## Ready for Proposal

**Yes.** All unknowns are resolved:
- `readOnly` prop exists on `RosterTable` — no RosterTable changes needed.
- Team model is sufficient — no new fields.
- Routing pattern is confirmed via Next.js docs — params is a Promise, use `use(params)`.
- Data flow is clear — client-side find from hydrated context.
- Testing pattern is established — hydration probe + InMemoryTeamStore.

The next phase (proposal) should confirm: (1) whether `TeamDetailView` should display a full coaching cost breakdown or a simpler summary, and (2) whether the `not-found` page should be a shared segment or just redirect to `/`.
