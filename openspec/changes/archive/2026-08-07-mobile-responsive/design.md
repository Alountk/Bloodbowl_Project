# Design: Mobile-Responsive Views

## Technical Approach

User-approved **Config A (drawer hamburger) + horizontal-scroll tables**. Desktop markup stays structurally identical (protects e2e + unit contracts); mobile additions are additive Tailwind v4 utilities and one `useState` in AppShell. No new deps, no store/schema change.

The core move: AppShell owns `mobileNavOpen` state and hosts both the always-mounted Desktop Sidebar (`hidden md:flex`) and a conditionally-mounted Drawer Sidebar. `SidebarContent` is extracted so both render identical markup. Topbar gets an `onMenuClick` prop (hamburger, `md:hidden`) and a compact search. Tables gain a nested `overflow-x-auto` wrapper + `min-w-[640px] md:min-w-0` panel; the outer `max-h-[55vh] overflow-auto` container is untouched.

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Desktop sidebar always-mounted vs gate behind drawer state | Always-mounted keeps `getByLabelText("Sidebar")` in `page.test.tsx` green (jsdom ignores media queries). Gated mounting breaks it. | Always-mounted `hidden md:flex` |
| Drawer copy conditionally mount vs permanently in DOM | Two conditionally-mounted copies avoid duplicate aria landmark in default state. | Mount only when open |
| Duplicated Sidebar markup vs shared partial | Duplication drifts. Shared `SidebarContent` keeps nav/active state single-sourced. | Extract `SidebarContent` |
| Add `overflow-x-auto` on outer container vs nested wrapper | Outer change breaks `RosterTable.test.tsx:78` (asserts `max-h-[55vh] overflow-auto`). Nested keeps contract. | Nested wrapper |
| `min-w-[640px] md:min-w-0` vs `min-w-max` | `md:min-w-0` prevents page overflow at 768–880px (240px sidebar + 640px panel > viewport). | `min-w-[640px] md:min-w-0` |
| Drawer state in AppShell vs Topbar | AppShell must render scrim + drawer, so state lives there; hamburger only signals up. | AppShell owns state |

## Data Flow

```
Topbar(onMenuClick) ──open──→ AppShell.mobileNavOpen
                                    │ render when true
                                    ▼
                     scrim(fixed inset-0 z-40) + Drawer Sidebar(fixed z-50)
                                        │ close
          nav-link onClick / scrim onClick /(hamburger is open toggle)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `components/AppShell.tsx` | Modify | Add `mobileNavOpen` state, `openMenu`/`closeMenu`, scrim + drawer JSX, render `Topbar` with `onMenuClick` |
| `components/Sidebar.tsx` | Modify | Extract `SidebarContent`; desktop wraps it in `aside hidden md:flex`; add `variant="drawer"` + `onNavigate` prop |
| `components/Topbar.tsx` | Modify | Accept `onMenuClick`; render hamburger (`md:hidden`, `aria-label="Open navigation menu"`); h1 truncate; compact search on `/` |
| `features/teams/TeamList.tsx` | Modify | Heading row `flex flex-wrap items-center justify-between`; CTA add `py-2.5` |
| `features/teams/create/CreateTeamForm.tsx` | Modify | Step-2 hero `text-2xl md:text-[28px]`, `px-4 sm:px-6`; form panel `px-4 sm:px-6` |
| `features/teams/create/PlayerAvailabilityTable.tsx` | Modify | Nest `overflow-x-auto` wrapper; panel `min-w-[640px] md:min-w-0` |
| `features/teams/detail/TeamDetailView.tsx` | Modify | Hero h1 responsive tokens + `px-4 sm:px-6`; coaching table nested wrapper + `min-w-[640px] md:min-w-0` |
| `features/teams/roster-table/RosterTable.tsx` | Modify | Nest `overflow-x-auto`; panel `max-w-[900px]` → `min-w-[640px] md:min-w-0`; outer untouched |
| `app/page.test.tsx` | Modify | Add drawer open/close + mobile behavior tests (hamburger present) |
| `features/teams/roster-table/RosterTable.test.tsx` | Modify | Add inner-wrapper `overflow-x-auto` + panel `min-w` assertions |

## Interfaces / Contracts

```tsx
// Sidebar.tsx
interface SidebarProps {
  variant?: "desktop" | "drawer";
  onNavigate?: () => void;   // closes drawer on nav link click
}
// Topbar.tsx
interface TopbarProps {
  onMenuClick?: () => void;  // opens drawer (md:hidden hamburger)
}
// AppShell.tsx
const [mobileNavOpen, setMobileNavOpen] = useState(false);
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Drawer open via hamburger, close via scrim + nav link | `app/page.test.tsx`/new AppShell test: click hamburger → drawer `aria-label="Sidebar"` mounts; click scrim/link → unmounts |
| Unit | Single Sidebar landmark when closed | Assert one `getByLabelText("Sidebar")` in default render |
| Unit | RosterTable nested scroll classes | Extend `RosterTable.test.tsx`: inner wrapper `overflow-x-auto`, panel `min-w-[640px] md:min-w-0`; outer assertions unchanged |
| Unit | Hamburger + h1 truncate + compact search | `app/page.test.tsx` home-route assertions |
| E2E | Desktop unchanged | Existing `create-team.spec.ts` (Desktop Chrome 1280×720) passes untouched |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. This change is strictly additive UI class/markup + one local `useState`.

## Migration / Rollout

No migration required. Revert the single PR; additively removable without touching data/store.

## Open Questions

None — Config A + horizontal scroll are user-approved and locked. Mobile viewport manual QA (375px/390px) is covered as a verify-phase check.
