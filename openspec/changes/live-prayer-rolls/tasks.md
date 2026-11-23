# Tasks: live-prayer-rolls

Delivery: stacked PRs to main, one slice each, < 400 authored lines (`chained-pr`).
Spec source: `odd/tasks/demo-partido-bb2025.md` T26b + L131/L133. Contract: this change's spec deltas (LM-33/LM-34/MVT-12) are the frozen integration surface between slices.

## Slice S1 — Persistence/API (branch `feat/live-prayer-rolls-s1`)

- [x] S1a Additive `LiveMatch.prayerRolls Json?` column + migration (`<ts>_live_match_prayer_rolls`, template: `20260910120000_live_match_inducements`).
- [x] S1b `recordPrayerRolls` liveStore command: seq-guarded replace-per-side, full LM-33 validation (1-16 ints, no duplicates, ≤ purchased count, non-empty, once-rolled lock), row write + hub publish alongside `inducements`.
- [x] S1c `purchaseInducements` roll alignment on cart replace (clear on count 0 or below recorded length).
- [x] S1d Route dispatch + LM-2/LM-11 gates; GET DTO + SSE expose `prayerRolls` (LM-34).
- [x] S1e `matchActivePrayersFromRolls` helper in `lib/rules/inducements.ts` + tests.
- [x] S1f RED-first tests (liveStore.test, route.test, inducements.test); `pnpm test`, `npx tsc --noEmit`, `pnpm lint`.

## Slice S2 — Capture UI (branch `feat/live-prayer-rolls-s2`, after S1)

- [x] S2a «Plegarias a Nuffle» block in `InducementPurchasePanel` (count > 0 only): manual 1-16 input + «Aceptar», POST `recordPrayerRolls`.
- [x] S2b Inline Spanish errors per failure class (`match.prayers.*` keys); mobile-first 390px, rulebook-light tokens.
- [x] S2c Success: verbatim blessing reveal via `resolvePrayerRoll` (10-13; honest note otherwise) + locked state «Tirada registrada».
- [x] S2d `prayerRolls` read from the live view state (same path as `inducements`).
- [x] S2d RED-first tests (MatchView.test); `pnpm test`, `npx tsc --noEmit`, `pnpm lint`.

## Slice S3 — activePrayers threading (branch `feat/live-prayer-rolls-s3`, after S2)

- [x] S3a Thread `MatchActivePrayers` (via `matchActivePrayersFromRolls`) into `MatchView`, `WatchMatchView`, `MatchViewV2` and `liveEventCards`; resolve earner side as `actaTurnTimeline.tsx:500` does.
- [x] S3b RED-first tests pinning an exception value (e.g. home `perfect-pass` completion) at each surface.
- [x] S3c `pnpm test`, `npx tsc --noEmit`, `pnpm lint`; close the change (verify → archive per CONTRIBUTING).

## Slice S4 — MVT-12 residuals (feed totals + guest exposure, L134)

- [x] S4a `deriveTeamStats(events, activePrayers?)`: pass the earner side's prayers to `eventSpp` (casualty → opposite side, else acting side; team attribution unchanged) so the MVT-10 mini SPP pill is prayer-aware; thread from MatchView's two `MiniStatsFeedStrip` sites.
- [x] S4b Guest exposure (user ruling 2026-11-23): `reduceWatchFrame` picks+parses `prayerRolls` (omit when the frame lacks the key), the watch fixture route selects the column, the watch SSE snapshot passes it via `toLiveViewState` opts, and `useWatchLive` carries the previous value across delta frames.
- [x] S4c RED-first tests (liveFeed, watchAccess, watch routes, useWatchLive, MatchView mini pill); full battery.
