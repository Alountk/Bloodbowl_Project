# Design: Rulebook-style RosterTable

## Technical Approach

Restyle `RosterTable` (both modes) to the user-confirmed rulebook light theme and layout: 11 content columns — CANT. | POSICIÓN | COSTE | MV | FU | AG | PS | AR | HABILIDADES Y RASGOS | PRIMARIAS | SECUNDARIAS (+ remove = 12 editable) — Spanish headers, rulebook cost format "50 000" scoped to the cost column, Spanish role subtitle, two access columns, optional banner + rulebook footer inside the table. Data model: `Positional` gains `min?`, `accessPrimary`, `accessSecondary` (letters ⊆ G/A/P/S/M/F; F = Fitness is a real rulebook category). Implements `roster-table`, `team-detail-view`, `race-data-bb2025` deltas; spec deltas required are listed in File Changes.

## Architecture Decisions

| Decision | Options | Choice | Rationale |
|---|---|---|---|
| Headers language | English (old). Spanish (confirmed) | **Spanish** | Locked decision 1; rulebook fidelity. Old "headers stay English" decision REVOKED. |
| Cost format | `formatGold` "50k". `toLocaleString("es-ES")` → "50.000" (dot — wrong). Space formatter | **`formatRulebookCost`: `value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")`** | Matches book "50 000"; no locale dot. Scope: cost column **and** totals cost (table-internal consistency). Budget cell keeps `formatGold` ("690k left" → e2e green); budget bar/coaching keep "50k". |
| Access columns | Single `access` (prior). Two arrays (confirmed) | **`accessPrimary` + `accessSecondary`** | Book has PRIMARIAS/SECUNDARIAS. Valid letters G/A/P/S/M/F; F = Fitness (OCR-noise assumption REVOKED). Normalize per column: keep only those letters, dedupe, order G→A→P→S→M→F; empty → `[]` → "—". |
| Role mapping location | Shared `data/` module. Local in RosterTable | **Local exported `ROLE_TRANSLATIONS` const** | Single consumer; mirrors local `formatGold` pattern. `Lineman→Línea, Thrower→Lanzador, Catcher→Receptor, Blitzer→Blitzer, Big Guy→Grandullón`, fallback `Otro`. |
| Banner/footer props | Single `footer` object. Flat primitives | **`bannerText?: string`, `apothecary?: boolean`** | Flat primitives match prop style (`readOnly`, `remainingBudget`). Reroll cost from `race.rerollCost`, limit `MAX_REROLLS` (8) — no duplicate prop. Footer row renders only when `apothecary` is provided. |
| Banner source | "New Team". Race-name fallback | **`form.name.trim() \|\| race.name` (create); `team.name` (detail)** | Race name is a meaningful default. Banner renders only with a non-empty roster (empty-state early return) — avoids duplicate `team.name` on the detail page; keeps `getByText("Reikland Reavers")` unambiguous. |
| Totals row vs footer | Drop totals. Keep both | **Totals row above rulebook footer** | Totals = functional budget info (count, cost, "Xk left"); footer = book's navy closing band. |
| Subtitle format | `(Raza, Rol)` (decision 3). `Raza Posicional · RolEspañol` (decision 8) | **Decision 3: "(Raza, Rol)"** | User confirmed the rulebook format. ReadOnly keeps the custom `player.name` as the cell primary (protects `getByText("John")`/`"Jane"`); the subtitle is always `(Raza, RolEs)`. |
| Stats alignment | All left. Rulebook | **Center all except POSICIÓN + HABILIDADES Y RASGOS (left)** | Matches book CSS and header spec exactly. |

## Data Flow

```
races.ts (min, accessPrimary, accessSecondary)
   └─→ RosterTable props {race, players, readOnly, bannerText?, apothecary?}
        ├─ CANT.: Math.min(min ?? 0, max) + "-" + max
         ├─ POSICIÓN: player.name (input|span) + pos-subtext "(Raza, RolEs)"
        ├─ COSTE: formatRulebookCost(cost)                     e.g. "50 000"
        ├─ MV/FU/AG/PS/AR: ma / st / ag / pa / av
        ├─ HABILIDADES: translations.es ?? name; no suffix; [] → "Ninguna"
        ├─ PRIMARIAS / SECUNDARIAS: arr.join(" ") | "—"
        └─ tfoot: totals (colSpan=10 + cost + budget[editable])
                 + footer: "0-8 Segundas oportunidades: …" (colSpan=5) | "Apotecario: SÍ/NO" (colSpan=6) [+<td/> editable]
```

## File Changes

