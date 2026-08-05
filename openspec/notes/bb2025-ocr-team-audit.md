# BB2025 OCR Team Audit (Reglamento 3a Temporada)

## Scope

- Source PDF: `external-assets/1017480877-Blood-Bowl-2025-Reglamento-3a-Temporada-Foto.pdf`
- Source dataset compared: `features/teams/data/races.ts`
- Product code changed: **no** (audit artifact only)

## Extraction Method and Limits

- The model cannot directly parse PDF binary in `Read`; extraction used local CLI OCR/text artifacts (`pdfinfo`, existing `bb2025_ocr_full/page-*.txt`).
- `pdftotext` on the raw PDF produced only form-feed output (no embedded selectable text), so OCR text is the effective source.
- Confidence labels below are deterministic:
  - **high**: explicit team header and/or clearly readable roster rows with consistent numeric profile patterns.
  - **medium**: header/row readable but with OCR corruption in one or more tokens.
  - **low**: severe OCR corruption, ad page, or non-roster page.

## Team Count Discovered from PDF

- **30 team lists** discovered from rules text (high confidence): page 167 explicitly states "Actualmente hay 30 listas de equipo distintas".
  - Evidence: `bb2025_ocr_full/page-167.txt:9`

## Team List Extracted from PDF (Normalized)

Confidence is for team identification (not every stat cell).

| Team (normalized) | Confidence | Evidence pages |
|---|---|---|
| Amazon | high | 168 |
| Black Orc | high | 169 |
| Bretonnian | high | 170 |
| Chaos Chosen | high | 171 |
| Chaos Dwarf | high | 172 |
| Chaos Renegades | high | 173 |
| Dark Elf | high | 174 |
| Dwarf | high | 175 |
| Elven Union | high | 176 |
| Gnome | high | 177 |
| Goblin | high | 178 |
| Halfling | high | 179 |
| Human | high | 180 |
| Imperial Nobility | high | 181 |
| Khorne | high | 182 |
| Lizardmen | high | 183 |
| Necromantic Horror | high | 184 |
| Norse | high | 185 |
| Nurgle | high | 186 |
| Ogre | high | 187 |
| Old World Alliance | high | 188 |
| Orc | high | 189 |
| Shambling Undead | high | 190 |
| Skaven | high | 191 |
| Snotling | high | 192 |
| Tomb Kings | high | 193 |
| Underworld Denizens | high | 194 |
| Vampire | high | 195 |
| Wood Elf | high | 196 |
| (one additional list implied by total=30, not reliably OCR-visible in sampled pages) | medium | 167 statement + page break noise around 197 |

## Comparison vs `races.ts` IDs

Current `races.ts` IDs (26):

`human`, `orc`, `dwarf`, `elven-union`, `skaven`, `dark-elf`, `shambling-undead`, `chaos-chosen`, `amazon`, `chaos-renegade`, `halfling`, `bretonnian`, `imperial-nobility`, `khorne`, `lizardmen`, `necromantic-horror`, `norse`, `nurgle`, `old-world-alliance`, `snotling`, `tomb-kings`, `underworld-denizens`, `vampire`, `black-orc`, `goblin`, `wood-elf`.

### Teams Present in PDF but Missing in `races.ts`

1. `chaos-dwarf` (normalized from "Chaos Dwarf(s)")
2. `gnome`
3. `ogre`
4. One additional team slot indicated by PDF total count=30, but not confidently identified from OCR pages sampled

### ID/Name Normalization Notes (Not Missing, but Relevant)

- PDF uses plural display names in several places (e.g., "Chaos Renegades", "Dark Elves", "Wood Elves"); code IDs are singularized/hyphenated conventions.
- `chaos-renegade` (code) likely maps to PDF "Chaos Renegades" (confidence: high).

## High-Confidence Positional Data Captured Now (for missing code teams)

The following are extracted as high-confidence from OCR row patterns; skill text may still require confirmation where OCR mangles tokens.

### Chaos Dwarf (`chaos-dwarf`) - page 172

Team-level:
- reroll cost: **70,000** (high) - `page-172.txt:39`
- apothecary: **yes** (high) - `page-172.txt:39`

