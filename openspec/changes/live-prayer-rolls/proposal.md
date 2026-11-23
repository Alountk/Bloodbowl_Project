# Proposal: live-prayer-rolls — Ready-Phase Prayer Roll Capture + activePrayers Threading

## Intent

Production persists only the prayer purchase COUNT (`LiveMatch.inducements` Json, `{id:"prayers-to-nuffle", count}`), never the 1D16 rolls, so the already-shipped SPP earn rule (`eventSpp`/`casualtySpp`, T25/T27) runs with `activePrayers = []` everywhere: prayer rows 10-13 always pay their defaults. The demo captured this end-to-end in T28/T29 (pre-match wizard step → `prayerRolls` → `activePrayers` → cards/timeline); this change delivers the production equivalent: capture the per-side rolls in the ready-phase inducement panel, persist them on `LiveMatch`, expose them through the live DTO/SSE, and thread the derived `activePrayers` into every production `eventSpp` call site.

Split from T26 by decision (ODD L131, «Primero SPP flags»): the payload-flag half (T26a) shipped as PR #432; this change is the capture/threading half (T26b).

## Scope

**In**:
- Additive `LiveMatch.prayerRolls Json?` column (`{ home: number[], away: number[] }`) + migration.
- New seq-guarded `recordPrayerRolls` command (ready phase, own side, validation + lock) and `purchaseInducements` roll alignment on cart replace.
- Live DTO + SSE snapshot expose `prayerRolls`; a client-safe helper derives `MatchActivePrayers` from rolls.
- Ready-phase UI in `InducementPurchasePanel`: manual 1-16 entry + «Aceptar» + verbatim blessing reveal + locked state (T29 parity, Spanish copy, mobile-first 390px).
- Thread per-side `activePrayers` at ALL production `eventSpp`/`casualtySpp`/`provisionalCasualtySpp` call sites (MatchView, WatchMatchView, MatchViewV2, liveEventCards).

**Out**:
- Auto-roll option (server `rollD16` exists — follow-up if the user wants the S5/S7 auto pattern here).
- Demo surfaces (T28/T29 shipped; demo flag-stamp parity is a separate logged gap, ODD L131).
- The earn rule itself (pinned, never modify) and prayer engine semantics (T25 complete).
- Capture during in-match phases (prayers roll pre-kickoff; ready phase is the production home).
- MatchResult/close-time prayer persistence (SPP is computed live; snapshot copy is a follow-up if ever needed).

## Capabilities

**Modified**:
- `live-match-realtime`: `LM-33 recordPrayerRolls` command + `LM-34 prayerRolls` DTO/SSE exposure + `matchActivePrayers` helper.
- `match-view`: `MVT-12` ready-phase prayer-roll capture UI + `activePrayers` threading at every production eventSpp call site.

## Approach

Mirror the `incentive-chips` precedent (`LM-30`): a seq-guarded ready-phase command writing one additive Json row column, published to the hub alongside `inducements`. Validation is server-side only (AGENTS rule 3): faces 1-16, no duplicates (rulebook re-rolls repeats), length ≤ purchased `prayers-to-nuffle` count, once-recorded lock (S7-6 «una vez tirado los dados, ya no se puede volver a tirar»). `purchaseInducements` aligns the side's rolls on cart replace (count 0 or below recorded length → clear, releasing the lock). The UI is manual entry only (T29 parity — coaches roll physical dice); blessings reveal through `resolvePrayerRoll` verbatim (10-13 name + effect, honest note for unmodeled faces). Consumers receive `MatchActivePrayers` derived by the new `matchActivePrayersFromRolls` helper and resolve the earner side exactly as the demo timeline does.

## Delivery

Stacked PRs to main (chained-pr, < 400 authored lines each), tests + docs per slice:
1. **S1 — persistence/API**: column, migration, command, alignment, DTO/SSE, helper, tests.
2. **S2 — capture UI**: panel block, i18n, reveal/lock, tests.
3. **S3 — threading**: all production call sites + tests (needs S1's exposure; independent of S2's files except MatchView, so it follows S2).
