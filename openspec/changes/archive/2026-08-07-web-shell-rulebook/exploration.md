# Exploration: Rulebook light shell (web-shell-rulebook)

## Current State

The app runs a two-theme split. The **rulebook-light** design system is already approved and shipping in `TeamDetailView` (`features/teams/detail/TeamDetailView.tsx`), the editable `CreateTeamForm` + `RosterTable`, and `PlayerAvailabilityTable`. Everything around it — the app shell (layout, Sidebar, Topbar) and the home list — is still the **old dark** theme.

### Approved rulebook-light tokens (ground truth from `TeamDetailView.tsx` / `RosterTable.tsx` / `CreateTeamForm.tsx`)
- Panel: `mx-auto max-w-[900px] bg-white ... shadow-[0_4px_8px_rgba(0,0,0,0.1)]` (RosterTable) / `max-w-[860px]` + `shadow-[0_4px_8px_rgba(0,0,0,0.35)]` (TeamDetailView) — note the shadow intensity varies per component; a shared choice is needed to converge.
- Navy hero/banner: `bg-[#12225a] px-6 py-[22px] text-white`; subtitle `text-[13px] text-[#cbd5e1]`.
- Red table header: `bg-[#d11938] text-white font-black uppercase`.
- Section h2 (book section): `mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]`.
- Zebra rows: `odd:bg-white even:bg-[#e6eef5]` (RosterTable) / `border-b border-[#e2e8f0] odd:bg-white even:bg-[#f1f5f9]` (TeamDetailView coaching).
- Light inputs: `rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500` (`fieldClassName` in CreateTeamForm).
- Cost format: `formatRulebookCost` (`features/teams/format.ts`) → `50 000` style.
- Spanish labels used where approved (Plantilla, Cuerpo técnico, Tesorería, Paso 1 · Datos del equipo, Siguiente). English is still used in parts of the create flow (Team name, Race, Create Team, Coaching Staff) — the shell is ENGLISH today.

### Remaining dark surface & test coverage
| File | Dark classes today | Tests |
|------|--------------------|-------|
| `app/layout.tsx` | `body className="min-h-screen bg-slate-900 text-white antialiased"` | none (layout itself) |
| `components/AppShell.tsx` | `div.flex.min-h-screen` + `<main className="flex-1 p-6">` (neutral, inherits body bg) | none |
| `components/Sidebar.tsx` | `aside aria-label="Sidebar" w-60 ... bg-slate-950 border-blue-600/20`; logo `text-blue-400`; links `text-slate-300` | none (asserted as `getByLabelText("Sidebar")` in `app/page.test.tsx`) |
| `components/Topbar.tsx` | `header` border-blue; h1 "Bloodbowl Teams"; input `bg-slate-800 text-white placeholder:text-slate-400` | none own test; label `Search teams` asserted in `features/teams/TeamList.test.tsx` |
| `app/page.tsx` → `features/teams/TeamList.tsx` | h2 `text-slate-200`; cards `bg-slate-800/60 border-blue-600/20`, name `text-white`, sub `text-slate-400/500`; empty `text-slate-400` | `features/teams/TeamList.test.tsx` (16 cases) + `app/page.test.tsx` + E2E |
| `app/globals.css` | only `@import "tailwindcss"` | — |
| `app/teams/[teamId]/not-found.tsx` | **bare HTML** (no classes): `main/h1/p/Link` — looks dark only because body is dark | `app/teams/[teamId]/not-found.test.tsx` (2 cases) |

