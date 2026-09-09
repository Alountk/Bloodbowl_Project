# Design: Team Shield — Custom Team Emblem (RAU-78)

## Technical Approach

Mirror the avatar pipeline, generalized through a **pipeline+pure** helper with a **sibling** serve route. Extract pure image primitives (`MAX_UPLOAD_BYTES`, `sniffImageBytes`, `keyFromValue`, `toSquareWebp`) into `lib/uploads/image.ts`; the avatar route re-exports/delegates byte-identically. Add additive `Team.emblem String?`, owner-only `POST`/`DELETE /api/teams/[id]/shield` storing `shields/<teamId>-<uuid>.webp` (sharp 512 cover WebP), a sibling `app/uploads/shields/[key]` serve route, and `TeamEmblem` optional `<img>` with deterministic fallback on TeamCard/MatchCard/detail hero + owner ShieldControl. Live header/standings/scouting-list stay acronym-only (MVT-8 invariant).

## Architecture Decisions

| Decision | Option A | Option B | Chosen | Rationale |
|---|---|---|---|---|
| Helper shape | Route helper (Request+formData, model-coupled) | Pipeline + pure fns (`bytes→webp`, sniff/key), route stays model layer | **B** | Spec TS-5 forbids model coupling; multipart messages are route-specific ("Avatar exceeds…" vs "shield") so keeping them inline makes avatar byte-identical trivial. |
| Key recovery | `avatarKeyFromValue` duplicated | `keyFromValue(value, namespace)` generalized | **Generalized** | `indexOf("/"+namespace+"/")` is byte-identical for `avatars`; shield reuses it for `/shields/`. |
| Serve route | Generalize `app/uploads/[namespace]/[key]` | Sibling `app/uploads/shields/[key]` | **Sibling** | Zero prod-avatar risk, unambiguous static+dynamic precedence, ~38 dup lines acceptable. |
| Field name | `shield` | `emblem` | **emblem** | Matches TeamEmblem naming + `User.avatar` convention; storage namespace stays `shields/`. |
| Crop | Client CropDialog | Server square-crop 512 | **Server** | Shields are square; 512 cover-crop suffices, avoids cross-feature CropDialog move. |

## Data Flow

```
POST shield: auth → formData("shield") → size≤2MB → sniff → owner findFirst
             → sharp 512 WebP → key shields/<id>-<uuid>.webp → adapter.put
             → prisma.team.update(emblem=value) → delete prev blob → 200 {emblem}
GET /uploads/shields/<key>: regex ^[a-zA-Z0-9]+-[0-9a-f-]+\.webp$ → adapter.read("shields/"+key) → image/webp immutable
GET scouting/leagues: raw Prisma rows auto-carry emblem; [id] GET adds emblem manually
```

## File Changes

| File | Action | Description |
|---|---|---|
| `lib/uploads/image.ts` | Create | `MAX_UPLOAD_BYTES`, `sniffImageBytes`, `keyFromValue(value, namespace)`, `toSquareWebp(bytes, px)` |
| `app/api/me/avatar/route.ts` | Modify | Re-export `MAX_UPLOAD_BYTES`/`sniffImageBytes`; `avatarKeyFromValue` wraps `keyFromValue(...,"avatars")`; POST delegates to `toSquareWebp(bytes,256)` |
| `prisma/schema.prisma` + migration | Modify | `Team.emblem String?` (adopt `20260909000000_team_shield`) |
| `app/api/teams/[id]/shield/route.ts` | Create | POST/DELETE owner-only; guard `findFirst({id,userId,archivedAt:null})` → 404 |
| `app/uploads/shields/[key]/route.ts` | Create | Serve shields WebP, strict regex, image/webp immutable |
| `app/api/teams/[id]/route.ts` | Modify | GET adds `emblem: team.emblem` |
| `features/teams/types.ts`, `store/ApiTeamStore.ts` | Modify | `Team.emblem: string \| null`; ApiTeam + `teamFromApi` |
| `features/leagues/api.ts` | Modify | `LeagueMemberTeam` + `ScoutedTeamDetail` add `emblem: string \| null` |
| `features/leagues/TeamEmblem.tsx` | Modify | Optional `emblem?: string \| null` → `<img>` else placeholder (preserve testid/aria) |
| `features/teams/TeamCard.tsx`, `features/leagues/MatchCard.tsx` | Modify | Pass emblem; MatchCard gains `emblemById?` map |
| `features/teams/detail/TeamDetailView.tsx` | Modify | Hero emblem; owner ShieldControl slot |
| `features/teams/detail/ShieldControl.tsx` | Create | Subir/Quitar (owner), a11y |
| `app/teams/[teamId]/page.tsx` | Modify | Wire upload/remove (owner) + `refreshTeams` |
| `features/teams/api.ts` | Modify | `uploadTeamShield`/`removeTeamShield` clients |
| `lib/i18n/dictionaries.ts` | Modify | ES/EN `detail.shield.*` keys |

