# Design: Match Report (BB2025 post-match resolution)

## Technical Approach

Roster JSON stays source of truth; `Player` owns only progression state (pe, skills, injuries, alive, valueBonus), backfilled lazily + idempotently on first result load. `lib/rules/` = pure server-only tables (RNG server-owned); result route applies them in one transaction; `Fixture` derives `played` from scores, not winnerId. Honors all six specs + binding decisions.

## Architecture Decisions

### 1. Player migration strategy

| Option | Tradeoff | Decision |
|---|---|---|
| A. Lazy backfill on first result load | No script; idempotent upsert | ✅ Spec-mandated; `lib/players.ts ensurePlayersForTeam` (skipDuplicates, unique teamId+rosterPlayerId), shared by result+improve routes; unknown ids skipped |
| B. One-time backfill | Correct everywhere; duplicates before needed | Rejected |
| C. Roster JSON forever | No reconciliation; roster edits orphan rows | Rejected |

Dead: alive:false, kept, spend 409. Players reference positionalKey; mods render from injuries[].

### 2. Player model shape

| Option | Tradeoff | Decision |
|---|---|---|
| A. Lean + JSON arrays | Queryable; fine for value/reporting | ✅ Spec columns + `improvements` (cost #) + `attributeIncreases Json` |
| B. Rich + skill/injury tables | Leaderboard-ready; 3× schema now | Rejected — standings later |

### 3. Result API shape

| Option | Tradeoff | Decision |
|---|---|---|
| A. Single POST, ΣTD==score validated | One tx; validated pre-commit | ✅ POST loads (captain/admin), PUT corrects (admin-only + audit) |
| B. Two-step scores/stats | Breaks atomicity | Rejected |
| C. Multipart | No files | Rejected |

Winner from scores (draw→null); forfeit→409; played POST→409 retry-safe; correction delta `max(0,new−old)`.

### 4. deriveFixtureStatus / rounds

| Option | Tradeoff | Decision |
|---|---|---|
| A. Scores present ⇒ played | Minimal diff; winnerId display-only | ✅ `played ⇔ homeScore!=null ∥ awayScore!=null`; forfeit writes walkover scores; winnerId alone no longer plays |
| B. MatchResult single source | Cleaner; bigger rewrite | Rejected — MatchResult only from result route |

Rounds + `matchStatusLabel` switch to scores; `route.test.ts` updated intentionally (delta spec).

### 5. Rules module structure

| Option | Tradeoff | Decision |
|---|---|---|
| A. Pure tables+functions per concern | Exhaustive tests; server-only | ✅ `lib/rules/{pe,improvements,skills,winnings,fanFactor,injuries,weather,value,index}.ts` |
| B. Single monolith | Fewer files; 500+ lines | Rejected |
| C. JSON+TS | Type drift | Rejected — TS = compile-time validation |

Catalog stays in `features/teams/data/skills.ts` (shared pure data) + elite/mandatory flags; missing random-table skills added slice 1.

### 6. Progression API/UI

| Option | Tradeoff | Decision |
|---|---|---|
| A. Single improve endpoint, server rolls | Server RNG; pending state | ✅ `{type: random-roll|random-pick|primary|secondary|attribute}`; `PlayerPendingRoll`; pick validates+deletes; others single-call |
| B. Stateless roll/pick | Client echoes roll (forgery) | Rejected |

Costs by type × improvement-#; alive 409; PE 400; valueBonus +10k/20k (élite); picks vs access letters.

## Data Flow

ResultModal → result/route (401/404·409·400) → lib/rules/* → one $transaction: Fixture(scores, winner, resultId) + MatchResult/audit + Team.treasury (lazy init+winnings) + Player ensurePlayers/pe/injuries/alive/valueBonus. Improve → improve/route (404·409·400) → Player + PlayerPendingRoll.

## File Changes

| File | Action | Description |
|---|---|---|
| `prisma/schema.prisma` | Modify | Player, MatchResult(+Correction), PlayerPendingRoll; Fixture +scores/resultId; Team +treasury |
| `lib/rules/*`, `lib/players.ts` | Create | 9 pure modules + ensurePlayersForTeam |
| `.../result/route.ts`, `.../improve/route.ts` | Create | POST/PUT result; PE spend + rolls |
| `app/api/leagues/[id]/route.ts` | Modify | scores in derivation/rounds |
| `features/leagues/*`, `features/teams/*` | Modify/Create | ResultModal, score render, élite badge, ProgressionPanel |
| `.../forfeit/route.ts` | Modify | walkover scores + 409 exclusion |
| `route.test.ts`, `e2e/league-matchday.spec.ts` | Modify | intentional updates |

## Interfaces / Contracts

```ts
// POST/PUT result
{ weather?: Weather; home: TeamResult; away: TeamResult }
TeamResult: { score; ballHeld; players: PlayerActions[]; mvp: { nominations: string[] } } // 6 unique ∈ roster
PlayerActions: { rosterPlayerId; tds; casualties; completions; interceptions; fouls;
  throwTeamMates; landedSafe }  // PE: TD3 CAS2 Comp1 Int2 MJP4 TTM1 LS1
// POST improve
{ type: "random-roll"; category: AccessLetter }
| { type: "random-pick"; selectedSkillId: SkillId }
| { type: "primary" | "secondary"; skillId: SkillId }
| { type: "attribute"; attribute: "ma"|"st"|"ag"|"pa"|"av" }
```

Prisma delta (additive): `Fixture{homeScore?, awayScore?, resultId? @unique, result MatchResult?}` · `Team{treasury?}` · `Player{@@unique(teamId,rosterPlayerId), pe, skills/injuries/attributeIncreases Json, alive, valueBonus, improvements}` · `MatchResult{fixtureId @unique, weather, scores, pettyCash?, loadedBy, corrections[]}` · `MatchResultCorrection{correctedBy, before/after Json}` · `PlayerPendingRoll{playerId @unique, roll1, roll2, kind}`.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | lib/rules tables | exhaustive pinned values |
| Unit | derivation/rounds/label | scores-driven + winnerId-alone cases |
| Unit | ensurePlayersForTeam | idempotent; unknown skipped |
| Route | result/improve | 401/403/404/409/400, tx rollback, audit |
| Component | ResultModal/ProgressionPanel/MatchCard | textContent/regex (no jest-dom) |
| E2E | slice 5 | load → score → jornada completa |

## Threat Matrix

N/A — no shell/subprocess/VCS/PR/executable/process boundary; HTTP-body validation covered by the error-semantics route tests above.

## Migration / Rollout

Additive only; revert = revert slice PRs; roster untouched until verified (count(Player) == roster ids, zero unknown rosterPlayerId). Old winnerId-only flow works until slice 2. Delivery: proposal's 5 slices confirmed (S1 schema+rules+derivation+tests — heaviest; S2 result API+forfeit; S3 result UI; S4 progression; S5 e2e); tasks may split S1 into two chained PRs.

## Open Questions

- [x] ~~**BLOCKING (slice-1/2 gate)**: Pase (P) + Triquiñuelas (T) random-table column values~~ — RESOLVED: full 6-column table (A/F/G/M/P/T) recovered in engram obs #302 (from the user's original message). All 72 cells available: e.g. block 1-3 row 4 P = Nervios de acero, T = Falta rápida; block 4-6 row 1 P = Pasar y seguir, T = Jugar sucio; etc. See obs #302 for the complete table.
- [x] Walkover score values — USER CONFIRMED: 2–0.
- [ ] player-progression scenario labels Apariencia asquerosa "élite" — stale vs REQ-RACE-08; fix label at archive.
- [x] TTM/landed-safe PE fields in ResultModal scope — USER CONFIRMED: include in slice 3 (payload supports lanzar compañero + aterrizar sano PE fields).