### Test contracts that MUST stay green (addressed in Steps 3–6)
- `app/page.test.tsx`: asserts `getByRole("heading", { name: "Bloodbowl Teams" })`, `getByLabelText("Sidebar")`, `getByRole("heading", { name: "Teams" })`, `/no teams yet/i`.
- `features/teams/TeamList.test.tsx`: asserts heading "Teams", texts "Reikland Reavers", "Human", "Orc", roster summaries (`11 players · 7x Lineman · 4x Blitzer`), `/no teams yet/i`, `/no teams match your search/i`, `getByLabelText(/search teams/i)` AND `getByRole("link", { name: /reikland reavers/i })`, link hrefs `/teams/team-1`, keyboard-focusable links.
- `app/teams/[teamId]/not-found.test.tsx`: asserts heading `/team not found/i`, `/does not exist or may have been removed/i`, link `/back to teams/i` with href `/`.
- `e2e/create-team.spec.ts` (line 106–129, "can create a full team end-to-end"): after creating a team redirects home and asserts `getByText("Reikland Reavers")` and `getByText("Human")` visible.

## Affected Areas
- `app/layout.tsx` — body background/text classes flip from `bg-slate-900 text-white` to a light base (e.g. `bg-[#eef2f7]` or `bg-slate-100`) so `AppShell` and all pages inherit light.
- `components/AppShell.tsx` — main content area bg (if any needed) + default text color; panel containers.
- `components/Sidebar.tsx` — full restyle (navy or white) with focus on keeping `aria-label="Sidebar"`.
- `components/Topbar.tsx` — h1 "Bloodbowl Teams" + search input restyle; MUST preserve `role="search"` and `aria-label="Search teams"`.
- `features/teams/TeamList.tsx` — h2 + card grid restyle to rulebook-light cards/rows.
- `app/teams/[teamId]/not-found.tsx` — add rulebook-light styling (currently bare).
- `app/globals.css` — possibly add shared token utilities / base body background (optional; Tailwind inline classes may suffice).
- `openspec/specs/team-list.md`, `openspec/specs/team-not-found.md` — must NOT regress their requirements. No shell/layout spec exists yet → likely ADD a new `app-shell` (or `web-shell`) domain spec.

---

## Step 1 — Inventory (remaining dark components/tests)

Dark surface to touch: `layout.tsx` (body), `AppShell.tsx` (main), `Sidebar.tsx`, `Topbar.tsx`, `TeamList.tsx`, `not-found.tsx`.

Test coverage of these:
- No dedicated `Sidebar.test.tsx` / `Topbar.test.tsx` / `AppShell.test.tsx` files exist.
- Sidebar is exercised indirectly via `app/page.test.tsx` (`getByLabelText("Sidebar")`).
- Topbar search is exercised via `TeamList.test.tsx` (`getByLabelText(/search teams/i)`).
- `TeamList.test.tsx` asserts all card TEXTS and LINK semantics — these are behavior contracts, not styling. Restyling is safe as long as text/roles/hrefs are preserved.
- `not-found.test.tsx` asserts text + link only — safe under restyle.

**Line-count estimate for the restyle:** ~6 files, mostly className-only edits. Rough deltas: layout 1 line, AppShell 1–2 lines, Sidebar ~10 lines, Topbar ~8 lines, TeamList ~12 lines, not-found ~10 lines, plus optional globals.css token block (~15 lines) = **≈ 55–70 authored lines total**, well under the 400-line PR budget → **single-PR forecast = Yes**.

---

## Step 2 — Shell styling options

### Option A: Navy sidebar + light content area (recommended, most rulebook-faithful)
The sidebar becomes the navy "book cover/binding" `bg-[#12225a]`, mirroring the TeamDetail hero; the content area goes light `bg-[#eef2f7]` (zebra-derived background) and pages keep white panels.

- **Visual**: left navy column (logo + nav in white/slate-100), right light content region with white `max-w-[900px]` panels floating on a softly-tinted background.
- **Tailwind sketch**:
  - `layout.tsx` body: `min-h-screen bg-[#eef2f7] text-[#1a1a1a] antialiased`
  - `Sidebar.tsx`: `aside aria-label="Sidebar" w-60 shrink-0 bg-[#12225a] p-4` ; logo `text-lg font-bold tracking-tight text-white` ; nav links `rounded-md px-3 py-2 text-sm text-[#cbd5e1] hover:bg-white/10 hover:text-white`
  - `Topbar.tsx`: `header flex items-center justify-between border-b border-[#12225a]/20 bg-[#12225a] p-4 text-white` — navy topbar OR white; see 2 color split options below.
  - `AppShell main`: `flex-1 p-6` (light bg inherited from body).
