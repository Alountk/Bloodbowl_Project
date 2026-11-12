# Blood Bowl 2025 (Season 3) — Match Rules Digest

Structured rule reference for `demo/partido` (live match-sheet demo). Purpose: serve product
decisions about the match flow in small PRs. Condensed from the `external-assets/` corpus
(MD > PDF); exact numbers and tables are quoted **verbatim** (in Spanish, the corpus language),
prose is condensed. Where the corpus is silent the digest says `not covered in MD` — nothing here
is invented. Clusters missing from the MD corpus but present only in the scanned PDF are
transcribed in [§PDF-sourced tables](#pdf-sourced-tables-transcribed-from-the-scanned-rulebook).

- Corpus: `external-assets/Blood Bowl 2025 MD/` (9 files, ~382 lines, a condensed digest of the
  Spanish rulebook *Reglamento BB 3ª Temporada*, pages cited per file), 3 JPGs, 1 photo-scan PDF.
- Rule terms keep their official form (turnover, scatter, block dice…); UI strings the demo shows
  are kept in Spanish («Clima:», «Inducements:», «Ver como:», …).
- All MD source pointers use `file.md` → `## heading`.

---

## Source inventory

### Files

| Source | Covers | Notes |
|---|---|---|
| `00_indice_general.md` | Master index of the 8 content files with page ranges and per-file section summaries | Navigation map; some table *names* survive only here (e.g. the 1D16 injury outcomes) |
| `01_bases_del_juego.md` (pp. 22-27) | Pitch zones, dugouts/trackers, ball & tokens, templates (1D8 scatter, 1D6 throw-in, range ruler), dice types | Equipment-level rules; no match-flow logic |
| `02_principios_generales_y_normas.md` (pp. 28-41) | Golden rule, dice mechanics (natural 1/6, modifiers, opposed rolls), re-rolls & Team Re-rolls limits, halves/rounds/turns, scatter & bounce, **turnover causes**, player profile & states, going to ground | Core mechanics backbone |
| `03_el_partido_y_secuencias.md` (pp. 42-53) | Pre-match sequence (fans, weather, substitutes, inducements, who kicks), **weather table (2D6, complete)**, kickoff sequence (deployment, kick, scatter, kickoff event names), team turns & action list | The match-flow spine |
| `04_acciones_de_movimiento.md` (pp. 54-59) | Move, stand up, dodge, leap, pick up ball, rush ("Forzar la marcha"), Secure the Ball | Numeric costs/thresholds mostly present |
| `05_acciones_de_violencia_y_combate.md` (pp. 60-70) | Block action, block-dice calculation & supports, **block dice results (complete)**, pushes/chains/out-of-bounds, Blitz (Penetración), Foul + expulsion + protest | Combat fully usable |
| `06_acciones_de_balon_y_especiales.md` (pp. 71-83) | Pass ranges & modifiers, pass/catch results, interceptions, throw-ins, Hand-off, Throw Team-Mate, touchdowns, retain-the-ball, end-of-drive sequence, overtime & penalties | The index (`00`) promises armor/injury/lesion/apothecary detail for pp. 71-83, but the file body **omits those sections** — only outcome names survive via `00_indice_general.md` |
| `07_creacion_de_equipos.md` (pp. 84-91) | Team budget, roster limits, positions, Team Re-rolls max, coaching staff, fans, Team Value (VE) | Pre-match economics; inducement *purchasing* rules not included |
| `08_historia_y_lore.md` (pp. 4-21) | Lore, geography, Hall of Fame, Jim Johnson stats | No match rules; ignore for the acta |
| `external-assets/01.jpg`, `02.jpg`, `03.jpg` | **Generic stock infographic templates** (Lorem Ipsum / "GRIEVANCE PROCESSING" / "BUSINESS INFOGRAPHIC") | **Zero Blood Bowl content** — no rule data to transcribe |
| `1017480877-Blood-Bowl-2025-Reglamento-3a-Temporada-Foto.pdf` (212 pp., CamScanner photo scan) | Full rulebook as photos | No text layer (`pdftotext` on pp. 42-53 → 12 empty bytes). Readable by rendering pages (`pdftoppm`) + vision — the §PDF-sourced tables extraction below used 20 rendered pages |

### Coverage per match-flow area

| Match-flow area | Coverage | Where / what's missing |
|---|---|---|
| Fan factor (pre-match) | complete | `03` §1 — formula base + 1D3 |
| Weather roll | complete | `03` §1 — full 2D6 table with effects |
| Inducements / petty cash / TV spending | **missing** | Named only ("Incentivos", `03` §1; VE, `07` §3). No costs, no petty cash, no underdog formula. **PDF gap-fill: §D** |
| Kicking team decision | complete | `03` §1 — opposed 1D6 |
| Setup / deployment | complete | `03` §2 — deployment constraints + kicker nomination |
| Kickoff sequence (order of operations) | complete | `03` §2 |
| Kickoff event table | **partial** | 11 event names (`00`, `03` §2) — **no 2D6 mapping, no effects** in MD. **PDF gap-fill: §A** |
| Team turns / actions / limits | complete | `03` §3, `02` §5 |
| Movement numbers (stand up, dodge, rush, secure) | complete | `04` |
| Leap modifier | partial | `04` §3 — modifier described qualitatively only |
| Passing (ranges, modifiers, results) | partial | `06` §1 — band names + modifiers, **no ruler distances** |
| Block dice | complete | `05` §1-3 |
| Armor / wounds / injury tables | **partial → missing** | Mechanism (2D6 vs AR) + outcome *names* only (`00`, `06` index). **No numeric tables** in MD. **PDF gap-fill: §B** |
| Turnovers | complete | `02` §5 — exhaustive list |
| Scoring / touchdowns | complete | `06` §4 |
| Throw Team-Mate | partial | `06` §3 — sequence summary, no landing table |
| Bombs / secret weapons | partial | Secret weapons cleanup at end of drive (`06` §4); bomb token exists (`01` §3) but **no bomb rules** |
| Half-time / end of drive | complete | `06` §4; re-rolls reset (`02` §2) |
| Overtime / penalties | partial | `06` §4 — one-paragraph summary |
| End of game: MVP / SPP / winnings / FF adjustment | **missing** | Not in MD at all. **PDF gap-fill: §C** (concession rules still missing) |
| Casualties resolution (1D16, apothecary) | partial | Outcome names (`00`); apothecary one-liner (`07` §3). **PDF gap-fill: §B** |
| Concession / forfeit | **missing** | Not covered in MD — still missing after the PDF extraction (see §C gap note) |
| Prayers to Nuffle / special play cards / weather mage / star players / journeymen | **missing** | Not covered in MD (the *Indigestión* and *Piquete de ojos* tokens in `01` §3 hint at event-adjacent rules that never appear in text) |

---

## Match lifecycle rules

### A. Match structure (whole game)

Source: `02_principios_generales_y_normas.md` → "## 3. Partes, Rondas y Turnos"

- A match has **2 parts** (halves). Each half has **8 rounds**. Each round has **2 turns** (one per
  coach). Full match = 32 turns (16 per team).
- **Entrada** (drive): "Periodo desde la patada inicial hasta que se anota un touchdown o finaliza
  la parte." A touchdown ends the current drive.
- Team Re-rolls ("Segundas Oportunidades"): reset at half-time, never carry over ("se restablecen
  en el medio tiempo pero no se acumulan"). They **cannot** re-roll armor, wounds, injuries,
  bounce/deviation, throw-ins, bribes, referee protests, or crowd reactions
  (`02` → "## 2. Mecánicas de Dados y Terminología").
- Dice mechanics (`02` §2): target numbers are written "N+" (roll ≥ N); modifiers apply to the
  final result but a D6 is never modified below 1 or above 6; natural **1** = automatic failure,
  natural **6** = automatic success regardless of modifiers; opposed rolls: each coach rolls 1D6,
  higher wins (ties re-rolled); drunk dice (off the table / not flat) are re-rolled; a re-roll can
  never itself be re-rolled.
- Golden rule: unresolvable rules disputes → opposed 1D6 (1-3 = coach A's reading, 4+ = coach B's)
  (`02` §1).

### B. Pre-match sequence

Source: `03_el_partido_y_secuencias.md` → "## 1. Secuencia Anterior al Partido"

Order of operations (verbatim order): 1) Los Hinchas, 2) El Clima, 3) Contratar Sustitutos
(league only), 4) Incentivos (league & balanced matches only), 5) Determinar Equipo Pateador.

