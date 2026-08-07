# Exploration: Redesign Create Team Form to the Rulebook Style

## Goal
Restyle `CreateTeamForm` to match the approved "rulebook light" design system, with the RosterTable appearing **at the top** of the roster builder (user request: "esta tabla debería aparecer arriba de todo"). Resolve whether the CANT. column stays in editable mode. Preserve all existing e2e + unit contracts.

## Current State

### Form structure (features/teams/create/CreateTeamForm.tsx)
The whole form lives on a dark page (`body` = `bg-slate-900 text-white`, `app/layout.tsx`). Everything uses dark slate inputs/panels:

1. **h1** "Create Team" (`text-2xl font-bold`) + subtitle
2. **Team name** input — `w-full rounded-md border border-blue-600/20 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-500`
3. **Race** select — same dark fieldClassName (`bg-slate-800 text-white`)
4. **Race-change confirm dialog** — `role="alertdialog"` `bg-yellow-900/20 border-yellow-600/40 text-yellow-300`, buttons yellow/neutral
5. **`<section aria-label="Roster builder">`** (only when a race is selected):
   - **Budget bar** — `{playerCount} player(s) · {cost}k / 1,000k gc` left, `remaining`/`Over budget by Xk` right; progress bar `bg-slate-700` track, `bg-blue-500`/`bg-red-500` fill
   - **Role-grouped positional add sections** — for each role, `<h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{role}s</h3>` + `<li>` cards (`bg-slate-800/60 border-blue-600/20`) each with positional name, `{cost}k gc · max {max}`, `({n}/{max})` counter, and `aria-label={"Add "+name}` button
   - **RosterTable** (editable, default) — `bg-slate-400`-color empty state when no players; when populated shows the rulebook light panel
6. **`<section aria-label="Coaching Staff">`** — dark card (`bg-slate-800/40 border-blue-600/20`), h2 "Coaching Staff", 4 numeric inputs (Rerolls/Dedicated Fans/Assistant Coaches/Cheerleaders) + Apothecary checkbox + League type select, all via `fieldClassName`
7. **Error `<p role="alert">`** for name/players/budget
8. **Submit** — `w-full rounded-md bg-blue-600 ... text-white`

### The rulebook light system (already shipped)
- **RosterTable** (`features/teams/roster-table/RosterTable.tsx`) has two modes: **editable** (12 cols: `CANT. | POSICIÓN |…| SECUNDARIAS` + blank trailing th) and **readOnly** (10 cols, no CANT./blank). Both self-contained light: `max-w-[900px] bg-white shadow`, banner navy `#12225a` 28px w/ 5px borders, header red `#d11938`, zebra `even:bg-[#e6eef5]`, navy footer `#12225a`, ES role subtitle, skills ES w/ "Ninguna".
- **`formatRulebookCost`** (`features/teams/format.ts`): `50000 → "50 000"`.
- **TeamDetailView** (`features/teams/detail/TeamDetailView.tsx`): navy `#12225a` hero, section h2 `border-b-[3px] border-[#d11938] text-[16px] text-[#12225a]`, navy-framed cards, ES labels. This is the "book" reference for the form restyle.
- There is **no `create-team` OpenSpec spec** yet — only `roster-table`, `team-detail-view`, `team-list`, `team-not-found`, `race-data-bb2025`.

## Affected Areas
- `features/teams/create/CreateTeamForm.tsx` — primary restyle + reordering; owns the sections, budget bar, add-sections, coaching section
- `features/teams/create/useCreateTeamForm.ts` — **likely unchanged** (state/logic; no layout). Only touched if editable-table semantics change (e.g. CANT. meaning).
- `features/teams/roster-table/RosterTable.tsx` — possibly touched if CANT. column is removed/repurposed in editable mode
- `features/teams/create/CreateTeamForm.test.tsx` — assertions on regions, aria-labels, budget texts; must be preserved or updated
- `e2e/create-team.spec.ts` — 14 tests; budget texts `"50k remaining"`, `"690k left"`, `"(n/max)"`, `"Over budget by Xk"`, regions "Roster builder"/"Coaching Staff", heading "Create Team" — MUST stay green
- `app/teams/create/page.tsx` — unchanged (just renders the form)
- `openspec/specs/roster-table/spec.md` — only if editable-mode column changes