- **Impact**: `layout.tsx`, `AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx`. Keeps content area from being stark white against panels — aligns with the zebra-light background.
- **Effort**: Medium. Sidebar + topbar navy reads as "rulebook spine"; strong brand echo of `#12225a` heroes.
- **Pros**: highest fidelity to approved navy/red/white rulebook look; navy sidebar has strong contrast with light content; few surfaced regressions.
- **Cons**: navy topbar + navy sidebar may look heavy; need to decide if BOTH nav elements go navy (see 2a/2b).

### Option B: Full light shell (white sidebar, navy text, red accents)
Everything light: white sidebar, light topbar, light content. Navy/red only as accents (page titles, borders, buttons).

- **Tailwind sketch**:
  - `layout.tsx` body: `min-h-screen bg-slate-100 text-[#1a1a1a] antialiased`
  - `Sidebar.tsx`: `aside w-60 shrink-0 border-r border-[#e2e8f0] bg-white p-4` ; logo `text-[#12225a]` ; links `text-slate-600 hover:bg-[#e6eef5] hover:text-[#12225a]`
  - `Topbar.tsx`: `header bg-white border-b border-[#e2e8f0]` ; h1 `text-[#12225a]` ; input light per approved field.
- **Impact**: same 4 files.
- **Effort**: Low. Almost no color-risk; pure slate flip to approved slate tones.
- **Pros**: simplest, most cohesive with the white panels already shipping; least visual surprise; nothing conflicting with the approved light-input `border-slate-300`.
- **Cons**: less dramatic "rulebook" identity — loses the navy hero/binding presence on the shell itself.

### Option C: Navy topbar only, light sidebar
Like light-mobile-apps pattern: a navy band across the top, light sidebar below.

- **Tailwind sketch**: Topbar navy per Option A; Sidebar white per Option B; body light.
- **Effort**: Low–Medium.
- **Pros**: single strong navy anchor; avoids two stacked navy regions.
- **Cons**: Sidebar/logo lack the navy identity; slightly less rulebook-cohesive than A.

### Recommendation for shell
**Option A, with a refinement on the topbar:** make the **Sidebar navy (`#12225a`)**, the **topbar white** (`bg-white border-b border-[#e2e8f0]`) with a navy h1 (`text-[#12225a]`) and a red accent, and the content area light `#eef2f7`. Rationale: puts the navy on the persistent sidebar (matches "book binding") so the home `Teams` h2 + detail/create hero blue tie together, keeps the topbar clean for the light search input (which would look wrong inside a navy bar with `bg-white` field — actually fine, a white field on navy is a common pattern, but white topbar is lower-risk against the light input), and avoids a tall double-navy wall. Two-navy (sidebar + topbar) is the more "rulebook" choice but heavier; fla to the user if a single bold navy choice is preferred.

> Note: **Mobile/responsive is explicitly OUT OF SCOPE** (a future change). The shell restyle only touches colors/layout-*neutral* classes; no responsive grid work here.

---

## Step 3 — TeamList options

### Option A: Keep card grid, light rulebook cards (recommended, lowest risk)
Keep the `ul.grid` structure + every text/role/href contract, restyle cards to rulebook-light:
- **Sketch**: container unchanged; `h2` → `className="mb-4 text-[16px] text-[#12225a] border-b-[3px] border-[#d11938] pb-1.5"` (matches book section heading); cards `li` → `rounded-lg border border-[#e2e8f0] bg-white p-4 shadow-[0_4px_8px_rgba(0,0,0,0.1)] hover:border-[#12225a]`; name → `text-[#12225a]`; race → `text-slate-600`; summary → `text-slate-500`; empty/search-message → `text-slate-500`.
- **Pros**: zero behavioral change; all `TeamList.test.tsx` assertions and E2E home assertions remain green (texts/roles/hrefs untouched). Light cards now match `bg-white` panels. No server/e2e risk on home.
- **Cons**: reads as "cards" not the rulebook table; less fidelity than a table but keeps the two E2E home text assertions intact.
- **Effort**: Low.

