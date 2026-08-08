# Exploration: Mobile-Responsive Views

## Current State

The app is "rulebook light" (Config C): white shell, navy `#12225a` / red `#d11938` accents, `body bg-[#f8fafc]`. Everything is desktop-first with a fixed-width sidebar and several wide tables that assume an ≥860px viewport. There are a few `sm:`/`lg:` grid classes but no mobile-first shell, drawer, or mobile table strategy. The only CSS is `@import "tailwindcss"` (Tailwind v4) — no custom media queries.

### Shell & layout
- **AppShell** (`components/AppShell.tsx`): `<div className="flex min-h-screen">` → `<Sidebar/>` + `<div className="flex flex-1 flex-col">` → `<Topbar/>` + `<main className="flex-1 p-6">`. Sidebar is always rendered inline; there is **no** mobile toggle state. `main p-6` (24px) padding is generous but fine.
- **Sidebar** (`components/Sidebar.tsx`): `<aside className="w-60 shrink-0 border-r ... p-4">`. Fixed 240px. On a 375px viewport this leaves only ~135px of content — unusable.
- **Topbar** (`components/Topbar.tsx`): `<header className="flex items-center justify-between border-b ... p-4">` with h1 "Bloodbowl Teams" (text-[18px]) on the left and, only on `/`, a search input. `justify-between` will squeeze h1 + input on 375px.
- **layout** (`app/layout.tsx`): `<html lang="en"><body className="min-h-screen bg-[#f8fafc] text-slate-900 antialiased">` → `<AppShell/>`. No viewport-clamp issue.

### Views
- **TeamList / home** (`features/teams/TeamList.tsx`): `<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">` — already single-column by default, so each card is full-width (fine). Header row is `flex items-end justify-between` with h2 + "Create New Team" Link. At 375px the h2 (text-lg) + full button won't fit on one line → wrap or shrink needed.
- **CreateTeamForm** (`features/teams/create/CreateTeamForm.tsx`): form `mx-auto max-w-[900px] ... px-6 py-6`. Step 1 = light panel (team name + race + "Siguiente →" button, `w-full`). Step 2 = navy hero (h1 text-[26px] + race · Paso 2 + "Editar nombre/raza" button), Plantilla section with RosterTable, budget bar, "Jugadores disponibles" (PlayerAvailabilityTable), CoachingStaffSection (`grid gap-4 sm:grid-cols-2` — already stacks to 1 col on mobile), final "Create Team" submit `w-full`. Hero `px-6` and text-[26px] needs downscaling at 375px. Budget bar is `w-full h-2`. Submit button is already `w-full` (good tap target).
- **PlayerAvailabilityTable** (`features/teams/create/PlayerAvailabilityTable.tsx`): 9 columns (POSICIÓN, COSTE, MV, FU, AG, PS, AR, HABILIDADES Y RASGOS, DISP.). Outer `max-h-[55vh] overflow-auto`, inner `max-w-[900px]`. Sticky red header. **Cannot** fit 375px.
- **TeamDetailView** (`features/teams/detail/TeamDetailView.tsx`): `mx-auto max-w-[860px]`. Navy hero (h1 text-[26px], league pill + treasury pill), Plantilla section wrapping RosterTable, coaching `<table>` (4 cols, narrow — fits mobile but padding-heavy), treasury cards `flex flex-wrap gap-2.5` with `flex-1` cards (compress on 375px but wrap ok).
- **RosterTable** (`features/teams/roster-table/RosterTable.tsx`): 11 cols in editable mode (RULEBOOK_HEADERS 10 + remove button col), 10 in read-only. Outer `max-h-[55vh] overflow-auto`, inner `max-w-[900px]`. Sticky header. **Cannot** fit 375px.
- **not-found** (`app/teams/[teamId]/not-found.tsx`): `mx-auto max-w-[900px] border ... p-8` — single text + link. Fine on mobile.

### Tests that could break (risk surface)
- **`features/teams/roster-table/RosterTable.test.tsx` (lines 74-82)**: asserts the outer scroll container has BOTH `max-h-[55vh]` AND `overflow-auto`, plus every header is `sticky top-0 z-10`. If horizontal scroll introduces a separate `overflow-x-auto` wrapper (or changes the outer to `overflow-x-auto`), this test breaks.
- **`app/page.test.tsx` (line 19)**: asserts `screen.getByLabelText("Sidebar")` is truthy. jsdom (default 1024x768) does **not** apply Tailwind media queries, so `hidden md:flex` keeps the element in the DOM and the test still passes. BUT if the sidebar is conditionally rendered only when a mobile drawer is open (rather than CSS-hidden), and the default is closed, this test **fails** — needs updating or the sidebar kept always-mounted in the DOM.
- The coaching table (TeamDetailView) has **no** class assertions in its test.
- CreateTeamForm / PlayerAvailabilityTable / TeamList tests: **no** responsive-class assertions (only `RosterTable` asserts on the scroll container).