## Layout Options for "Table at the Top"

### Option 1 — Table-first *inside* the `Roster builder` section (above budget bar + add sections)
Move the `<RosterTable>` to the very top of the `Roster builder` region, before the budget bar and positional add sections.
- **Pros**: Keeps "Roster builder" region uninterrupted (budget bar, table, add sections all under one `aria-label`). Minimal e2e risk — regions/`(n/max)`/add-button contracts unchanged, only order. Table empty-state ("No players in roster yet.") appears immediately on race select, directly answering the user request. Smallest diff.
- **Cons**: When the table is empty it sits above the budget bar and add-sections — the "reveal" order changes; user must scroll past add buttons below to see the table once populated. Budget bar slightly less prominent if pushed under the table.
- **Effort**: Low.

### Option 2 — Table directly under the Race select, outside/above the whole `Roster builder` section
Render the table right after the race-change dialog, above the entire builder (pre-race placeholder → select → table → then the `Roster builder` section with budget/adds).
- **Pros**: Table is physically the first thing after choosing a race — strongest possible match to "arriba de todo".
- **Cons**: Splits the RosterTable OUT of the `Roster builder` region (DOM order change). Higher e2e risk if a test scopes table content inside the region (`page.test.tsx` uses `within(rosterSection).getByText("Lineman")` — those are add-card texts, not table, so likely safe). Requires the table + budget row to render before race selection is done; currently table sits inside `{race ? …}` guard — moving outside needs the guard handled.
- **Effort**: Medium.

