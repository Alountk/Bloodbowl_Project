# Design: incentive-chips — Pre-Match Inducement Purchase + Per-Team Feed Chips

## Technical Approach

Rules-faithful pre-match purchase in the `ready` phase (LM-30): a new live command `purchaseInducements` restricted to the lower-TV coach, validated against a pure client-safe catalog (`lib/rules/inducements.ts`, mirrors `winnings.ts`), persisted on a new additive `LiveMatch.inducements Json?` column. The 3 close builders copy a per-side `{budget, cards}` snapshot into `scores.home|away.inducements` (additive JSON, no `MatchResult` migration); PUT copies it forward like `winnings`. The finished feed renders per-team "Incentivos" rows + chip pills (IND-1..5, MVT-4).

## Architecture Decisions

| Decision | Option | Tradeoff | Chosen |
|---|---|---|---|
| Catalog home | Pure module vs roster-catalog extension | Roster catalog models positionals/skills, not inducements; race→rule map is inducement-only | Pure `lib/rules/inducements.ts` (single source of truth, IND-1/IND-5) |
| Cart storage | `LiveMatch.inducements Json?` vs `MatchResult` column | Pre-match cart is live-row state; snapshot at close lives inside `scores` (LM-14 additive precedent) | `LiveMatch.inducements Json?`, row-scoped, `{home:[{id,count}],away:[{id,count}]}` |
| Command transport | Live POST (`/live`) vs fixture POST | `ready` is live lifecycle; cart must reach SSE snapshot + hub fan-out (LM-8); seq guard exists only on live | Live command `purchaseInducements` (mirrors `consent`/`begin`) |
| Budget source | Server-side TV vs client TV | Client TV is forgeable; spec IND-2 mandates server derivation | `raceTvParts` + `computeTeamTv` in store (already duplicated at `lib/liveStore.ts:1074-1089`) |
| Snapshot carry | Shared helper vs 3 inline copies | Inline copies drift (known risk); helper gives parity + one test surface | Shared `buildInducementSnapshot(row, homeTeam, awayTeam)` |
| Mercenarios | Purchasable vs deferred | Dynamic cost (base+30k+skill) breaks the `costOverrides` model | Excluded from purchase; `id` reserved (decide → OUT) |
| Wizard | Per-race type now vs deferred | Type-per-race is IND-5 verification debt | Ship base 150k for all races; type variants deferred |

## Data Flow

```
ready UI (MatchView) ──purchaseInducements──▶ POST /live
    │                                            │ gate (LM-2) → coach/admin
    │                                            ▼
    │                                   store.purchaseInducements
    │                                     ├ read LiveMatch row + teams (raceId/roster/coaching/players)
    │                                     ├ status==="ready"?  else 409
    │                                     ├ lower-TV = budgetForSide(computeTeamTv(...))
    │                                     ├ validateCart(cards, raceId, budget) — IND-3
    │                                     └ updateMany(seq bump) write inducements + hub.publish
    ▼                                            │
SSE snapshot (GET /live) + fixture GET ◀── expose inducements in view
    │
close: result POST / resolveLiveMatch / runWizardClose
    └─ buildInducementSnapshot ──▶ scores.home|away.inducements {budget,cards}
                                            │ PUT: copy-forward (like winnings)
                                            ▼
                          buildSummaryFeedRows ──▶ per-team "Incentivos" rows + chips
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `lib/rules/inducements.ts` | Create | Catalog (16 entries), `RACE_SPECIAL_RULES`, `effectiveCost`, `budgetForSide`, `validateCart`, `getInducement` |
| `prisma/schema.prisma` | Modify | Add `inducements Json?` to `LiveMatch` (after `journeymen`) + migration |
| `lib/liveStore.ts` | Modify | `purchaseInducements` store fn; `buildInducementSnapshot` helper; wire into `resolveLiveMatch` + `runWizardClose` |
| `lib/liveMatch.ts` | Modify | Expose `inducements` in `toLiveViewState`/`LiveMatchViewState` (optional field) |
| `app/api/.../live/route.ts` | Modify | `ControlCommand` + `isControlCommand` case; dispatch handler (guards); SSE snapshot merge |
| `app/api/.../result/route.ts` | Modify | POST: carry snapshot when `fixture.liveMatch` has cart; PUT: copy-forward inducements |
| `features/leagues/api.ts` | Modify | `LiveCommand` variant, `MatchScoreboard.inducements`, `LiveMatchViewState.inducements` |
| `features/leagues/MatchView.tsx` | Modify | Ready-phase purchase UI (S2); `SummaryFeedRowView` incentives case + `key` (S4) |
| `features/leagues/matchSummary.ts` | Modify | `SummaryFeedRow` incentives (team+budget+cards); `buildSummaryFeedRows` split + legacy fallback |
| `lib/i18n/dictionaries.ts` | Modify | ES/EN purchase + chip labels |

## Interfaces / Contracts

```ts
// lib/rules/inducements.ts (client-safe, no DB imports)
export type RuleId = "bribery-and-corruption" | "low-cost-linemen"
  | "favoured-of-nurgle" | "masters-of-undeath" | "halfling-chef" | "wizard-type";
