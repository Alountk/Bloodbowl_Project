# Tasks: Rulebook-style RosterTable

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700–900 (data ~300+, UI ~250, tests ~200) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 → PR2 (data before UI) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: resolved — stacked-to-main (PR1 data on feat/table-rulebook-data -> main; PR2 UI on feat/table-rulebook-ui stacked on main after PR1 merged)
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Types + access data + races-access.test | PR 1 | `pnpm vitest run features/teams/data/races-access.test.ts` | N/A — catalog/type-level, no UI runtime | Revert `types.ts` + `races.ts` + `races-access.test.ts`; additive fields, no consumer impact |
| 2 | RosterTable restyle + consumers + tests | PR 2 | `pnpm vitest run features/teams/roster-table features/teams/detail` | `pnpm dev` → Create Team, roster non-empty → banner/light table/footer; TeamDetail → readOnly; e2e `pnpm exec playwright test create-team` | Revert RosterTable + CreateTeamForm + TeamDetailView + the 3 test files; UI-only |

## Phase 1: Data Foundation (PR 1)

- [x] 1.1 `types.ts`: add `min?: number`, `accessPrimary: string[]`, `accessSecondary: string[]` to `Positional` (declare in interface).
- [x] 1.2 RED: create `features/teams/data/races-access.test.ts` — invariants: both arrays present on every positional, letters ⊆ {G,A,P,S,M,F}, F valid, `min` ≤ `max`, min defaults 0.
- [x] 1.3 RED (same file): exact Human/Orc/Dwarf access expected vs OCR `page-180/189/175.txt` (e.g. Human lineman `[G,A,P,S]` / `[]`).
- [x] 1.4 GREEN: populate Human/Orc/Dwarf in `races.ts` — `accessPrimary`, `accessSecondary` (normalize: only G/A/P/S/M/F, dedupe, order G→A→P→S→M→F, empty → `[]`); add `min` where ≠0.
- [x] 1.5 Log per-race access normalization/uncertainty in `openspec/notes/bb2025-ocr-team-audit.md`.
- [x] 1.6 GREEN (batches ~4–6 races): populate remaining 27 races ×144 positionals in `races.ts`, same normalization; never ship unverified letters.

## Phase 2: Core UI (PR 2)

- [x] 2.1 `RosterTable.tsx`: add `bannerText?`, `apothecary?` props; add `formatRulebookCost` (regex space) and local `ROLE_TRANSLATIONS` (Lineman→Línea, Thrower→Lanzador, Catcher→Receptor, Blitzer→Blitzer, Big Guy→Grandullón, fallback Otro).
- [x] 2.2 `RosterTable.tsx`: light container `max-w-[900px] bg-white shadow-[...]`; banner `border-y-[5px] border-[#12225a] bg-white py-[5px] text-center text-[28px] text-[#12225a]` — only when roster non-empty.
- [x] 2.3 `RosterTable.tsx`: ES header th `CANT.|POSICIÓN|COSTE|MV|FU|AG|PS|AR|HABILIDADES Y RASGOS|PRIMARIAS|SECUNDARIAS` (+ blank th editable), `bg-[#d11938] text-white`, POSICIÓN+HABILIDADES left, rest centered; td `text-[#1a1a1a]`, zebra `odd:bg-white even:bg-[#e6eef5]`.
- [x] 2.4 `RosterTable.tsx`: row cells — qty `min-max`, name+subtitle `(Raza, RolEs)` (readOnly primary = `player.name`), `formatRulebookCost(cost)` in cost col only, skills `translations.es ?? name` no suffix, empty→"Ninguna", access `arr.join(" ")`|"—".
- [x] 2.5 `RosterTable.tsx`: totals row ABOVE footer — colSpan readOnly 10+1=11, editable 10+1+1=12; keep `formatGold` budget cell.
- [x] 2.6 `RosterTable.tsx`: footer `bg-[#12225a]` white bold 13px — `0-8 Segundas oportunidades: {formatRulebookCost(race.rerollCost)} M.O. cada una` (colSpan5) + `Apotecario: SÍ/NO` (colSpan6 [+`<td/>` editable]); render only when `apothecary` provided.

## Phase 3: Consumers + Tests (PR 2)

- [x] 3.1 `CreateTeamForm.tsx`: pass `bannerText={form.name.trim() \|\| race.name}` and `apothecary={form.coaching.apothecary}` to `<RosterTable>`.
- [x] 3.2 `TeamDetailView.tsx`: pass `bannerText={team.name}` and `apothecary={team.coaching.apothecary}`.
- [x] 3.3 `RosterTable.test.tsx`: update headers to ES order (11, +blank editable), assert "50 000" in row+totals, "Ninguna", no "(general)", PRIMARIAS/SECUNDARIAS letters, subtitle `(Human, Línea)` + `Otro` fallback, min→"2-4", banner/footer render + absent, colSpans.
- [x] 3.4 `TeamDetailView.test.tsx`: L88 `/^50k$/` → assert "50 000" (row + total); keep John/Jane/remove/no-input green.
- [x] 3.5 Run `pnpm test` — full suite green; e2e `create-team.spec.ts` untouched and green. REFACTOR any dead/misaligned code.

## Phase 4: Documentation

- [x] 4.1 Confirm spec deltas landed: `specs/roster-table/spec.md` (ES headers, access cols, cost/banner/footer/colSpan), `specs/race-data-bb2025/spec.md` (REQ-RACE-07 both arrays ⊆{G,A,P,S,M,F}, F valid), `openspec/.../team-detail-view.md`.
- [x] 4.2 Update `openspec/notes/bb2025-ocr-team-audit.md` Access normalization log to final state.