1. **Fan factor** — sum the team sheet's base value and roll **1D3** (occasional fans). Demo
   fixture models this as `{ base, dice, total }` per side.
2. **Weather** — each coach rolls 1D6, both are summed (2D6) and read on the table below.
3. **Substitutes** — league-only; mechanics `not covered in MD`.
4. **Incentives (inducements)** — league & balanced matches only; costs/petty cash
   `not covered in MD` → **transcribed in §PDF-sourced tables D**. (See §I for what the demo
   already models.)
5. **Kicking team** — opposed 1D6; winner decides who kicks and who receives.

#### Weather table (2D6) — VERBATIM

> * **2 - Calor Asfixiante:** Al final de la entrada, se tiran 1D3 y se retiran al azar esa cantidad de jugadores al banquillo para la siguiente entrada.
> * **3 - Muy Soleado:** Modificador de -1 a todos los chequeos de Pase.
> * **4-10 - Clima Perfecto:** Sin efectos adicionales.
> * **11 - Lluvioso:** Modificador de -1 a los intentos de atrapar, recoger o interceptar el balón.
> * **12 - Ventisca:** Modificador de -1 adicional a forzar la marcha; los pases se limitan a Pase rápido o Pase corto.

(No Fame roll, no "fame advantage" or similar — `not covered in MD`.)

### C. Kickoff sequence (start of each drive)

Source: `03_el_partido_y_secuencias.md` → "## 2. Secuencia de Inicio de Entrada"

1. **Deployment** — kicking team deploys first, then the receiving team. Constraints:
   - No player may cross the Line of Scrimmage ("línea de placajes iniciales") into their own half…
     (verbatim: "Ningún jugador puede cruzar la línea de placajes iniciales en su mitad.")
   - Minimum **3** players in the central zone adjacent to the LOS.
   - Maximum **2** players in each wide zone ("zona lateral", 4 squares deep, `01` §1).
2. **The Kick** — nominate a kicker (not adjacent to the LOS, not in a wide zone); place the ball
   in the opponent's half and scatter it using **1D6** (distance in squares) + **1D8** (direction,
   random-direction template; `01` §4).
3. **Kickoff Event** — roll **2D6** and consult the kickoff event table.

#### Kickoff event table (2D6) — names VERBATIM, effects NOT COVERED

The corpus lists exactly these 11 event names (`03` §2.3, echoed in `00`):

> Árbitro intimidado, Tiempo muerto, Defensa sólida, Patada alta, Los hinchas animan, Entrenador
> brillante, Clima cambiante, Anticipación, ¡A la carga!, Indigestión, Invasión de campo.

**The MD binds no roll value to any name and gives no effect text.** (11 names for 2D6 2–12
suggests an ordered table, but the mapping is not stated — do not assume it.) This is the single
biggest gap for a faithful kickoff flow. **PDF gap-fill:** the full table (2D6 mapping + effect
text) is transcribed in **§PDF-sourced tables A** — PDF page 53 (printed page 48).

4. **Free reception** — "Recepción libre" is listed as the tail of the kickoff sequence
   (`00` → `03` summary); mechanics `not covered in MD` beyond the name → **PDF gap-fill:
   §PDF-sourced tables A** (bonus block, PDF page 54 / printed page 49).

### D. Turn structure

Source: `03_el_partido_y_secuencias.md` → "## 3. Turnos de Equipo"; `02` → "## 5. Cambio de Turno"

- 8 team turns per half. The active team activates players one at a time, **declaring the action
  before starting it**. Action list with per-turn limits (verbatim list, `03` §3):
  - Acción de Movimiento
  - Acción de Asegurar el Balón
  - Acción de Placaje
  - Acción de Penetración (Blitz) — max **1** per turn
  - Acción de Pase — max **1** per turn
  - Acción de Entregar el Balón (Hand-off) — max **1** per turn
  - Acción de Lanzar Compañero — max **1** per turn, requires trait
  - Acción de Falta (Foul) — max **1** per turn
  - Special actions (per skills/traits)

#### Turnover causes («cambio de turno») — VERBATIM

> * Un jugador del equipo activo se Cae durante su activación.
> * Un jugador del equipo activo es Derribado.
> * El portador del balón del equipo activo es Tumbado boca arriba u obligado a salir del campo.
> * Falla al intentar recoger el balón del suelo.
> * Una acción de Pase resulta en un balón perdido.
> * Falla al atrapar el balón tras un pase o entrega (salvo rebote directo a un compañero que lo atrape).
> * Un jugador del equipo inactivo intercepta el pase o termina con el balón.
> * Un jugador lanzado no aterriza adecuadamente, va al público o es devorado.
> * Un jugador activo es expulsado por cometer una falta.
> * Se anota un touchdown.

#### Player states (`02` → "## 7. Estados de un Jugador")

- **En pie** — Tackle Zone = the 8 adjacent squares; auto-marks any rival inside it.
- **Distraído** — loses tackle zone, cannot use active skills, intercept or catch; ends when the
  player is next activated.
- **Tumbado boca arriba** (prone, yellow token) — cannot act until standing.
- **Aturdido** (stunned, red token) — cannot be activated; at the end of their own team's turn they
  become prone.
- Ways to the ground: *ser colocado tumbado* (no armor roll), *caerse* (own failure — armor roll +
  turnover), *ser derribado* (block/external — armor roll).

#### Movement action (`04_acciones_de_movimiento.md`)

| Maneuver | Rule (numeric, condensed) |
|---|---|
| Basic move | Up to MV squares, any direction incl. diagonal, into unoccupied squares |
| Stand up | Costs **3** squares of movement. MV ≤ 2: roll 1D6, **4+** stands using full movement, **1-3** fails and activation ends |
| Dodge | Mandatory when leaving a square marked by a rival. AG check with **-1 per rival marking the destination square**. Fail → player *Cae* in destination square, activation ends (turnover) |
| Leap (over prone/stunned players) | AG check, costs **2** squares; penalty "based on the number of rivals marking origin or destination (the higher count)" — exact modifier `not covered in MD`. Fail or natural 1 → immediate fall |
| Pick up ball | On voluntarily entering the ball's square: AG check with **-1 per rival marking the player**. Fail → turnover, ball bounces |
| Rush ("Forzar la marcha") | Up to **2** extra squares beyond MV, one 1D6 per extra square: **2+** ok, **1** → player *Cae*, activation ends immediately |
| Secure the Ball | Only with no standing rivals at ≤ 2 squares. No AG check: 1D6, **2+** picks up safely (activation ends); **1** → turnover + bounce |

