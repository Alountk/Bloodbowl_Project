# Proposal: Rulebook light web shell (web-shell-rulebook)

## Intent

The app runs a two-theme split: `TeamDetailView` / `CreateTeamForm` already ship the approved rulebook-light (navy `#12225a` / red `#d11938` / white) design, but the shell (layout, Sidebar, Topbar) and home list are still dark. This change flips the shell, home, and not-found to full light rulebook (Config C), with a Teams-only sidebar, home restructure (Create New Team CTA + empty states), and route-conditional search — ending the split with zero behavior loss.

## Scope

### In Scope
- Light body base: `bg-[#f8fafc] text-slate-900`; `main` inherits light
- White Sidebar (Config C): navy "BLOODBOWL" logo + red "Teams" tag; single "Teams" nav item; active navy/hover `bg-slate-100`; keep `aria-label="Sidebar"`
- White Topbar: navy h1 "Bloodbowl Teams"; light search input (`bg-white border-slate-300 text-slate-900`) rendered **only on `/`** via `usePathname`; keep `role="search"` + `aria-label="Search teams"`
- Home restructure: h2 "Teams" heading row (navy + red underline) with "Create New Team" CTA → `/teams/create`; rulebook cards (white, `h-[6px]` navy band + red border, navy name, race, roster summary); grid unchanged
- Empty states: no-teams → light panel "No teams yet. Create your first team." + navy CTA; no-match → "No teams match your search."
- not-found: light panel, navy h2 "Team not found" + red underline, navy "Back to teams" → `/`; keep texts/aria
- NEW `app-shell` spec capturing canonical tokens (`#12225a`, `#d11938`, `#f8fafc`, `#e2e8f0`, slate scale, panel shadow `0.1`, zebra `#e6eef5`)
- Test updates: add `vi.mock("next/navigation")` to `app/page.test.tsx` + `features/teams/TeamList.test.tsx` (Topbar/Sidebar gain `usePathname`); **no assertion edits**

### Out of Scope
- CreateTeamForm/TeamDetailView internals (already light)
- Mobile/responsive (future change; design must not worsen mobile)
- TeamList table conversion (deferred, risks e2e home texts)
- Refactoring existing shadow `0.35`/zebra `#f1f5f9` usages (canonical tokens documented in `app-shell`; convergence later)

## Capabilities

### New Capabilities
- `app-shell`: design tokens + light shell layout; route-conditional topbar search; sidebar structure/a11y (`aria-label="Sidebar"`)

### Modified Capabilities
- `team-list`: ADDED requirements — heading row with "Create New Team" CTA; empty states (no-teams CTA panel, no-match panel); rulebook card presentation
- `team-not-found`: **None** (texts/roles/hrefs unchanged; presentation-only)

## Approach

Tailwind inline classes using approved tokens. Topbar + Sidebar become route-aware (`usePathname()`); search renders only on `/`. Preserve every text/role/href contract: h1 "Bloodbowl Teams", card texts, `/no teams yet/i`, `/no teams match your search/i`, not-found texts, e2e "Reikland Reavers"/"Human".

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/layout.tsx` | Modified | body → light base |
| `components/Sidebar.tsx` | Modified | white, Teams-only, active state |
| `components/Topbar.tsx` | Modified | white, navy h1, search only on `/` |
| `features/teams/TeamList.tsx` | Modified | heading row + CTA, cards, empty states |
| `app/teams/[teamId]/not-found.tsx` | Modified | light panel |
| `app/page.test.tsx` | Modified | add `next/navigation` mock only |
| `features/teams/TeamList.test.tsx` | Modified | add `next/navigation` mock only |
| `openspec/specs/app-shell/spec.md` | New | tokens + shell requirements |
| `e2e/create-team.spec.ts` | Unchanged | home assertions stay green |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `usePathname` throws in unit tests without router | High (certain) | `vi.mock("next/navigation")` per existing `CreateTeamForm.test.tsx` pattern |
| Body flip exposes dark-text reliance on sibling routes | Med | Audit sibling routes; not-found explicitly styled |
| E2E home assertions (`getByText("Reikland Reavers"/"Human")`) regress | Low | Card texts preserved; verify e2e |
| Token drift on shadow/zebra | Med | Canonical tokens in `app-shell` spec |

## Rollback Plan

Single-commit scope: `git revert` of the change commit. Styling + additive structure only — no data, logic, or route changes; search behavior identical where rendered.

## Dependencies

- None external. `usePathname` from `next/navigation` (Next.js built-in).

## Success Criteria

- [ ] All unit tests + e2e green — only added mocks, zero assertion edits
- [ ] Light shell renders on `/`, `/teams/create`, `/teams/[id]`, and team 404
- [ ] Search visible only on `/`; hidden on `/teams/create` and other routes
- [ ] `app-shell` spec merged at archive; `team-list` delta covers CTA/empty states
