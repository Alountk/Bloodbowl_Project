# Design: Create Team Rulebook Form

## Technical Approach

Restyle `CreateTeamForm` to the shipped rulebook-light grammar (TeamDetailView vocabulary: navy `#12225a` hero, 16px section h2s with 3px `#d11938` bottom border, light `bg-white border-slate-300 text-slate-900` fields) inside a `max-w-[900px]` white panel; move `<RosterTable>` above the budget bar and role-group add sections inside `Roster builder`; drop CANT. from editable RosterTable mode (11 cols) and collapse its colSpans to 11. Zero logic change; every e2e/unit contract string stays byte-identical. Implements `create-team` spec + `roster-table` delta spec.

## Architecture Decisions

| # | Decision | Options | Tradeoff | Decision |
|---|---|---|---|---|
| D1 | Table placement | first inside `Roster builder` vs above whole section | first keeps region/aria intact, smallest diff | **first** (locked) |
| D2 | CANT. column | keep vs remove | remove unifies headers + rewrites colSpans/tests (spec delta already written); keep contradicts locked decision | **remove**: merge `EDITABLE_HEADERS` into `RULEBOOK_HEADERS`, delete qty `<td>`; `min`/`max` stay on positionals driving `(n/max)` counters (locked) |
| D3 | Section h2s | add "Roster builder" h2 vs headingless | visible string no test pins; book grammar vs minimal | **add h2**; Coaching Staff h2 restyled in place |
| D4 | Palette source | TeamDetailView tokens vs new colors | consistency vs reinvention | **TeamDetailView tokens** (`#12225a`, `#d11938`, `#e2e8f0`/`#f1f5f9`, slate-900) |
| D5 | Budget bar | restyle-only | formatGold strings must stay byte-identical | **classes only** (locked) |

## Data Flow

Props flow unchanged: `CreateTeamForm → RosterTable (players, race, onRename, onRemove, remainingBudget, bannerText, apothecary)`; budget bar and coaching derive from the same `form` state via `formatGold`. Only render order and classes change.

## File Changes

| File | Action | Description |
|---|---|---|
| `features/teams/create/CreateTeamForm.tsx` | Modify | Light restyle; move `<RosterTable>` to top of `Roster builder`; add/restyle section h2s; light dialog/errors/submit/coaching |
| `features/teams/roster-table/RosterTable.tsx` | Modify | Delete `EDITABLE_HEADERS`; unify header map; remove qty `<td>`; editable totals colSpan 10→9, footer 5→4 |
| `features/teams/roster-table/RosterTable.test.tsx` | Modify | Editable 11-col asserts; qty tests → no-qty assert |
| `features/teams/create/CreateTeamForm.test.tsx` | Modify | New table-first + no-CANT. asserts; existing text/role asserts unchanged |
| `e2e/create-team.spec.ts` | — | Untouched |

## Layout Order (exact)

1. Navy hero: `header` `bg-[#12225a] px-6 py-[22px] text-white` — h1 "Create Team" `text-[26px] font-black tracking-[0.02em]`; subtitle `mt-2 text-[13px] text-[#cbd5e1]` (text unchanged)
2. Team name label + input, then Race label + select — light `fieldClassName`
3. Race-change dialog `role="alertdialog"` light amber (`border-amber-300 bg-amber-50 text-amber-900`; Confirm navy, Cancel slate) — text unchanged
4. `<section aria-label="Roster builder">`: (a) h2 "Roster builder" (book style) (b) `<RosterTable>` editable — FIRST (c) budget bar (light) (d) role-group add sections (light `<li>` cards, `aria-label="Add {name}"`, `(n/max)`)
5. `<section aria-label="Coaching Staff">` — light card, English labels, `{X}k gc` totals
6. Errors `role="alert"` — `text-red-600`, texts unchanged
7. Submit `w-full rounded-md bg-[#12225a] px-4 py-2 font-semibold text-white hover:bg-[#0f1d48]`

Class sketches: form `mx-auto max-w-[900px] space-y-6 bg-white px-6 py-6 text-[#1a1a1a] shadow-[0_4px_8px_rgba(0,0,0,0.35)]`; `fieldClassName = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"`; book h2 `mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-[16px] text-[#12225a]`; budget left `text-[#334155]`, right `text-[#64748b]` / over `text-[#d11938] font-semibold`, track `bg-[#e2e8f0]`, fill `bg-[#12225a]` / `bg-[#d11938]`; add `<li>` `border-[#e2e8f0] bg-[#f1f5f9]`, name `text-[#1a1a1a]`, cost `text-[#64748b]`; coaching card `rounded-md border border-[#e2e8f0] bg-[#f1f5f9] p-4`.

## Column / colSpan Contract

| Mode | Headers | Totals row | Footer |
|---|---|---|---|
| editable | 10 rulebook + blank th = **11** | label 9 + cost 1 + budget 1 = **11** | 4 + 6 + blank 1 = **11** |
| readOnly | 10 (unchanged) | 7 + 1 + 2 = **10** | 4 + 6 = **10** |

(Editable was 12/12/12.)

## Interfaces / Contracts

`RosterTableProps` unchanged. Editable body row: first cell is POSICIÓN (text-left); table stops reading `positional.min`; `min`/`max` remain on `Positional` for the add-counters (`countForPositional >= positional.max`, `(n/max)`).

## Testing Strategy

| Layer | What | How |
|---|---|---|
| Unit — RosterTable | editable 11 headers (10 + blank th, no CANT.); no qty cell; totals/footer sums 11 | Update 2 header tests; replace "2-4"/"0-16" tests with no-qty assert; sums 12→11 |
| Unit — CreateTeamForm | table-first order; no CANT. in form | New: `within(region)` first child is the table wrapper (empty-state `<p>` when empty) or `compareDocumentPosition`; existing text/role asserts untouched |
| E2E | 14 tests green, no string diffs | Run `e2e/create-team.spec.ts` as-is |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. Single PR; rollback = `git revert`.

## Open Questions

- [ ] Exact light hues for Add buttons / budget fill within the palette (executor discretion)
- [ ] Confirm adding visible h2 "Roster builder" (no test pins it; alters accessible heading list)