## Interfaces / Contracts

```ts
// lib/uploads/image.ts (pipeline + pure — no model imports)
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export function sniffImageBytes(bytes: Uint8Array): "jpeg"|"png"|"webp"|null;
export function keyFromValue(value: string, namespace: "avatars"|"shields"): string | null;
export async function toSquareWebp(bytes: Buffer, px: number): Promise<Buffer>;
// avatar route: export { MAX_UPLOAD_BYTES, sniffImageBytes } from helper;
//              export const avatarKeyFromValue = (v) => keyFromValue(v, "avatars");
```

```ts
// shield API
POST   /api/teams/[id]/shield  → 200 { emblem: string } | 401 | 400 | 404
DELETE /api/teams/[id]/shield  → 204 | 401 | 404  (no-op when emblem null)
```

`keyFromValue` returns `value.slice(idx+1)` where `idx = value.indexOf("/"+namespace+"/")` — byte-identical to today's `avatarKeyFromValue` for `avatars` (verified: S3 URL `…/shields/avatars/u.webp` still resolves `avatars/u.webp`).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit | `sniffImageBytes`/`keyFromValue`/`toSquareWebp`; avatar route.test.ts byte-identical | New helper tests + keep `route.test.ts` untouched |
| Integration | shield POST/DELETE (401/404/400/oversize/SVG/200/delete-prev/no-op) | Mirror avatar route.test.ts; mock auth/prisma/storage/sharp |
| Serve | shields route (serve/404 malformed/404 missing) | Mirror `app/uploads/avatars/[key]/route.test.ts` |
| E2E | owner upload→render; non-owner sees shield no controls | Playwright; update only intentional markup |

## Threat Matrix

N/A — no shell, subprocess, VCS/PR automation, or executable-file classification boundary. The one genuine boundary (serve-route path safety) is closed by the strict `^[a-zA-Z0-9]+-[0-9a-f-]+\.webp$` regex + `shields/` namespace prefix (TS-3), which is a routing-safety requirement, not a VCS/shell threat.

## Migration / Rollout

Additive `Team.emblem String?` only; existing rows get `emblem: null` (placeholder renders). Rollback = reverse merge order; drop column pre-release if needed. Orphan blobs inert.

## Slices / PRs (each <400 lines, chained)

- **S1** helper `lib/uploads/image.ts` + avatar re-export refactor (~250) — verify `route.test.ts` green + tsc.
- **S2** migration + schema + shield POST/DELETE + serve route + tests (~280).
- **S3** FE types + `TeamEmblem` emblem + TeamCard/MatchCard/detail hero plumbing (~380).
- **S4** ShieldControl + page wiring + i18n + e2e (~250).

## Risks

| Risk | Mitigation |
|---|---|
| Avatar not byte-identical | Extract only pure fns + `toSquareWebp`; keep multipart inline; global sharp mock intercepts helper too |
| FE type drift | Single slice S3; typecheck + tests |
| Ownership leak | `findFirst({id,userId,archivedAt:null})` → 404; foreign/archived tests |
| e2e markup | Update tests only when behavior intentionally changes |

## Open Questions

- [ ] None blocking — field `emblem` (not `shield`) and `detail.shield.*` prefix follow existing conventions.
