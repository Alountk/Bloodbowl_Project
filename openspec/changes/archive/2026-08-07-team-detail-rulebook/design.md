# Design: Team Detail Rulebook Restyle (Style A)

## Technical Approach

Rewrite `TeamDetailView` to the approved Style A layout (navy `#12225a` hero, book headings, `coach-a` coaching table, 3 treasury cards) with Spanish copy; branch `RosterTable` on `readOnly` to drop `CANT.` + Qty cell (10 cols), suppress banner, and render navy ES totals; centralize `formatRulebookCost` in a shared module. No data/domain changes; `CreateTeamForm` (editable consumer) is untouched. Implements delta specs `team-detail-view` and `roster-table`.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| League labels | Shared module. Local const. Rulebook named leagues | **Local exported `LEAGUE_LABELS: Record<TeamLeagueType, string>` in `TeamDetailView.tsx`**: `open → "Liga Abierta"`, `exhibition → "Exhibición"` | No league catalog exists in code (only raw tokens); single display consumer (create-form select is out of scope). Mirrors the `ROLE_TRANSLATIONS` local-const precedent. Render `LEAGUE_LABELS[t] ?? t` as defensive fallback. Tests assert exact strings. |
| `formatRulebookCost` home | Keep in `RosterTable` (export). Move to `roster.ts`. New `format.ts` | **Move to new `features/teams/format.ts`** | Presentation helper, not domain — `roster.ts` stays pure. Importing it from `RosterTable` (a `"use client"` component) into `TeamDetailView` couples components. `format.ts` is 5 lines, no directive; update the 3 import sites (RosterTable, RosterTable.test, TeamDetailView). |
| readOnly footer path | Remove entirely (no consumer). Keep, corrected spans | **Keep with colSpans 4+6=10** | The roster-table delta spec explicitly requires footer colSpans to sum to the rendering mode's column count *including read-only*; removing contradicts the spec. Path is inert (no readOnly consumer passes `apothecary`) but stays documented and tested. |
| readOnly totals row | — | **Navy `#12225a` bold row**: label `colSpan={7}` + cost `colSpan={1}` + empty `colSpan={2}` = 10 | Spec mandates navy row, ES label, sum == header count. Matches prototype footer `<td colspan="7">…</td><td>…</td><td colspan="2">`. Editable totals unchanged (10+1+1=12, "2 players", `formatGold` budget). |
| Banner mode-gate | — | `showBanner = !readOnly && bannerText !== undefined && bannerText.length > 0` | Spec: read-only suppresses banner even when `bannerText` provided. Existing banner tests currently render `readOnly` — they flip to editable. |

## Data Flow

```
page.tsx (resolve race/FALLBACK_RACE) ──→ TeamDetailView {team, race}
  ├─ computeRosterCostFromPlayers ──→ rosterCost
  ├─ computeCoachingCostItems ──→ 4 items (no apothecary)
  ├─ computeCoachingCost ──→ coachingTotal (items Σ + apothecary? APOTHECARY_COST : 0)
  └─ STARTING_TREASURY − rosterCost − coachingTotal ──→ treasury
       │
       ├─→ hero (name, race, league label, "Tesorería: {treasury}")
       ├─→ RosterTable readOnly {players, race}            // no bannerText/apothecary
       ├─→ coach table: items + Apotecario row + total row
       └─→ 3 treasury cards
```

**Key formulas**: `coachingTotal = computeCoachingCost(race, team.coaching) = Σ items[i].total + (coaching.apothecary ? APOTHECARY_COST : 0)` — used by BOTH the table total row and the "Cuerpo técnico" card (apothecary already included; `computeCoachingCostItems` excludes it). Apotecario row: Cantidad `SÍ` (green `#16a34a`, bold) / `NO`; unit `formatRulebookCost(APOTHECARY_COST)` = "50 000"; total `formatRulebookCost(apothecary ? APOTHECARY_COST : 0)`. `treasury = STARTING_TREASURY − rosterCost − coachingTotal`.

## File Changes

| File | Action | Description |
|---|---|---|
| `features/teams/format.ts` | Create | `formatRulebookCost` (moved verbatim from RosterTable) |
| `features/teams/detail/TeamDetailView.tsx` | Rewrite | Style A hero + 3 ES sections + coaching table + treasury cards; drop local `formatGold`; stop passing `bannerText`/`apothecary`; Spanish `COACHING_LABELS` (`rerolls→Segundas oportunidades, dedicatedFans→Fanáticos dedicados, assistantCoaches→Entrenadores asistentes, cheerleaders→Animadoras`); `LEAGUE_LABELS` |
| `features/teams/roster-table/RosterTable.tsx` | Modify | readOnly: 10 headers (prepend `CANT.` only when editable), no Qty td, no banner, navy totals (7+1+2), footer 4+6; editable unchanged (12, banner, budget, footer 5+6+1); import `formatRulebookCost` |
| `features/teams/detail/TeamDetailView.test.tsx` | Rewrite | ES hero/sections/labels, apotecario SÍ/NO + totals, treasury cards, no banner/footer, readOnly spans |
| `features/teams/roster-table/RosterTable.test.tsx` | Modify | 10 readOnly headers, qty/banner tests → editable, navy totals sum 10, footer sum 10/12, `formatRulebookCost` import from `../format` |
| `app/teams/[teamId]/page.test.tsx` | None | Verify only — asserts `getByText("Test Team")`; hero `<h1>` still satisfies it |

