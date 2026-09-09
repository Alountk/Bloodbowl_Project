# Proposal: Team Shield — Custom Team Emblem (RAU-78)

## Intent

Let team owners upload a custom shield replacing the deterministic `TeamEmblem` placeholder on team cards, match cards and team detail (mirrors avatar pipeline, RAU-78).

## Scope

### In Scope
- Additive migration + `Team.emblem String?` (adapter-issued or null)
- Shared helper from `app/api/me/avatar/route.ts` (byte-identical; re-exports keep tests green)
- `POST`/`DELETE /api/teams/[id]/shield` (owner-only)
- Sibling serve route `app/uploads/shields/[key]/route.ts`
- `TeamEmblem` optional `emblem` → TeamCard, MatchCard, detail hero; fallback placeholder
- Owner ShieldControl (Subir/Quitar escudo) + i18n ES/EN `detail.*`

### Out of Scope
- Live match-view header (MVT-8 acronym invariant; no new live DTO fields)
- Standings, headerEmblem, scouting-list emblems
- CropDialog (server square-crops), SVG, multiple shields/versions, avatar change

## Capabilities

### New Capabilities
- `team-shield`: owner upload (≤2MB JPEG/PNG/WebP sniff, sharp 512 WebP, key `shields/<teamId>-<uuid>.webp`), remove (null + blob delete), rendering with fallback, owner gating.

### Modified Capabilities
- `team-persistence` (Persistent Schema): Team gains nullable `emblem String?`
- `team-scouting` (Get Team Scouting Endpoint): response adds nullable `emblem`
- None others — avatar unchanged; storage-adapter already namespaced.

## Approach

- Extract `lib/uploads/image.ts` (`MAX_UPLOAD_BYTES`, `sniffImageBytes`, `toSquareWebp`, `keyFromValue`, `asBlobFile`); avatar route delegates + re-exports.
- Shield routes guard `findFirst({id,userId,archivedAt:null})` → 404; POST store blob → DB → delete previous; DELETE null + `adapter.delete`.
- Sibling serve route over `[namespace]` generalization: no prod-avatar risk, unambiguous precedence, ~40 dup lines.
- FE: `emblem` through Team/ApiTeam/LeagueMemberTeam/ScoutedTeamDetail + maps; TeamEmblem `<img>` else placeholder.

## Affected Areas

| Area | Impact |
|---|---|
| `prisma/schema.prisma` | Modified — `emblem String?` |
| `lib/uploads/image.ts` | New — shared helper |
| `app/api/me/avatar/route.ts` | Modified — delegate + re-export |
| `app/api/teams/[id]/shield/route.ts`, `app/uploads/shields/[key]/route.ts` | New — API + serve |
| `app/api/teams/[id]/route.ts` | Modified — GET adds emblem |
| `features/teams/*`, `features/leagues/*`, `lib/i18n/dictionaries.ts` | Modified — types, TeamEmblem/cards/detail UI, ES/EN keys |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Avatar refactor not byte-identical | High | Re-exports; route.test.ts unchanged |
| FE payload types drift | Med | One slice; typecheck + tests |
| Ownership guard leak | Med | Owner 404 + foreign/archived tests |
| e2e markup churn | Med | Update tests only when intentional |
| Migration | Low | Additive; rollback pre-release |

## Rollback Plan

Reverse merge order; rollback `emblem` migration pre-release; placeholder fallback; orphan blobs inert.

## Dependencies

storage-adapter (ready), sharp; match-view invariant unchanged.

## Success Criteria

- [ ] Upload stores 512 WebP; cards/detail render it
- [ ] Quitar → placeholder returns; blob deleted
- [ ] 401 unauthenticated; 404 foreign/archived; non-owner sees shield, no controls
- [ ] avatar route.test.ts byte-identical; vitest/lint/tsc + local e2e green

## Delivery Forecast

Exploration ~500/450/250 → 4 slices (<400 each): S1 helper + avatar refactor (~250); S2 migration + API + serve (~280); S3 FE types + TeamEmblem + cards (~380); S4 detail + ShieldControl + i18n (~250).

Decision needed before apply: No · Chained PRs recommended: Yes · 400-line budget risk: Medium