Positionals (high for count/cost/stats; medium for some skill labels):
- Hobgoblin Lineman: `0-16`, `40,000`, `MA 6 ST 3 AG 3+ PA 4+ AV 8+` (high) - `page-172.txt:21-23`
- Sneaky Stabba: `0-2`, `60,000`, `6/3/3+/5+/8+` (high) - `page-172.txt:24-25`
- Chaos Dwarf Blocker: `0-4`, `70,000`, `4/3/4+/6+/10+` (high) - `page-172.txt:26-29`
- Flamesmith: `0-2`, `80,000`, `5/3/4+/6+/10+` (high) - `page-172.txt:30-32`
- Bull Centaur: `0-2`, `130,000`, `6/4/4+/6+/10+` (high) - `page-172.txt:33-34`
- Minotaur: `0-1`, `150,000`, `5/5/4+/6+/9+` (high) - `page-172.txt:35-38`

### Gnome (`gnome`) - page 177

Team-level:
- reroll cost: **50,000** (high) - `page-177.txt:38`
- apothecary: **yes** (high) - `page-177.txt:38`

Positionals (high for count/cost/stats; medium for some names/skills where OCR joined words):
- Gnome Lineman: `0-16`, `40,000`, `5/2/3+/4+/7+` (high) - `page-177.txt:20-22`
- Woodland Fox: `0-2`, `50,000`, `7/2/2+/-/6+` (high) - `page-177.txt:23-25`
- Gnome Illusionist: `0-2`, `50,000`, `5/2/3+/3+/7+` (high) - `page-177.txt:26-28`
- Gnome Beastmaster: `0-2`, `55,000`, `5/2/3+/4+/8+` (high) - `page-177.txt:29-32`
- Altern Forest Treeman (likely "Altern Forest Treeman"): `0-2`, `120,000`, `2/6/5+/5+/11+` (high stats/cost, medium exact name) - `page-177.txt:33-37`

### Ogre (`ogre`) - page 187

Team-level:
- reroll cost: **70,000** (high) - `page-187.txt:29`
- apothecary: **yes** (high) - `page-187.txt:29`

Positionals (high for count/cost/stats; medium for one role label):
- Gnoblar Lineman: `0-16`, `15,000`, `5/1/3+/4+/6+` (high) - `page-187.txt:17-19`
- Ogre Blocker: `0-5`, `140,000`, `5/5/4+/5+/10+` (high) - `page-187.txt:20-23`
- Ogre Runt Punter: `0-1`, `145,000`, `5/5/4+/4+/10+` (high) - `page-187.txt:24-27`

## Unresolved Data List (Ready for User Confirmation)

Ask only these items:

1. **Missing team #30 identity**
   - Field: team name / ID
   - Current value: unresolved (PDF says 30 lists; OCR sample recovered 29 distinct named lists + 1 unresolved slot)
   - Evidence: `page-167.txt:9`, noisy tail around `page-197.txt`
   - Confidence: low

2. **Chaos Dwarf skill text normalization**
   - Team: chaos-dwarf
   - Field: skill names for `SneakyStabba`, `Flamesmith`, `Bull Centaur`, `Minotaur`
   - Current value: OCR-transcribed Spanish strings with possible token corruption
   - Evidence: `page-172.txt:24-38`
   - Confidence: medium

3. **Gnome roster exact English/Spanish naming for two positionals**
   - Team: gnome
   - Field: positional names (`Woodland Fox` spelling and `Altern Forest Treeman` canonical name)
   - Current value: OCR-derived labels likely close but not canonical
   - Evidence: `page-177.txt:23-37`
   - Confidence: medium

4. **Ogre third positional canonical role label**
   - Team: ogre
   - Field: `Ogre Runt Punter` exact localized/canonical name
   - Current value: OCR reads "Ogre Runt Punter"
   - Evidence: `page-187.txt:24-27`
   - Confidence: medium

5. **Chaos Renegades naming consistency**
   - Team: chaos-renegade (code) vs Chaos Renegades (PDF)
   - Field: canonical ID/display convention to use when code is updated
   - Current value: ID singular in code; name plural in PDF
   - Evidence: `page-173.txt:2`
   - Confidence: high for mismatch, medium for desired canonicalization decision