export interface InducementEntry {
  id: string; displayName: string; costGp: number; maxPerMatch: number;
  eligibility?: RuleId; costOverrides?: Partial<Record<RuleId, number>>;
  dynamicCost?: boolean; // mercenarios only → excluded from purchase
}
export const COMMON_INDUCEMENTS: readonly InducementEntry[];
export const RACE_SPECIAL_RULES: Readonly<Record<string, readonly RuleId[]>>;
export const NO_APOTHECARY_RACES: ReadonlySet<string>; // apothecary-eligible = "unless here"
export function getInducement(id: string): InducementEntry | undefined;
export function effectiveCost(e: InducementEntry, raceId: string): number;
export function isEligible(e: InducementEntry, raceId: string): boolean;
export function budgetForSide(homeTv: number, awayTv: number):
  | { side: "home"; budget: number } | { side: "away"; budget: number } | { side: null; budget: 0 };
export function validateCart(cart: {id:string;count:number}[], raceId: string, budget: number):
  { ok: true } | { ok: false; error: string };
```

```ts
// features/leagues/api.ts
export type LiveCommand = /* ... */ | {
  type: "purchaseInducements"; side: "home" | "away";
  cards: { id: string; count: number }[];
};
export interface MatchScoreboard {
  home: { /* ... */ inducements?: { budget: number; cards: { name: string; count: number }[] } };
  away: MatchScoreboard["home"];
  /* ... */
}
export interface LiveMatchViewState { /* ... */ inducements?: { home: {id:string;count:number}[] | null; away: {id:string;count:number}[] | null } | null; }
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `inducements.ts` — lookup, effectiveCost (goblin bribes=50k), eligibility (orc/plague-doctor), budgetForSide (1200k/1050k → away 150k; equal → 0), validateCart (over-budget/limit/unknown/race) | New `lib/rules/inducements.test.ts` |
| Unit | `buildInducementSnapshot` parity — 3 paths write identical `{budget,cards}` | Shared-helper test + path parity assertions |
| Integration | `purchaseInducements` store — ready guard, lower-TV guard, replace-cart, seq 409, hub publish | `liveStore.test.ts` (consent/begin precedents) |
| Route | POST live — 409 non-ready, 403/404 gate, 409 non-eligible side, 200 with cart in view | `route.test.ts` |
| Component | MatchView — purchase UI disabled/error states; `SummaryFeedRowView` chips + key uniqueness | `MatchView.test.tsx` |
| E2E | Local-mode: lower-TV coach buys in ready → close → per-team chips render | Playwright (reuse consent/begin helpers) |

Update pinned assertions: `matchSummary.test.ts:240-283` (per-team incentives rows), `MatchView.test.tsx:1430` ("Incentivos 150.000" → per-team), `result/route.test.ts:202` (pettyCash create stays; add inducements).

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. This adds a normal DB+JSON live command in the existing seq-guarded store (same class as `consent`/`begin`).

## Migration / Rollout

Additive only: new nullable `inducements Json?` column (migration), unknown JSON keys ignored by old readers, legacy rows untouched (single-row `pettyCash` fallback). Rollback = revert slice PRs in chain order; S1 revert leaves the unused column null.

## Open Questions

- [ ] `wandering-apothecary`/`wizard` definitive BB2025 rule sets (IND-5 verification debt) — blocked on rules confirmation, NOT on S1 (flagged entries ship with base cost + clear `dynamicCost`/`wizard-type` markers).
- [ ] Confirm `mercenaries` stays excluded (decide recorded above).

## Slices (chained PRs)

| # | Scope | Commits | Verify |
|---|-------|---------|--------|
| S1 | Catalog + `LiveMatch.inducements` + `purchaseInducements` command + tests | feat(catalog), feat(schema), feat(command) | `pnpm test` + new inducements/liveStore/route tests |
| S2 | Ready-phase purchase UI + i18n + e2e | feat(ui) | `AUTH_MODE=local pnpm exec playwright test` |
| S3 | Snapshot carry: 3 paths + PUT copy-forward + parity tests | feat(snapshot), fix(put) | result/route.test.ts + liveStore.resolve tests |
| S4 | Feed per-team rows + chips + pinned test updates | feat(feed) | matchSummary/MatchView tests |
