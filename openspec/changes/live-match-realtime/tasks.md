# Tasks: Live Match Realtime — Interactive 2-Coach Live Mode

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2239 total (349/355/383/375/380/397 per slice) |
| 400-line budget risk | Low (every slice <400) |
| Chained PRs recommended | Yes (6 slices, dep chain 1→2→3→4→5→6) |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 (stacked to main) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Migration + leagues clock option (creation UI/API/defaults/immutability/backfill) | PR 1 | `pnpm vitest run app/api/leagues/route.test.ts features/leagues/CreateLeagueModal.test.tsx lib/liveAccess.test.ts` | Create league enabled@240, invalid 3600→400; `mercurius.mdx` | Revert league columns + option (migration additive; entrypoint `prisma migrate deploy`) |
| 2 | SSE subscribe: `lib/liveAccess.ts`, `lib/liveHub.ts`, GET route (snapshot+gap) | PR 2 | `pnpm vitest run lib/liveHub.test.ts app/api/leagues/[id]/fixtures/[fixtureId]/live/route.test.ts` | Two browsers on one live fixture, both get snapshot | Stop streaming only; hub is in-memory, DB untouched |
| 3 | Control: pure transitions + `lib/liveStore.ts` + POST (seq-conflict 409) | PR 3 | `pnpm vitest run lib/liveMatch.test.ts app/api/leagues/[id]/fixtures/[fixtureId]/live/route.test.ts` | Run via cargo-blessed browser two-context | Revert POST handler; event rows additive, no authority drift |
| 4 | Client: `useLiveMatch` SSE hook + DTO `turnClockEnabled`/nullable clocks + MSW/expo | PR 4 | `pnpm vitest run features/leagues/useLiveMatch.test.ts lib/liveHub.test.ts` | `useLiveMatch` against hub | Revert hook + DTO only; server unchanged |
| 5 | MatchView shells live + timeline (live+played) + Spanish labels | PR 5 | `pnpm vitest run features/leagues/MatchView.test.tsx features/leagues/liveEventLabels.test.ts app/api/leagues/[id]/fixtures/[fixtureId]/route.test.ts` | Manual: played fixture timeline, static states keep `not.toContainText(/turno\|minuto\|½/i)` | Revert MatchView/timeline; DTO field removable |
| 6 | Result prefill + auth-suite e2e (two-context + new-device) + config exclusion | PR 6 | `pnpm vitest run features/leagues/ResultModal.test.tsx`; `AUTH_MODE=auth pnpm exec playwright test e2e/live-match.spec.ts`; local: `playwright.config.ts` ignore | Two contexts: A "Dar el turno" → B sees flip/clock/score; fresh-context recovery | Revert prefill + e2e + config exclusion; local suite untouched |

## Phase 1: Migration + League Clock Option (PR 1)

- [x] 1.1 RED `app/api/leagues/route.test.ts`: POST with option omitted → 240 default persisted; invalid `3600` → 400 no league; enabled 240 persisted; immutable (no update path). GREEN in `app/api/leagues/route.ts`.
- [x] 1.2 RED `features/leagues/CreateLeagueModal.test.tsx`: toggle + 120/240/360 select, default 240. GREEN in `CreateLeagueModal.tsx`.
- [x] 1.3 `features/leagues/api.ts` + `useLeagues.ts`: pass option param through.
- [x] 1.4 `prisma/schema.prisma`: add `League.turnClockEnabled Boolean @default(true)` + `turnClockSeconds Int @default(240)`.
- [x] 1.5 Create `prisma/migrations/<ts>_add_live_match_realtime/migration.sql` (League columns; additive; backfills existing rows enabled@240).
- [x] 1.6 RED `lib/liveAccess.test.ts` role matrix (401/404/403; local parity 401). GREEN `lib/liveAccess.ts` (empty gate awaiting slice 2).
- [x] 1.7 `pnpm db:generate`; confirm `prisma migrate deploy` in entrypoint.

## Phase 2: SSE Subscribe + Hub (PR 2)