### E2E
- `playwright.config.ts` uses `devices["Desktop Chrome"]` (1280×720). `e2e/create-team.spec.ts` (14 tests) asserts **no** responsive/spacing classes (grep returned nothing). Desktop-viewport e2e is **unaffected** as long as we keep the same markup/structure at desktop widths and don't break selectors the spec relies on (roles, labels).

---

## Affected Areas

- `components/AppShell.tsx` — side drawer state (open/close), mobile hamburger, overlay; keep desktop `flex` + `md:flex-row`.
- `components/Sidebar.tsx` — mobile: `hidden md:block` / drawer-content; `w-60` → `w-64 md:w-60` or icon collapse.
- `components/Topbar.tsx` — fit h1 + search at 375px; add hamburger toggle slot on mobile.
- `features/teams/TeamList.tsx` — header row wrap on mobile; card tap target; single-column grid is fine.
- `features/teams/create/CreateTeamForm.tsx` — reduced `px`/hero text on mobile; hero text-[26px]→text-[20px] on small; budget bar + submit stay full-width; step-1 footer button already full-width.
- `features/teams/create/PlayerAvailabilityTable.tsx` — mobile table strategy (see below); keep sticky header.
- `features/teams/detail/TeamDetailView.tsx` — hero text scale, treasury card wrap, coaching table padding, `max-w` panel on mobile.
- `features/teams/roster-table/RosterTable.tsx` — mobile table strategy; MUST keep `max-h-[55vh] overflow-auto` on the outer container (test contract) and add horizontal scroll inside.
- `app/teams/[teamId]/not-found.tsx` — minor; `p-8`→`p-6` + full-width button already-fit.
- `app/layout.tsx` — likely no change (viewport already defaults; no width-constraining styles).
- Tests: `RosterTable.test.tsx`, `app/page.test.tsx` (may need contract updates depending on approach).

---

## Shell / Navigation Options (mobile)

| Option | How | Pros | Cons | Effort |
|--------|-----|------|------|--------|
| **A. Hamburger + overlay drawer** | Add mobile `useState` in AppShell; hamburger button in Topbar (visible `< md`); Sidebar `hidden md:block` plus a drawer copy on `< md` that slides in with an overlay when open; close on nav/link click + Esc + overlay click. | Lowest cognitive load; industry standard; keeps all nav; easy a11y (dialog role, focus trap). | New state + overlay + a 2nd rendered sidebar instance; more markup. | Medium |
| **B. Top-bar nav with tabs** | Hide sidebar entirely; move single "Teams" link into Topbar as a tab/segment. | Smallest change (only 1 nav item). | Not scalable when more nav items arrive; loses the rulebook sidebar look. | Low |
| **C. Collapse sidebar to icons** | `w-60` → `w-14` on `< md` (icon-only). | Keeps persistent nav, no drawer logic. | Still eats 56px; icons need rendering logic; single nav item doesn't justify it. | Low-Med |

**Recommendation: Option A.** With exactly one nav item, A is still the right investment because the app is "rulebook light" and will gain nav items (skills, rulebook) — a drawer is future-proof, matches the white rulebook aesthetic (a slide-out book spine), and keeps desktop markup untouched, which preserves the e2e and most unit contracts. Implement as two `Sidebar` variants sharing one piece of markup (a `SidebarContent` partial) to avoid duplicate styling atom.

---

## Table Strategy on Mobile

All three tables share a rulebook look: sticky red header, tight `px-[5px]` cells, `max-w-[900px]`. None fit 375px. Options:

1. **Horizontal scroll** — keep the table; give the inner `max-w-[900px]` panel a `min-w-max`/`min-w-[640px]` so the wide table scrolls horizontally inside the existing `max-h-[55vh] overflow-auto` container (needs inner `overflow-x-auto` wrapper or rely on `overflow-auto` handling both axes). Pros: zero data loss, minimal markup, preserves sticky header. Cons: vertical + horizontal scroll in one pane.
2. **Card-style rows** — restructure each row into stacked cards (name/stat strip + skills below). Pros: no horizontal scroll, mobile-native. Cons: large markup rewrite, breaks sticky-header test and e2e selectors, big diff, duplicate desktop table.
3. **Hide secondary columns** (`HABILIDADES Y RASGOS`, `PRIMARIAS`, `SECUNDARIAS`, `DISP.`) below a breakpoint and add a details toggle. Pros: fits width. Cons: hides critical data, requires "expand row" interaction, more logic.

### Per-table recommendation
- **RosterTable** (11 cols): **Horizontal scroll** via `min-w` on the inner panel (`min-w-[640px] md:min-w-0`) + an `overflow-x-auto` inner wrapper (or `overflow-auto` on the existing container, which already does both axes). Keep outer `max-h-[55vh] overflow-auto` to preserve the unit-test contract at line 79. Put any added `overflow-x-auto` on a *nested* wrapper so the test's asserted outer class is untouched. Only exception: RosterTable is the primary reading surface for team detail — consider also shortening the editable input name column.
- **PlayerAvailabilityTable** (9 cols): **Horizontal scroll**, same pattern (`min-w-[640px]` inner + `overflow-x-auto`). Users mostly tap the `+ Add` in the last column; horizontal scroll keeps the whole row visible with its action.
- **Coaching table** (TeamDetailView, 4 cols): fits 375px — **no strategy needed**; just tighten `px-[10px]`→`px-2` on small and drop to `text-xs` if needed. Treasury cards already `flex-wrap`.

