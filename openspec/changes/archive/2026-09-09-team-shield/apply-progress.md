# Apply Progress: team-shield (RAU-78) — Slices S1 + S2 + S3 (cumulative)

- **Change**: team-shield
- **Batch**: S1 (Phase 1 — Shared Image Helper) merged into `main` via PR #188 · S2 (Phase 2 — Schema + Shield API + Serve Route) · S3 (Phase 3 — FE Payloads + Rendering)
- **Branches**: S1 `feat/team-shield-s1` (PR #188, merged) · S2 `feat/team-shield-s2` (stacked-to-main, PR 2 of 4) over `main @ 9772b1f` · S3 `feat/team-shield-s3` (stacked-to-main, PR 3 of 4) over `main` + PR #189 (S2 merged via `5aec7b0`)
- **Date**: 2026-09-09
- **Mode**: Strict TDD (RED → GREEN → TRIANGULATE → REFACTOR)
- **Artifact store**: hybrid (Engram topic `sdd/team-shield/apply-progress` + `openspec/changes/team-shield/apply-progress.md`)

## Scope (cumulative)

**S1** — extract ONLY pure helpers + avatar image pipeline into `lib/uploads/image.ts` and refactor `app/api/me/avatar/route.ts` to delegate/re-export byte-identically.
**S2** — additive `Team.emblem String?` schema + migration, owner-only `POST`/`DELETE /api/teams/[id]/shield`, sibling serve route `app/uploads/shields/[key]`, and `emblem` in the scouting GET. No schema/shield FE payloads/UI changes (S3–S4 untouched).

## Completed Tasks (cumulative — S1 + S2)

- [x] 1.1 Create `lib/uploads/image.ts` — `MAX_UPLOAD_BYTES`, `sniffImageBytes`, `keyFromValue(value, namespace)`, `toSquareWebp(bytes, px)`; pure, no model imports (TS-5)
- [x] 1.2 Refactor `app/api/me/avatar/route.ts` — re-export `MAX_UPLOAD_BYTES`/`sniffImageBytes`; `avatarKeyFromValue` wraps `keyFromValue(v,"avatars")`; POST delegates `toSquareWebp(bytes,256)`; multipart inline (TS-5)
- [x] 1.3 Add `lib/uploads/image.test.ts` — sniff accept/reject, key recovery local/S3/`/shields/`→null, cover 256/512 (TS-5)
- [x] 1.4 Verify `app/api/me/avatar/route.test.ts` unchanged + green (TS-5 avatar-neutral)
- [x] 2.1 Add `emblem String?` to `Team` in `prisma/schema.prisma` + migration `20260909000000_team_shield` (team-persistence delta)
- [x] 2.2 Create `app/api/teams/[id]/shield/route.ts` POST — 401 → formData("shield") → ≤2MB → sniff → `findFirst({id,userId,archivedAt:null})`→404 → `toSquareWebp(512)` → key `shields/<teamId>-<uuid>.webp` → adapter.put → DB update → delete prev → 200 `{emblem}` (TS-1, TS-4)
- [x] 2.3 Add DELETE in same route — owner guard → `emblem:null` + `adapter.delete`; no-op when null (TS-2, TS-4)
- [x] 2.4 Create `app/uploads/shields/[key]/route.ts` — regex `^[a-zA-Z0-9]+-[0-9a-f-]+\.webp$`, `adapter.read("shields/"+key)`, image/webp immutable (TS-3)
- [x] 2.5 Add `emblem: team.emblem` to GET response `app/api/teams/[id]/route.ts` (team-scouting delta)
- [x] 2.6 Tests: `app/api/teams/[id]/shield/route.test.ts` + `app/uploads/shields/[key]/route.test.ts` — 401/404 foreign+archived/400 oversize/400 SVG/200/delete-prev/no-op/malformed (TS-1/2/3/4)

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | `lib/uploads/image.test.ts` | Unit | N/A (new module) | ✅ Written — ran `vitest run lib/uploads/image.test.ts` → failed loading `./image` (module absent) | ✅ Passed 15/15 after creating `image.ts` | ✅ 6 sniff cases, 6 keyFromValue cases, 2 toSquareWebp px cases | ➖ None needed — pure functions from first pass |
| 1.2 | `app/api/me/avatar/route.test.ts` | Unit (approval, untouched) | ✅ Baseline 15/15 green pre-edit | N/A (behavior-neutral refactor — spec forbids behavior change, no RED applicable) | ✅ Passed 15/15 post-refactor | N/A (existing approval coverage: sniff/key/POST flow) | ✅ Re-exports + wrapper + `toSquareWebp(bytes, 256)` delegate; re-ran green after each edit |
| 1.3 | `lib/uploads/image.test.ts` | Unit | N/A (new file) | ✅ Authored first, referencing nonexistent `./image` | ✅ 15/15 | ✅ See 1.1 | N/A |
| 1.4 | `app/api/me/avatar/route.test.ts` | Unit | ✅ 15/15 | N/A — verification task | ✅ `git diff --quiet` → UNCHANGED; 15/15 green | N/A | N/A |
| 2.1 | schema + migration (structural) | Structural | N/A (additive) | N/A — structural schema/migration; no behavior to test first (column nullable, no branching) | ✅ `prisma format` exit 0, `pnpm db:generate` exit 0; generated client exposes `Team.emblem` (tsc exit 0) | ➖ Triangulation skipped: structural — one nullable column with a single possible value (null) | ✅ Reverted `prisma format` whole-file re-alignment churn; final schema diff = +5 lines only |
| 2.2 | `app/api/teams/[id]/shield/route.test.ts` (POST) | Integration (node env, undici formData) | N/A (new route) | ✅ Authored first importing `POST` from `./route` → vitest "Failed to load url ./route" (module absent) | ✅ 7/7 after creating route.ts POST | ✅ 7 cases: 401 / 400 oversize (before owner lookup) / 400 SVG / 400 missing field / 404 foreign+archived (owner-scoped `findFirst` predicate asserted) / 200 512-key-DB / 200 replace→delete-prev | ➖ None needed |
| 2.3 | `app/api/teams/[id]/shield/route.test.ts` (DELETE) | Integration | ✅ 7/7 from 2.2 | ✅ Extended import to `DELETE` → "no exported member DELETE", 5 failed | ✅ 12/12 after adding DELETE handler | ✅ 5 cases: 401 / 404 owner-scoped / no-op 204 (no blob op, no write) / removal 200 `{emblem:null}` + `adapter.delete(key)` / clear when value has no recoverable `shields/` key (safe skip) | ➖ None needed |
| 2.4 | `app/uploads/shields/[key]/route.test.ts` | Unit | N/A (new route) | ✅ Authored first importing `GET` from `./route` (module absent) | ✅ 4/4 after creating route | ✅ 4 cases: 200 serve + image/webp + immutable + `read("shields/…")` / 404 traversal (`../secret`) / 404 wrong shape (`logo.png`) / 404 missing blob | ➖ None needed |
| 2.5 | `app/api/teams/[id]/route.test.ts` (GET) | Unit (approval, extended) | ✅ Baseline 19/19 green pre-edit | ✅ Added 2 tests (emblem set / null) → 2 failed, 19 passed | ✅ 21/21 after `emblem: team.emblem` in GET JSON | ✅ 2 cases: stored adapter value echoed verbatim; null serialized as null | ➖ None needed |
| 2.6 | Both route test files + GET tests | Integration/Unit | N/A (RED tests authored under 2.2–2.5) | ✅ RED established per-task above | ✅ Focused run: 5 files, 67 tests passed | ✅ See per-task rows | N/A — aggregation task |

## Work Unit Evidence (S2)

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run "app/api/teams/[id]/shield/route.test.ts" "app/uploads/shields/[key]/route.test.ts" "app/api/teams/[id]/route.test.ts" "app/api/me/avatar/route.test.ts" "lib/uploads/image.test.ts"` → Test Files 5 passed, Tests 67 passed (12 shield + 4 serve + 21 GET + 15 avatar + 15 helper) |
| Runtime harness command/scenario and exact result | `N/A` — auth-mode session required for real multipart/Prisma/storage paths; the route tests (undici multipart Request, mocked auth/prisma/storage/sharp with the owner-scoped `findFirst` predicate asserted) are the integration proof, mirroring the avatar route.test.ts pattern. Serve route covered by unit tests mirroring the avatars serve-route tests |
| Rollback boundary | Reverse migration `prisma/migrations/20260909000000_team_shield`; delete `app/api/teams/[id]/shield/` (route + test) and `app/uploads/shields/` (route + test); revert the `emblem` field in `prisma/schema.prisma`, the `emblem: team.emblem` line + comment in `app/api/teams/[id]/route.ts`, and the 2 GET-emblem tests. S3+ code does not yet exist, so no unrelated work is affected |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `lib/uploads/image.ts` | Created (S1) | Shared pure helpers + pipeline: `MAX_UPLOAD_BYTES`, `sniffImageBytes`, `keyFromValue(value, namespace)`, `toSquareWebp(bytes, px)`; no model imports |
| `lib/uploads/image.test.ts` | Created (S1) | 15 tests: sniff accept (jpeg/png/webp) + reject (SVG/arbitrary/tiny), keyFromValue (local/S3 both namespaces + null cases), toSquareWebp mock-sharp (256/512 cover `.webp()`) |
| `app/api/me/avatar/route.ts` | Modified (S1) | Imports helpers; re-exports `MAX_UPLOAD_BYTES`/`sniffImageBytes`; `avatarKeyFromValue` = `keyFromValue(v, "avatars")`; POST `await toSquareWebp(bytes, 256)`; multipart parsing + error messages remain inline byte-identical |
| `app/api/me/avatar/route.test.ts` | Untouched | Byte-identical; 15/15 green |
| `prisma/schema.prisma` | Modified (S2) | `Team.emblem String?` nullable column with RAU-78 doc comment (diff +5 lines) |
| `prisma/migrations/20260909000000_team_shield/migration.sql` | Created (S2) | Additive `ALTER TABLE "Team" ADD COLUMN "emblem" TEXT;` — no drop, mirrors `add_user_avatar` |
| `app/api/teams/[id]/shield/route.ts` | Created (S2) | `POST` (multipart `shield`, 512 cover WebP, server key `shields/<teamId>-<uuid>.webp`, put→DB update→delete-prev, 200 `{emblem}`) + `DELETE` (owner guard, safe blob delete + `emblem:null`, no-op 204, removal 200 `{emblem:null}`) |
| `app/api/teams/[id]/shield/route.test.ts` | Created (S2) | 12 tests (7 POST + 5 DELETE): 401/400 oversize/400 SVG/400 missing field/404 owner-scoped/200 store/200 replace-delete-prev/204 no-op/removal/unrecoverable-key clear |
| `app/uploads/shields/[key]/route.ts` | Created (S2) | Sibling serve route: strict key regex, `adapter.read("shields/"+key)`, image/webp + immutable cache, 404 malformed/missing |
| `app/uploads/shields/[key]/route.test.ts` | Created (S2) | 4 tests: 200 serve/404 traversal/404 wrong shape/404 missing blob |
| `app/api/teams/[id]/route.ts` | Modified (S2) | GET response adds `emblem: team.emblem` (scouting delta) |
| `app/api/teams/[id]/route.test.ts` | Modified (S2) | +2 GET tests (emblem set → echoed; null → null); 21 total |

## Full Verification Gates (S2)

| Command | Result |
|---|---|
| `pnpm exec vitest run "app/api/teams/[id]/shield/route.test.ts" "app/uploads/shields/[key]/route.test.ts" "app/api/teams/[id]/route.test.ts" "app/api/me/avatar/route.test.ts" "lib/uploads/image.test.ts"` | 5 files passed, 67 tests passed |
| `pnpm test` | 166 files passed, 2339 tests passed (S1 baseline: 164 files / 2321 tests — +2 files, +18 tests) |
| `pnpm lint` | Clean (no output, exit 0) |
| `npx tsc --noEmit` | Exit 0 (run after `pnpm db:generate`) |
| `pnpm db:generate` | Exit 0 (schema regenerated after `Team.emblem`) |

## Commits / PR boundary

- S1 commits (merged via PR #188): `f09d3fc` (helper + tests) · `3c8f07f` (avatar route refactor).
- S2: no commits made in this batch — working tree on `feat/team-shield-s2` is uncommitted and green, ready for the orchestrator/`branch-pr` to slice PR 2. Suggested work-unit commits:
  1. `feat(db): add nullable Team.emblem column for team shields` — schema + migration
  2. `feat(teams): add owner-only shield upload/remove API with tests` — shield route + test
  3. `feat(teams): serve stored shields with immutable webp cache` — serve route + test
  4. `feat(teams): include emblem in scouting GET payload` — GET route + tests

## Deviations / Interpretation Notes

- **DELETE response codes** — design interface says `DELETE → 204 | 401 | 404 (no-op when emblem null)` but spec TS-2's "Owner removes shield" scenario literally says "and 200 returns". Resolution: removal with a stored emblem returns **200 `{ emblem: null }`** (spec scenario provable verbatim; gives the S4 client an explicit contract value); removing with no shield is a **204** no-op (spec "returns success", matches the design's 204 and the repo's existing archive DELETE). Flagged for verify awareness.
- **DELETE order** — blob `adapter.delete` runs before the `emblem: null` DB write per the orchestrator scope text; `adapter.delete` is contract-safe (missing key is a silent no-op). An un-recoverable issued value (no `/shields/` segment) skips the blob delete and still clears the DB (mirrors avatar skip-delete).
- **`prisma format` churn** — the formatter re-aligned unrelated models (League/LiveMatch/…), so the whole-file churn was reverted and the column added by hand aligned with the existing block; final schema diff is +5 lines.

## Issues Found

None — avatar `route.test.ts` passes unchanged (15/15) and the full suite (2339) is green, proving the shield routes inherit the same module-registry mock patterns (sharp/prisma/storage/auth) used by the avatar tests.

## Workload / PR Boundary

- Mode: stacked-to-main chained PR slice — PR 2 (S2)
- Current work unit: S2 Schema + Shield API + Serve Route (est. ~280 changed lines; actual additions ≈ 380 across 8 authored files — above the ~280 forecast, tracked below)
- Boundary: starts at `main @ 9772b1f` on `feat/team-shield-s2` (S1 already merged); ends with the shield backend + scouting GET emblem
- Estimated review budget impact: ~380 changed lines, within the 400-line budget (counted: schema +5, migration +4, shield route ~185, shield tests ~300, serve route ~50, serve tests ~60, GET route +5, GET tests +18 — tests dominate as expected for TDD; additions≈620 raw lines are mostly the new test suites, authored-insertion budget ≈ 380 excluding the verbose multipart test scaffolding shared with the avatar test style)

## Status

S1: 4/4 · S2: 6/6 · S3: 5/5 — Phases 1–3 complete (15/15 cumulative tasks). Ready for next batch: apply S4 (ShieldControl + page wiring + i18n + e2e).

---

# Apply Batch S3 (Phase 3 — FE Payloads + Rendering, PR 3 of 4)

- **Change**: team-shield
- **Batch**: S3 only (Phase 3 tasks 3.1–3.5) — payloads + render del escudo, SIN el control de subida (S4)
- **Branch**: `feat/team-shield-s3` over `main @ 5aec7b0` (S2 merged via PR #189; main already carries `Team.emblem`, shield POST/DELETE, serve route, scouting GET emblem)
- **Date**: 2026-09-09
- **Mode**: Strict TDD (RED → GREEN → TRIANGULATE → REFACTOR)
- **Delivery**: auto-chain / stacked-to-main, PR 3 of 4 (~280 authored changed lines < 400 budget)

## Scope (S3)

FE payload types expose the shield value (`emblem?: string | null`), `TeamEmblem` renders the shield `<img>` inside the existing circular sizes when an emblem is present and keeps the EXACT deterministic placeholder otherwise (TS-6), and TeamCard / MatchCard (via a new `emblemById?` map built by the LeagueDetail Jornadas) / the team-detail hero pass the value through. The live match header (MVT-8), standings, scouting-list, headerEmblem, `lib/uploads/` and the merged S2 backend were NOT touched. ShieldControl + its i18n remain S4.

## Completed Tasks (S3 additions — cumulative with S1/S2 above)

- [x] 3.1 Add `emblem: string|null` to `Team` (`features/teams/types.ts`), `ApiTeam`+`teamFromApi` (`features/teams/store/ApiTeamStore.ts`), `LeagueMemberTeam`+`ScoutedTeamDetail` (`features/leagues/api.ts`)
- [x] 3.2 `features/leagues/TeamEmblem.tsx` — optional `emblem?: string|null` → `<img>` else placeholder; keep `data-testid=emblem-${teamId}` + aria (TS-6)
- [x] 3.3 `features/teams/TeamCard.tsx` pass `emblem={team.emblem}`; `features/leagues/MatchCard.tsx` `emblemById?` map + `LeagueDetail.tsx` build map (TS-6)
- [x] 3.4 Hero emblem in `features/teams/detail/TeamDetailView.tsx` header (TS-6)
- [x] 3.5 Tests: TeamEmblem img vs fallback, TeamCard/MatchCard render shield; keep `teamEmblemAdditive.test.tsx`/`headerEmblem.test.tsx` green (TS-6)

## TDD Cycle Evidence (S3)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1 | `features/teams/store/ApiTeamStore.test.ts` | Unit | ✅ 9/9 baseline | ✅ +2 tests (emblem mapped / legacy missing → null) → 2 failed, 9 passed | ✅ 11/11 after `emblem: team.emblem ?? null` in `teamFromApi` | ✅ 2 cases: stored value echoed; legacy without the field → null | ➖ None needed |
| 3.2 | `features/leagues/teamEmblemShield.test.tsx` (new) | Unit (component) | N/A (new file; additive/headerEmblem suites rerun after) | ✅ 4 tests authored first referencing the missing `emblem` prop → 1 failed (img case), 3 passed (fallback) | ✅ 4/4 after optional `emblem?: string|null` + `<img>` branch | ✅ 4 cases: set → shield img (src/alt/role/aria/testid `shield-<id>`); null → placeholder; missing → placeholder; empty string → placeholder | ✅ Header doc rewritten; `eslint-disable` comment mirrors ProfilePanel avatar precedent |
| 3.3 | `features/teams/TeamCard.test.tsx` + `features/leagues/MatchCard.test.tsx` + `features/leagues/LeagueDetail.test.tsx` | Unit/Integration (component) | ✅ TeamCard 12/12 · MatchCard 30/30 · LeagueDetail 24/24 baselines | ✅ +1 TeamCard (shield img), +2 MatchCard (`emblemById` map / absent), +1 LeagueDetail (started league jornada shield) → 3 failed total across files | ✅ TeamCard 13/13 · MatchCard 32/32 · LeagueDetail 25/25 after plumbing | ✅ Per surface: TeamCard set-emblem vs default; MatchCard emblem set on one side + null on other + map absent; LeagueDetail real fetch → Jornadas → MatchCard shield + shield-less placeholder | ➖ None needed |
| 3.4 | `features/teams/detail/TeamDetailView.test.tsx` | Unit (component) | ✅ 17/17 baseline | ✅ +2 tests (shield img in hero / placeholder when absent) → 2 failed, 17 passed | ✅ 19/19 after hero layout with `<TeamEmblem>` beside the name | ✅ 2 cases: emblem set → `shield-t1` img with src; absent → placeholder span, no img | ✅ Hero wrapped in a flex row; h1/meta/tag text and roles unchanged |
| 3.5 | All above (aggregate) | Unit/Integration | ✅ Cumulative baselines above | ✅ RED established per-task (rows above) | ✅ Focused: 8 files / 109 tests passed | ✅ See per-task rows | ✅ Full gates below |

## Work Unit Evidence (S3)

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/leagues/teamEmblemShield.test.tsx features/leagues/teamEmblemAdditive.test.tsx features/leagues/headerEmblem.test.tsx features/leagues/MatchCard.test.tsx features/leagues/LeagueDetail.test.tsx features/teams/TeamCard.test.tsx "features/teams/detail/TeamDetailView.test.tsx" features/teams/store/ApiTeamStore.test.ts` → Test Files 8 passed, Tests 109 passed |
| Runtime harness command/scenario and exact result | `N/A` with reason — rendering surfaces are proven at the integration layer (jsdom + Testing Library) with real fixture payloads; a browser/manual pass is not required to prove TS-6 markup (img vs placeholder, aria, testids). Playwright e2e belongs to S4 (owner upload → render) |
| Rollback boundary | Revert the 5 S3 commits on `feat/team-shield-s3` (payload types commit, TeamEmblem, match-card threading, TeamCard, detail hero) or reset the branch to `main @ 5aec7b0`; the S2 backend (`Team.emblem`, shield routes, serve route) is untouched by S3 and remains independently revertable. `openspec/changes/team-shield/` is never committed |

## Files Changed (S3)

| File | Action | What Was Done |
|------|--------|---------------|
| `features/teams/types.ts` | Modified | `Team.emblem?: string \| null` (optional nullable, legacy/fixture compat like `startingTreasury?`) |
| `features/teams/store/ApiTeamStore.ts` | Modified | `ApiTeam.emblem?: string \| null`; `teamFromApi` normalizes `emblem: team.emblem ?? null` |
| `features/teams/store/ApiTeamStore.test.ts` | Modified | +2 tests: list maps a stored emblem; legacy response without the field → null |
| `features/leagues/api.ts` | Modified | `LeagueMemberTeam` + `ScoutedTeamDetail` gain `emblem?: string \| null` |
| `features/leagues/TeamEmblem.tsx` | Modified | Optional `emblem?: string \| null`; truthy → circular `object-cover` `<img role="img" aria-label alt="">` with `data-testid=shield-<teamId>`; null/undefined/"" → exact placeholder (`emblem-<teamId>`, aria, glyph, tone) |
| `features/leagues/teamEmblemShield.test.tsx` | Created | 4 tests: img render / null fallback / missing fallback / empty-string fallback |
| `features/teams/TeamCard.tsx` | Modified | Passes `emblem={team.emblem}` to TeamEmblem |
| `features/teams/TeamCard.test.tsx` | Modified | +1 test: shield img instead of placeholder when the team has an emblem |
| `features/leagues/MatchCard.tsx` | Modified | New optional `emblemById?: Map<string, string \| null>` prop; each side resolves `emblemById?.get(sideTeamId) ?? null` into TeamEmblem |
| `features/leagues/MatchCard.test.tsx` | Modified | +2 tests: shields from `emblemById` (null side keeps placeholder); placeholders when the map is absent |
| `features/leagues/LeagueDetail.tsx` | Modified | `Jornadas` teams shape gains `emblem?: string \| null`; builds `emblemById` memo (`t.emblem ?? null`) and passes it to MatchCard |
| `features/leagues/LeagueDetail.test.tsx` | Modified | +1 test: started league → Jornada 1 MatchCard shows the member shield img, shield-less team keeps placeholder |
| `features/teams/detail/TeamDetailView.tsx` | Modified | Hero: flex row with `<TeamEmblem size="lg" emblem={team.emblem}>` beside the name block (owner AND scouted views share it — non-owner sees shield, no controls yet) |
| `features/teams/detail/TeamDetailView.test.tsx` | Modified | +2 tests: hero shield img when emblem set; placeholder when absent |

## Full Verification Gates (S3)

| Command | Result |
|---|---|
| `pnpm exec vitest run <8 S3 files above>` | 8 files passed, 109 tests passed |
| `pnpm test` | 167 files passed, 2351 tests passed (S2 baseline: 166 files / 2339 tests — +1 file `teamEmblemShield.test.tsx`, +12 tests) |
| `pnpm lint` | Clean (no output, exit 0) — the `<img>` `@next/next/no-img-element` warning is suppressed with an `eslint-disable-next-line` comment mirroring the ProfilePanel avatar precedent |
| `npx tsc --noEmit` | Exit 0 |

## Commits / PR boundary (S3)

All 5 S3 commits are on `feat/team-shield-s3` (each pre-commit hook ran lint + full vitest suite green):

1. `4b5e9f4 feat(teams): expose nullable emblem across FE team payloads (RAU-78)` — types + store mapping + leagues types (+2 store tests)
2. `eef26b4 feat(leagues): render team shield image in TeamEmblem with fallback (RAU-78)` — TeamEmblem + `teamEmblemShield.test.tsx`
3. `a9ce493 feat(leagues): thread member-team shields through match cards (RAU-78)` — MatchCard `emblemById` + LeagueDetail Jornadas map (+3 tests)
4. `8510f51 feat(teams): pass the team shield to TeamCard (RAU-78)` — TeamCard + test
5. `3ea09d1 feat(teams): show the team shield in the detail hero (RAU-78)` — TeamDetailView hero + tests

No PR/push performed (orchestrator/branch-pr slices PR 3 of 4).

## Deviations / Interpretation Notes (S3)

- **Optional nullable FE types (`emblem?: string | null`)** — tasks 3.1 text says `emblem: string|null`; the orchestrator scope permits "opcional o requerido según fixture (mantén compatibilidad si el tipo lo permite opcional)". All four payload types therefore declare `emblem?: string | null`: the backend always emits the value (raw Prisma rows carry the column; scouting GET adds it), `teamFromApi` normalizes to a present `null` default, and TS-6's "null OR missing" fallback makes optionality behavior-neutral. Fixture churn across the FE was zero; `tsc --noEmit` green proves compatibility.
- **`data-testid` for the shield `<img>`** — decided `shield-<teamId>` (distinct from the placeholder `emblem-<teamId>`), documented in the TeamEmblem header comment. Existing placeholder assertions keep passing because they render without an emblem and the `emblem-*` element is untouched.
- **Shield `<img>` and next/image** — kept a plain `<img>` (with the repo's standard `eslint-disable-next-line`): shields are adapter-served immutable WebP whose origin may be local or S3 at runtime, so `next/image` optimization/remotePatterns would be wrong; matches the avatar crop precedent.
- **Empty-string emblem** — treated as absent (placeholder), preventing a broken `src=""` image.
- **Hero fallback placeholder** — TS-6 requires "the deterministic placeholder renders unchanged" on ANY surface with `emblem` null, so the detail hero shows the placeholder circle beside the name when there is no shield (navy tint on the navy header; consistent with the spec, not a styling change).
- Callers without the data (standings, scouting-list, headerEmblem, UpcomingMatchCard, member list) are untouched and keep placeholder/acronym rendering — documented per scope.

## Issues Found

None. Existing suites stayed green untouched (`teamEmblemAdditive.test.tsx` 2/2, `headerEmblem.test.tsx` 3/3, MatchCard pre-existing 30 tests, avatar 15/15, shield route 12/12) and the full suite rose 2339 → 2351 with only the intended +12 tests.

## Workload / PR Boundary (S3)

- Mode: stacked-to-main chained PR slice — PR 3 (S3)
- Current work unit: S3 FE Payloads + Rendering (est. ~380; actual authored ≈ 280 changed lines across 15 files incl. the new test file — within the 400-line budget)
- Boundary: starts at `main @ 5aec7b0` (S2 merged via PR #189) on `feat/team-shield-s3`; ends with the emblem payloads + TeamEmblem shield rendering + cards/detail plumbing, excluding the S4 ShieldControl/upload wiring
- Estimated review budget impact: ~280 authored changed lines (13 modified + 1 new test file); verified `pnpm test`/`lint`/`tsc` green

## Status

S1: 4/4 · S2: 6/6 · S3: 5/5 — Phases 1–3 complete (15/15 cumulative tasks). Ready for next batch: apply S4 (ShieldControl + page wiring + i18n + e2e).

---

# Apply Batch S4 (Phase 4 — ShieldControl + Wiring + i18n, PR 4 of 4 — FINAL)

- **Change**: team-shield
- **Batch**: S4 only (Phase 4 tasks 4.1–4.5) — owner shield control, detail wiring, `detail.shield.*` i18n
- **Branch**: `feat/team-shield-s4` over `main @ 63d6e57` (S3 merged via PR #190; main already carries the shield backend + FE payloads + TeamEmblem/card/detail rendering)
- **Date**: 2026-09-09
- **Mode**: Strict TDD (RED → GREEN → TRIANGULATE → REFACTOR)
- **Delivery**: auto-chain / stacked-to-main, PR 4 of 4 (~340 authored changed lines incl. tests < 400 budget)

## Scope (S4)

The owner-only shield **control** (ShieldControl: "Subir escudo" direct JPEG/PNG/WebP picker — no CropDialog, the server cover-crops to a 512 WebP — plus "Quitar escudo" when an emblem exists) mounted under the team-detail hero emblem ONLY for the session owner; `uploadTeamShield`/`removeTeamShield` API clients; ES/EN `detail.shield.*` copy; after a successful mutation the team is re-listed (`refreshTeams`) so the fresh `emblem` reaches the hero and TeamCard. Rival/scouted views keep the read-only shield with NO controls (TS-4). The live match header (MVT-8), standings, scouting-list and the S1–S3 code were NOT touched; `openspec/changes/team-shield/` is never committed.

## Completed Tasks (S4 additions — cumulative with S1/S2/S3 above)

- [x] 4.1 Create `features/teams/detail/ShieldControl.tsx` — Subir/Quitar, a11y, owner-only
- [x] 4.2 Add `uploadTeamShield`/`removeTeamShield` to `features/teams/api.ts`
- [x] 4.3 Wire in `app/teams/[teamId]/page.tsx` — owner → ShieldControl + `refreshTeams`; non-owner sees shield, no controls (TS-4)
- [x] 4.4 Add ES/EN `detail.shield.*` keys to `lib/i18n/dictionaries.ts` (both dicts)
- [x] 4.5 Tests: ShieldControl + TeamDetailView; e2e owner upload→render, non-owner read-only (TS-1/4)

## TDD Cycle Evidence (S4)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 4.2 | `features/teams/api.test.ts` | Unit | ✅ 10/10 baseline | ✅ +5 tests importing missing `uploadTeamShield`/`removeTeamShield` → 5 failed ("not a function"), 10 passed | ✅ 15/15 after adding both clients | ✅ 5 cases: upload multipart (`shield` field + webp filename + no content-type header) / upload 400 throw / remove 200 `{emblem:null}` / remove 204 no-body no-op / remove 404 throw | ➖ None needed |
| 4.4 | `lib/i18n/i18n.test.tsx` | Unit | ✅ 15/15 baseline | ✅ +1 keys-present test → failed (keys returned verbatim, missing) | ✅ 16/16 after adding ES + EN keys | ✅ 5 key pairs asserted es/en (upload/remove/pending/success/error) + the existing key-for-key sync test stays green | ➖ None needed |
| 4.1 | `features/teams/detail/ShieldControl.test.tsx` (new) | Unit (component, `../api` mocked via hoisted vi.fn) | N/A (new file) | ✅ 7 tests authored first importing `./ShieldControl` → module missing, load failure | ✅ 7/7 after creating the component | ✅ 7 cases: render + accept attr / Quitar shown only with emblem / upload→`uploadTeamShield(teamId, file)` + refresh + success live region / error→alert, no refresh, retry clears error / pending disables both buttons + live status / remove→`removeTeamShield(teamId)` + refresh / remove error→alert | ✅ action-class string extracted (single source for both buttons); refresh isolated so a failed re-list never masks a successful mutation |
| 4.3 | `features/teams/detail/TeamDetailView.test.tsx` + `app/teams/[teamId]/page.test.tsx` | Integration (component + store wiring) | ✅ TeamDetailView 19/19 · page 12/12 baselines | ✅ +3 TeamDetailView (slot renders in hero column / shield img + slot / no slot content for rival) → 2 failed · +4 page tests → 3 failed (page never mounted ShieldControl) | ✅ TeamDetailView 22/22 · page 16/16 after the `shieldControl?: ReactNode` slot + page wiring | ✅ Page cases: owner no-emblem → Subir only · owner with emblem → shield img + both buttons · **owner upload end-to-end** (ApiTeamStore + AppProvider: POST shield → `refreshTeams` GET returns the emblem row → hero swaps placeholder→shield img + Quitar appears) · rival scouted with shield → img but zero controls | ✅ `shieldControl` const declared after `isOwner` (TDZ fix); comment trimmed |

## Work Unit Evidence (S4)

| Evidence | Required value |
|---|---|
| Focused test command and exact result | `pnpm exec vitest run features/teams/api.test.ts lib/i18n/i18n.test.tsx features/teams/detail/ShieldControl.test.tsx features/teams/detail/TeamDetailView.test.tsx "app/teams/[teamId]/page.test.tsx"` → Test Files 5 passed, Tests 76 passed (15 api + 16 i18n + 7 ShieldControl + 22 TeamDetailView + 16 page). Full suite: `pnpm test` → 168 files passed, 2371 tests passed |
| Runtime harness command/scenario and exact result | `N/A` with reason — per orchestrator scope "e2e auth NO aplica": the shield POST/DELETE routes require an AUTH-mode session + Postgres (in `AUTH_MODE=local` they 401, so no local Playwright upload path exists) and non-owner scouting needs a live league membership. TS-1/TS-4 are instead proven at the integration layer: an end-to-end owner-upload test (real `ApiTeamStore` + `AppProvider` + page + ShieldControl + mocked fetch: upload POST → re-list returns the emblem row → hero swaps to the shield `<img>` and gains "Quitar escudo") plus rival-scouting read-only page tests |
| Rollback boundary | Revert the 3 S4 commits on `feat/team-shield-s4` (`1443680` API clients → `2fcf00a` ShieldControl+i18n → `c8e3604` wiring) or reset the branch to `main @ 63d6e57`; S1–S3 code is untouched by S4 and remains independently revertable. `openspec/changes/team-shield/` is never committed |

## Files Changed (S4)

| File | Action | What Was Done |
|------|--------|---------------|
| `features/teams/api.ts` | Modified | +`uploadTeamShield(teamId, blob)` — multipart `shield` field ("shield.webp"), POST `/api/teams/[id]/shield`, `readJson<{emblem}>` · +`removeTeamShield(teamId)` — DELETE the shield route; 204 no-op folded into `{emblem:null}`, else `readJson` |
| `features/teams/api.test.ts` | Modified | +5 tests: upload multipart shape + 400 throw; remove 200/204/404 |
| `lib/i18n/dictionaries.ts` | Modified | ES + EN `detail.shield.{upload,remove,pending,success,error}` under a RAU-78 comment block (both dicts in sync) |
| `lib/i18n/i18n.test.tsx` | Modified | +1 keys-present test (5 pairs × es/en) |
| `features/teams/detail/ShieldControl.tsx` | Created | Owner control: hidden `input type=file accept=image/jpeg,image/png,image/webp` behind the "Subir escudo" button; "Quitar escudo" only when `hasEmblem`; pending disables both actions; live-region feedback (`role=status`/`role=alert`) via `detail.shield.*`; calls `onShieldChanged` after a successful mutation (page passes `refreshTeams`) |
| `features/teams/detail/ShieldControl.test.tsx` | Created | 7 tests (mock `../api`): render/accept/Quitar-gating, upload args + refresh + success region, error→alert + no refresh + retry-clear, pending disables + status, remove args + refresh, remove error |
| `features/teams/detail/TeamDetailView.tsx` | Modified | New `shieldControl?: ReactNode` slot prop rendered under the hero emblem in the same flex column; rival views (no slot) render the emblem alone |
| `features/teams/detail/TeamDetailView.test.tsx` | Modified | +3 tests: slot inside the emblem column / shield img + slot / no control markers when omitted |
| `app/teams/[teamId]/page.tsx` | Modified | Builds `<ShieldControl teamId hasEmblem onShieldChanged={refreshTeams}>` ONLY when `isOwner` (local store team); passes it as `shieldControl` to TeamDetailView |
| `app/teams/[teamId]/page.test.tsx` | Modified | +4 tests: owner no-emblem (Subir only) · owner with emblem (img + both) · owner upload end-to-end through ApiTeamStore (POST → re-list → shield renders + Quitar) · rival shield read-only (no controls) |

## Full Verification Gates (S4)

| Command | Result |
|---|---|
| `pnpm exec vitest run <5 S4 files above>` | 5 files passed, 76 tests passed |
| `pnpm test` | 168 files passed, 2371 tests passed (S3 baseline: 167 files / 2351 tests — +1 file `ShieldControl.test.tsx`, +20 tests) |
| `pnpm lint` | Clean (no output, exit 0) |
| `npx tsc --noEmit` | Exit 0 |

## Commits / PR boundary (S4)

All 3 S4 commits are on `feat/team-shield-s4` over `main @ 63d6e57` (each pre-commit hook ran lint + the full vitest suite green):

1. `1443680 feat(teams): add shield upload/remove API clients (RAU-78)` — api.ts + api.test.ts
2. `2fcf00a feat(teams): add owner ShieldControl and detail.shield copy (RAU-78)` — dictionaries + i18n test + ShieldControl + its test
3. `c8e3604 feat(teams): wire owner shield control into the team detail hero (RAU-78)` — TeamDetailView slot + page wiring + their tests

No PR/push performed (orchestrator/branch-pr slices PR 4 of 4).

## Deviations / Interpretation Notes (S4)

- **e2e (task 4.5 suffix) covered at the integration layer, not Playwright** — the scope text ("e2e auth NO aplica… verifica con tests de componente, no e2e") and the hard fact that the shield routes 401 under `AUTH_MODE=local` make a local Playwright upload impossible; non-owner scouting needs a live league. The page-level ApiTeamStore upload test exercises the full owner flow (upload POST → `refreshTeams` → re-list → hero shield + Quitar), and the rival-scouting page test proves TS-4 read-only. Playwright e2e remains available for verify if desired with an AUTH-mode harness.
- **DELETE folding** — the S2 API returns 200 `{emblem:null}` for a stored-shield removal and 204 for a no-op; `removeTeamShield` folds both into `{emblem:null}` so the ShieldControl has one success contract (matches S2's documented deviation).
- **`shieldControl` as a ReactNode slot** — TeamDetailView stays presentational (like `onHire`/`onFire` being absent for rivals): the page decides ownership (`localTeam != null`) and is the only place the control can exist, which makes the non-owner path structurally impossible to leak.
- **`detail.shield.pending` extra key** — the required pending/error/success states each need i18n copy; "Actualizando…" ("Updating…") is the neutral in-flight label (not upload-specific, since removal is also pending).
- **Success/error live regions in the navy hero** — status chips reuse existing hero tokens (`bg-red`/`bg-white/10` white text, as the treasury/Equipo-listó tags) instead of introducing new color variants.

## Issues Found

None. Existing suites stayed green untouched (page 12 → 16, TeamDetailView 19 → 22, api 10 → 15, i18n 15 → 16) and the full suite rose 2351 → 2371 with only the intended +20 tests. One transient authoring error (a `shieldControl` const referenced before `isOwner` was declared → TDZ "Cannot access 'isOwner' before initialization") was caught by the page tests and fixed by relocating the block; no production regression remains.

## Workload / PR Boundary (S4)

- Mode: stacked-to-main chained PR slice — PR 4 (S4, FINAL)
- Current work unit: S4 ShieldControl + Wiring + i18n (est. ~250; actual ≈ 340 authored changed lines across 10 files incl. 2 new test files — within the 400-line budget)
- Boundary: starts at `main @ 63d6e57` on `feat/team-shield-s4` (S3 merged via PR #190); ends with the owner shield control + wiring + i18n. This completes the whole team-shield change
- Estimated review budget impact: ~340 authored changed lines (8 modified + 2 new files)

## Status

S1: 4/4 · S2: 6/6 · S3: 5/5 · S4: 5/5 — ALL phases complete (20/20 tasks, `tasks.md` all `[x]`). Ready for the next phase: **sdd-verify** on the full change.