### Option B: Table-style list like the book (rows with race/roster summary)
Convert the grid to a rulebook table (navy header band, zebra rows) per the table-design precedent.
- **Sketch**: `<table>` with `thead` navy `bg-[#12225a] text-white` headers (e.g. "EQUIPO" / "RAZA" / "PLANTILLA"), `tbody` rows `odd:bg-white even:bg-[#e6eef5]`, each row a `Link` wrapping two/three cells.
- **Pros**: highest rulebook fidelity; consistent with `RosterTable` theme.
- **Cons**: **BREAKS E2E** `getByText("Reikland Reavers")`/`getByText("Human")`? No — texts remain, but **breaks** `TeamList.test.tsx` keyboard-focusable-link test IF rows are wrapped in table cells that are large/ambiguous, and `getByRole("link", { name: /reikland reavers/i })` may still pass but the "11 players · 7x Lineman" summary text interactions and `sm:grid-cols` tests are class-free so they survive. Real risks: row-as-link accessibility, and the `TeamList.test.tsx` assertions that query **plain text** still pass, but `getByRole("link", { name: /reikland reavers/i })` needs the accessible name to be exactly the team name (works if one cell holds the name). Higher churn; more risk for marginal gain on a home page whose approved grid already exists.
- **Effort**: High.

### Option C: Hybrid — keep grid, add a small rulebook table-header treatment per card
Keep grid cards but give each card a navy top band (like a mini-hero) + red underline.
- **Sketch**: `li` `rounded-lg overflow-hidden border border-[#d11938]/30 bg-white shadow...`; top band `bg-[#12225a] px-4 py-2 text-white font-bold` holding team name; body `p-4` race + `border-t border-[#d11938]` summary.
- **Pros**: keeps grid + texts; adds rulebook character (navy band echoes hero).
- **Cons**: extra offset structure; slightly more vertical use; still not a true table.
- **Effort**: Medium.

### TeamList recommendation
**Approach 3A (light cards)**, optionally with the navy-band accent of 3C if the user wants more rulebook presence. It is the only option with **zero** test churn on home. Table conversion (3B) should be deferred to a later change because it risks the E2E home text assertions and requires re-writing `TeamList.test.tsx` focus/role assertions that are part of the shipped spec contract.

---

## Step 4 — Topbar (search + h1)

Preserve **exactly**: `<form role="search">`, `<input aria-label="Search teams">`, `type="search"`, placeholder "Search teams…", and the `searchQuery`/`setSearchQuery` binding.

- **h1**: keep text "Bloodbowl Teams" (asserted by `page.test.tsx`), restyle to navy/text color. In a navy topbar → `text-white`; white topbar → `text-[#12225a]`.
- **Input**: switch from dark `bg-slate-800 text-white placeholder:text-slate-400` to approved light field `rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500`. If the topbar is navy, the white field on navy contrast works.
- **Recommended**: white topbar (`bg-white border-b border-[#e2e8f0]`), h1 `text-[#12225a] text-xl font-bold`, light search input exactly per approved `fieldClassName`. Optionally add a red underline under the h1 (`border-b-[3px] border-[#d11938]`) to echo the book section heading.
- **Impact**: `components/Topbar.tsx` only; `role="search"`/`aria-label` untouched; `TeamList.test.tsx` `getByLabelText(/search teams/i)` and `page.test.tsx` h1 both stay green.

---

## Step 5 — not-found

Current state: `features/teams/[teamId]/not-found.tsx` returns **bare HTML** (`<main><h1>Team not found</h1>...<Link>`). It renders dark only because the dark body provides `text-white` — once the body goes light, it silently becomes light with black text and no panel, so it MUST be explicitly styled.

