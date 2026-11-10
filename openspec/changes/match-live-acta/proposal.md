# Proposal: match-live-acta

## Intent

The match ("enfrentamiento") section makes coaches re-enter ~35–50 inputs per match across two parallel surfaces (live capture plus a 7-step acta wizard plus a resolve modal), and live events are lost on `resultPrefill` (only TDs survive, `features/leagues/resultPrefill.ts:68-86`). This change implements the chosen "Acta en Vivo" design (`design/match-report-redesign/08-acta-en-vivo.html`, motion from `09-acta-en-vivo-animada.html`) in the V2 feature-flagged match view so live capture is the single source of truth and the match report derives from it, asking only for missing data (casualty rolls, MVP, fans).

## Scope

### In Scope

- Slice A: V2 shell — top score bar, scoreboard subheader, horizontal turn stepper (behind `useUiFlag`/`bb-ui` v2; V1 unchanged).
- Slice B: per-turn timeline cards + event rows + pending injury-roll callout with the BB2025 D16 severity table.
- Slice C: quick-capture dock (+TD, +Pase, +Baja, +Evento, Fin Turno) writing live events for the recording coach.
- Slice D: motion layer from the "animada" design (fadeInUp, pulseGlow, badgePulse, diceShake, rowHighlightFlash, floatUpFade) with `prefers-reduced-motion` fallback.
- Slice E: event vocabulary unification — LiveEvent kinds ≡ acta actions; result prefill carries every kind, not only TDs.
- Slice F: single closure surface replacing the `MatchResolveModal` / `MatchActaWizard` duplication (derived acta asks only missing data).
- Slice G: draft persistence/autosave for capture and close-out.

### Out of Scope

- The V1 match view (unchanged behind its flag).
- BB2025 rules semantics (casualty bands, SPP values, winnings) — already modeled in `bb2025-rules` / `match-result`.
- Live-match transport and recovery (`live-match-realtime` LM-1/LM-7/LM-8, `live-match-recovery`) except the event vocabulary.
- Branding assets generated in Stitch (favicon + "LIGA NUFFLE CRUAB" emblem) — separate follow-up.
- Anything not present in artboards 08/09.

## Capabilities

### Modified Capabilities

- `match-view`: the V2 surface is replaced by the Acta en Vivo sheet (MVT-* superseded by MVA-*).
- `live-match-realtime`: unified event vocabulary (LM-13).
- `match-result`: derived-acta prefill carries every event kind.
- `match-acta-wizard`: single closure surface (MAW-10); the wizard bodies become the closure flow.

### New Capabilities

- None — the sheet lives in `match-view`.

## Approach

- **Data binding**: league/round/team names and score come from data; the league name renders from `league.name` (S5, e.g. "LIGA NUFFLE CRUAB") — never hardcoded in components.
- **Tokens**: existing rulebook-light tokens (#12225a / #d11938 / #f8fafc / white panels) in `app/globals.css`; the artboards' semantic palette maps onto them, no new color or shadow variants (AGENTS.md rule 5).
- **Icons**: inline SVG (Material Symbols paths), never icon fonts.
- **Motion**: CSS `@keyframes` with a `prefers-reduced-motion: reduce` fallback.
- **Business rules stay server-side**: turn invariants (LM-4), turn-phase event permissions (LM-12), SPP and winnings computation are not weakened; the dock posts to the existing live-event APIs and the server validates.
- **Delivery**: stacked PRs to main, one slice each, < 400 authored lines (`chained-pr`), tests and docs with the behavior; focused verification per slice (`pnpm test`, `npx tsc --noEmit`, `pnpm lint`, local Playwright).
