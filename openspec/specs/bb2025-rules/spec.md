# bb2025-rules Specification

## Purpose

Pure `lib/rules/` module encoding the user-validated BB2025 tables and functions: PE awards, improvement costs, random skills, winnings, fan factor, injuries, weather, and élite values. Rules are server-side only and pinned by exhaustive unit tests.

## Requirements

### Requirement: PE Awards by Action

The system MUST award PE per the user-validated table: touchdown 3 · MJP 4 · intercepción 2 · lesionar rival 2 · pase completo 1 · lanzar compañero 1 · aterrizar sano 1. MJP SHALL follow the rulebook method: each team nominates 6 players numbered 1–6; a 1D6 roll selects the winner, who gains 4 PE.

#### Scenario: Touchdown awards three PE

- GIVEN a player scored a touchdown
- WHEN PE are awarded
- THEN the player gains 3 PE

#### Scenario: MJP selected by nomination die

- GIVEN six nominations numbered 1–6
- WHEN a 1D6 rolls the number of one nomination
- THEN that player gains 4 PE

### Requirement: Improvement Cost Table

PE cost of each improvement MUST follow the user-validated table:

| Mejora | Azar | Primaria | Secundaria | Atributo |
|---|---|---|---|---|
| 1ª Exp. | 3 | 6 | 10 | 14 |
| 2ª Vet. | 4 | 8 | 12 | 16 |
| 3ª Est. | 6 | 12 | 16 | 20 |
| 4ª Est. | 8 | 16 | 20 | 24 |
| 5ª Sup. | 10 | 20 | 24 | 28 |
| 6ª Ley. | 15 | 30 | 34 | 38 |

#### Scenario: Primary cost at first improvement

- GIVEN a player's first improvement is a primary skill
- WHEN the cost is computed
- THEN it is 6 PE

#### Scenario: Attribute cost at sixth improvement

- GIVEN a player's sixth improvement is an attribute increase
- WHEN the cost is computed
- THEN it is 38 PE

### Requirement: Random Skill Roll

A random skill roll SHALL use the user-validated table (rulebook p.121): the player chooses a category (A/F/G/M/P/T), rolls 2D6 twice (one die after the other), and picks ONE of the two resulting skills; identical results yield that skill; the roll repeats if the player already has the skill or cannot use it. The six-column table MUST be encoded exactly — block 1ºD6 1–3 and block 1ºD6 4–6, rows 1–6, columns Agilidad/Fuerza/Generales/Mutación/Pase/Triquiñuelas. Skills marked with an asterisk in the rulebook (Apariencia asquerosa, Furia) are MANDATORY skills (must be used whenever applicable, rulebook p.129) — they are NOT élite markers. Élite skills are a separate rulebook symbol; user-confirmed élite list: Placar (Block), Esquivar (Dodge), Defensa (Guard), Golpe Mortífero (Mighty Blow).

#### Scenario: Two rolls, one pick

- GIVEN a chosen category and no owned skills among outcomes
- WHEN 2D6 is rolled twice
- THEN one of the two resulting skills is chosen

#### Scenario: Duplicate results

- GIVEN both rolls land the same skill
- THEN that skill is the outcome

#### Scenario: Owned skill re-roll

- GIVEN the player already has the rolled skill
- THEN the roll repeats until an eligible skill results

### Requirement: Winnings and Fan Factor

Winnings MUST be computed as `((FF1+FF2)/2 + own TDs + 1 if the team never held the ball) × 10.000` with no roll; fractional halves are preserved (e.g. (7+3)/2 = 5.0, and (4+3)/2 = 3.5 → 6.5 total → 65.000), rounded down only on the final M.O. figure if needed (user-confirmed: the .5 half carries through the formula). Post-match FF MUST change by result: win → 1D6 ≥ FF → +1 (max 7); loss → 1D6 < FF → −1 (min 1); draw → 0. Pre-match FF MUST be 1D3 + roster dedicated fans (`coaching.dedicatedFans`).