Light rulebook restyle (keep texts + link exactly):
- **Sketch**: wrap the whole thing in a white panel, navy heading, red accent:
  ```
  <main className="mx-auto max-w-[900px] bg-white p-6 shadow-[0_4px_8px_rgba(0,0,0,0.1)]">
    <h1 className="border-b-[3px] border-[#d11938] pb-1.5 text-[26px] font-black text-[#12225a]">Team not found</h1>
    <p className="mt-3 text-[#1a1a1a]">The team you are looking for does not exist or may have been removed.</p>
    <Link href="/" className="mt-4 inline-block rounded-md bg-[#12225a] px-4 py-2 font-semibold text-white hover:bg-[#0f1d48]">Back to teams</Link>
  </main>
  ```
- **Test impact**: `not-found.test.tsx` asserts heading `/team not found/i`, paragraph text, link name `/back to teams/i` + href `/` → all preserved by this restyle. Zero changes needed.
- **Impact**: `features/teams/[teamId]/not-found.tsx` only.

---

## Step 6 — Risks

- **Shell/body flip**: layout body becomes light; any page relying on dark default text (mostly `not-found.tsx`, now handled) could regress. Audit siblings after flip. **Medium risk — count not-found + confirm TeamList texts still pass; `page.test.tsx` and e2e still green.**
- **E2E home assertions**: `getByText("Reikland Reavers")` and `getByText("Human")` in "can create a full team end-to-end" (create-team.spec.ts:127–128) MUST stay. Approach 3A guarantees this; 3B risks it.
- **`TeamList.test.tsx`**: 16 cases assert texts, search label, link hrefs, keyboard focus. Color-only changes are safe; any semantic/structure change (3B) breaks several of them.
- **`page.test.tsx`**: asserts `getByRole("heading", { name: "Bloodbowl Teams" })` and `getByLabelText("Sidebar")` → must keep h1 text + `aria-label="Sidebar"` on the `<aside>`.
- **No shell spec exists** → the proposal/spec phases should ADD an `app-shell`-style domain spec (or a design-system token doc) capturing the navy/white/red tokens so subsequent screens reuse them; otherwise token drift (the two different shadow intensities already observed: `0.1` vs `0.35`, and `#f1f5f9` vs `#e6eef5` zebra) will keep creeping.
- **Token inconsistency already present**: `shadow-[0_4px_8px_rgba(0,0,0,0.1)]` (RosterTable) vs `...0.35)` (TeamDetailView/CreateTeamForm) and zebra `#e6eef5` vs `#f1f5f9`. The shell change is a good place to standardize (recommend `0.1` panela + `#e6eef5` zebra as canonical).
- **400-line budget**: est. 55–70 authored lines → **single-PR Yes**, no chaining needed. `Decision needed before apply: No`, `Chained PRs recommended: No`, `400-line budget risk: Low`.

---

## Recommendation

Adopt **Option 2A for the shell (navy sidebar, white/light topbar, light `#eef2f7` content)**, **Approach 3A for TeamList (light rulebook cards, optionally navy-band accent)**, light restyle of Topbar preserving `role="search"`/`aria-label`, and the explicit light panel for not-found. Standardize the panel shadows/zebra to `0.1` + `#e6eef5` while touching these files. This delivers full rulebook-light consistency across the web shell with **zero** test-churn on the highest-risk surfaces (home texts, search label, detail/create links, not-found). Defer TeamList table conversion (3B) and mobile/responsive (explicitly out of scope) to future changes.

Product/user confirmations to raise before proposal:
1. Navy on **both** sidebar and topbar, or navy sidebar + white topbar? (recommend latter for less weight.)
2. TeamList: plain light cards or navy-band accent cards? (recommend plain light cards, simplest.)

## Ready for Proposal

**Yes** — pending the two visual-choice confirmations above. When confirmed, delegate `sdd-propose`; spec phase should ADD a new `app-shell`/web-shell domain spec capturing the navy/white/red tokens and the "light shell + light home + light not-found" requirements.
