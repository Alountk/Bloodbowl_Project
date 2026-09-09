# Tasks: Team Shield — Custom Team Emblem (RAU-78)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | S1 ~250 · S2 ~280 · S3 ~380 · S4 ~250 (total ~1160) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (S1) → PR 2 (S2) → PR 3 (S3) → PR 4 (S4) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|----------------------|-----------------|-------------------|
| S1 | Shared image helper + byte-identical avatar refactor | 1 | `pnpm exec vitest run app/api/me/avatar/route.test.ts lib/uploads/image.test.ts` | N/A — behavior-neutral refactor | Revert `lib/uploads/image.ts`; restore avatar imports |
| S2 | Migration + shield POST/DELETE + serve route | 2 | `pnpm exec vitest run app/api/teams/[id]/shield/route.test.ts app/uploads/shields/[key]/route.test.ts` | N/A — auth-mode session required (route tests cover) | Reverse migration + delete shield routes |
| S3 | `emblem` payloads + TeamEmblem `<img>` + cards/detail plumbing | 3 | `pnpm exec vitest run features/leagues/TeamEmblem features/teams/TeamCard features/leagues/MatchCard` | `pnpm dev` → teams/leagues render placeholder fallback | Revert FE type + render changes |
| S4 | ShieldControl + page wiring + i18n + e2e | 4 | `pnpm exec vitest run features/teams/detail/ShieldControl features/teams/detail/TeamDetailView` | `AUTH_MODE=local pnpm exec playwright test` | Revert ShieldControl + page wiring |

## Phase 1: Shared Image Helper (S1)

- [x] 1.1 Create `lib/uploads/image.ts` — `MAX_UPLOAD_BYTES`, `sniffImageBytes`, `keyFromValue(value, namespace)`, `toSquareWebp(bytes, px)`; pure, no model imports (TS-5)
- [x] 1.2 Refactor `app/api/me/avatar/route.ts` — re-export `MAX_UPLOAD_BYTES`/`sniffImageBytes`; `avatarKeyFromValue` wraps `keyFromValue(v,"avatars")`; POST delegates `toSquareWebp(bytes,256)`; multipart inline (TS-5)
- [x] 1.3 Add `lib/uploads/image.test.ts` — sniff accept/reject, key recovery local/S3/`/shields/`→null, cover 256/512 (TS-5)
- [x] 1.4 Verify `app/api/me/avatar/route.test.ts` unchanged + green (TS-5 avatar-neutral)

## Phase 2: Schema + Shield API + Serve Route (S2)

- [x] 2.1 Add `emblem String?` to `Team` in `prisma/schema.prisma` + migration `20260909000000_team_shield` (team-persistence delta)
- [x] 2.2 Create `app/api/teams/[id]/shield/route.ts` POST — 401 → formData("shield") → ≤2MB → sniff → `findFirst({id,userId,archivedAt:null})`→404 → `toSquareWebp(512)` → key `shields/<teamId>-<uuid>.webp` → adapter.put → DB update → delete prev → 200 `{emblem}` (TS-1, TS-4)
- [x] 2.3 Add DELETE in same route — owner guard → `emblem:null` + `adapter.delete`; no-op when null (TS-2, TS-4)
- [x] 2.4 Create `app/uploads/shields/[key]/route.ts` — regex `^[a-zA-Z0-9]+-[0-9a-f-]+\.webp$`, `adapter.read("shields/"+key)`, image/webp immutable (TS-3)
- [x] 2.5 Add `emblem: team.emblem` to GET response `app/api/teams/[id]/route.ts` (team-scouting delta)
- [x] 2.6 Tests: `app/api/teams/[id]/shield/route.test.ts` + `app/uploads/shields/[key]/route.test.ts` — 401/404 foreign+archived/400 oversize/400 SVG/200/delete-prev/no-op/malformed (TS-1/2/3/4)

## Phase 3: FE Payloads + Rendering (S3)

- [x] 3.1 Add `emblem: string|null` to `Team` (`features/teams/types.ts`), `ApiTeam`+`teamFromApi` (`features/teams/store/ApiTeamStore.ts`), `LeagueMemberTeam`+`ScoutedTeamDetail` (`features/leagues/api.ts`)
- [x] 3.2 `features/leagues/TeamEmblem.tsx` — optional `emblem?: string|null` → `<img>` else placeholder; keep `data-testid=emblem-${teamId}` + aria (TS-6)
- [x] 3.3 `features/teams/TeamCard.tsx` pass `emblem={team.emblem}`; `features/leagues/MatchCard.tsx` `emblemById?` map + `LeagueDetail.tsx` build map (TS-6)
- [x] 3.4 Hero emblem in `features/teams/detail/TeamDetailView.tsx` header (TS-6)
- [x] 3.5 Tests: TeamEmblem img vs fallback, TeamCard/MatchCard render shield; keep `teamEmblemAdditive.test.tsx`/`headerEmblem.test.tsx` green (TS-6)

## Phase 4: ShieldControl + Wiring + i18n (S4)

- [x] 4.1 Create `features/teams/detail/ShieldControl.tsx` — Subir/Quitar, a11y, owner-only
- [x] 4.2 Add `uploadTeamShield`/`removeTeamShield` to `features/teams/api.ts`
- [x] 4.3 Wire in `app/teams/[teamId]/page.tsx` — owner → ShieldControl + `refreshTeams`; non-owner sees shield, no controls (TS-4)
- [x] 4.4 Add ES/EN `detail.shield.*` keys to `lib/i18n/dictionaries.ts` (both dicts)
- [x] 4.5 Tests: ShieldControl + TeamDetailView; e2e owner upload→render, non-owner read-only (TS-1/4)