#### Block (Placaje) (`05_acciones_de_violencia_y_combate.md`)

- Declared by a standing player against an adjacent rival they mark.
- Block dice by modified Strength: **equal → 1 die**; **greater → 2 dice** (stronger coach chooses);
  **more than double → 3 dice** (stronger coach chooses).
- Supports: +1 Strength per eligible offensive/defensive support (supporter marks the target /
  attacker and is not themselves marked by another rival).
- Block dice results — VERBATIM:
  > * **Atacante Derribado (Símbolo de calavera):** El atacante cae al suelo como si hubiera recibido un placaje.
  > * **Ambos Jugadores Derribados (Doble calavera):** Ambos contendientes caen al suelo.
  > * **Empujón (Flecha):** El blanco retrocede una casilla alejándose del atacante. El atacante puede realizar un *Movimiento de Impulso* gratuito para ocupar su antigua casilla.
  > * **Desequilibrio (Icono especial):** Si el blanco tiene la habilidad *Esquivar*, cuenta como empujón; de lo contrario, cuenta como ¡Zasca!
  > * **¡Zasca! (Calavera estrellada):** El blanco es empujado y **derribado inmediatamente** en su casilla final.
- Chain pushes: if the push square is occupied, chain-push; **the attacking coach picks the
  direction**. Pushed off the pitch → exposed to "herido por el público" (details `not covered in MD`).
- **Blitz (Penetración)** — move + one final block; max 1 per team per turn.
- **Foul (Falta)** — kick a prone/stunned rival at end of a movement; armor roll with supports
  (**+1 per offensive support, -1 per defensive support**). **Expulsion**: natural double on the
  armor **or** wound roll → player sent off (turnover). *Protestar al Árbitro*: 1D6 — **6**
  cancels the expulsion but causes a turnover; **1** also expels the coach.

#### Passing (`06_acciones_de_balon_y_especiales.md` §1-2)

- One Pass per turn. Declare target square, measure with the range ruler ("Regla de Alcance",
  `01` §4 — actual band distances `not covered in MD`):
  - *Pase rápido* — no modifier
  - *Pase corto* — **-1**
  - *Pase largo* — **-2**
  - *Bomba larga* — **-3**
- Plus **-1 per rival marking the thrower**.
- Result: success = precise; failure = inaccurate, scatters ("escora 3 casillas"); fumble /
  natural 1 = **ball lost**, bounces from the thrower, **turnover**.
- Interceptions: rivals along the range ruler may try: AG check with **-3** (precise pass) or
  **-2** (inaccurate).
- Catch: AG check (modified by bounces, throw-ins, markings); natural 1 → ball bounces
  ("Desviarse": 1D6 squares + 1D8 direction; "Escorarse (N)": N × 1D8 steps, `02` §4).
- Throw-in ("Devoluciones"): ball leaves the pitch → the crowd returns it with the 1D6
  throw-in template and a **2D6-square** displacement (`06` §2).
- **Hand-off (Entregar el Balón)** — give the ball to an adjacent teammate at the end of a
  movement; max 1 per turn.
- **Throw Team-Mate (Lanzar Compañero)** — trait *Lanzar compañero* onto allies with
  *Humanoide bala* (e.g. Halflings, Gnomes). Measure distance (quick/short), pass check, then the
  thrown player must land or crash into rivals (landing table `not covered in MD`).

### E. Scoring

Source: `06_acciones_de_balon_y_especiales.md` → "## 4…"

- **Touchdown**: the standing ball carrier is in the opponent end zone → score 1, play stops and
  the **drive ends** ("Detiene el juego y finaliza la entrada").
- **Retain the ball (Retener el Balón)**: a player who could score without rolling dice and ends
  their activation without doing so → at end of activation roll 1D6: if ≥ current turn number, the
  crowd hits them with a projectile, knocking them down and causing a turnover.
- Bombs / special plays: **not covered in MD** (only the bomb token exists, `01` §3).

### F. End of drive and half-time

Source: `06_acciones_de_balon_y_especiales.md` → "## 4…", "Secuencia de Final de Entrada"

End-of-drive sequence, verbatim order:
1. Handle Secret Weapons (automatic ejection / expulsion — "expulsión automática").
2. End-of-drive effects and weather (e.g. *Calor Asfixiante* benches 1D3 players for the next
   drive, weather table above).
3. Recovery of unconscious players: roll 1D6; **4+** → back to reserves ("pasan a reservas").
4. End of the half or of the match.

Half-time additionally: Team Re-rolls reset (never accumulate, `02` §2). No other half-time
events — `not covered in MD`.

### G. Overtime

Source: `06_acciones_de_balon_y_especiales.md` → "Prórroga y Penaltis"

> Si hay empate en partidos eliminatorios, se juega una parte adicional de 8 turnos o una tanda de
> penaltis de 5 tiradas enfrentadas de 1D6.

(Which competition formats trigger which option, and the exact penalty structure — `not covered
in MD` beyond this sentence.)

### H. End of game

- **MVP, SPP awards, winnings, fan factor adjustments, concessions/forfeits: not covered in MD.**
  The corpus has no post-match resolution chapter at all. **PDF gap-fill:** MVP, SPP awards,
  winnings and fan-factor adjustments are transcribed in **§PDF-sourced tables C** (PDF pages
  103-105 / printed pages 95-97); **concession/forfeit rules remain a gap** (only a passing
  reference survives: when a coach concedes, the resulting touchdowns' 3 PE go to a player of the
  scoring coach's choice). (The acta closure flow already models
  winnings/fans/MVP/casualties/journeymen steps — see §I — but the *rules* for amounts and awards
  are absent from this corpus.)
- **Casualties / injuries** (fragmentary — names only, from `00_indice_general.md` → `06` summary):
  - Armor roll: 2D6 vs the target's **AR** value (target number). Mechanism named in `00`/`06`
    index and used by Foul (`05` §6); full modifiers `not covered in MD` → **PDF gap-fill: §B**
    (mechanism transcribed verbatim; no armor-roll modifier table exists on printed pp. 66-67 —
    the only armor modifiers in the book are the Foul support modifiers in §D).
  - Wound roll ("Tiradas de Heridas"): *Tabla normal* and *Tabla para escurridizos*, outcomes:
    **Aturdido, Inconsciente, Lesionado**. Ranges/values `not covered in MD` → **PDF gap-fill:
    §B** (both tables transcribed, printed p. 66).
  - Injury roll ("Tiradas de Lesiones", **1D16**): **Magullado, Apaleado, Herida grave, Herida
    permanente, Muerto**. Ranges/values `not covered in MD` → **PDF gap-fill: §B** (1D16 table +
    1D6 permanent-injury sub-table transcribed, printed p. 67).
  - Apothecary (`07` §3): max 1 per team (50,000 mo) — "Permite reanimar jugadores inconscientes o
    mitigar lesiones graves en la tabla de lesiones."
  - "Herido por el público" (pushed off the pitch): mentioned (`05` §4, `00` → `06`); resolution
    `not covered in MD`.

### I. Pre-match team economics & special rules the sheet must reflect

Sources: `07_creacion_de_equipos.md`, `03` §1, `02` §2, `01` §3