## Interfaces / Contracts

```ts
// features/teams/format.ts
export function formatRulebookCost(value: number): string // "50 000"

// TeamDetailView.tsx — layout (Tailwind mirrors prototype A)
<div className="mx-auto max-w-[860px] bg-white text-[#1a1a1a] shadow-[0_4px_8px_rgba(0,0,0,0.35)]">
  <header className="bg-[#12225a] px-6 py-[22px] text-white">          {/* hero-a */}
    <h1 className="text-[26px] font-black tracking-[0.02em]">{team.name}</h1>
    <p className="mt-2 text-[13px] text-[#cbd5e1]">
      <b className="text-white">{race.name}</b> · {LEAGUE_LABELS[team.leagueType] ?? team.leagueType}
    </p>
    <div className="mt-3">
      <span className="mr-[6px] inline-block rounded-full border border-white/25 bg-white/10 px-[10px] py-[3px] text-[12px] font-bold text-white">Equipo listo</span>
      <span className="inline-block rounded-full border-[#d11938] bg-[#d11938] px-[10px] py-[3px] text-[12px] font-bold text-white">Tesorería: {formatRulebookCost(treasury)}</span>
    </div>
  </header>
  <div className="px-6 py-[18px]">                                      {/* panel-a */}
    <section>                                                           {/* section-a */}
      <h2 className="mb-[14px] border-b-[3px] border-[#d11938] pb-[6px] text-[16px] text-[#12225a]">Plantilla</h2>
      <RosterTable readOnly players={team.roster} race={race} />
    </section>
    <section className="mt-5">
      <h2 className="mb-[14px] border-b-[3px] border-[#d11938] pb-[6px] text-[16px] text-[#12225a]">Cuerpo técnico</h2>
      {/* coach-a: table text-[13px]; thead th bg-[#12225a] text-white uppercase text-left text-[12px] font-bold px-[10px] py-[7px];
          body tr odd:bg-white even:bg-[#f1f5f9]; td px-[10px] py-[7px] border-b border-[#e2e8f0];
          .num cells text-right tabular-nums; .yes text-[#16a34a] font-bold; .total-row bg-[#e2e8f0] font-bold (label colSpan 3 + total) */}
    </section>
    <section>
      <h2 className="mb-[14px] border-b-[3px] border-[#d11938] pb-[6px] text-[16px] text-[#12225a]">Tesorería</h2>
      {/* treasury-a: flex flex-wrap gap-[10px]; card flex-1 min-w-[180px] rounded-[6px] border border-[#e2e8f0] bg-[#f1f5f9] p-[10px_14px] text-center;
          .k text-[11px] uppercase tracking-[0.05em] text-[#64748b]; .v mt-[2px] text-[18px] font-extrabold text-[#12225a];
          .gold .v text-[#d11938] (Tesorería restante) */}
    </section>
  </div>
</div>
```

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | TeamDetailView | Hero: name, bold race, "Liga Abierta" / "Exhibición" (raw `open`/`exhibition` never in DOM), tags "Equipo listo" + "Tesorería: 750 000"; 3 ES headings; coaching rows + always-present Apotecario (SÍ/NO, unit 50 000, total 50 000/0) + "Total cuerpo técnico" = items Σ + 50 000; treasury cards (incl. apothecary case: card +50 000, restante −50 000); player names as spans; FALLBACK_RACE raw id; no `Segundas oportunidades`/`Apotecario` footer text |
| Unit | RosterTable | readOnly: exactly 10 `th scope="col"` ES headers (no CANT., no blank), no Qty cell, no banner even with `bannerText`, navy totals "{n} jugadores · Coste total" sum 10, footer 4+6=10; editable: 12 headers, qty min-max, banner, "2 players" + budget sum 12, footer 5+6+1=12; absent `apothecary` → no footer; `formatRulebookCost` unit cases (import moved) |
| Integration | page.test.tsx | Verify only — "Test Team" resolves via hero h1; no change expected |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration. Presentation-only; `RosterTable` prop API unchanged (only call sites differ). **Estimate**: ~430–470 changed lines (TeamDetailView + test rewrites dominate) — near the 400-line review budget; single PR, but sdd-tasks should confirm slicing (guard: `400-line budget risk: Medium`).

## Open Questions

- [ ] League label wording is product content ("Liga Abierta"/"Exhibición" pinned defaults — each is a one-string change if the user prefers e.g. "Amistoso").
