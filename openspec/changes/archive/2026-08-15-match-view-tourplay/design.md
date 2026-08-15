# Design: Match View Tourplay Redesign

## Technical Approach

Model-first, 5 slices (proposal approach). Close the persisted data gaps server-side (foul victim, casualty cause/causer), then rebuild the feed as Tourplay cards + timeline bar, then snapshot summary rows. All display derivations stay pure in `lib/` (zero-mock testable, repo precedent). The 8-kind display surface (LM-16) is untouched; kickoff stays deferred.

## Architecture Decisions

| # | Decision | Options / tradeoffs | Choice + rationale |
|---|----------|--------------------|--------------------|
| D1 | Actor-side invariants | (a) Pure helper in `lib/livePhase.ts` — zero-mock testable, matrix in one place (b) in the route, DB-coupled | (a) `playerSide()` + `checkActorInvariant()` beside `resolveEventPermission`; the route only loads rosters → `RosterSideMap` (LM-12) |
| D2 | Payload shape | (a) Extend command union + JSON payload (b) new event kinds | (a) Additive, no migration (LM-6/LM-14); legacy `{}`/`{band}` payloads render fallback rows |
| D3 | Card structure | (a) New `liveEventCards.tsx` (b) inline in 1300-line MatchView | (a) `LiveEventCards` replaces `LiveEventsList`; team cards 68% with `grid-template-areas` (tag top own side / minute bottom opposite), generic 100% flat "info repartida"; reuses existing emoji glyphs (MV-7, no icon lib) |
| D4 | Timeline bounds | (a) `end = finishedAt ?? lastDisplayEventAt` (b) live clock `now` | (a) Reload-identical bar (MVT-2); `timelinePercent()` round+clamp 0..100; home top / away bottom; 0'/100' markers only when finished |
| D5 | Per-TD score | (a) Accumulate TD events per side in seq order | (a) `derivePartialScore()` → `Map<seq, {home, away}>`; only TD cards render "(H - A)" |
| D6 | Summary rows | (a) Extend `matchSummary.ts` (b) new file | (a) `buildSummaryFeedRows(detail)` reuses snapshot extraction; MV-2 walkover guard (`result == null` → `[]`); report date = `result.createdAt`; never new event kinds |
| D7 | Controls labels | — | New selects use DISTINCT labels `Víctima` / `Causa` / `Causante` so the existing `getByLabelText(/Jugador/i)` stays unambiguous; causer select hidden for `dodge`/`crowd` (LM-20) |
| D8 | Header | — | Add back arrow to `LiveTopBar` + `MatchTimelineBar` under `LiveMetaRow`; UI-only, existing DTO (MVT-3) |

## Data Flow

```
POST /live (foul +victimId | casualty +cause/causerId)
  → loadFixtureGate → resolveEventPermission (side gate) → deny 409
  → load both rosters → checkActorInvariant (pure) → deny 409
  → recordFoul/recordCasualty (payload JSON) → applyTransition (seq guard)
  → hub → SSE → LiveEventCards / MatchTimelineBar (liveFeed derivations)
Finished: MatchResult snapshot → buildSummaryFeedRows → reported/ganancias/fanáticos/incentivos rows
```

## Interfaces / Contracts

```ts
// lib/livePhase.ts
export interface RosterSideMap { home: ReadonlySet<string>; away: ReadonlySet<string> }
export function playerSide(map: RosterSideMap, id: string | null | undefined): TeamSide | null;
export function checkActorInvariant(input: {
  kind: "foul" | "casualty"; actorSide: TeamSide; // foul = aggressor side; casualty = VICTIM side
  opponentId?: string; cause?: string; rosters: RosterSideMap;
}): "allow" | "deny";
// foul: opponentId resolves opposite actorSide (else deny). casualty: causer opposite victim;
// dodge|crowd → opponentId MUST be absent (deny if present). Unresolvable id → deny.

// lib/liveFeed.ts
export function derivePartialScore(events: readonly FeedEvent[]): Map<number, { home: number; away: number }>;
export function timelinePercent(at: number, start: number, end: number): number; // round, clamp 0..100

// features/leagues/matchSummary.ts — [] when detail.result == null (MV-2)
export function buildSummaryFeedRows(detail: MatchDetail): SummaryFeedRow[]; // reported|winnings|fans|incentives
```