- Team budget **1,000,000 gc** standard; roster **min 11 / max 16** players.
- Positions: Línea, Lanzador, Receptor, Corredor, Blitzer, Defensor, Grandullón, Especial
  (`07` §2). Player profile limits (`02` → "## 6. Perfil de Jugador y Atributos"):

  | Attribute | Meaning | Min | Max |
  |---|---|---|---|
  | MV (Movimiento) | Max squares of movement | 1 | 9 |
  | FU (Fuerza) | Strength for blocks | 1 | 8 |
  | AG (Agilidad) | Target number for dodges, leaps, catches | 6+ | 1+ |
  | PS (Pase) | Target number for passes | 6+ | 1+ |
  | AR (Armadura) | Target number to resist hits | 3+ | 11+ |

  Plus skills (learned) and traits (innate).
- Team Re-rolls: max **8** ("Su coste en liga duplica al inicial" — exact pricing wording is
  ambiguous even in MD).
- Coaching staff (`07` §3): Assistants max 6 (10,000 mo ea., kickoff-event bonuses), Cheerleaders
  max 6 (10,000 mo ea.), Apothecary max 1 (50,000 mo), Fans start at 1, up to 3 at creation
  (5,000 mo per point). **VE** (Team Value) = sum of current value of players + staff + re-rolls.
- Inducements: named in `03` §1 ("Incentivos — Exclusivo de ligas y partidos equilibrados") but
  catalog/costs `not covered in MD` → **PDF gap-fill: §D** (full common list with prices +
  petty-cash/VAE rules). The **demo already uses a real IND-1 catalog**: «Sobornos» (bribes),
  «Barriles de Bloodweiser» (bloodweiser-kegs), «Mago del Clima» (weather-mage) — per-inducement
  effect text lives on printed pp. 143+ (not transcribed).
- Prayers to Nuffle, special play cards, star players, journeymen: **not covered in MD** — except
  *Plegarias a Nuffle* and *Jugadores Estrella*, which appear with prices in §PDF-sourced tables D
  (their effect tables are not transcribed). (The
  fixture data uses a `journeyman: true` player flag; the rules for journeymen are not in the
  corpus.)
- Tokens with implied rules that never appear in text (`01` §3): *Indigestión / Dodgy Snack*
  (green), *Piquete de ojos / Eye Gouge* (cancels offensive/defensive support in blocks),
  *Enraizado / Rooted* (Treemen), *Masticado / Chomped*. Only the Eye Gouge and Rooted effects are
  stated (token descriptions).

---

## PDF-sourced tables (transcribed from the scanned rulebook)

Four clusters that exist only in the photo-scan PDF (`1017480877-…-Foto.pdf`, no text layer) were
extracted by rendering individual pages (`pdftoppm -f N -l N -r 150 -png`) and reading them
visually (20 pages rendered). Every transcribed block is labeled `PDF page N (printed page M)`.
The scan offset is **not linear** (PDF ≈ printed + 5 early, + 7 by printed p. 66, + 8 by printed
p. 84 — the scan gained pages mid-file), so printed numbers were verified in each rendered footer.
Text is **verbatim** (Spanish, exact numbers/ranges); only art/flavor asides are omitted.

### A. Tabla de Eventos de Patada Inicial (2D6)

**PDF page 53 (printed page 48)** — «EVENTO DE PATADA INICIAL» intro:
"Inmediatamente después de que el chute se desvíe, el Entrenador del equipo pateador tira 2D6 y
consulta la tabla de Eventos de patada inicial de abajo, para ver qué clase de jaleo tiene lugar."

**PDF page 53 (printed page 48)** — TABLA DE EVENTOS DE PATADA INICIAL (each 2D6 sum 2–12 maps to
exactly one event):

> * **2 - ÁRBITRO INTIMIDADO:** Cada equipo recibe un Incentivo de Soborno gratuito. Este Incentivo debe usarse antes del final del partido o se pierde.
> * **3 - TIEMPO MUERTO:** Si la ficha de turno del equipo pateador está en el turno 6, 7 u 8 de esa parte, ambos equipos mueven su ficha de turno un espacio hacia atrás. Si no es así, ambos equipos mueven su ficha de turno un espacio hacia delante.
> * **4 - DEFENSA SÓLIDA:** El Entrenador del equipo pateador elige hasta 1D3+3 jugadores Desmarcados de su equipo. Dichos jugadores son retirados del campo y desplegados de nuevo siguiendo todas las restricciones normales de despliegue.
> * **5 - PATADA ALTA:** Un jugador Desmarcado del equipo receptor puede ser colocado inmediatamente en la casilla en la que va a caer el balón.
> * **6 - LOS HINCHAS ANIMAN:** Cada Entrenador tira 1D6 y le suma el número de Animadoras de su Hoja de plantilla. La primera acción de Placaje realizada en el siguiente turno del Entrenador que haya sacado un total más alto en esta tirada recibe un apoyo ofensivo adicional. Si la tirada ha sido un empate, ambos Entrenadores reciben este beneficio durante su siguiente turno.
> * **7 - ENTRENADOR BRILLANTE:** Cada Entrenador tira 1D6 y le suma el número de Ayudantes del Entrenador de su Hoja de plantilla. El Entrenador que haya sacado un total más alto en esta tirada, o ambos Entrenadores en caso de empate, obtiene una Segunda oportunidad gratuita para la entrada que va a jugarse. Si esta Segunda oportunidad no se usa antes del final de esa entrada, se pierde.
> * **8 - CLIMA CAMBIANTE:** Haz inmediatamente una nueva tirada en la tabla de Clima. Si el nuevo resultado es "Clima perfecto", el balón se escora (3) antes de caer al suelo.
> * **9 - ANTICIPACIÓN:** El Entrenador del equipo receptor elige hasta 1D3+3 jugadores Desmarcados de su equipo. Dichos jugadores pueden moverse inmediatamente una casilla en cualquier dirección, incluso entrando en la mitad contraria del campo.
> * **10 - ¡A LA CARGA!:** El Entrenador del equipo pateador elige hasta 1D3+3 jugadores Desmarcados de su equipo. Dichos jugadores se pueden activar uno tras otro, como si fuera el turno de su equipo, y realizar una acción de Movimiento gratuita. Uno de ellos puede realizar en su lugar una acción de Penetración gratuita, otro puede realizar en su lugar una acción de Lanzar compañero gratuita, y otro puede realizar en su lugar una acción de Patear compañero gratuita. Si uno de los jugadores elegidos se Cae o es Derribado durante su activación, ya no se pueden activar más jugadores y la Carga termina.
> * **11 - INDIGESTIÓN:** Ambos Entrenadores tiran 1D6. El Entrenador con el total más bajo, o ambos en caso de empate, determina al azar a uno de sus jugadores sobre el campo y tira 1D6. Con 2+, el aperitivo que ha tomado el jugador antes de la entrada no le ha sentado bien, por lo que, mientras dure esa entrada, dicho jugador reduce en 1 su MV y su AR. Con un 1, el aperitivo le ha provocado una evacuación forzosa: coloca al jugador en la zona de Reserva de su equipo, ¡para reflejar que se pasa el resto de la entrada encerrado en la letrina!
> * **12 - INVASIÓN DE CAMPO:** Cada Entrenador tira 1D6 y le suma su Factor de Hinchas. El Entrenador que saque un total más bajo, o ambos Entrenadores en caso de empate, selecciona al azar 1D3 jugadores de su equipo que están sobre el campo. Dichos jugadores son colocados Tumbados boca arriba y quedan Aturdidos.

