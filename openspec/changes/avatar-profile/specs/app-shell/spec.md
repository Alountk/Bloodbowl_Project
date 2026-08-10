# Delta for app-shell

## MODIFIED Requirements

### Requirement: Sidebar Structure

The Sidebar MUST be a white `<aside aria-label="Sidebar">` with right border `border-slate-200`. It MUST show the wordmark "BLOODBOWL" in navy `#12225a` beside a small tag in red `#d11938`, and a nav containing a "Teams" link to `/`, a "Ligas" link to `/leagues`, and a "My Profile" link to `/profile`; these items MUST be declared in a shared `NAV_ITEMS` array used by both the desktop and drawer instances. The active item MUST use navy `#12225a` background with white text; hover MUST use `bg-slate-100`. The desktop Sidebar MUST render with `hidden md:flex` so it stays in the DOM (protecting landmark queries) and only becomes visible at `md+`; the desktop and drawer Sidebars MUST share one markup definition (`SidebarContent` partial) so nav state stays identical.
(Previously: the Sidebar nav contained ONLY "Teams" and "Ligas"; no "My Profile" item.)

#### Scenario: Sidebar landmark and wordmark

- GIVEN the shell renders
- WHEN the desktop Sidebar renders
- THEN it exposes `aria-label="Sidebar"` and shows "BLOODBOWL" with a red tag
- AND its root carries `hidden md:flex`

#### Scenario: Teams, Ligas, and My Profile navigation

- GIVEN the shell renders on any route
- WHEN the nav renders
- THEN it contains the "Teams" link to `/`, the "Ligas" link to `/leagues`, and the "My Profile" link to `/profile`
- AND no other nav items are present

#### Scenario: Active and hover states

- GIVEN the user is on the home route
- WHEN the "Teams" link renders
- THEN it uses navy background with white text
- AND hover styling uses `bg-slate-100`

#### Scenario: Ligas link routes to leagues

- GIVEN the user on a page with the sidebar
- WHEN the "Ligas" link is activated
- THEN the app navigates to `/leagues`