- [x] 2.1 RED `lib/liveHub.test.ts`: subscribe/publish fan-out; active-coach tracking; no ticker/grace via fake timers.
- [x] 2.2 Implement `lib/liveHub.ts` hub (narrow interface; grace/ticker gated on `turnClockEnabled`; publish only when subs exist).
- [x] 2.3 RED `live/route.test.ts` GET cases: 401 both auth modes; 404 foreign; 200 snapshot-first; gap replay (`seq > snapshot.seq`); abort cleanup. GREEN GET handler `live/route.ts` (`force-dynamic`).
- [x] 2.4 Subscribe race interleave test: subscribe→DB read→drain; dupes dropped by `seq` (fake hub, controlled prisma seqs).

## Phase 3: Control + Transitions + POST (PR 3)

- [ ] 3.1 RED `lib/liveMatch.test.ts` pure invariants: alternation, no double-action, 8-turn/half flip, half-2-turn-8 TD finishes, TD-auto-ends-turn, `endMatch`, start guards, `clockSeconds` from state (not constant), clocks-disabled leaves clock fields inert. GREEN in `lib/liveMatch.ts`.
- [ ] 3.2 RED `live/route.test.ts` POST cases: 401/404/403/409 (out-of-turn, seq-conflict `updateMany` 0 rows→409, start on played, already finished)/200, `LiveEvent` seq order, publish-after-commit. GREEN POST handler + `lib/liveStore.ts` (`applyTransition` reads league option, optimistic `seq`, atomic `$transaction`, hub publish).
- [ ] 3.3 Grace: active-coach disconnect→10s auto-pause (`paused=true`,`clockStartedAt=null`). Resume on reconnect; recompute from persisted timestamps (restart survival).

## Phase 4: Client + SSE Hook + DTO (PR 4)

- [ ] 4.1 RED `useLiveMatch.test.ts`: connect, snapshot-first, reconnect via Last-Event-ID, control restored. GREEN `features/leagues/useLiveMatch.ts`.
- [ ] 4.2 `features/leagues/api.ts`: DTO `turnClockEnabled` + nullable `homeClock`/`awayClock`/`paused` on disabled; `clockSeconds` absent.

## Phase 5: MatchView + Timeline + Labels (PR 5)

- [ ] 5.1 RED `MatchView.test.tsx`: live UI shows state; clocks hidden when `turnClockEnabled` false; static states keep `not.toContainText(/turno\|minuto\|½/i)` (MV-5/AC-5). GREEN `MatchView.tsx` + `useLiveMatch` wiring.
- [ ] 5.2 RED `liveEventLabels.test.ts`: Spanish labels pure-fn. GREEN `liveEventLabels.ts` (matchSummary precedent).
- [ ] 5.3 `app/api/leagues/[id]/fixtures/[fixtureId]/route.ts`: return `live: LiveMatchViewState | null` (turn-clock include + DTO); test.

## Phase 6: Prefill (PR 6)

- [ ] 6.1 RED `ResultModal.test.tsx`: prefill scores + per-scorer TD from live DTO only; MJP/casualty/actions untouched. GREEN `resultPrefill.ts` + `ResultModal.tsx`/`LeagueDetail.tsx` (LM-9).
- [ ] 6.2 RED `e2e/live-match.spec.ts` (auth only): league created clocks enabled@240; two contexts — A "Dar el turno" → B sees flip/clock/score via SSE; new-device recovery (fresh context, same creds → snapshot + control restored).
- [ ] 6.3 `playwright.config.auth.ts` match / `playwright.config.ts` ignore `live-match.spec.ts` (local suite stays green).

## AC Traceability

| AC | Covered in |
|----|-----------|
| AC-1 | 1.6, 2.3 |
| AC-2 | 3.1/3.2 |
| AC-3 | 3.1 |
| AC-4 | 2.3/2.4, 3.2 |
| AC-5 | 5.1 |
| AC-6 | 6.1 |
| AC-7 | 5.1/5.2 (MV-7 preserved) |
| AC-8 | 2.3, 4.1, 6.2 |
| AC-9 | 3.3, 2.2 |
| AC-10 | 1.1–1.5, 3.1 (LM-5/leagues delta) |

Deploy order: merge PR 1 migration first (additive, `prisma migrate deploy` before live code). Rollback = reverse order.