**PDF page 54 (printed page 49)** — bonus, same kickoff flow (fills the "free reception" gap in §C):

> **TODO LO QUE SUBE, BAJA:** En cuanto se haya resuelto el Evento de patada inicial, el balón cae en la casilla en la que está situado. Si no hay un jugador en esa casilla, el balón rebota desde la misma inmediatamente. Si hay un jugador en esa casilla, puede intentar atrapar el balón haciendo un chequeo de Agilidad. Si supera el chequeo, se convierte en el portador del balón. Si falla el chequeo, el balón rebota inmediatamente desde esa casilla.
>
> **RECEPCIÓN LIBRE:** Para que la patada sea legal, el balón debe caer en la mitad del campo del equipo receptor. Si el balón termina fuera del campo o cruza la línea de placajes iniciales hasta la mitad del campo del equipo pateador debido a un desvío, un rebote o cualquier otro motivo, se produce una "recepción libre". En caso de recepción libre, tras resolver el Evento de patada inicial el Entrenador del equipo receptor elige a uno de sus jugadores En pie sobre el campo y le otorga la posesión del balón. Si no hay ningún jugador En pie al que otorgarle el balón, puede colocarlo en cualquier casilla desocupada de su mitad del campo.

### B. Combat resolution tables (Armadura / Heridas / Lesiones)

**PDF page 42 (printed page 37)** — «AR – ARMADURA», armor-roll mechanism (2D6 vs AR):

> A veces las reglas pedirán hacer una tirada de Armadura contra un jugador. En tal caso, el Entrenador rival tira 2D6 y compara el resultado con el atributo Armadura del jugador. Si falla la tirada de Armadura, no ocurre nada más: la armadura del jugador le ha salvado esta vez. Si la tirada de Armadura tiene éxito, se dice que se ha "roto" la armadura y el jugador puede sufrir heridas. Las heridas se explican en la pág. 66.

**PDF page 73 (printed page 66)** — «ARMADURA Y HERIDAS» / RIESGO DE HERIDAS + TIRADAS DE HERIDAS:

> **RIESGO DE HERIDAS:** Al hacer una tirada de Armadura contra un jugador, existe el riesgo de que sufra una herida. Tal como se describe en la pág. 66, si la armadura no se rompe el jugador está a salvo y no sufre efectos adicionales. Sin embargo, si la armadura se rompe se debe hacer una tirada de Heridas por el jugador.
>
> **TIRADAS DE HERIDAS:** Cuando hay que hacer una tirada de Heridas contra un jugador, el Entrenador rival tira 2D6 y consulta la siguiente tabla de Heridas:
>
> **TABLA DE HERIDAS**
> * **2-7 ATURDIDO:** El jugador queda Aturdido inmediatamente.
> * **8-9 INCONSCIENTE:** El jugador queda Inconsciente inmediatamente. Retíralo del campo y colócalo en la zona de Inconscientes de su banquillo.
> * **10-12 LESIONADO:** El jugador sufre una lesión. Retíralo del campo y colócalo en la zona de Lesionados de su banquillo. A continuación el Entrenador del equipo rival hace una tirada de Lesiones contra él.

