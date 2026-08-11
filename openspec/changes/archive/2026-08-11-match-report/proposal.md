# Proposal: Match Report (BB2025 post-match resolution)

## Intent

A match ends at `winnerId` — no scores, no progression, no treasury. This change implements full BB2025 post-match resolution: result, winnings, fan factor, PE awards, injuries/deaths, progression. 5 chained PRs.

## Scope

### In Scope
- Hybrid model: `Player` table (PE, skills, injuries, deaths) reconciled from roster-JSON ids; `Fixture` scores; `Team.treasury`.
- `lib/rules/` pure module: all user-validated BB2025 tables + functions.
- Result API: either captain (404-no-leak) or league admin loads/corrects; score validation; winnings/FF/PE one transaction; 409 on played; audit row.
- Result UI: modal, MatchCard score display, jornada completion consistent.
- Progression UI: spend PE, skill rolls (user's random table), élite `$` marking, value recalculation.
- e2e updates.

### Out of Scope
- Live match, standings, shields, friendlies, substitutions, purchase flow.
- Inducements/petty cash — user decided: computed in the result API (slice 2) from TV difference and persisted in the report.

## Capabilities

### New Capabilities
- `bb2025-rules`: pure `lib/rules/` tables + functions (PE, improvement costs, random skills, winnings, FF, weather, injuries).
- `player-progression`: Player entity, PE spending, skill rolls, élite marking, value recalculation.
- `match-result`: result loading (captains + admin), score persistence, winnings/FF/PE, injuries/deaths, idempotency, audit.

### Modified Capabilities
- `league-season`: Fixture score fields; `played` derivation + round completion driven by result, not `winnerId` alone.
- `matchday-forfeit`: mutual exclusion with result (409); walkover sets scores, skips PE.
- `race-data-bb2025`: skill catalog gains `elite` flag; random-table categories map onto access letters.

## Rules Data (user-validated — encode exactly)

**PE por acción:** pase completo 1 · lanzar compañero 1 · aterrizar sano 1 · intercepción 2 · lesionar rival 2 · touchdown 3 · MJP 4.

| Mejora | Azar | Primaria | Secundaria | Atributo |
|---|---|---|---|---|
| 1ª Exp. | 3 | 6 | 10 | 14 |
| 2ª Vet. | 4 | 8 | 12 | 16 |
| 3ª Est. | 6 | 12 | 16 | 20 |
| 4ª Est. | 8 | 16 | 20 | 24 |
| 5ª Sup. | 10 | 20 | 24 | 28 |
| 6ª Ley. | 15 | 30 | 34 | 38 |

**Skill al azar** (elegir categoría → 2D6 dos veces → elegir una; repetir si ya la tiene): 1ºD6 1–3 → 1 Atrapar/Abrirse paso/Agallas/Apariencia asquerosa*; 2 Echarse a un lado/Apartar/Equilibrio firme/Boca monstruosa; 3 En pie de un salto/Brazo fuerte/Forcejear/Brazos adicionales; 4 Esprintar/Cabeza dura/Furia*/Cola prensil; 5 Esquivar/Defensa/Manos seguras/Cuernos; 6 Golpe a la carrera/Golpe mortífero/Patada/Dos cabezas. 1ºD6 4–6 → 1 Pies firmes/Imparable/Placaje defensivo/Garras; 2 Placaje heroico/Llave de brazo/Placar/Mano grande; 3 Proteger el cuero/Luchador/Profesional/Piel férrea; 4 Recepción heroica/Mantenerse firmes/Provocar/Piernas muy largas; 5 Romper defensas/Ojo de halcón/Robar balón/Presencia perturbadora; 6 Saltar/Placaje múltiple/Zafarse/Tentáculos. Columnas: A/F/G/M.

**Ganancias:** `((FF1+FF2)/2 + TDs propios + 1 si nunca retuvo el balón) × 10.000` — sin tirada.
**Hinchas:** ganó → 1D6 ≥ FF → +1 (máx 7); perdió → 1D6 < FF → −1 (mín 1); empate → 0. FF pre-partido: 1D3 + plantilla (hoy `coaching.dedicatedFans`).
**Lesión (1D16):** 1–8 Magullado · 9–10 Apaleado (falla próxima) · 11–12 Herida grave (+PPP) · 13–14 Permanente (−1 atributo +PPP; 1D6: 1 −AR, 2 −MV, 3 −PS, 4 −AG, 5 −FU, 6 duplicado) · 15–16 Muerto (eliminado). LMC: +1 a futuras.
**Clima (2D6):** 2 Calor · 3 Muy soleado (−1 Pase) · 4–10 Perfecto · 11 Lluvioso (−1 atrapar/recoger/interceptar) · 12 Ventisca.
**Élite:** marcadas `*` → UI `$` + tooltip "Élite"; valor +10.000 (élite +20.000).

## Approach

- **DB**: additive migration — `Player` (teamId, rosterPlayerId, name, positionalKey, pe, skills[], injuries[], alive, valueBonus), `Fixture.homeScore/awayScore`, `Team.treasury`, `MatchResult` audit (snapshot, loadedBy, correctedAt). Roster JSON stays source of truth; backfill Players on first result load, reconcile by `PlayerEntry.id`, skip unknown (no orphans).
- **Rules**: `lib/rules/` pure functions + tables; exhaustive unit tests; rules server-side only.
- **API**: `POST .../fixtures/[fixtureId]/result` — participant or admin; validates per-player TDs == final score; one transaction (scores, winnings, FF, PE incl. MJP, injuries/deaths, petty cash from TV difference); 409 on played; correction admin-only + audit (snapshot before/after, PE deltas re-run, spent PE never revoked).
- **UI**: ResultModal (scores, per-player PE, MJP nomination 6×1-6 + 1D6 roll per rulebook), MatchCard score, ProgressionPanel (PE spend, skill roll modal, élite badge).

## Delivery Slices (chained PRs)

1. DB schema + `lib/rules/` + tests · 2. Result API · 3. Result UI · 4. Progression UI · 5. e2e + polish

## Affected Areas

| Area | Impact |
|---|---|
| `prisma/schema.prisma` | Modified |
| `lib/rules/*` | New |
| `app/api/leagues/[id]/fixtures/[fixtureId]/result/route.ts` | New |
| `features/leagues/{MatchCard,LeagueDetail,api}.tsx` | Modified |
| `features/teams/{types.ts,TeamDetail}` | Modified |
| `e2e/league-matchday.spec.ts` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Migration orphans | Med | reconcile by id, skip unknown |
| Status/round drift | Med | single derivation + tests |
| e2e label breakage | Med | update intentionally |
| Rules fidelity | Low | user-validated + snapshot tests |
| Corrections re-award PE | Med | admin-only, audit, re-run rules |
| PE spend vs death | Med | alive check before spend |
| Pase/Triquiñuelas cols missing | High | user must supply (slice-2 blocker) |

## Rollback Plan

- Additive migration only (no drops); roster JSON untouched until backfill verified → revert = revert slice PRs.
- Result routes feature-flagged; `winnerId`-only flow remains until Player backfill complete.

## Dependencies

- User confirmed: inducements/petty cash in slice 2 · corrections admin-only + audit with re-run PE (spent never revoked) · MJP = 6 nominations 1-6 + 1D6 · full 6-column random-skill table supplied (Pase/Triquiñuelas in memory obs #297).

## Success Criteria

- [ ] Unit tests prove winnings/FF/PE match the user's tables exactly
- [ ] Both captains + admin load/correct with 401/403/404/409 semantics
- [ ] PE spend + skill rolls follow rules; élite marked; value recalculated
- [ ] Jornada completes via results; e2e green
- [ ] Zero teams orphaned by Player backfill