Commands: `foul { victimRosterId: string }` (now REQUIRED); `casualty { cause?: "blitz"|"foul"|"dodge"|"crowd"|"penetration"|"block"; causerRosterId?: string }`. Payloads: foul `{ victimRosterId }`, casualty `{ band, cause, causerRosterId }`. Legacy events keep rendering without detail (LM-6 fallback).

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `app/api/.../live/route.ts` | Modify | command union + `isControlCommand`, recordFoul/recordCasualty payloads, roster load + invariant gate |
| `lib/livePhase.ts` | Modify | `RosterSideMap` / `playerSide` / `checkActorInvariant` |
| `features/leagues/api.ts` | Modify | `LiveCommand` fields; `MatchResultRecord.createdAt: string` |
| `features/leagues/liveControls.tsx` | Modify | `opponentRoster` prop; Víctima/Causa/Causante selects + validation |
| `features/leagues/liveEventLabels.ts` | Modify | `CAUSE_LABELS` (MVT-5); move `EVENT_GLYPH` here |
| `features/leagues/liveEventCards.tsx` | Create | gray-box card grid 68%/100%, victim/causer lines, TD score note |
| `features/leagues/matchTimelineBar.tsx` | Create | sticky-header track bar |
| `features/leagues/matchSummary.ts` | Modify | `buildSummaryFeedRows` |
| `features/leagues/MatchView.tsx` | Modify | list→cards swap, timeline in header, summary rows in `FinishedLiveView`, remove local glyph/list |
| `lib/liveFeed.ts` | Modify | `derivePartialScore`, `timelinePercent` |
| `lib/livePhase.test.ts` · `route.test.ts` · `liveFeed.test.ts` · `liveEventLabels.test.ts` · `matchSummary.test.ts` · `liveControls.test.tsx` · `MatchView.test.tsx` · `e2e/live-match.spec.ts` | Modify | deliberate updates (below) |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit livePhase | invariant matrix: foul own-side 409, causer same-side 409, dodge/crowd with causer 409, unresolvable id 409, non-active own-injury still 200 | pure, no mocks |
| Unit liveFeed | TD accumulation (1-0 → 1-1), timelinePercent (99/199 → 50) + clamp | pure |
| Unit labels | 6 cause labels exact; unknown passes through | exact map |
| Unit matchSummary | 4 rows from snapshot; walkover → `[]`; MVP not duplicated | pure |
| Component | cards 68%/100%, "a Trash (#8)", "por Arnau (#4) · Blitz"; controls capture+submit | RTL |
| Route | 409 invariant bypass, 200 foul with victim, legacy payload fallback renders | route.test |
| E2E | victim/causer survive reload; cards/timeline/summary rows; labels kept | live-match.spec |

## Testids / Labels

Preserved: `live-event-row` (kept on card `li`), `tourplay-header`, `live-score`, `mini-td-*`, `mini-spp-*`, `Mitad N · Turno M`, `1ª/2ª PARTE`, `Dar el turno`, `Pedir turno`, `Tu turno`, `Tu rival pide el turno`, `Inicio del partido`, `Touchdown`, `Pase completo`, `Baja`, `Herida`, `Falta`, `Fin de la mitad`, `Fin del partido`, `Jugador más valioso`, `Registrar`, `Cancelar`, `Jugador`, `Tipo de lesión`.

Deliberate additions (ship WITH the behavior, never silently): `match-timeline` (bar), `summary-row` + `summary-row-reported` (rows), select labels `Víctima`/`Causa`/`Causante`, MVT-5 cause strings, "(H - A)" on TD cards. Card `li` changes inner structure (flex → grid) but keeps `live-event-row` and all preserved strings.

## Threat Matrix

N/A — no routing (OS-level), shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. The live HTTP route is an existing endpoint being extended; its 401/403/404/409 semantics are covered by existing gates plus the new invariant unit tests.

## Migration / Rollout

No migration: additive JSON payloads, `kind` TEXT (LM-14 precedent). Old events render fallback (LM-6). Slices independently revertible.

## Slicing (≤400 lines/slice, `ask-on-risk`)

| Slice | Scope | Gate |
|-------|-------|------|
| S1 | Server: route + livePhase + api.ts types + route/livePhase tests | green unit |
| S2 | Controls: liveControls + tests | green unit |
| S3 | Cards: liveEventCards + liveFeed + labels + MatchView swap + tests | green unit + lint/tsc |
| S4 | Timeline + summary rows + back arrow + tests | green unit |
| S5 | e2e/live-match.spec + full sweep | full suite green |

## Open Questions

- [ ] MVT-4 "team-assigned card": the snapshot stores ONE `pettyCash` (TV difference) — no per-team split, no inducement chips persisted. Design renders the single value; chips need a follow-up slice (kickoff precedent). Needs confirmation.
- [ ] Live (unfinished) timeline bound = last display event (reload-deterministic). Confirm vs clock-based.
- [ ] Strict rule: reject `causerRosterId` when cause is `dodge`/`crowd` (spec covers only the absent case).
