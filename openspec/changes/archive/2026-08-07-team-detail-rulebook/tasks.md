# Tasks: Team Detail Rulebook Restyle (Style A)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~430–470 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 (single-view rewrite forced) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
```

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Derive `format.ts`; RosterTable readOnly 10-col contract + navy totals/footer spans | PR 1 | `pnpm vitest run features/teams/roster-table/RosterTable.test.tsx` | `pnpm dev` → team detail in readOnly (RosterTable 10 cols, no banner) | Revert RosterTable+format.ts; editable path unaffected |
| 2 | TeamDetailView Style A rewrite (hero, ES sections, coach table, cards) | PR 2 | `pnpm vitest run features/teams/detail/TeamDetailView.test.tsx` | `pnpm dev` → open a team detail in browser | Revert TeamDetailView+test; RosterTable PR already merged |

## Phase 1: Shared Format & RosterTable Contract

- [x] 1.1 RED: Move `formatRulebookCost` unit cases into new `features/teams/format.test.ts` GREEN import site (or update RosterTable.test import before extraction) — end-to-end RED
- [x] 1.2 RED: Update `RosterTable.test.tsx` — readOnly headers = exactly 10 (no `CANT.`), qty/banner/editable tests flip to editable, navy totals "{n} jugadores · Coste total" sum 10, footer spans 4+6=10 / editable 5+6+1=12, `formatRulebookCost` imported from `../format`
- [x] 1.3 GREEN: Create `features/teams/format.ts` (move `formatRulebookCost` verbatim, keep export)
- [x] 1.4 GREEN: `features/teams/roster-table/RosterTable.tsx` — readOnly: headers prefix `CANT.` only when editable; drop Qty td in readOnly; `showBanner = !readOnly && …`; navy totals (label colSpan 7 + cost 1 + empty 2 = 10), keep "2 players"+budget editable (12); footer editable 5+6+1 / readOnly 4+6; import `formatRulebookCost` from `../format`
- [x] 1.5 REFACTOR: Update remaining `formatRulebookCost` import sites (remove from RosterTable local, wire `format.ts`) — confirm `pnpm test` green

## Phase 2: TeamDetailView Style A

- [x] 2.1 RED: Rewrite `TeamDetailView.test.tsx` — hero (name, bold race, "Liga Abierta"/"Exhibición", tags "Equipo listo" + "Tesorería: 750 000"), raw `open`/`exhibition` never in DOM, ES headings Plantilla/Cuerpo técnico/Tesorería, player names as spans, FALLBACK_RACE raw id, no `Segundas oportunidades`/footer
- [x] 2.2 RED: Coaching + treasury assertions — Apotecario row always present (SÍ green/NO, unit `50 000`, total `50 000`/`0`), "Total cuerpo técnico" = items Σ + 50 000, 3 cards (Coste plantilla / Cuerpo técnico / Tesorería restante gold), apothecary case card +50 000 & restante −50 000
- [x] 2.3 GREEN: Rewrite `features/teams/detail/TeamDetailView.tsx` — navy `#12225a` hero (name h1, `<b>{race.name}</b> · {LEAGUE_LABELS[leagueType] ?? leagueraw}`, tags), 3 Spanish book sections, coach-a table (ES labels, zebra `#f1f5f9`, Apotecario always, total row `#e2e8f0` using `computeCoachingCost`), <RosterTable readOnly …/> WITHOUT `bannerText`/`apothecary`
- [x] 2.4 GREEN: Add local `LEAGUE_LABELS` (`open→"Liga Abierta"`, `exhibition→"Exhibición"`); drop local `formatGold`; treasury = `STARTING_TREASURY − rosterCost − computeCoachingCost`; cards "50 000" format; import `formatRulebookCost` from `../format`

## Phase 3: Verification

- [x] 3.1 Verify `page.test.tsx` passes unchanged ("Test Team" via hero h1); `not-found.test.tsx` green
- [x] 3.2 Run full `pnpm test` — all suites green

## Phase 4: Cleanup

- [x] 4.1 Remove any `formatRulebookCost` duplicate/legacy export in RosterTable if no longer referenced; confirm e2e create-team untouched
