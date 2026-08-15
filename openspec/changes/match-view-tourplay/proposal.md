# Proposal: Match View Tourplay Redesign

## Intent

Match the approved Tourplay design (previews/enfrentamiento-tourplay.html + enfrentamiento-derivado.html v7): gray-box event cards, timeline bar in the sticky header, post-match rows in the finished feed. Four data gaps block it: foul victim, casualty cause/causer, kickoff rows, and snapshot summary rows are unavailable in the feed.

## Scope

### In Scope
- Persist foul `victimRosterId` + casualty `cause`/`causerRosterId` (additive JSON payload, no migration); EventControls capture; permission matrix side-checks.
- Tourplay cards (team 68% / generic 100%, gray box, internal gradient, 4px radius, 2px gap, turn top / minute bottom), per-TD partial score; casualty 3-actor rows.
- Timeline bar in sticky header (% elapsed, local top / visitor bottom).
- Header: integrated back arrow, T1–T16 flanking "Dar el turno", per-coach clocks + half indicator.
- Finished-feed rows from MatchResult snapshot: "Partido reportado" (success), ganancias, fanáticos, incentivos.
- Deliberate unit + e2e updates.

### Out of Scope
- Kickoff events (error costoso, fan-factor roll, weather) — follow-up slice via LM-14 TEXT-kind precedent.
- Icon library port — inline glyphs/SVG only (MV-7/LM-10). No new specs; no replay.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `match-view`: cards, timeline bar, summary rows, header (MV-5/6/7).
- `live-match-realtime`: foul/casualty payloads, permissions, controls, labels (LM-6/12/20).

## Approach

Model-first, sliced (~5 PRs ≤400 lines): server payloads → controls → cards+timeline → summary rows+header → e2e. Summary rows snapshot-derived; LM-16 8-kind surface kept.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `.../live/route.ts` · `lib/liveMatch.ts` | Modified | payloads, LiveCommand union, permissions |
| `liveControls.tsx` · `liveEventLabels.ts` | Modified | victim/cause capture + labels |
| `MatchView.tsx` · `lib/liveFeed.ts` | Modified | cards, timeline, header, rows, per-TD score |
| `MatchView.test.tsx` · `liveControls.test.tsx` · `liveEventLabels.test.ts` · `e2e/live-match.spec.ts` | Modified | deliberate updates |
| `openspec/specs/{match-view,live-match-realtime}` | Modified | deltas |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| CRITICAL: model-first dropped → design impossible (victim/causer exists nowhere) | Med | Lock persistence REQUIRED; LM-6 delta |
| Broad test breakage | High | Preserve testids/labels; gated per slice |
| LM-12 bypass via victim/causer side | Med | Side checks + unit tests |
| Summary rows without snapshot | Med | MV-2 guard |

## Rollback Plan

Slices independently revertible; payloads additive/optional — old events render fallback flat rows. No DB/data migration.

## Dependencies

MatchResult snapshot for summary rows (walkover omits). No new deps; auth e2e needs Docker+Postgres.

## Success Criteria

- [ ] Victim/causer persist and survive reload.
- [ ] Cards/timeline match v7; tokens/copy rulebook-light; no icon lib.
- [ ] Finished feed shows reportado/winnings/fans/incentives from snapshot.
- [ ] Unit + auth e2e + lint + tsc green; zero migrations.

## Proposal question round

Review: (1) kickoff rows deferred? (2) summary rows snapshot-derived? (3) header changes UI-only? (4) test updates deliberate?
