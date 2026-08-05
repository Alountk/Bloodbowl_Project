import type { Race } from "../types";

export const RACES: Race[] = [
  {
    id: "human",
    name: "Human",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: [] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 75_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "3+", av: "9+", skills: ["sure-hands", "pass"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 85_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["defensive", "block"] },
      { key: "catcher", name: "Catcher", role: "Catcher", cost: 75_000, max: 4, ma: 8, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["catch", "dodge"] },
      { key: "ogre", name: "Ogre", role: "Big Guy", cost: 140_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: ["thick-skull", "really-stupid", "mighty-blow-plus-1", "throw-team-mate", "loner-3-plus"] },
    ],
  },
  {
    id: "orc",
    name: "Orc",
    rerollCost: 60_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 50_000, max: 16, ma: 5, st: 3, ag: "3+", pa: "4+", av: "10+", skills: [] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 75_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "3+", av: "9+", skills: ["sure-hands", "pass"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 85_000, max: 4, ma: 6, st: 3, ag: "3+", pa: "4+", av: "10+", skills: ["brawler", "block"] },
      { key: "big-un-blocker", name: "Big Un Blocker", role: "Blocker", cost: 95_000, max: 4, ma: 5, st: 4, ag: "4+", pa: "6+", av: "10+", skills: ["thick-skull", "mighty-blow-plus-1", "taunt", "unchannelled-fury"] },
      { key: "goblin", name: "Goblin", role: "Runner", cost: 40_000, max: 4, ma: 6, st: 2, ag: "3+", pa: "3+", av: "8+", skills: ["dodge", "right-stuff", "stunty", "titchy"] },
      { key: "troll", name: "Troll", role: "Big Guy", cost: 115_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "5+", av: "10+", skills: ["mighty-blow-plus-1", "throw-team-mate", "projectile-vomit", "really-stupid", "regeneration", "always-hungry", "loner-4-plus"] },
    ],
  },
  {
    id: "dwarf",
    name: "Dwarf",
    rerollCost: 60_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 70_000, max: 16, ma: 4, st: 3, ag: "4+", pa: "5+", av: "10+", skills: ["thick-skull", "block", "tackle"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 100_000, max: 4, ma: 5, st: 3, ag: "4+", pa: "4+", av: "10+", skills: ["defensive", "arm-bar", "block", "thick-skull"] },
      { key: "runner", name: "Runner", role: "Runner", cost: 80_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["thick-skull", "sprint", "sure-hands"] },
      { key: "troll-slayer", name: "Troll Slayer", role: "Blitzer", cost: 95_000, max: 2, ma: 5, st: 3, ag: "4+", pa: "5+", av: "9+", skills: ["dauntless", "thick-skull", "frenzy", "block", "troll-hatred"] },
      { key: "deathroller", name: "Deathroller", role: "Big Guy", cost: 170_000, max: 1, ma: 5, st: 7, ag: "5+", pa: "—", av: "11+", skills: ["break-tackle", "secret-weapon", "no-hands", "mighty-blow-plus-1", "juggernaut", "dirty-player-plus-1", "stand-firm", "loner-4-plus"] },
    ],
  },
  {
    id: "elven-union",
    name: "Elven Union",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 65_000, max: 16, ma: 6, st: 3, ag: "2+", pa: "3+", av: "8+", skills: ["dump-off"] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 75_000, max: 2, ma: 6, st: 3, ag: "2+", pa: "2+", av: "8+", skills: ["pass", "running-pass"] },
      { key: "catcher", name: "Catcher", role: "Catcher", cost: 100_000, max: 4, ma: 8, st: 3, ag: "2+", pa: "4+", av: "8+", skills: ["catch", "nerves-of-steel", "safe-pair-of-hands"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 115_000, max: 4, ma: 7, st: 3, ag: "2+", pa: "3+", av: "9+", skills: ["side-step", "block"] },
    ],
  },
  {
    id: "skaven",
    name: "Skaven",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 50_000, max: 16, ma: 7, st: 3, ag: "3+", pa: "4+", av: "8+", skills: [] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 80_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "2+", av: "8+", skills: ["sure-hands", "pass"] },
      { key: "gutter-runner", name: "Gutter Runner", role: "Runner", cost: 85_000, max: 4, ma: 9, st: 2, ag: "2+", pa: "4+", av: "8+", skills: ["stab", "dodge"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 90_000, max: 2, ma: 8, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["block", "strip-ball"] },
      { key: "rat-ogre", name: "Rat Ogre", role: "Big Guy", cost: 150_000, max: 1, ma: 6, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["prehensile-tail", "animal-savagery", "frenzy", "mighty-blow-plus-1", "loner-4-plus"] },
    ],
  },
  {
    id: "dark-elf",
    name: "Dark Elf",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 65_000, max: 16, ma: 6, st: 3, ag: "2+", pa: "3+", av: "9+", skills: [] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 105_000, max: 4, ma: 7, st: 3, ag: "2+", pa: "3+", av: "9+", skills: ["block"] },
      { key: "runner", name: "Runner", role: "Runner", cost: 80_000, max: 2, ma: 7, st: 3, ag: "2+", pa: "3+", av: "8+", skills: ["running-pass", "kick"] },
      { key: "assassin", name: "Assassin", role: "Blitzer", cost: 90_000, max: 2, ma: 7, st: 3, ag: "2+", pa: "4+", av: "8+", skills: ["stab", "hit-and-run", "shadowing"] },
      { key: "witch-elf", name: "Witch Elf", role: "Blitzer", cost: 110_000, max: 2, ma: 7, st: 3, ag: "2+", pa: "4+", av: "8+", skills: ["jump-up", "dodge", "frenzy"] },
    ],
  },
  {
    id: "shambling-undead",
    name: "Shambling Undead",
    rerollCost: 70_000,
    positionals: [
      { key: "skeleton-lineman", name: "Skeleton Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 5, st: 3, ag: "4+", pa: "6+", av: "8+", skills: ["thick-skull", "regeneration"] },
      { key: "zombie-lineman", name: "Zombie Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 4, st: 3, ag: "4+", pa: "6+", av: "9+", skills: ["low-blow", "regeneration", "unchannelled-fury"] },
      { key: "ghoul-runner", name: "Ghoul Runner", role: "Runner", cost: 75_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "3+", av: "8+", skills: ["dodge", "regeneration"] },
      { key: "wight-blitzer", name: "Wight Blitzer", role: "Blitzer", cost: 95_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "5+", av: "9+", skills: ["thick-skull", "defensive", "block", "regeneration"] },
      { key: "mummy", name: "Mummy", role: "Big Guy", cost: 125_000, max: 2, ma: 3, st: 5, ag: "5+", pa: "6+", av: "10+", skills: ["mighty-blow-plus-1", "regeneration"] },
    ],
  },
  {
    id: "chaos-chosen",
    name: "Chaos Chosen",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 55_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "3+", av: "9+", skills: ["thick-skull", "horns"] },
      { key: "chosen-blocker", name: "Chosen Blocker", role: "Blitzer", cost: 100_000, max: 4, ma: 5, st: 4, ag: "3+", pa: "5+", av: "10+", skills: ["arm-bar"] },
      { key: "chaos-troll", name: "Chaos Troll", role: "Big Guy", cost: 115_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "5+", av: "10+", skills: ["mighty-blow-plus-1", "throw-team-mate", "projectile-vomit", "really-stupid", "regeneration", "always-hungry", "loner-4-plus"] },
      { key: "minotaur", name: "Minotaur", role: "Big Guy", cost: 150_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["thick-skull", "horns", "frenzy", "mighty-blow-plus-1", "unchannelled-fury", "loner-4-plus"] },
    ],
  },
  {
    id: "chaos-dwarf",
    name: "Chaos Dwarf",
    rerollCost: 70_000,
    positionals: [
      { key: "hobgoblin-lineman", name: "Hobgoblin Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: [] },
      { key: "sneaky-stabba", name: "Sneaky Stabba", role: "Runner", cost: 60_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "5+", av: "8+", skills: ["stab", "shadowing"] },
      { key: "chaos-dwarf-blocker", name: "Chaos Dwarf Blocker", role: "Blocker", cost: 70_000, max: 4, ma: 4, st: 3, ag: "4+", pa: "6+", av: "10+", skills: ["thick-skull", "iron-hard-skin", "tackle"] },
      { key: "flamesmith", name: "Flamesmith", role: "Blocker", cost: 80_000, max: 2, ma: 5, st: 3, ag: "4+", pa: "6+", av: "10+", skills: ["thick-skull", "fire-breathing", "brawler", "disturbing-presence"] },
      { key: "bull-centaur", name: "Bull Centaur", role: "Blitzer", cost: 130_000, max: 2, ma: 6, st: 4, ag: "4+", pa: "6+", av: "10+", skills: ["thick-skull", "sprint", "sure-feet", "shakey"] },
      { key: "minotaur", name: "Minotaur", role: "Big Guy", cost: 150_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["thick-skull", "horns", "frenzy", "mighty-blow-plus-1", "unchannelled-fury", "loner-4-plus"] },
    ],
  },
  // --- Additional BB2025 races ---
  {
    id: "amazon",
    name: "Amazon",
    rerollCost: 60_000,
    positionals: [
      { key: "linewoman", name: "Linewoman", role: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["dodge"] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 80_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "3+", av: "8+", skills: ["on-the-ball", "dodge", "pass", "safe-pass"] },
      { key: "catcher", name: "Catcher", role: "Catcher", cost: 90_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["hit-and-run", "jump-up", "dodge"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 110_000, max: 4, ma: 6, st: 4, ag: "3+", pa: "4+", av: "9+", skills: ["dodge", "defensive"] },
    ],
  },
  {
    id: "chaos-renegade",
    name: "Chaos Renegade",
    rerollCost: 70_000,
    positionals: [
      { key: "renegade-lineman", name: "Renegade Human Lineman", role: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["animosity-all"] },
      { key: "renegade-orc-lineman", name: "Renegade Orc Lineman", role: "Lineman", cost: 50_000, max: 2, ma: 5, st: 3, ag: "3+", pa: "4+", av: "10+", skills: ["animosity-all"] },
      { key: "renegade-goblin", name: "Renegade Goblin", role: "Runner", cost: 40_000, max: 2, ma: 6, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["animosity-all", "dodge", "right-stuff", "titchy"] },
      { key: "renegade-skaven", name: "Renegade Skaven", role: "Runner", cost: 50_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["animosity-all"] },
      { key: "renegade-dark-elf", name: "Renegade Dark Elf", role: "Blitzer", cost: 65_000, max: 2, ma: 6, st: 3, ag: "2+", pa: "3+", av: "9+", skills: ["animosity-all"] },
      { key: "chaos-ogre", name: "Chaos Ogre", role: "Big Guy", cost: 140_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: ["thick-skull", "really-stupid", "throw-team-mate", "loner-4-plus"] },
      { key: "renegade-troll", name: "Renegade Troll", role: "Big Guy", cost: 115_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "5+", av: "10+", skills: ["mighty-blow-plus-1", "throw-team-mate", "projectile-vomit", "really-stupid", "regeneration", "always-hungry", "loner-4-plus"] },
      { key: "renegade-minotaur", name: "Renegade Minotaur", role: "Big Guy", cost: 150_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["horns", "frenzy", "mighty-blow-plus-1", "loner-4-plus"] },
      { key: "renegade-rat-ogre", name: "Renegade Rat Ogre", role: "Big Guy", cost: 150_000, max: 1, ma: 6, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["prehensile-tail", "frenzy", "mighty-blow-plus-1", "loner-4-plus"] },
    ],
  },
  {
    id: "halfling",
    name: "Halfling",
    rerollCost: 60_000,
    positionals: [
      { key: "hopeful", name: "Hopeful", role: "Lineman", cost: 30_000, max: 16, ma: 5, st: 2, ag: "3+", pa: "4+", av: "7+", skills: ["dodge", "right-stuff", "titchy"] },
      { key: "catcher", name: "Catcher", role: "Catcher", cost: 55_000, max: 4, ma: 5, st: 2, ag: "3+", pa: "4+", av: "7+", skills: ["catch", "sprint", "dodge", "right-stuff", "titchy"] },
      { key: "hefty", name: "Hefty", role: "Blitzer", cost: 50_000, max: 2, ma: 5, st: 2, ag: "3+", pa: "3+", av: "8+", skills: ["dodge", "right-stuff", "sneaky-git"] },
      { key: "treeman", name: "Treeman", role: "Big Guy", cost: 120_000, max: 2, ma: 2, st: 6, ag: "5+", pa: "5+", av: "11+", skills: ["strong-arm", "thick-skull", "take-root", "mighty-blow-plus-1", "throw-team-mate", "stand-firm", "timmm-ber"] },
    ],
  },
  {
    id: "high-elf",
    name: "High Elf",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 70_000, max: 16, ma: 6, st: 3, ag: "2+", pa: "4+", av: "8+", skills: [] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 100_000, max: 2, ma: 6, st: 3, ag: "2+", pa: "2+", av: "8+", skills: ["pass", "sure-hands"] },
      { key: "catcher", name: "Catcher", role: "Catcher", cost: 85_000, max: 4, ma: 8, st: 2, ag: "2+", pa: "4+", av: "8+", skills: ["catch", "dodge"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 110_000, max: 4, ma: 7, st: 3, ag: "2+", pa: "3+", av: "9+", skills: ["block"] },
    ],
  },
  {
    id: "gnome",
    name: "Gnome",
    rerollCost: 50_000,
    positionals: [
      { key: "gnome-lineman", name: "Gnome Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 5, st: 2, ag: "3+", pa: "4+", av: "7+", skills: ["jump-up", "slippery", "wrestle", "right-stuff"] },
      { key: "woodland-fox", name: "Woodland Fox", role: "Runner", cost: 50_000, max: 2, ma: 7, st: 2, ag: "2+", pa: "—", av: "6+", skills: ["side-step", "safe-pair-of-hands", "slippery", "dodge"] },
      { key: "gnome-illusionist", name: "Gnome Illusionist", role: "Thrower", cost: 50_000, max: 2, ma: 5, st: 2, ag: "3+", pa: "3+", av: "7+", skills: ["trickster", "jump-up", "slippery", "wrestle"] },
      { key: "gnome-beastmaster", name: "Gnome Beastmaster", role: "Blocker", cost: 55_000, max: 2, ma: 5, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["defensive", "jump-up", "slippery", "wrestle"] },
      { key: "altern-forest-treeman", name: "Altern Forest Treeman", role: "Big Guy", cost: 120_000, max: 2, ma: 2, st: 6, ag: "5+", pa: "5+", av: "11+", skills: ["strong-arm", "thick-skull", "take-root", "mighty-blow-plus-1", "throw-team-mate", "stand-firm", "timmm-ber"] },
    ],
  },
  {
    id: "bretonnian",
    name: "Bretonnian",
    rerollCost: 50_000,
    positionals: [
      { key: "peasant-lineman", name: "Peasant Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["bribery-and-corruption"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 85_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["defensive", "block"] },
      { key: "blocker", name: "Blocker", role: "Blocker", cost: 65_000, max: 4, ma: 5, st: 3, ag: "4+", pa: "6+", av: "9+", skills: ["wrestle", "thick-skull"] },
      { key: "ogre", name: "Ogre", role: "Big Guy", cost: 140_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: ["thick-skull", "really-stupid", "mighty-blow-plus-1", "throw-team-mate", "loner-3-plus"] },
    ],
  },
  {
    id: "imperial-nobility",
    name: "Imperial Nobility",
    rerollCost: 60_000,
    positionals: [
      { key: "lackey-lineman", name: "Lackey Lineman", role: "Lineman", cost: 45_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["fend"] },
      { key: "bodyguard", name: "Bodyguard", role: "Blocker", cost: 85_000, max: 4, ma: 5, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["wrestle", "stand-firm"] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 75_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "2+", av: "9+", skills: ["pass", "running-pass"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 90_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["catch", "block", "pro"] },
      { key: "ogre", name: "Ogre", role: "Big Guy", cost: 140_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: ["thick-skull", "really-stupid", "mighty-blow-plus-1", "throw-team-mate", "loner-3-plus"] },
    ],
  },
  {
    id: "khorne",
    name: "Khorne",
    rerollCost: 60_000,
    positionals: [
      { key: "marauder", name: "Marauder", role: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["frenzy"] },
      { key: "khorne-blocker", name: "Khorne Blocker", role: "Blitzer", cost: 70_000, max: 4, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["thick-skull", "horns", "jump-up", "juggernaut"] },
      { key: "bloodseeker", name: "Bloodseeker", role: "Blitzer", cost: 105_000, max: 4, ma: 5, st: 4, ag: "4+", pa: "6+", av: "10+", skills: ["frenzy"] },
      { key: "juggernaut", name: "Juggernaut", role: "Big Guy", cost: 160_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["frenzy", "claws", "mighty-blow-plus-1", "unchannelled-fury", "loner-4-plus"] },
    ],
  },
  {
    id: "lizardmen",
    name: "Lizardmen",
    rerollCost: 70_000,
    positionals: [
      { key: "skink-runner", name: "Skink Runner", role: "Runner", cost: 60_000, max: 16, ma: 8, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["dodge", "right-stuff"] },
      { key: "saurus-blocker", name: "Saurus Blocker", role: "Blocker", cost: 90_000, max: 6, ma: 6, st: 4, ag: "5+", pa: "6+", av: "10+", skills: ["juggernaut", "unchannelled-fury"] },
      { key: "kroxigor", name: "Kroxigor", role: "Big Guy", cost: 140_000, max: 2, ma: 6, st: 5, ag: "5+", pa: "6+", av: "10+", skills: ["thick-skull", "prehensile-tail", "really-stupid", "mighty-blow-plus-1", "loner-4-plus"] },
    ],
  },
  {
    id: "necromantic-horror",
    name: "Necromantic Horror",
    rerollCost: 70_000,
    positionals: [
      { key: "zombie-lineman", name: "Zombie Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 4, st: 3, ag: "4+", pa: "6+", av: "9+", skills: ["low-blow", "regeneration", "unchannelled-fury"] },
      { key: "werewolf", name: "Werewolf", role: "Runner", cost: 120_000, max: 2, ma: 8, st: 3, ag: "3+", pa: "3+", av: "9+", skills: ["frenzy", "claws", "regeneration"] },
      { key: "flesh-golem", name: "Flesh Golem", role: "Blocker", cost: 110_000, max: 2, ma: 4, st: 4, ag: "4+", pa: "6+", av: "10+", skills: ["thick-skull", "stand-firm", "regeneration", "unchannelled-fury"] },
      { key: "wraith", name: "Wraith", role: "Blitzer", cost: 85_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "—", av: "9+", skills: ["foul-appearance", "side-step", "no-hands", "block", "regeneration"] },
      { key: "ghoul-runner", name: "Ghoul Runner", role: "Runner", cost: 75_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "3+", av: "8+", skills: ["dodge", "regeneration"] },
    ],
  },
  {
    id: "norse",
    name: "Norse",
    rerollCost: 60_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["drunkard", "thick-skull", "block", "unchannelled-fury"] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 95_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "3+", av: "8+", skills: ["dauntless", "catch", "pass", "strip-ball"] },
      { key: "berserker", name: "Berserker", role: "Blitzer", cost: 90_000, max: 4, ma: 6, st: 3, ag: "3+", pa: "5+", av: "8+", skills: ["jump-up", "frenzy", "block"] },
      { key: "valkyrie", name: "Valkyrie", role: "Blitzer", cost: 95_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "3+", av: "8+", skills: ["dauntless", "catch", "pass", "strip-ball"] },
      { key: "ulfwerener", name: "Ulfwerener", role: "Big Guy", cost: 105_000, max: 2, ma: 6, st: 4, ag: "4+", pa: "6+", av: "9+", skills: ["frenzy", "unchannelled-fury"] },
      { key: "snow-troll", name: "Snow Troll", role: "Big Guy", cost: 140_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["frenzy", "claws", "unchannelled-fury", "disturbing-presence", "loner-4-plus"] },
    ],
  },
  {
    id: "nurgle",
    name: "Nurgle",
    rerollCost: 60_000,
    positionals: [
      { key: "rotter-lineman", name: "Rotter Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 5, st: 3, ag: "4+", pa: "6+", av: "9+", skills: ["decay", "nurgling-infestation"] },
      { key: "pestigor", name: "Pestigor", role: "Runner", cost: 70_000, max: 4, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["thick-skull", "horns", "sure-feet", "regeneration"] },
      { key: "bloater", name: "Bloater", role: "Blocker", cost: 110_000, max: 4, ma: 4, st: 4, ag: "4+", pa: "6+", av: "10+", skills: ["foul-appearance", "stand-firm", "disturbing-presence", "regeneration", "unchannelled-fury"] },
      { key: "rotspawn", name: "Rotspawn", role: "Big Guy", cost: 140_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "6+", av: "10+", skills: ["foul-appearance", "mighty-blow-plus-1", "disturbing-presence", "really-stupid", "regeneration", "tentacles", "loner-4-plus"] },
    ],
  },
  {
    id: "ogre",
    name: "Ogre",
    rerollCost: 70_000,
    positionals: [
      { key: "gnoblar-lineman", name: "Gnoblar Lineman", role: "Lineman", cost: 15_000, max: 16, ma: 5, st: 1, ag: "3+", pa: "4+", av: "6+", skills: ["titchy", "side-step", "slippery", "dodge", "right-stuff"] },
      { key: "ogre-blocker", name: "Ogre Blocker", role: "Blocker", cost: 140_000, max: 5, ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: ["thick-skull", "really-stupid", "mighty-blow-plus-1", "throw-team-mate"] },
      { key: "ogre-runt-punter", name: "Ogre Runt Punter", role: "Thrower", cost: 145_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "4+", av: "10+", skills: ["thick-skull", "runt-punter", "kick-team-mate", "really-stupid", "mighty-blow-plus-1"] },
    ],
  },
  {
    id: "old-world-alliance",
    name: "Old World Alliance",
    rerollCost: 70_000,
    positionals: [
      { key: "human-lineman", name: "Human Lineman", role: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: [] },
      { key: "dwarf-lineman", name: "Dwarf Lineman", role: "Lineman", cost: 70_000, max: 6, ma: 4, st: 3, ag: "4+", pa: "5+", av: "10+", skills: ["thick-skull", "block", "tackle"] },
      { key: "halfling-hopeful", name: "Halfling Hopeful", role: "Lineman", cost: 30_000, max: 4, ma: 5, st: 2, ag: "3+", pa: "4+", av: "7+", skills: ["dodge", "right-stuff", "titchy"] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 75_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "3+", av: "9+", skills: ["sure-hands", "pass"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 85_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["defensive", "block"] },
      { key: "ogre", name: "Ogre", role: "Big Guy", cost: 140_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: ["thick-skull", "really-stupid", "mighty-blow-plus-1", "throw-team-mate", "loner-3-plus"] },
    ],
  },
  {
    id: "snotling",
    name: "Snotling",
    rerollCost: 70_000,
    positionals: [
      { key: "snotling", name: "Snotling", role: "Lineman", cost: 15_000, max: 16, ma: 5, st: 1, ag: "3+", pa: "4+", av: "6+", skills: ["dodge", "right-stuff", "side-step", "titchy", "swarming"] },
      { key: "fun-hoppa", name: "Fun Hoppa", role: "Runner", cost: 20_000, max: 4, ma: 6, st: 1, ag: "3+", pa: "4+", av: "6+", skills: ["side-step", "dodge", "right-stuff", "pogo-stick"] },
      { key: "stilty-runna", name: "Stilty Runna", role: "Runner", cost: 20_000, max: 4, ma: 6, st: 1, ag: "3+", pa: "4+", av: "6+", skills: ["side-step", "sprint", "dodge", "right-stuff"] },
      { key: "pump-wagon", name: "Pump Wagon", role: "Big Guy", cost: 100_000, max: 2, ma: 5, st: 5, ag: "5+", pa: "6+", av: "9+", skills: ["mighty-blow-plus-1", "juggernaut", "dirty-player-plus-1", "stand-firm"] },
      { key: "trained-troll", name: "Trained Troll", role: "Big Guy", cost: 115_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "5+", av: "10+", skills: ["mighty-blow-plus-1", "throw-team-mate", "projectile-vomit", "really-stupid", "regeneration", "always-hungry", "loner-4-plus"] },
    ],
  },
  {
    id: "tomb-kings",
    name: "Tomb Kings",
    rerollCost: 60_000,
    positionals: [
      { key: "skeleton-lineman", name: "Skeleton Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 5, st: 3, ag: "4+", pa: "6+", av: "8+", skills: ["thick-skull", "regeneration"] },
      { key: "thro-ra", name: "Thro-Ra", role: "Thrower", cost: 65_000, max: 2, ma: 6, st: 3, ag: "4+", pa: "3+", av: "9+", skills: ["thick-skull", "sure-hands", "pass", "regeneration"] },
      { key: "blitz-ra", name: "Blitz-Ra", role: "Blitzer", cost: 85_000, max: 4, ma: 6, st: 3, ag: "4+", pa: "5+", av: "9+", skills: ["thick-skull", "block", "regeneration"] },
      { key: "tomb-guardian", name: "Tomb Guardian", role: "Blocker", cost: 115_000, max: 4, ma: 4, st: 5, ag: "5+", pa: "6+", av: "10+", skills: ["decay", "brawler", "regeneration"] },
    ],
  },
  {
    id: "underworld-denizens",
    name: "Underworld Denizens",
    rerollCost: 70_000,
    positionals: [
      { key: "underworld-goblin", name: "Underworld Goblin Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 6, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["dodge", "right-stuff", "stunty", "titchy"] },
      { key: "skaven-lineman", name: "Skaven Lineman", role: "Lineman", cost: 50_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["animosity-goblin"] },
      { key: "skaven-thrower", name: "Skaven Thrower", role: "Thrower", cost: 80_000, max: 1, ma: 7, st: 3, ag: "3+", pa: "2+", av: "8+", skills: ["animosity-goblin", "sure-hands", "pass"] },
      { key: "skaven-blitzer", name: "Skaven Blitzer", role: "Blitzer", cost: 90_000, max: 1, ma: 8, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["animosity-goblin", "block", "strip-ball"] },
      { key: "mutant-rat-ogre", name: "Mutant Rat Ogre", role: "Big Guy", cost: 150_000, max: 1, ma: 6, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["prehensile-tail", "animal-savagery", "frenzy", "mighty-blow-plus-1", "loner-4-plus"] },
    ],
  },
  {
    id: "vampire",
    name: "Vampire",
    rerollCost: 60_000,
    positionals: [
      { key: "thrall-lineman", name: "Thrall Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: [] },
      { key: "vampire-runner", name: "Vampire Runner", role: "Runner", cost: 100_000, max: 2, ma: 8, st: 3, ag: "2+", pa: "3+", av: "8+", skills: ["hypnotic-gaze", "regeneration", "blood-lust-2-plus"] },
      { key: "vampire-thrower", name: "Vampire Thrower", role: "Thrower", cost: 110_000, max: 2, ma: 6, st: 4, ag: "2+", pa: "2+", av: "9+", skills: ["hypnotic-gaze", "pass", "regeneration", "blood-lust-2-plus"] },
      { key: "vampire-blitzer", name: "Vampire Blitzer", role: "Blitzer", cost: 110_000, max: 2, ma: 6, st: 4, ag: "2+", pa: "4+", av: "9+", skills: ["juggernaut", "hypnotic-gaze", "regeneration", "blood-lust-3-plus"] },
      { key: "vargheist", name: "Vargheist", role: "Big Guy", cost: 150_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "6+", av: "10+", skills: ["frenzy", "claws", "regeneration", "blood-lust-3-plus", "loner-4-plus"] },
    ],
  },
  {
    id: "black-orc",
    name: "Black Orc",
    rerollCost: 60_000,
    positionals: [
      { key: "goblin-bruiser", name: "Goblin Bruiser Lineman", role: "Lineman", cost: 45_000, max: 16, ma: 6, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["thick-skull", "right-stuff", "dodge", "titchy"] },
      { key: "black-orc-blocker", name: "Black Orc Blocker", role: "Blocker", cost: 90_000, max: 6, ma: 4, st: 4, ag: "4+", pa: "5+", av: "10+", skills: ["grab", "brawler"] },
      { key: "trained-troll", name: "Trained Troll", role: "Big Guy", cost: 115_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "5+", av: "10+", skills: ["mighty-blow-plus-1", "throw-team-mate", "projectile-vomit", "really-stupid", "regeneration", "always-hungry", "loner-4-plus"] },
    ],
  },
  {
    id: "goblin",
    name: "Goblin",
    rerollCost: 80_000,
    positionals: [
      { key: "goblin-lineman", name: "Goblin Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 6, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["dodge", "right-stuff", "stunty", "titchy"] },
      { key: "fanatic", name: "Fanatic", role: "Blitzer", cost: 70_000, max: 1, ma: 3, st: 7, ag: "3+", pa: "—", av: "8+", skills: ["secret-weapon", "ball-and-chain", "no-hands", "stunty"] },
      { key: "loony", name: "Loony", role: "Blitzer", cost: 40_000, max: 1, ma: 6, st: 2, ag: "3+", pa: "—", av: "8+", skills: ["secret-weapon", "stunty", "no-hands", "chainsaw"] },
      { key: "pogoer", name: "Pogoer", role: "Runner", cost: 75_000, max: 1, ma: 7, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["dodge", "right-stuff", "pogo-stick"] },
      { key: "bombardier", name: "Bombardier", role: "Thrower", cost: 45_000, max: 1, ma: 6, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["secret-weapon", "bombardier", "stunty", "dodge"] },
      { key: "trained-troll", name: "Trained Troll", role: "Big Guy", cost: 115_000, max: 2, ma: 4, st: 5, ag: "5+", pa: "5+", av: "10+", skills: ["mighty-blow-plus-1", "throw-team-mate", "projectile-vomit", "really-stupid", "regeneration", "always-hungry", "loner-4-plus"] },
    ],
  },
  {
    id: "wood-elf",
    name: "Wood Elf",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 65_000, max: 16, ma: 7, st: 3, ag: "2+", pa: "3+", av: "8+", skills: [] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 85_000, max: 2, ma: 7, st: 3, ag: "2+", pa: "2+", av: "8+", skills: ["pass", "pro"] },
      { key: "catcher", name: "Catcher", role: "Catcher", cost: 90_000, max: 4, ma: 8, st: 2, ag: "2+", pa: "3+", av: "8+", skills: ["catch", "sprint", "dodge"] },
      { key: "wardancer", name: "Wardancer", role: "Blitzer", cost: 130_000, max: 2, ma: 8, st: 3, ag: "2+", pa: "3+", av: "8+", skills: ["dodge", "block", "leap"] },
      { key: "treeman", name: "Treeman", role: "Big Guy", cost: 120_000, max: 1, ma: 2, st: 6, ag: "5+", pa: "5+", av: "11+", skills: ["strong-arm", "thick-skull", "take-root", "mighty-blow-plus-1", "throw-team-mate", "stand-firm", "loner-4-plus"] },
    ],
  },
];

export function getRaceById(id: string): Race | undefined {
  return RACES.find((race) => race.id === id);
}

/** BB2025 ruleset version marker. */
export const RULES_METADATA = { version: "BB2025" } as const;

