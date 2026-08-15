# Delta for live-match-realtime

## MODIFIED Requirements

### Requirement: LM-6 · Event Persistence and Sequence

Every TD, completion, casualty, foul, end-of-half, and end-of-match MUST persist a `LiveEvent` row with monotonic `seq` and a JSON payload; the database MUST be the source of truth and an in-memory hub MUST fan out behind a narrow interface. Catch-up by `seq` MUST NEVER be stale. A `foul` payload MUST carry `victimRosterId`; a `casualty` payload MUST carry `band`, `cause` (one of `blitz|foul|dodge|crowd|penetration|block`), and `causerRosterId` (absent when the crowd or the player's own dodge caused it). Because payloads are JSON and `LiveEvent.kind` is TEXT, this MUST NOT require a migration (LM-14 precedent); legacy events with `{}`/`{band}` payloads MUST still render as fallback rows without victim/cause detail.
(Previously: the `foul` payload was `{}` and the `casualty` payload carried only `band`.)

#### Scenario: Event recorded with sequence

- GIVEN a TD or a completion occurs
- WHEN the control POST commits
- THEN a LiveEvent with the next seq, kind, scorer, and payload is persisted

#### Scenario: Catch-up returns missing events only

- GIVEN a subscriber at seq N
- WHEN they request catch-up after N
- THEN exactly the events with seq > N arrive, in seq order

#### Scenario: Foul victim and casualty cause persist

- GIVEN a foul POSTed with `victimRosterId` and a casualty POSTed with `cause` and `causerRosterId`
- WHEN both commit
- THEN the foul row stores the victim and the casualty row stores `band`, `cause`, and the causer

#### Scenario: Legacy events keep rendering

- GIVEN persisted events whose payloads lack the new fields
- WHEN the feed renders
- THEN they render as fallback rows without victim/cause detail and no error occurs

### Requirement: LM-12 · Turn-Phase Event Permissions

Event commands MUST be side-gated against `activeSide`: the ACTIVE coach MUST be allowed to record TDs, fouls, casualties, completions, and pass-turn; the NON-ACTIVE coach MUST be allowed ONLY to record a casualty to one of their OWN players. Any other non-active event command MUST return 409 with no mutation; spectator members 403 and foreign users 404 (per LM-2). Foul and casualty commands MUST also satisfy actor side invariants: a foul's `victimRosterId` MUST resolve to a roster player on the side opposite the aggressor (`side`), and a casualty's `causerRosterId`, when present, MUST resolve to a roster player on the side opposite the victim (`side`); a violation MUST return 409 with no mutation. The live DTO MUST expose the viewer's side so the client renders the correct controls.
(Previously: the side gate checked kind and casualty victim-side only — a foul's victim and a casualty's causer were not constrained.)

#### Scenario: Active coach records events

- GIVEN home's turn active and the home coach
- WHEN they record a TD, foul, casualty, completion, or pass-turn
- THEN it returns 200 and the event persists

#### Scenario: Non-active TD, foul, or completion rejected

- GIVEN away's turn active
- WHEN the home coach records a TD, foul, or completion
- THEN it returns 409 and no state changes

#### Scenario: Own-injury exception

- GIVEN away's turn active
- WHEN the home coach records a casualty to a home player
- THEN it returns 200 and the casualty persists

#### Scenario: Opponent injury denied

- GIVEN away's turn active
- WHEN the home coach records a casualty to an away player
- THEN it returns 409 and no state changes

#### Scenario: Spectator and foreign actors denied

- GIVEN a spectator member, or a foreign user
- WHEN they record an event
- THEN the member gets 403 and the foreign user 404, with no mutation

#### Scenario: Viewer-side DTO

- GIVEN a viewer whose side matches `activeSide`
- WHEN the DTO is received
- THEN it carries the viewer's side so the UI renders "Tu turno"

#### Scenario: Foul victim must be an opponent

- GIVEN the home coach POSTs a foul whose `victimRosterId` is a home player
- WHEN the command reaches the route
- THEN it returns 409 and no event persists

#### Scenario: Casualty causer must be on the opposite side

- GIVEN a home-coach casualty on a home player with `causerRosterId` of another home player
- WHEN the command reaches the route
- THEN it returns 409 and no event persists

#### Scenario: Crowd and self-inflicted casualties omit the causer

- GIVEN a casualty with cause `crowd` or `dodge` and no `causerRosterId`
- WHEN the command reaches the route
- THEN it returns 200 and the casualty persists without a causer

### Requirement: LM-20 · Event Recording Controls

The live UI MUST render a floating "+" button that opens an event-type menu and a mini-form for recording live events. The menu items MUST be derived from the viewer-side DTO (`viewerSide`) against the LM-12 matrix: the ACTIVE coach MUST be able to record TD, Pase completo, Baja/Herida, and Falta via a mini-form with a player select from their own roster and a band select for casualty/injury. The Falta form MUST additionally capture the victim (select from the OPPONENT roster) and submit `victimRosterId`; the Baja/Herida form MUST additionally capture `cause` (one of the six causes) and, except for `dodge`/`crowd`, the causer (select from the OPPONENT roster, submitted as `causerRosterId`). The NON-ACTIVE coach MUST be offered ONLY Herida (casualty to their OWN player, with cause and optional causer). A spectator member or an admin without a side MUST NOT see any event controls. The submitted command MUST pass through the server permission matrix — the server remains the authority and any bypass MUST return 409; a recorded event MUST appear in the Design-A feed.
(Previously: the foul form captured only the aggressor and the casualty form captured only the band.)

#### Scenario: Active coach opens the menu

- GIVEN a live match and the ACTIVE coach
- WHEN they open the "+" menu
- THEN they can record TD, Pase completo, Baja/Herida, or Falta via the mini-form (player select from their roster, band select for casualty/injury)

#### Scenario: Non-active coach restricted to Herida

- GIVEN a live match and the NON-active coach
- WHEN they open the "+" menu
- THEN only Herida (casualty to their own player) is offered; recording any other kind returns 409 per the LM-12 matrix

#### Scenario: No controls without a side

- GIVEN a spectator member or an admin without a side
- WHEN the live UI renders
- THEN no "+" button or event controls appear

#### Scenario: Submission fires the command

- GIVEN the ACTIVE coach filled the mini-form
- WHEN they submit
- THEN the corresponding command fires and the event appears in the Design-A feed

#### Scenario: Server matrix stays authoritative

- GIVEN a client bypassing the menu, e.g. a NON-active coach POSTing a TD
- WHEN the command reaches the live route
- THEN it returns 409 with no mutation

#### Scenario: Foul form captures the victim

- GIVEN the ACTIVE coach opens the Falta form
- WHEN they pick the aggressor from their roster and the victim from the OPPONENT roster and submit
- THEN the foul command carries `victimRosterId` and the feed card shows the victim line

#### Scenario: Casualty form captures cause and causer

- GIVEN a coach opens the Baja/Herida form
- WHEN they pick the band, the cause, and (unless `dodge`/`crowd`) the causer from the OPPONENT roster
- THEN the casualty command carries `cause` and `causerRosterId` and the card shows the three actors

## ADDED Requirements

### Requirement: MVT-5 · Casualty Cause and Actor Rendering Data

Cause→label MUST map: `blitz` → "Blitz", `foul` → "Falta", `dodge` → "Esquivando — se cayó", `crowd` → "El público", `penetration` → "Penetración", `block` → "Bloqueo". A casualty card MUST render three actors: the victim (main row), the cause label, and the causer line — "por {name} (#{dorsal}) · {cause}" when `causerRosterId` resolves to a roster player, "El público" when the causer is absent with cause `crowd`, and the bare cause label when absent otherwise. A foul card MUST render the victim line "a {name} (#{dorsal})" resolved from `victimRosterId`. Unknown causes MUST pass through unchanged and never throw.

#### Scenario: Cause labels

- GIVEN the six valid causes
- WHEN the label derives
- THEN `blitz|foul|dodge|crowd|penetration|block` render "Blitz", "Falta", "Esquivando — se cayó", "El público", "Penetración", "Bloqueo"

#### Scenario: Causer line

- GIVEN a casualty whose `causerRosterId` resolves to dorsal 4 "Arnau" and `cause: "blitz"`
- WHEN the card renders
- THEN it shows "por Arnau (#4) · Blitz"

#### Scenario: Crowd and self-inflicted lines

- GIVEN a casualty with cause `crowd` or `dodge` and no `causerRosterId`
- WHEN the card renders
- THEN it shows "El público" (crowd) or "Esquivando — se cayó" (dodge) with no "por …" line

#### Scenario: Foul victim line

- GIVEN a foul whose `victimRosterId` resolves to dorsal 8 "Trash"
- WHEN the card renders
- THEN it shows "a Trash (#8)" under the aggressor row
