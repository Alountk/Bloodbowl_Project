# Delta for match-view

## ADDED Requirements

### Requirement: MV-8 · Match Share Affordance

`MatchView` MUST surface a "Compartir" control visible only to the home/away team owner, the league owner, or a `live.manage` holder — mirroring the existing `canResetLive` eligibility (`MatchView.tsx` ~1706). Activating it MUST call `POST /api/leagues/[id]/fixtures/[fixtureId]/share` and copy `${origin}/watch/${token}` via `navigator.clipboard` with a "Copiado" state. A spectator member, a side-less admin without `live.manage`, or a foreign viewer MUST see no share control.

#### Scenario: Eligible viewer shares

- GIVEN a participant, owner, or admin viewing the match page
- WHEN they activate "Compartir"
- THEN the stable `/watch/[token]` link is copied and a "Copiado" state shows

#### Scenario: Non-eligible viewer has no control

- GIVEN a spectator member (no side, not owner/admin)
- WHEN the page renders
- THEN no "Compartir" control appears