**PDF page 73 (printed page 66)** — «JUGADORES ESCURRIDIZOS» (dodgy players' wound table):

> Si se hace una tirada de Heridas contra un jugador con el rasgo de Escurridizo, se debe tirar en la tabla de Heridas para Escurridizos en lugar de utilizar la tabla de Heridas normal. ¡Ser pequeño hace que seas más fácil de romper!
>
> **TABLA DE HERIDAS PARA ESCURRIDIZOS**
> * **2-6 ATURDIDO:** El jugador queda Aturdido inmediatamente.
> * **7-8 INCONSCIENTE:** El jugador queda Inconsciente inmediatamente. Retíralo del campo y colócalo en la zona de Inconscientes de su banquillo.
> * **9 MAGULLADO:** El jugador sufre una lesión. Retíralo del campo y colócalo en la zona de Lesionados de su banquillo. En una liga, no hagas una tirada de Lesiones por él; en su lugar, el jugador sufre automáticamente el resultado de Magullado de la tabla de Lesiones.
> * **10-12 LESIONADO:** El jugador sufre una lesión. Retíralo del campo y colócalo en la zona de Lesionados de su banquillo. A continuación el Entrenador del equipo rival hace una tirada de Lesiones contra él.

**PDF page 74 (printed page 67)** — «TIRADAS DE LESIONES» (1D16) + aftermath sub-tables:

> Cuando un jugador resulta Lesionado, el Entrenador del equipo rival hace una tirada de Lesiones contra él tirando 1D16 y consultando la siguiente tabla de Lesiones. El jugador siempre se perderá el resto del partido actual, pero además puede sufrir otras consecuencias duraderas. Durante los partidos de exhibición y los partidos equilibrados, esto no tendrá efecto y puede saltarse para agilizar el juego. Sin embargo, si el equipo del jugador afectado tiene un Apotecario o alguna regla especial asociada con un resultado concreto de la tabla de Lesiones (normalmente, con el resultado de Muerto), se debe tirar por si acaso.
>
> **TABLA DE LESIONES**
> * **1-8 MAGULLADO:** El jugador no sufre efectos a largo plazo.
> * **9-10 APALEADO:** El jugador se pierde el próximo partido.
> * **11-12 HERIDA GRAVE:** El jugador sufre una Lesión mal curada y se pierde el próximo partido.
> * **13-14 HERIDA PERMANENTE:** El jugador sufre una reducción de atributo y se pierde el próximo partido.
> * **15-16 MUERTO:** ¡El jugador ha muerto!
>
> **SE PIERDE EL PRÓXIMO PARTIDO:** Durante una liga, si un jugador se ve obligado a perderse el próximo partido de su equipo, no podrá ser elegido para ese partido. Anótalo en tu Hoja de plantilla.
>
> **LESIÓN MAL CURADA:** Anota en tu Hoja de plantilla que el jugador padece una Lesión mal curada. Por cada Lesión mal curada que acumule un jugador, se le aplica un modificador de +1 a todas sus futuras tiradas en la tabla de Lesiones.
>
> **REDUCCIÓN DE ATRIBUTO:** Uno de los atributos del jugador empeora en 1. Para determinar qué atributo empeora, tira 1D6 y consulta la siguiente tabla de Heridas permanentes:
>
> **TABLA DE HERIDAS PERMANENTES**
> * **1-2 CABEZA FRACTURADA:** -1 AR
> * **3 RODILLA APLASTADA:** -1 MV
> * **4 BRAZO ROTO:** -1 PS
> * **5 CADERA DISLOCADA:** -1 AG
> * **6 ROTURA DE HOMBRO:** -1 FU
>
> En el caso de Movimiento o Fuerza, el atributo simplemente se reduce en 1. Los atributos que se representan con un número objetivo se ven afectados de forma distinta. Para Pase y Agilidad, aumenta en 1 el número antes del símbolo +; eso hace que los chequeos respectivos sean más difíciles de superar. Para Armadura, reduce en 1 el número antes del símbolo +; eso hace que el Entrenador rival pueda superar más fácilmente las tiradas de Armadura contra el jugador. Si el resultado es una reducción de atributo que no puede aplicarse, como por ejemplo si un atributo ya no puede empeorar más, no apliques dicha reducción de atributo y en su lugar trata el resultado como si fuese Se pierde el próximo partido; ¡está claro que Nuffle cree que el jugador ya ha sufrido bastante!
>
> **MUERTO:** El jugador ha muerto. Bórralo de tu Hoja de plantilla.

No armor-roll *modifier* table exists on printed pp. 66-67 — the only armor-roll modifiers in the
book are the Foul support modifiers already in §D of this digest. "Herido por el público"
resolution is **not** on these pages — still a gap.

### C. Post-match (Secuencia posterior al partido)

**PDF page 103 (printed page 95)** — «SECUENCIA POSTERIOR AL PARTIDO», steps (verbatim order):

> * Anotar el resultado y las ganancias
> * Actualizar Hinchas
> * Progreso de los jugadores
> * Fichar, despedir y retirar temporalmente
> * Errores costosos
> * Preparar el próximo partido

**PDF page 103 (printed page 95)** — «ANOTAR EL RESULTADO Y LAS GANANCIAS» (record + winnings):

> Cada Entrenador debe anotar la siguiente información sobre el desenlace del partido, en los apartados apropiados de su Registro de partidos: El resultado (victoria, derrota o empate). Cuántos touchdowns ha anotado cada equipo. Cuantas Lesiones se han causado, contando solo las que generan Puntos de Estrellato (ver pág. 96). Cuantos puntos de liga se han ganado (ver pág. 103).
>
> A continuación, cada Entrenador tendrá que averiguar cuántas monedas de oro ha ganado su equipo. Para calcular las ganancias de un equipo, primero hay que calcular la Afluencia al partido, que es la suma del Factor de Hinchas de ambos equipos. Divide entre dos la Afluencia al partido y súmale el número de touchdowns que ha anotado tu equipo. Súmale 1 adicional si en ningún momento durante el partido se ha considerado que un jugador de tu equipo Retenía el balón. Multiplica el resultado total por 10 000 para determinar cuántas monedas de oro gana tu equipo.
>
> Las ganancias se añaden inmediatamente a la Tesorería del equipo, y pueden gastarse durante la Secuencia posterior al partido.

(Worked example, same page: FF 4 vs 3 → Afluencia 7 → 7/2 = 3,5 + 2 touchdowns + 1 = 6,5 →
65 000 M.O.)

**PDF page 103 (printed page 95)** — «ACTUALIZAR HINCHAS» (fan-factor adjustments):

> Si tu equipo ha ganado, tira 1D6. Si el resultado es igual o mayor que el atributo de Hinchas de tu equipo, aumenta dicho atributo en 1. Este atributo nunca puede ser mayor que 7. Si tu equipo ha perdido, tira 1D6. Si el resultado es menor que el atributo de Hinchas de tu equipo, reduce dicho atributo en 1. Este atributo nunca puede ser menor que 1. Si tu equipo ha empatado, el atributo de Hinchas de tu equipo se queda igual.

**PDF page 104 (printed page 96)** — «GANAR PUNTOS DE ESTRELLATO» (SPP awards):

> * **HACER UN PASE COMPLETO:** Cuando un jugador realiza una acción de Pase que resulta en un pase preciso y el balón es atrapado por un compañero sin tocar antes el suelo y rebotar, se dice que ha hecho un "pase completo". Un jugador que hace un pase completo obtiene 1 PE.
> * **LANZAR A UN COMPAÑERO:** Cuando un jugador realiza una acción de Lanzar compañero que resulta en un lanzamiento soberbio y el compañero lanzado aterriza exitosamente de pie, el jugador que realizó la acción de Lanzar compañero obtiene 1 PE. Además, si un jugador es lanzado por un compañero y aterriza exitosamente de pie, obtiene también 1 PE por aterrizar sano y salvo, sin importar el tipo de lanzamiento.
> * **INTERCEPTAR EL BALÓN:** Cuando un jugador Intercepta con éxito una acción de Pase realizada por un jugador rival, el jugador que ha hecho la intercepción obtiene 2 PE.
> * **LESIONAR A UN RIVAL:** Si un jugador es Derribado como resultado de una acción de Placar y resulta Lesionado, sin importar qué jugador realizó dicha acción, se dice que el jugador que lo ha derribado "ha lesionado a un rival". Un jugador que lesione a un rival obtiene 2 PE. Los 2 PE por lesionar a un rival se obtienen incluso si ambos jugadores son Derribados y Lesionados, e incluso aunque la Lesión causada se recupere por cualquier medio (como, por ejemplo, usando un Apotecario o el rasgo Regeneración) Las Lesiones causadas por otros métodos, como mediante acciones especiales o debido al público, no generan PE.
> * **ANOTAR UN TOUCHDOWN:** Cuando un jugador anota un touchdown, obtiene 3 PE. Si se otorgan touchdowns a tu equipo porque el equipo rival concede el partido, puedes elegir qué jugador de tu equipo obtiene los 3 PE de cada uno de esos touchdowns.

(Same page: "Los Jugadores Estrella no ganan PE. Los Sustitutos, por el contrario, sí que los ganan,
y esto puede ser un factor importante a la hora de decidir si quieres fichar a un sustituto de
forma permanente durante la Secuencia posterior al partido.")

**PDF page 104 (printed page 96)** — «MEJOR JUGADOR DEL PARTIDO» (MVP):

> Al final de un partido, cada equipo debe determinar quién ha sido su Mejor jugador del partido (MJP). Para eso, cada Entrenador nombra a seis jugadores de su equipo que hayan jugado durante el partido y les asigna un número entre 1 y 6. A continuación, tira 1D6 para determinar cuál de ellos recibe el galardón de MJP. El jugador que reciba este galardón obtiene 4 PE.

**PDF page 105 (printed page 97)** — «TABLA DE MEJORAS» (SPP spending costs):

| Mejora | Determinar habilidad primaria al azar | Elegir habilidad primaria | Elegir habilidad secundaria | Mejora de atributo |
|---|---|---|---|---|
| Experimentado (primera mejora) | 3 PE | 6 PE | 10 PE | 14 PE |
| Veterano (segunda mejora) | 4 PE | 8 PE | 12 PE | 16 PE |
| Estrella emergente (tercera mejora) | 6 PE | 12 PE | 16 PE | 20 PE |
| Estrella (cuarta mejora) | 8 PE | 16 PE | 20 PE | 24 PE |
| Superestrella (quinta mejora) | 10 PE | 20 PE | 24 PE | 28 PE |
| Leyenda (sexta mejora) | 15 PE | 30 PE | 34 PE | 38 PE |

(Same page: random-skill rolls use 2D6 on "la tabla de Habilidades de la pág. 121". Attribute
improvements — «TABLA DE MEJORA DE ATRIBUTOS» (1D8) and «TABLA DE INCREMENTO DE VALORACIÓN»
(+20 000 M.O. primary skill / +40 000 secondary / +1 AR 10 000 / +1 MV 20 000 / +1 PS 20 000 /
+1 AG 30 000 / +1 FU 60 000) — are on PDF page 106 / printed page 98; not transcribed in full.)

**Rendición / concesión — remaining gap.** The only concession reference found is inside «ANOTAR UN
TOUCHDOWN» above (PDF page 104 / printed page 96): a conceding opponent grants touchdowns whose
3 PE go to a player of the scoring coach's choice. No dedicated "rendición" section was found on
the searched pages (printed 83, 94-100, 142 — PDF pages 90, 102-108, 150). Nearby post-match
content not transcribed here: «FICHAR, DESPEDIR Y RETIRAR TEMPORALMENTE» (PDF page 107 / printed
page 99) and «ERRORES COSTOSOS» treasury-loss table (PDF page 108 / printed page 100).

### D. Incentivos (inducements) + petty cash

**PDF page 102 (printed page 94)** — «INCENTIVOS» purchasing + petty cash ("dinero en efectivo"):

> Antes de cada partido de liga, los Entrenadores pueden gastar monedas de oro de su Tesorería o del dinero en efectivo a fin de adquirir Incentivos para su equipo. Estos Incentivos se anotan en el Registro de partidos del equipo. El proceso es el siguiente:
>
> Si un equipo tiene una VAE menor que el otro (ver pág. 91) incluyendo el valor de cualquier Sustituto, recibe "dinero en efectivo" con el que adquirir Incentivos. Para calcular el dinero en efectivo recibido, sigue estos pasos por orden:
>
> * Primero, el equipo con mayor VAE tiene la oportunidad de gastar M.O. de su Tesorería para adquirir Incentivos.
> * Tras resolver eso, el equipo con menor VAE recibe una cantidad de dinero en efectivo igual a la diferencia de VAE entre los dos equipos, más una cantidad igual a las M.O. que el otro equipo ha gastado de su Tesorería en Incentivos.
> * El equipo con menor VAE puede entonces gastar ese dinero en efectivo en Incentivos, pero lo que no gaste se pierde. Además del dinero en efectivo, puede gastar hasta un máximo de 50 000 M.O. adicionales de su Tesorería.
> * Si ambos equipos tienen el mismo VAE, ninguno de ellos puede gastar oro de su Tesorería; ¡están igualados!

(Worked example, same page: VAE 1 240 000 vs 1 160 000 → the higher-VAE coach may spend treasury
money first (e.g. 50 000 M.O. on one *Barril de Estrella Blitzer*); the lower-VAE coach then gets
80 000 M.O. cash (the VAE difference) + 50 000 M.O. (what the rival spent), and may add up to
50 000 more from treasury — the example adds 10 000 → 140 000 total.)

**PDF page 150 (printed page 142)** — «ADQUIRIR INCENTIVOS» conventions:

> Cada Incentivo indica un costo, que es la cantidad de monedas de oro necesarias para adquirirlo, así como el número de veces que puedes adquirirlo (p. ej., 0-2). También se indica qué equipos pueden adquirir ese Incentivo; algunas veces, para poder adquirir el Incentivo el equipo deberá tener alguna regla especial concreta. Las reglas especiales de equipo se explican en la pág. 154. Algunos Incentivos pueden también ser más baratos para ciertos equipos, o para equipos con reglas especiales concretas.

**PDF page 150 (printed page 142)** — INCENTIVOS COMUNES (full common list with prices):

> * 0-3 Plegarias a Nuffle – 10 000 M.O.
> * 0-5 Ayudantes a tiempo parcial – 20 000 M.O.
> * 0-5 Animadoras temporales – 5 000 M.O.
> * 0-1 Mascota del equipo – 25 000 M.O.
> * 0-1 Cambiacíclimas – 25 000 M.O.
> * 0-2 Barriles de cerveza Estrella Blitzer – 50 000 M.O.
> * 0-3 Sobornos (0-6 para equipos con la regla especial Sobornos y corrupción) – 100 000 M.O. (50 000 M.O. para equipos con la regla especial Sobornos y corrupción)
> * 0-8 Entrenamientos adicionales – 100 000 M.O.
> * 0-1 Ayudante de la morgue – 100 000 M.O. (solo para equipos con la regla especial Señores de los No Muertos)
> * 0-1 Médico de la peste – 100 000 M.O. (solo para equipos con la regla especial Elegidos de Nurgle)
> * 0-1 Novatos embravecidos – 150 000 M.O. (solo para equipos con la regla especial Líneas prescindibles)
> * 0-2 Apotecarios errantes – 100 000 M.O. (no disponible para equipos que no puedan contratar un Apotecario)
> * 0-1 Chef Maestro Halfling – 300 000 M.O. (100 000 M.O. para equipos Halfling)
> * 0-1 Árbitro poco imparcial – precio variable
> * 0-1 Miembros del cuadro técnico famosos (o infames) – precio variable
> * 0-3 Jugadores mercenarios – precio variable
> * 0-2 Jugadores Estrella – precio variable
> * 0-1 Mago – precio variable

**PDF page 150 (printed page 142)** — «PLEGARIAS A NUFFLE» (first inducement detail; its 1D16 table
is on printed p. 143+, **not transcribed**):

> Es común que equipos, entrenadores y aficionados pidan intervención divina en un partido de Blood Bowl, sobre todo cuando su equipo se dispone a jugar contra un oponente claramente superior. Aunque esto rara vez tiene el menor impacto, ¡resulta que ofrecer a Nuffle un poco de oro parece aumentar su tendencia a escuchar las plegarias! Por cada Plegaria a Nuffle que adquieras, tira 1D16 (repitiendo cualquier resultado que ya hayas obtenido) y consulta la tabla de Plegarias a Nuffle de abajo para determinar qué bendición se le concede al equipo. Las Plegarias a Nuffle duran hasta el final del partido. Si una Plegaria a Nuffle requiere elegir jugadores, no se puede elegir a Jugadores Estrella bajo ninguna circunstancia.

Demo catalog name mapping (note, not rule text): «Sobornos» → *Sobornos* (0-3; 100 000 M.O., or
0-6 / 50 000 M.O. with *Sobornos y corrupción*); «Barriles de Bloodweiser» → *Barriles de cerveza
Estrella Blitzer* (0-2; 50 000 M.O.); «Mago del Clima» → closest is *Cambiacíclimas* (0-1;
25 000 M.O.), while generic *Mago* is 0-1 at precio variable.

Remaining gaps in this cluster: per-inducement effect text (printed pp. 143-153, incl. the
Plegarias a Nuffle 1D16 table), variable prices (Árbitro poco imparcial, staff stars, mercenarios,
Jugadores Estrella, Mago), and the team special-rules page (printed p. 154).

---

## demo/partido implications

What the live match sheet (acta) must be able to record/show, per rule area. Grounding: the demo
models (`features/leagues/actaDemoReducer.ts`, `actaFlow.fixtures.ts`, `actaDemoHarness.tsx`)
already carry much of this; "gap" = rule data absent from the MD corpus.

| Rule area | The acta must record/show | Demo grounding (read-only) |
|---|---|---|
| Pre-match fans | Per-side FF: base + 1D3 total, shown in header | `fan_factor` event payload `{ home: { base, dice, total }, away: … }`; `fanFactorOf()` feeds «Factor de hinchas» header cells |
| Pre-match weather | The 2D6 roll + resulting condition, restated when it changes (weather-mage / Clima cambiante) | `weather` command/event `{ value, roll? }` (T1 payload contract); `latestWeather()` → «Clima:» header; `resultSnapshot().weather` persists it |
| Inducements | Purchased cart per side (counts + catalog ids), petty cash, TV/VE delta | `PersistedInducements` demo cart: 1× bribes, 2× bloodweiser-kegs (home), 1× weather-mage (away); «Inducements:» header via `inducementsOf()`; `bribesOf()` feeds «Sobornos». **Gap:** MD gives no costs/limits |
| Kickoff | Who kicked, kick/scatter result, kickoff event drawn + effect resolved | Not modeled as a first-class event — a faithful kickoff flow needs new event kinds. **Gap:** kickoff effects missing from MD |
| Turn clock | Half 1-2, turn 1-8, active side, turn-start reason (voluntary/turnover/injury…) | `endTurn` rolls 1T8→2T1 and 2T8→finished; `turnStart` events carry `reason: "voluntary" \| "turnover" \| "injury"`; «1T · turno 3» scenario chips |
| Turnover | A visible feed marker when a turn ends early and why | `turnStart { reason: "turnover" }` — the *cause* is not captured; the 10-turnover-cause list in §D is the vocabulary to draw from |
| Actions (move/block/pass/hand-off/TTM/foul…) | Per-action entries on the timeline, per-turn caps (1 blitz, 1 pass, 1 hand-off, 1 TTM, 1 foul) | `LiveActionDock` (guided modals) fires real `LiveCommand`s; events `completion`, `interception`, `throwTeamMate`, `landedSafe`, `foul`, `casualty`, `td` exist. **Gap:** no move/block/hand-off event kinds yet |
| Block & injuries | Block outcome, armor/wound/injury rolls incl. the 1D16 result | `casualty` payload `{ victimRosterId, causerRosterId, cause: "block" \| "foul", roll16, roll6, bothDown }` — `roll16` aligns with the 1D16 Lesiones table (§H). **Gap:** wound/armor numeric tables missing from MD |
| Foul | Foul entry + victim + expulsion + protest roll | `foul` event `{ victimRosterId }`; expulsion/protest not yet modeled |
| Scoring | TD event + score bump + drive/turn transition | `td` command → event + `scoreBump`; TD ends the drive per §E |
| End of drive / half | Secret-weapon ejections, unconscious recovery 1D6 4+, FF/weather side-effects (Calor Asfixiante benching) | `endHalf` event at 1T8; none of the recovery steps modeled |
| End of game | Closure steps: winnings, fans adjustment, MVP, casualties, journeymen — one submitter | `resolutionState` steps (`winnings`, `fansDone`, `mvpConfirmed/mvpRolled`, `casualtiesDone`, `journeymenDone`); `nominateMvp`/`rollMvp` commands; «Abrir cierre» → `ActaClosure`; «Resultado reportado por …» single-submitter banner. **Gap:** all amounts/award rules missing from MD |
| Concession/forfeit | Proposal + resolution if the match is abandoned | `concedeProposedBy` field exists. **Gap:** not covered in MD |

UI strings already in play (keep verbatim): «Clima:», «Inducements:», «Ver como:», «Seguir al
turno activo», «Solicitar turno», «Fin de turno», «Finalizar partido», «Abrir cierre»,
«Restablecer», «Resultado reportado por …», scenario chips «Inicio», «1T · turno 3»,
«2T · turno 5», «Finalizado».

---

## Open questions

1. **Kickoff event table** — the MD names the 11 events but gives neither the 2D6 value mapping
   nor effects. Without them the kickoff flow cannot be faithful. Source them via human-held
   photos of the table page (PDF pp. 42-53 region; the scan has no text layer) or accept a
   demo-only stub? Should the demo implement kickoff events at all in v1?
   **Status: resolved — transcribed in §PDF-sourced tables A (PDF page 53 / printed page 48).**
2. **Numeric combat tables** — wound table (2D6 vs AR result mapping, normal + "escurridizos"),
   the 1D16 injury ranges (Magullado…Muerto), and the pass-range ruler distances are all absent
   from the MD (the `00` index promises them for pp. 71-83 but `06` omits them). Needed before
   the demo can *compute* anything; meanwhile it can only *record* rolls. Same photo-extraction
   question as (1).
   **Status: combat tables resolved — transcribed in §PDF-sourced tables B (PDF pages 73-74 /
   printed pages 66-67). Pass-ruler band distances still missing.**
3. **Post-match resolution rules** — MVP, SPP awards, winnings, fan factor adjustments and
   concession/forfeit are not in the corpus at all, yet the acta closure already has those steps.
   Where do the rules come from (more PDF pages? external BB2025 references?) — or do we design
   demo amounts and label them as non-canonical?
   **Status: winnings, FF adjustments, SPP awards and MVP transcribed in §PDF-sourced tables C;
   concession/forfeit rules still missing.**
4. **Inducements & petty cash** — «Incentivos» is named but never priced; the demo catalog
   («Sobornos», «Barriles de Bloodweiser», «Mago del Clima») has real ids but no rule text here.
   Which inducements does the demo need to support first, and with which effects (e.g. does the
   weather-mage trigger a mid-match weather re-roll — `Clima cambiante`-style)?
   **Status: list + prices + petty cash transcribed in §PDF-sourced tables D; per-inducement effect
   text (printed pp. 143+) not transcribed.**
5. **Scope for v1 faithfulness** — should the demo enforce rule mechanics (turnover triggers,
   per-turn action caps, 8-turn half clock) or stay a free recorder of events with rule-flavored
   labels? Sub-decision: the leap modifier and "Retener el balón"/"herido por el público" corner
   rules are half-covered — include or defer?

Secondary (non-blocking) ambiguities in the MD itself:
- "Retener el balón" threshold "≥ número de turno actual" — turn number resets each half; which
  counter does it use? (MD says "número de turno actual" only.)
- Team Re-roll league pricing ("Su coste en liga duplica al inicial") is ambiguous in the source.
- Overtime: one extra half of 8 turns *or* 5 opposed-1D6 penalties — the trigger condition
  ("partidos eliminatorios") is named but not elaborated.

---

## Appendix: dice, templates & tokens (equipment reference)

Source: `01_bases_del_juego.md` → "## 4. Plantillas Técnicas", "## 5. Tipos de Dados", "## 3…".
Useful for naming the rolls the acta records (`roll6`, `roll16`, scatter steps).

| Item | Use |
|---|---|
| D6 | Standard die; 1D3 = D6 ÷ 2 rounded up; 2D6 = sum of two (range 2–12) |
| Block dice (Dados de Placaje) | 6-face icon dice: skull, double skull, push arrow, stumble, POW (see §D block results) |
| D8 | Numbered 1–8, drives the random-direction template (scatter direction) |
| D16 | Numbered 1–16, random player selection on team sheets — and the Lesiones table (§H) |
| Plantilla de Dirección Aleatoria | 1D8 template, 8 numbered squares around a central star — ball/player scatter direction |
| Plantilla de Devolución | Throw-in template for crowd returns; 1D6 sectors 1-2 / 3-4 / 5-6 (`06` §2) |
| Regla de Alcance | Graduated ruler in bands (Pase rápido/corto/largo, Bomba larga) — band distances `not covered in MD` |

Game tokens (`01` §3): Tumbado boca arriba (yellow; reverse = Aturdido, red), Distraído (blue,
cancels tackle zone + active skills/traits), Penetración / Blitz! (gold, marks the one blitzer),
Indigestión / Dodgy Snack (green), Piquete de ojos / Eye Gouge (purple, cancels offensive/
defensive support in blocks), Enraizado / Rooted (brown, Treemen), Masticado / Chomped (white),
ball token (loose/carried, 32 mm base), thrown-player/bomb token (double-sided).
