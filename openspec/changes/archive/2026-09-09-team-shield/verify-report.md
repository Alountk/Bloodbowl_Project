```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:4626a3e86cf537cbdd522c9c5761e907cd32ed23949349639b410d1bcc17e0a2
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 8/8
scenarios: 20/20
test_command: pnpm test
test_exit_code: 0
test_output_hash: sha256:02c4e5a2e098b31c847d33d31a264ae3b0f1065696a586a16d6b822094c096ab
build_command: pnpm build
build_exit_code: 0
build_output_hash: sha256:e64d52b5efe5df0b9fee1fbfa453d60c64b62e34cd2b6eb84c86ae538f09681c
```

## Verification Report

**Change**: team-shield (RAU-78)
**Version**: N/A
**Mode**: Standard (spec-driven verification; apply ran Strict TDD per batch evidence)
**Scope**: Change fully merged into `main` (HEAD 7bcdb68 = merge PR #191, S4). Deliverables: PR #188 (S1 helper+avatar refactor), #189 (S2 shield backend), #190 (S3 render FE), #191 (S4 ShieldControl). Independent source inspection of `main` + full runtime harness.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 20 |
| Tasks complete | 20 |
| Tasks incomplete | 0 |

`tasks.md` 20/20 `[x]`; Engram #777 identical; apply-progress (file, post-merge revision) reports S1 4/4 · S2 6/6 · S3 5/5 · S4 5/5.

### Build & Tests Execution
**Build**: ✅ Passed
- `pnpm build` → exit 0 (Next.js 16 route table includes `/api/teams/[id]/shield` and `/uploads/shields/[key]`).
- `pnpm db:generate` → exit 0.
- `npx tsc --noEmit` → exit 0.
- `pnpm lint` → exit 0 (clean).

**Tests**: ✅ 2371 passed / 0 failed / 0 skipped — 168 files passed (`pnpm test`).
```text
Test Files  168 passed (168)
     Tests  2371 passed (2371)
```

**Coverage**: ➖ Not configured (no coverage threshold in repo; apply used test-count deltas per batch).

**Runtime harness e2e**: ➖ Not run — documented limitation: an alien `next-server` (PID 60123, ~6-day uptime) holds :3000, which Playwright `reuseExistingServer` would adopt (non-authoritative). Per change scope, shield e2e routes 401 under `AUTH_MODE=local` (no local upload path) and auth-mode e2e is out of scope (auth untouched). TS-1/TS-4 owner-upload + rival read-only flows are proven at the integration layer by passing page tests (real `ApiTeamStore` + mocked fetch). Not a blocker.

### Spec Compliance Matrix
Requirements counted from the retrieved delta specs: team-shield TS-1..TS-6 (6 requirements / 11 scenarios), team-persistence "Persistent Schema" MODIFIED (1 / 5), team-scouting "Get Team Scouting Endpoint" MODIFIED (1 / 4). Total 8 requirements / 20 scenarios.

| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| TS-1 · Shield Upload | Owner uploads a shield | `app/api/teams/[id]/shield/route.test.ts` > "returns 200, stores a 512x512 cover WebP under shields/\<teamId\>-[uuid].webp and returns the value" + "replaces an existing emblem and deletes the previous blob only after the put succeeds" | ✅ COMPLIANT |
| TS-1 · Shield Upload | Oversize or wrong-kind rejected | same file > "returns 400 over the 2MB cap before any owner lookup and stores nothing" + "returns 400 for non-JPEG/PNG/WebP (SVG) and stores nothing" + "returns 400 when the shield file field is missing" | ✅ COMPLIANT |
| TS-2 · Shield Removal | Owner removes shield | same file > "removes the shield: deletes the stored blob and persists emblem null" (200 `{emblem:null}`) | ✅ COMPLIANT |
| TS-2 · Shield Removal | Remove with no shield is a no-op | same file > "no-ops with 204 when the team has no emblem (no blob operation)" | ✅ COMPLIANT |
| TS-3 · Shield Serve Route | Stored shield served | `app/uploads/shields/[key]/route.test.ts` > "serves a stored shield as image/webp with a long immutable cache" | ✅ COMPLIANT |
| TS-3 · Shield Serve Route | Malformed key rejected | same file > "rejects a traversal key without touching storage" + "rejects a key outside the server-issued shape without touching storage" + "returns 404 when the adapter has no blob for the key" | ✅ COMPLIANT |
| TS-4 · Owner Gating | Foreign team denied | `app/api/teams/[id]/shield/route.test.ts` > "returns 404 for a foreign, missing, or archived team (owner-scoped findFirst)" (POST + DELETE) | ✅ COMPLIANT |
| TS-4 · Owner Gating | Non-owner sees shield, no controls | `app/teams/[teamId]/page.test.tsx` > "shows a rival's shield but never the owner upload/remove controls (TS-4)"; `TeamDetailView.test.tsx` > "renders no control content when the shieldControl slot is omitted (rival view)" | ✅ COMPLIANT |
| TS-5 · Shared Image Helper | Avatar refactor is behavior-neutral | `app/api/me/avatar/route.test.ts` byte-identical across change (git diff 9772b1f^..HEAD = 0 lines) + 15/15 green; `lib/uploads/image.test.ts` 15/15 | ✅ COMPLIANT |
| TS-6 · Emblem Rendering with Fallback | Shield shown when present | `features/leagues/teamEmblemShield.test.tsx` > "renders the shield image…"; TeamCard/MatchCard/LeagueDetail/TeamDetailView shield tests | ✅ COMPLIANT |
| TS-6 · Emblem Rendering with Fallback | Fallback when absent | `teamEmblemShield.test.tsx` null/missing/empty-string cases; `TeamDetailView.test.tsx` > "shows the deterministic placeholder emblem…" | ✅ COMPLIANT |
| Persistent Schema (delta) | Team persisted to DB | Pre-existing persistence suites green in full run (unchanged); additive column only | ✅ COMPLIANT |
| Persistent Schema (delta) | Archived team still persisted | Pre-existing suites green (unchanged); no schema behavior touched | ✅ COMPLIANT |
| Persistent Schema (delta) | Existing team starts unassigned | Pre-existing league migration suites green (unchanged) | ✅ COMPLIANT |
| Persistent Schema (delta) | League delete nulls membership | Pre-existing league suites green (unchanged) | ✅ COMPLIANT |
| Persistent Schema (delta) | Existing team gains null emblem | Migration `20260909000000_team_shield` additive `ADD COLUMN emblem TEXT`; `prisma migrate status` = up to date (28 migrations, applied to dev DB); full suite green | ✅ COMPLIANT |
| Get Team Scouting Endpoint (delta) | Owner fetches own team | `app/api/teams/[id]/route.test.ts` 21/21 incl. "returns the stored emblem value…" / "returns emblem null…" | ✅ COMPLIANT |
| Get Team Scouting Endpoint (delta) | Unauthenticated scouting rejected | Pre-existing GET 401 tests green (unchanged) | ✅ COMPLIANT |
| Get Team Scouting Endpoint (delta) | Archived team hidden | Pre-existing GET 404 tests green (unchanged) | ✅ COMPLIANT |
| Get Team Scouting Endpoint (delta) | Emblem present in scouted payload | `route.test.ts` > "returns the stored emblem value when the team has a shield" + "returns emblem null when the team has no shield" | ✅ COMPLIANT |

**Compliance summary**: 20/20 scenarios compliant.

### Correctness (Static Evidence — main @ 7bcdb68)
| Requirement | Status | Notes |
|------------|--------|-------|
| `lib/uploads/image.ts` | ✅ Implemented | Pure `MAX_UPLOAD_BYTES`, `sniffImageBytes`, `keyFromValue(value, namespace)`, `toSquareWebp(bytes, px)`; no model imports (TS-5). |
| `app/api/me/avatar/route.ts` | ✅ Implemented | Re-exports `MAX_UPLOAD_BYTES`/`sniffImageBytes`; `avatarKeyFromValue` wraps `keyFromValue(v,"avatars")`; POST delegates `toSquareWebp(bytes,256)`. `route.test.ts` 0-line diff across change. |
| `prisma/schema.prisma` + migration | ✅ Implemented | `Team.emblem String?` (+5 lines, doc comment); `20260909000000_team_shield` additive `ALTER TABLE "Team" ADD COLUMN "emblem" TEXT;`. DB up to date. |
| `app/api/teams/[id]/shield/route.ts` | ✅ Implemented | POST: 401 → formData("shield") → 2MB cap → sniff → `findFirst{id,userId,archivedAt:null}`→404 → `toSquareWebp(512)` → `shields/<id>-<uuid>.webp` → put → DB update → delete prev → 200 `{emblem}`. DELETE: owner guard, `emblem:null` + safe `adapter.delete`, no-op 204, removal 200 `{emblem:null}`. |
| `app/uploads/shields/[key]/route.ts` | ✅ Implemented | Strict regex `^[a-zA-Z0-9]+-[0-9a-f-]+\.webp$`, `adapter.read("shields/"+key)`, `image/webp` + immutable cache, 404 malformed/missing. Sibling route; avatar serving untouched. |
| `app/api/teams/[id]/route.ts` GET | ✅ Implemented | Response adds `emblem: team.emblem` (nullable). |
| FE payloads | ✅ Implemented | `Team.emblem?: string\|null` (types.ts), `ApiTeam`+`teamFromApi` normalize `?? null`, `LeagueMemberTeam`/`ScoutedTeamDetail` emblem optional. |
| `features/leagues/TeamEmblem.tsx` | ✅ Implemented | Truthy emblem → circular `object-cover` `<img>` `data-testid=shield-<id>`; null/undefined/"" → exact placeholder (`emblem-<id>`, aria, tone); `acronym` path preserved for header glyphs. |
| TeamCard / MatchCard / LeagueDetail / TeamDetailView | ✅ Implemented | TeamCard passes `team.emblem`; MatchCard `emblemById?` map built by LeagueDetail `Jornadas`; detail hero shows TeamEmblem lg + owner `shieldControl` slot in same column. |
| `features/teams/detail/ShieldControl.tsx` | ✅ Implemented | Owner-only (page-mounted), direct picker `accept=image/jpeg,image/png,image/webp`, Quitar gated on `hasEmblem`, pending disables, `role=status`/`role=alert` live regions, `onShieldChanged` refresh. No CropDialog, no SVG. |
| `app/teams/[teamId]/page.tsx` | ✅ Implemented | Builds ShieldControl only when `isOwner` (store team present); rival view structurally cannot mount controls; `refreshTeams` after mutation. |
| `features/teams/api.ts` | ✅ Implemented | `uploadTeamShield` (multipart `shield` field, no content-type header), `removeTeamShield` (DELETE; 204 folded into `{emblem:null}`). |
| `lib/i18n/dictionaries.ts` | ✅ Implemented | ES + EN `detail.shield.{upload,remove,pending,success,error}` in sync (key-pair test + dict sync test green). |
| OUT invariants | ✅ Verified absent | No changed files under live-match header (MVT-8), headerEmblem, standings, LiveMatch, CropDialog, or SVG surfaces (`git diff 9772b1f^..HEAD --name-only` = 0 matches). `HeaderEmblem` still calls TeamEmblem with `acronym` and no emblem → acronym glyph intact. |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| Pipeline + pure fns in `lib/uploads/image.ts` (Option B) | ✅ Yes | No model coupling; multipart stays inline per route. |
| Generalized `keyFromValue(value, namespace)` | ✅ Yes | Byte-identical for `avatars`; reuse for `shields`. |
| Sibling serve route `app/uploads/shields/[key]` | ✅ Yes | Zero avatar-serving risk; ~40-line route. |
| Field `emblem`, storage namespace `shields/` | ✅ Yes | Matches TeamEmblem + User.avatar convention. |
| Server 512 cover-crop, no client CropDialog | ✅ Yes | Sharp pipeline in POST; ShieldControl sends raw blob. |
| DELETE response codes (design `204 \| 401 \| 404`) | ⚠️ Deviation (documented, spec-compliant) | Removal with a stored emblem returns **200 `{emblem:null}`** (TS-2 scenario says "200 returns"); no-shield removal is **204** no-op (matches design's no-op note). Client folds both into `{emblem:null}`. Flagged in apply-progress; does not break any spec scenario. |

### Issues Found
**CRITICAL**: None
**WARNING**:
1. Design-interface deviation on DELETE codes (200 `{emblem:null}` for stored-shield removal vs design's `204|401|404` line) — fully documented in apply-progress, satisfies TS-2 scenario text verbatim, both client paths covered by tests. No spec break.
2. Playwright e2e for shield upload/read-only not executed — alien server on :3000 would be reused (non-authoritative) and local auth mode 401s the shield routes; TS-1/TS-4 proven at the integration layer (page tests with real store flow). Documented limitation, no spec scenario left untested at runtime.

**SUGGESTION**: None

### Verdict
PASS WITH WARNINGS — 20/20 tasks, 8/8 requirements and 20/20 scenarios compliant with passing runtime evidence (168 files / 2371 tests, lint, tsc, db:generate, production build all green on `main` @ 7bcdb68); two non-blocking documented warnings only.