#### Scenario: Winnings formula

- GIVEN FF 5 vs 3, 2 TDs scored, ball held at least once
- WHEN winnings are computed
- THEN the team gains 60.000

#### Scenario: FF rises on win, capped

- GIVEN a winning team with FF 3
- WHEN 1D6 rolls 4
- THEN FF becomes 4, never above 7

#### Scenario: FF falls on loss, floored

- GIVEN a losing team with FF 4
- WHEN 1D6 rolls 3
- THEN FF becomes 3, never below 1

### Requirement: Injury Table

Injury resolution MUST follow 1D16: 1–8 Magullado (no long-term effect, no PE — only Magullado) · 9–10 Apaleado (misses next match) · 11–12 Herida grave (Lesión mal curada, misses next match) · 13–14 Permanente (−1 attribute + Lesión mal curada + misses next match; 1D6: 1–2 −AR, 3 −MV, 4 −PS, 5 −AG, 6 −FU) · 15–16 Muerto (eliminated). A player with a previous Lesión mal curada MUST add +1 to future injury rolls (LMC). The PE award for causing ANY injury that generates SPP is a flat 2 PE ("lesionar a un rival", rulebook p.104) regardless of severity — the earlier "(+PE)" annotations on grave/permanent rows referred to that same award, not an extra amount.
(Note — both-down block casualty, DEC-1): a casualty recorded from a both-down block outcome (payload marker `bothDown: true`, the fallen blocker's record authored by the non-active coach) MUST NOT be treated as an SPP exception. Like the defender's record of the same both-down (a plain `block`, no marker), its causer MUST receive the flat 2 PE ("lesionar a un rival") for a lasting band, and the derived action card MUST show ★2. SPP derivation (`deriveLivePeAwards`/`eventSpp`) MUST key the award on the injury band alone; the `bothDown` marker MUST NOT suppress or alter it. This symmetric model is the resolved DEC-1 decision — the earlier "PE suppression" spec default is superseded and MUST NOT be reintroduced.

#### Scenario: Apaleado misses next match

- GIVEN a 1D16 roll of 10
- THEN the player is Apaleado and misses the next match

#### Scenario: Permanent injury reduces attribute

- GIVEN a 1D16 roll of 13 and a 1D6 roll of 2
- THEN the player suffers −1 MV, gains a Lesión mal curada, and the causing player gains 2 PE (flat injury award)

#### Scenario: Death eliminates

- GIVEN a 1D16 roll of 16
- THEN the player is eliminated

### Requirement: Weather Table

Weather MUST follow 2D6: 2 Calor asfixiante · 3 Muy soleado (−1 Pase) · 4–10 Perfecto · 11 Lluvioso (−1 atrapar/recoger/interceptar) · 12 Ventisca. Full effects (user-confirmed): Calor asfixiante — at the end of each drive, one coach rolls 1D3 and each coach randomly selects that many fielded players who are placed in Reserves and cannot deploy next drive; Muy soleado — −1 to all Pass checks; Perfecto — no effects; Lluvioso — −1 to attempts to catch/pick up/intercept a pass; Ventisca — extra −1 to forced march attempts and pass actions may only attempt Quick or Short passes.

#### Scenario: Heat affects fielded players

- GIVEN a 2D6 roll of 2
- THEN weather is Calor asfixiante and at the end of each drive 1D3 fielded players per team move to Reserves

#### Scenario: Blizzard restricts passes

- GIVEN a 2D6 roll of 12
- THEN weather is Ventisca with forced-march −1 and Quick/Short passes only

### Requirement: Server-Side Only, Values Pinned

Rules MUST live in `lib/rules/` as pure functions and tables, MUST NOT be duplicated in client code, and MUST be covered by exhaustive colindante unit tests asserting the exact validated values.

#### Scenario: Tests pin validated values

- GIVEN the lib/rules module
- WHEN `pnpm test` runs
- THEN unit tests assert every table value exactly as user-validated

Affected: slice 1 (`lib/rules/*` + snapshot tests).