| File | Action | Description |
|---|---|---|
| `features/teams/types.ts` | Modify | `Positional` + `min?`, `accessPrimary`, `accessSecondary` |
| `features/teams/data/races.ts` | Modify | Populate both arrays ×144 positionals (Human/Orc/Dwarf first, OCR 180/189/175); `min` where ≠ 0 |
| `features/teams/roster-table/RosterTable.tsx` | Modify | Rulebook theme/columns, `formatRulebookCost`, role map, banner, footer, totals |
| `features/teams/roster-table/RosterTable.test.tsx` | Modify | ES headers, "50 000", "Ninguna", no "(general)", access cols, colSpan, banner/footer |
| `features/teams/data/races-access.test.ts` | Create | Invariants (both arrays, letters ⊆ G/A/P/S/M/F, min≤max) + exact human/orc/dwarf (RED→data→GREEN) |
| `features/teams/create/CreateTeamForm.tsx` | Modify | Pass `bannerText={form.name.trim() \|\| race.name}`, `apothecary={form.coaching.apothecary}` |
| `features/teams/detail/TeamDetailView.tsx` | Modify | Pass `bannerText={team.name}`, `apothecary={team.coaching.apothecary}` |
| `features/teams/detail/TeamDetailView.test.tsx` | Modify | L88 `/^50k$/` ≥2 → assert "50 000" (row + total); John/Jane/remove untouched |
| `openspec/notes/bb2025-ocr-team-audit.md` | Modify | Access normalization log, per column, letters G/A/P/S/M/F |
| `specs/race-data-bb2025/spec.md` | Modify (delta) | **REQ-RACE-07 must cover both arrays** ⊆ {G,A,P,S,M,F}, F valid, canonical order |
| `specs/roster-table/spec.md` | Modify (delta) | ES headers, two access cols, cost "50 000", banner/footer, colSpan 11/12 |

## Interfaces / Contracts

```ts
export interface Positional {
  key: string; name: string; role?: string; cost: number; max: number;
  /** Qty range start; defaults to 0; must never exceed max. */
  min?: number;
  /** Primary skill-access letters ⊆ {G,A,P,S,M,F}; [] renders "—". */
  accessPrimary: string[];
  /** Secondary skill-access letters ⊆ {G,A,P,S,M,F}; [] renders "—". */
  accessSecondary: string[];
  ma: number; st: number; ag: string; pa: string; av: string; skills: SkillId[];
}

function formatRulebookCost(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); // 50000 → "50 000"
}
```

Props: existing + `bannerText?: string` (28px `#12225a`, 5px top/bottom borders, white bg; only when roster non-empty) + `apothecary?: boolean` (undefined → no footer). Footer: `0-${MAX_REROLLS} Segundas oportunidades: ${formatRulebookCost(race.rerollCost)} M.O. cada una` | `Apotecario: ${apothecary ? "SÍ" : "NO"}`.

Theme (CSS-faithful, self-contained vs dark ancestors): container `max-w-[900px] bg-white shadow-[0_4px_8px_rgba(0,0,0,0.1)]` inside existing `overflow-x-auto`; th `bg-[#d11938] px-[5px] py-2 text-center font-black uppercase text-white`; td `px-[5px] py-2 align-top text-[#1a1a1a]`; zebra `odd:bg-white even:bg-[#e6eef5]`; pos-subtext `mt-0.5 block text-[11px] text-[#333]`; footer `bg-[#12225a] text-[13px] font-bold text-white`; banner `border-y-[5px] border-[#12225a] bg-white py-[5px] text-center text-[28px] text-[#12225a]`. Editable controls on white: input `border-slate-300 bg-white text-slate-900 focus:border-blue-500`; remove `text-red-600 hover:text-red-800`.

**colSpan invariant** (sum == header count): readOnly 11 cols → totals `10` + cost `1`; footer `5`+`6` = 11. Editable 12 cols → totals `10` + `1` + budget `1`; footer `5`+`6`+`<td/>` = 12. Re-derive on any column change.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | RosterTable | Exact ES header order (11, +blank th editable); "50 000" in row+totals; "Ninguna" for empty skills (access empties stay "—"); no "(general)"; "Block" English fallback; PRIMARIAS/SECUNDARIAS letters; subtitle "(Human, Línea)" + `Otro` fallback; qty `min:2`→"2-4"; banner/footer render + absent cases; totals/footer colSpans |
| Unit | races-access | Both arrays present; letters ⊆ {G,A,P,S,M,F}; min ≤ max; exact human/orc/dwarf values (RED → data fills → GREEN) |
| Unit | TeamDetailView | L88 cost → "50 000"; John/Jane/remove/no-input assertions stay green |
| E2E | create-team | Green untouched: budget texts ("690k left"), regions, counters, aria-labels, "Add X" — all preserved per decision 9 |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. Access normalization is authored data entry, not runtime process integration.

## Migration / Rollout

No data migration (catalog-only additive fields; `PlayerEntry` untouched). Chained PRs: **PR1** types + races + `races-access.test`; **PR2** RosterTable + consumers + tests. Reversible by revert. Spec deltas (two files above) must land alongside.

## Open Questions

- [x] Subtitle format: decision 3 "(Raza, Rol)" vs decision 8 "Raza Posicional · RolEspañol" — **RESOLVED: user confirmed decision 3 "(Raza, Rol)"**.
- [ ] Canonical access order G→A→P→S→M→F assumed for normalization; confirm.
- [ ] Banner font-weight not in reference CSS (book renders bold); cosmetic.