**Common rule:** any horizontal scroll keeps `overflow-auto`/`overflow-x-auto` + sticky header so both axes scroll in one pane, and test contracts stay intact.

---

## Home Cards on Mobile

- Grid is already `grid gap-3 sm:grid-cols-2 lg:grid-cols-3` → single column at < 640px. **Works**.
- Card inner link `block p-4` → good tap target (~full card height), already large enough.
- **Fix needed:** header row `flex items-end justify-between` (h2 "Teams" + "Create New Team") wraps/squeezes at 375px → make it `flex flex-wrap items-center justify-between` (or `gap-3`) at small widths; keep the CTA full-width or a block below on very small.
- **CTA:** "Create New Team" `px-4 py-2` — make it tap-target ≥40px (`py-2.5`) on mobile.

---

## Wizard on Mobile

- Step 1 panel: header text-[26px] is fine (single line), inputs `w-full`, submit `w-full` — **mostly works**; just reduce outer `px-6` → `px-4` at small widths and keep enough vertical rhythm.
- Step 2 hero (TeamDetail-style): h1 text-[26px] → `text-[20px] sm:text-[26px]`; `px-6` → `px-4 sm:px-6`; "Editar nombre/raza" button already wraps fine.
- Budget bar: `w-full h-2` — **works** at 375px.
- CoachingStaffSection `grid gap-4 sm:grid-cols-2` — already stacks to 1 col — **works**.
- Submit `w-full` — **works**, good tap target.
- Plantilla + Jugadores disponibles sections: covered by the RosterTable / PlayerAvailabilityTable horizontal-scroll strategy above.

---

## Risks

- **`RosterTable.test.tsx:75-82`** asserts outer container has `max-h-[55vh]` AND `overflow-auto`, plus `sticky top-0 z-10` headers. Any horizontal-scroll implementation that changes that outer container's classes breaks the test. Mitigation: add a **nested** `overflow-x-auto` wrapper + `min-w` on the inner panel, leaving the outer contract untouched. This is the highest-risk line.
- **`app/page.test.tsx:19`** asserts `getByLabelText("Sidebar")`. Mitigation: keep the Sidebar **always mounted** on desktop (`hidden md:flex` for the fixed one); render the drawer copy only on demand. jsdom ignores media queries so `hidden md:flex` keeps the element findable. If instead we gate mounting behind drawer-open state, update this assertion to match (e.g., assert the hamburger + closed state).
- **E2E (`create-team.spec.ts`)**: Desktop Chrome 1280×720 — unaffected unless we change landmark roles or the desktop layout. Do NOT global-hide the sidebar at desktop widths; the spec may rely on it being visible. No class assertions found, so safe.
- **Duplicate markup risk**: drawer vs desktop sidebar duplication. Mitigation: extract a shared `SidebarContent` so both render from one definition.
- **Changed-line estimate**: roughly **250–400 lines** across 9 files + 2 test updates. Forecast: **Medium 400-line budget risk** → likely **single PR** if we default the drawer approach and keep tables as horizontal-scroll (no card rewrite). If the team chooses card-style rows, budget jumps and a **chained PR** becomes necessary.
- **Viewport/Meta**: `<html lang="en">` has no explicit `viewport` meta but Next sets one; confirm `width=device-width, initial-scale=1` is present in built output (it is on App Router) so mobile zoom is correct.

---

## Recommendation

- **Shell:** Option A — hamburger + overlay drawer on `< md`, desktop sidebar unchanged (`hidden md:flex`), shared `SidebarContent` partial, hamburger toggled from Topbar. Keep the desktop sidebar always-in-the-DOM to protect the `app/page.test.tsx` Sidebar assertion.
- **Tables:** Horizontal scroll (nested `overflow-x-auto` + `min-w-[640px]` inner panels, sticky header retained) for RosterTable and PlayerAvailabilityTable; coaching + treasury unchanged beyond padding/text tightening. Preserve `RosterTable.test.tsx` outer-container contract.
- **Home:** `flex-wrap` the header row, bump CTA tap target.
- **Wizard:** responsive hero (`text-[20px]`, `px-4`) and `px-4` outer panels; tables handled by the scroll strategy.
- **Delivery:** single PR forecast (~250–400 lines). Keep desktop markup structurally identical to protect e2e.

### Ready for Proposal
Yes. The user should be told: mobile-shell work is a single-PR-sized change built on a drawer + horizontal-scroll strategy that keeps all desktop markup (and therefore the e2e and the two unit-test contracts) intact; the only unit tests likely to need updated assertions are `RosterTable.test.tsx` (if we touch the outer scroll container — we intend not to) and `app/page.test.tsx` (only if we gate Sidebar mounting, which we intend not to).
