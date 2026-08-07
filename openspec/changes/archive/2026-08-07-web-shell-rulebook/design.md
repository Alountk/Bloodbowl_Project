# Design: Rulebook light web shell (web-shell-rulebook)

## Technical Approach

Flip the shell, home, and not-found to the approved rulebook-light surface (Config C, user-locked) using inline Tailwind tokens. Topbar and Sidebar become route-aware via `usePathname()` so the search renders only on `/`. Preserve every existing text/role/href contract so all unit + e2e assertions stay green with zero assertion edits (only added `vi.mock("next/navigation")`).

## Architecture Decisions

### Decision: White sidebar + white topbar (Config C)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Navy sidebar (Option A) | Stronger "binding" but heavier, and conflicts with light input legibility choices | Rejected |
| Full light (Option B/C) | Cohesive with white home panels; navy/red become accents | **Chosen** |

**Rationale**: User-locked Config C. The approved white panels, light `border-slate-300` input, and book-style h2 already ship on detail/create; white shell eliminates the two-theme split with no color-risk on those contracts.

### Decision: Route-conditional search via `usePathname`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Always render search | Works today but search filtering only applies to `/` | Rejected |
| Render search only on `/` | Requires mocking `usePathname` in unit tests (established repo pattern) | **Chosen** |

**Rationale**: Spec `app-shell` requires search to render only on `/`. Repo already mocks `next/navigation` in `CreateTeamForm.test.tsx` and create/detail page tests.

### Decision: Square rulebook cards keep the grid + Link structure

**Choice**: Keep `ul.grid` (`gap-3 sm:grid-cols-2 lg:grid-cols-3`) with `rounded-none` white cards, navy `h-[6px]` top band + red `border-b-2`, navy name, race, summary.
**Alternatives**: Table conversion (rejected — breaks e2e home texts and focus/role tests). Plain light cards (rejected — user locked the band accent).
**Rationale**: Preserves `TeamList.test.tsx` link/focus/href assertions and e2e "Reikland Reavers"/"Human" texts.

## Data Flow

No data/state changes. Components read `usePathname()` (route) and existing `useApp()` context (teams/searchQuery/hydration).

```
usePathname() ─ /  → Topbar renders search form
              └ ≠/ → Topbar renders h1 only

Sidebar usePathname() === item.href → active navy bg / white text
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/layout.tsx` | Modify | body → `min-h-screen bg-[#f8fafc] text-slate-900 antialiased` |
| `components/Sidebar.tsx` | Modify | white bg + `border-r border-slate-200`; "BLOODBOWL" navy logo + red "Teams" tag; single nav link; active state via `usePathname()` |
| `components/Topbar.tsx` | Modify | white header; navy h1; search form only when `usePathname() === "/"`; light input styles |
| `features/teams/TeamList.tsx` | Modify | heading row (navy h2 + red underline + right "Create New Team" CTA); rulebook cards; light empty-state panels |
| `app/teams/[teamId]/not-found.tsx` | Modify | light square panel, navy h2, red underline, navy "Back to teams" |
| `app/page.test.tsx` | Modify | add `vi.mock("next/navigation")` only |
| `features/teams/TeamList.test.tsx` | Modify | add `vi.mock("next/navigation")` only + new assertions (search hidden off-`/`, Teams-only nav, home CTA) |

## Interfaces / Contracts

No new types. Shared hooks: `usePathname()` from `next/navigation`. Sidebar exposes `aria-label="Sidebar"`; Topbar keeps `role="search"` + `aria-label="Search teams"`; TeamList keeps `<Link>` per card, `summarizeRosterFromEntries`, CTA link to `/teams/create`, empty-state strings `/no teams yet/i` and `/no teams match your search/i`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Search hidden when `usePathname() !== "/"` | Render Topbar with mock path `/teams/create`, assert `queryByLabelText("Search teams")` null |
| Unit | Teams-only sidebar nav | Assert no "Create Team" link; only "Teams" link present |
| Unit | Home CTA link | `getByRole("link", { name: /create new team/i })` href `/teams/create` |
| E2E | Home texts + create flow | `create-team.spec.ts` untouched (expect 14 passing) |

Safety net: run existing unit tests before edits; only add mocks + new assertions; zero edits to existing assertions.

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. `usePathname` is read-only Next.js routing context; no new process/exec surface.

## Migration / Rollout

No migration required. Single-commit scope: `git revert` of the change commit. Additive styling + structure only — no data, logic, or route changes.

## Open Questions

- None — design is user-locked.
