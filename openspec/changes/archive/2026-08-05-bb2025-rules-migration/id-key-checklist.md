# BB2025 Migration: Identifier Delta + Freeze Checklist

> Generated during Phase 1 (task 1.3) audit of `features/teams/data/races.ts`.
> **Rule update (approved)**: BB2025 roster composition is authoritative over previous inventory.
> This migration allows only the explicit finite identifier delta below.
> All identifiers not listed in the delta remain frozen.

## Approved Finite Identifier Delta (user-approved compatibility break)

### Race IDs

- Remove: `high-elf`
- Add: `bretonnian`

### Positional keys

- Remove: `chaos-chosen.beastman-runner`
- Remove: `chaos-renegade.renegade-beastman`
- Remove: `tomb-kings.bone-giant`
- Remove: `vampire.vampire`
- Add: `chaos-renegade.renegade-minotaur`
- Add: `chaos-renegade.renegade-rat-ogre`
- Add: `vampire.vampire-runner`
- Add: `vampire.vampire-thrower`
- Add: `vampire.vampire-blitzer`
- Add: `vampire.vargheist`

## Race IDs After Migration (26 total)

| # | race.id |
|---|---------|
| 1 | `human` |
| 2 | `orc` |
| 3 | `dwarf` |
| 4 | `elven-union` |
| 5 | `skaven` |
| 6 | `dark-elf` |
| 7 | `shambling-undead` |
| 8 | `chaos-chosen` |
| 9 | `amazon` |
| 10 | `chaos-renegade` |
| 11 | `halfling` |
| 12 | `bretonnian` |
| 13 | `imperial-nobility` |
| 14 | `khorne` |
| 15 | `lizardmen` |
| 16 | `necromantic-horror` |
| 17 | `norse` |
| 18 | `nurgle` |
| 19 | `old-world-alliance` |
| 20 | `snotling` |
| 21 | `tomb-kings` |
| 22 | `underworld-denizens` |
| 23 | `vampire` |
| 24 | `black-orc` |
| 25 | `goblin` |
| 26 | `wood-elf` |

## Positional Keys by Race After Migration (126 total)

| Race | positional.key |
|------|----------------|
| human | `lineman`, `thrower`, `blitzer`, `catcher`, `ogre` |
| orc | `lineman`, `thrower`, `blitzer`, `big-un-blocker`, `goblin`, `troll` |
| dwarf | `lineman`, `blitzer`, `runner`, `troll-slayer`, `deathroller` |
| elven-union | `lineman`, `thrower`, `catcher`, `blitzer` |
| skaven | `lineman`, `thrower`, `gutter-runner`, `blitzer`, `rat-ogre` |
| dark-elf | `lineman`, `blitzer`, `runner`, `assassin`, `witch-elf` |
| shambling-undead | `skeleton-lineman`, `zombie-lineman`, `ghoul-runner`, `wight-blitzer`, `mummy` |
| chaos-chosen | `lineman`, `chosen-blocker`, `chaos-troll`, `minotaur` |
| amazon | `linewoman`, `thrower`, `catcher`, `blitzer` |
| chaos-renegade | `renegade-lineman`, `renegade-orc-lineman`, `renegade-goblin`, `renegade-skaven`, `renegade-dark-elf`, `chaos-ogre`, `renegade-troll`, `renegade-minotaur`, `renegade-rat-ogre` |
| halfling | `hopeful`, `catcher`, `hefty`, `treeman` |
| bretonnian | `peasant-lineman`, `blitzer`, `blocker`, `ogre` |
| imperial-nobility | `lackey-lineman`, `bodyguard`, `thrower`, `blitzer`, `ogre` |
| khorne | `marauder`, `khorne-blocker`, `bloodseeker`, `juggernaut` |
| lizardmen | `skink-runner`, `saurus-blocker`, `kroxigor` |
| necromantic-horror | `zombie-lineman`, `werewolf`, `flesh-golem`, `wraith`, `ghoul-runner` |
| norse | `lineman`, `thrower`, `berserker`, `valkyrie`, `ulfwerener`, `snow-troll` |
| nurgle | `rotter-lineman`, `pestigor`, `bloater`, `rotspawn` |
| old-world-alliance | `human-lineman`, `dwarf-lineman`, `halfling-hopeful`, `thrower`, `blitzer`, `ogre` |
| snotling | `snotling`, `fun-hoppa`, `stilty-runna`, `pump-wagon`, `trained-troll` |
| tomb-kings | `skeleton-lineman`, `thro-ra`, `blitz-ra`, `tomb-guardian` |
| underworld-denizens | `underworld-goblin`, `skaven-lineman`, `skaven-thrower`, `skaven-blitzer`, `mutant-rat-ogre` |
| vampire | `thrall-lineman`, `vampire-runner`, `vampire-thrower`, `vampire-blitzer`, `vargheist` |
| black-orc | `goblin-bruiser`, `black-orc-blocker`, `trained-troll` |
| goblin | `goblin-lineman`, `fanatic`, `loony`, `pogoer`, `bombardier`, `trained-troll` |
| wood-elf | `lineman`, `thrower`, `catcher`, `wardancer`, `treeman` |

## Verification Rule

After migration, verify only approved additions/removals occurred and all other keys stayed unchanged.

Run:
```bash
node -e "
const {RACES} = require('./features/teams/data/races.ts');
// Verify all ids match this list exactly
"
```
Or verify via test: `pnpm test -- features/teams/data/races.test.ts` — uniqueness and count invariant tests catch duplicate or missing keys.

## Gate Status

| Check | Status |
|-------|--------|
| Approved finite identifier delta documented | ✅ Done |
| 26 race IDs post-migration verified | ✅ Done |
| 126 positional keys post-migration verified | ✅ Done |
| All unlisted keys frozen | ✅ Done |
| REQ-RACE-01: BB2025 reference table verified | ✅ Done |