### Option 3 — Split: table at very top of builder, add-sections + budget bar *after* it
Like Option 1 but ALSO visually detach the add sections into their own light sub-panel, keeping budget bar attached to the table (since the table's totals row already shows `Xk left`).
- **Pros**: Budget redundancy reduced (table totals row already shows remaining), cleanest "book" presentation.
- **Cons**: Larger restyle; the budget bar text contract (`"Xk remaining"` / `"Over budget by Xk"`) currently lives in the builder and is asserted by e2e — moving/restyling it risks the `"1,000k remaining"`/`"690k remaining"` assertions if the text/format changes.
- **Effort**: Medium-High.

**Recommendation: Option 1** — reorder within the existing `Roster builder` region. It satisfies "abajo todo arriba" inside the region with the smallest contract risk.

## Styling Options

### Option A — Full light rulebook form
Mirror TeamDetailView's book presentation across the whole form: wrap in a light `max-w-[860px] bg-white` card, restyle inputs/selects to light (`bg-white border-slate-300 text-slate-900`), navy hero header, red-bordered section h2s, light coaching section.
- Sketches: wrapper `mx-auto max-w-[900px] bg-white text-[#1a1a1a] shadow-[0_4px_8px_rgba(0,0,0,0.35)]`; inputs `w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500`; section h2 `mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]`; submit `bg-[#12225a] ... text-white hover:bg-[#0f1d48]`.
- **Pros**: Consistent "book" feel; matches the shipped detail view exactly.
- **Cons**: Biggest edit surface (~all Tailwind classes in the file); error text colors and dialog need light re-skins; caret/placeholder contrast must be checked.

### Option B — Hybrid: light table + light sections on the existing dark shell
Keep the dark page/form shell but make the RosterTable (already light, self-contained) the centerpiece, and restyle only the add-sections/coaching into light rulebook panels.
- **Pros**: Much smaller diff; the table already renders light and isolated.
- **Cons**: The user explicitly wants the form to *match* the rulebook style — a dark shell with light isolated table reads as inconsistent, not "rulebook light". Half-measure.

### Option C — Light form container, minimal section re-skin
Wrap the form in a light card and swap the fieldClassName to light, but leave structure intact.
- **Pros**: Middle ground; low risk to contracts; visually "light".
- **Cons**: Does not fully match the navy-hero/section-h2 book grammar of the detail view; coaching section would not look like the detail's navy-framed table.

**Recommendation: Option A** (full light) targeting the user's explicit "rulebook light" goal, using TeamDetailView's class vocabulary as the source of truth. It is a styling-only change (no logic), with the diff concentrated in `CreateTeamForm.tsx`.

## CANT. Column in Editable Mode

Current editable mode shows `CANT.` with a derived `{min}-{max}` qty (`e.g. 0-16`) — this is a **reference/limit range**, not a live count (no player-cloning).
- **Keep (recommended)**: The column communicates positional limits at a glance; RosterTable editable tests assert the 12-column set (`"appends CANT. and a blank header cell in editable mode (12 columns)"`, qty `"0-16"`/`"2-4"`); e2e asserts `(n/max)` add-counters which pair with it. Removing CANT. = contracting the editable table and rewriting RosterTable tests + `roster-table/spec.md` (currently mandates 12 editable columns), for no clear gain. **Edge**: e2e `"5 players · 150k / …"` also asserts `"5 players" {exact}` and `"690k left"` — these come from the totals row, unaffected by CANT.
- **Hide option impact**: would change `EDITABLE_HEADERS` to drop `CANT.`, collapse 12→11 columns, break RosterTable.test editable assertions + `roster-table/spec.md` "Rulebook Column Set" editable scenario + the footer/totals colSpan sums (12). Adds real regression risk for a cosmetic gain.

**Recommendation: KEEP** CANT. in editable. Rationale: it carries the min-max position limits the builder relies on, and removing it invalidates just-shipped editable contracts/specs for no functional benefit. (Open question for the user, but supported by evidence.)

## Risk List

| Change | Contracts at risk | Mitigation |
|---|---|---|
| Option 1 reorder (top) | Very low — regions/aria/budget/counters all preserved; only DOM order changes inside `Roster builder` | Keep all aria-labels + region names identical; no `within(region)` assumptions on order in current tests |
| Option A full-light restyle | Error `<p role="alert">` text unchanged (`Team name is required`, `at least 3`, `Roster exceeds the 1,000,000 gc budget`); heading "Create Team" text unchanged; `role="alertdialog"` kept | e2e/unit assert by text + role, not class; keep all text/roles identical |
| Budget bar | e2e asserts `"1,000k remaining"`, `"690k remaining"`, `"Over budget by 110k"`, and `"0 players · 0k / 1,000k gc"` exactly | Keep `formatGold` k-format and exact strings; restyle via class only |
| Coaching Staff | e2e asserts `"0k gc"`, `"100k gc"`, … `"210k gc"` (exact), labels Rerolls/Dedicated Fans/Assistant Coaches/Cheerleaders/Apothecary/League type | Keep labels + formatGold + aria-labels; change only visuals |
| CANT. keep | none (unchanged) | — |
| CANT. hide | RosterTable.test editable (headers=12, qty cells), `roster-table/spec.md` editable 12-col scenario, totals/footer colSpan 12 | Spec delta + test rewrite — avoid unless user insists |

**Spec deltas needed**: a new `create-team` delta spec if one is created during `sdd-spec` (currently none exists). If CANT. is kept (recommended), **no `roster-table` spec change**. If CANT. is hidden, `roster-table/spec.md` + `RosterTable.test.tsx` must change.

**Estimated changed lines**: Option 1 + Option A ≈ **~180–260** lines net in `CreateTeamForm.tsx` (Tailwind swap + reorder), `0` logical lines; `useCreateTeamForm.ts` untouched; no unit/e2e test edits expected (contracts preserved) → comfortably under the 400-line review budget. If CANT. is hidden, add ~40–60 test/spec lines.

## Ready for Proposal
**Yes.** Recommendation: **Option 1 (table-first inside Roster builder) + Option A (full light rulebook form) + KEEP CANT.**. Tell the user: the table moves to the top of the Roster builder region, the whole form is re-skimmed to the light book style mirroring TeamDetailView (navy hero, red-bordered section h2s, light inputs), CANT. is kept in editable because it carries min–max position limits and removing it breaks the just-shipped editable-table spec/tests. No logic change; all 14 e2e + unit contracts stay green.
