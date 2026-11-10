# Tasks: match-live-acta

Delivery strategy: `auto-chain` — stacked PRs to main, one slice each, < 400 authored lines.
Spec source: `odd/tasks/match-report-redesign.md` (S1-S5). Design source: `design/match-report-redesign/08-acta-en-vivo.html` + `09-acta-en-vivo-animada.html`.

## Slice A — Acta en Vivo shell (branch `feat/match-live-acta-slice-a`) — **DONE, commit `ea1ae0b`**

- [x] A1 V2 gate: the Acta en Vivo sheet renders under the `bb-ui` v2 flag (`useUiFlag`); V1 unchanged.
- [x] A2 Top score bar: "Reikland Reavers 2 - 1 Gouged Eye" shape bound to live score; league/round line bound to `league.name` (S5).
- [x] A3 Scoreboard subheader: per-team RR/bribes/score, weather + referee line, "Oficial" status chip.
- [x] A4 Horizontal turn stepper T1-T8 with done (✓), casualty-marked, active and upcoming states + "TURNO N EN JUEGO" badge.
- [x] A5 Focused verification: `pnpm test`, `npx tsc --noEmit`, `pnpm lint`, local Playwright visual check.

## Slice B — Turn timeline + pending rolls (branch `feat/match-live-acta-slice-b`)

- [x] B1 Per-turn cards with header state (EN JUEGO / COMPLETADO / CERRADO), team + minute labels.
- [x] B2 Event rows: player name + role/number, kind badge (+1 TD, CASUALTY, +1 SPP…), description, SPP marker.
- [x] B3 Pending injury-roll callout: BB2025 D16 severity table (1-8 Magullado, 9-10 Apaleado, 11-12 Grave, 13-14 Permanente, 15-16 Muerto) + "TIRAR 1D16 DE LESIÓN" action wired to the pending roll (S1).
- [x] B4 Focused verification — DONE (commit `5245fef`, amended with the D1/D2 gate fix from independent verification).

## Slice C — Quick-capture dock (branch `feat/match-live-acta-slice-c`)

> Verification finding (Slice B, L12): if "+Baja" records roll-less casualty events, `deriveTeamStats` (lib/liveFeed.ts:103-104) and the timeline would double-count one victim (raw + resolved rows). Slice C MUST either supersede the roll-less event on resolution or dedupe casualty counters by victim (side, player).

- [x] C1 Fixed dock: +TD, +Pase, +Baja, +Evento, Fin Turno (high-contrast red).
- [x] C2 Each action records a live event for the recording coach's team on the active turn; server-side turn-phase permissions (LM-12) preserved.
- [x] C3 Focused verification.

## Slice D — Motion layer (branch `feat/match-live-acta-slice-d`)

- [x] D1 Apply the animada keyframes (fadeInUp, pulseGlow, badgePulse, diceShake, rowHighlightFlash, floatUpFade) to sheet elements.
- [x] D2 `prefers-reduced-motion: reduce` fallback disables them (MVA-6).
- [x] D3 Focused verification.

## Slice E — Event vocabulary + prefill (T4)

- [x] E1 LiveEvent kinds ≡ acta actions (LM-13).
- [x] E2 `resultPrefill` carries every kind, not only TDs (`features/leagues/resultPrefill.ts:68-86`).
- [x] E3 Tests + focused verification.

## Slice F — Unified closure (T5)

- [x] F1 Closure runs from the sheet; derived acta asks only missing data (casualty rolls, MVP, fans) — MAW-10.
- [x] F2 Retire the `MatchResolveModal` / `MatchActaWizard` duplication (guards preserved per MAW-1).
- [x] F3 Tests + focused verification.

## Slice G — Autosave (T6)

- [ ] G1 Draft persistence for capture and close-out (replaces the in-memory `useState` at `features/leagues/MatchActaWizard.tsx:86`).
- [ ] G2 Tests + focused verification.
