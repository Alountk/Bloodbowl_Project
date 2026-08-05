import type { Race } from "../types";

export const RACES: Race[] = [
  {
    id: "human",
    name: "Human",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: [] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 75_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "3+", av: "9+", skills: ["Sure Hands", "Pass"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 85_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Defensive", "Block"] },
      { key: "catcher", name: "Catcher", role: "Catcher", cost: 75_000, max: 4, ma: 8, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["Catch", "Dodge"] },
      { key: "ogre", name: "Ogre", role: "Big Guy", cost: 140_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: ["Thick Skull", "Really Stupid", "Mighty Blow (+1)", "Throw Team-mate", "Loner (3+)"] },
    ],
  },
  {
    id: "orc",
    name: "Orc",
    rerollCost: 60_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 50_000, max: 16, ma: 5, st: 3, ag: "3+", pa: "4+", av: "10+", skills: [] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 75_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "3+", av: "9+", skills: ["Sure Hands", "Pass"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 85_000, max: 4, ma: 6, st: 3, ag: "3+", pa: "4+", av: "10+", skills: ["Brawler", "Block"] },
      { key: "big-un-blocker", name: "Big Un Blocker", role: "Blocker", cost: 95_000, max: 4, ma: 5, st: 4, ag: "4+", pa: "6+", av: "10+", skills: ["Thick Skull", "Mighty Blow (+1)", "Taunt", "Unchannelled Fury"] },
      { key: "goblin", name: "Goblin", role: "Runner", cost: 40_000, max: 4, ma: 6, st: 2, ag: "3+", pa: "3+", av: "8+", skills: ["Dodge", "Right Stuff", "Stunty", "Titchy"] },
      { key: "troll", name: "Troll", role: "Big Guy", cost: 115_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "5+", av: "10+", skills: ["Mighty Blow (+1)", "Throw Team-mate", "Projectile Vomit", "Really Stupid", "Regeneration", "Always Hungry", "Loner (4+)"] },
    ],
  },
  {
    id: "dwarf",
    name: "Dwarf",
    rerollCost: 60_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 70_000, max: 16, ma: 4, st: 3, ag: "4+", pa: "5+", av: "10+", skills: ["Thick Skull", "Block", "Tackle"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 100_000, max: 4, ma: 5, st: 3, ag: "4+", pa: "4+", av: "10+", skills: ["Defensive", "Arm Bar", "Block", "Thick Skull"] },
      { key: "runner", name: "Runner", role: "Runner", cost: 80_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Thick Skull", "Sprint", "Sure Hands"] },
      { key: "troll-slayer", name: "Troll Slayer", role: "Blitzer", cost: 95_000, max: 2, ma: 5, st: 3, ag: "4+", pa: "5+", av: "9+", skills: ["Dauntless", "Thick Skull", "Frenzy", "Block", "Troll Hatred"] },
      { key: "deathroller", name: "Deathroller", role: "Big Guy", cost: 170_000, max: 1, ma: 5, st: 7, ag: "5+", pa: "—", av: "11+", skills: ["Break Tackle", "Secret Weapon", "No Hands", "Mighty Blow (+1)", "Juggernaut", "Dirty Player (+1)", "Stand Firm", "Loner (4+)"] },
    ],
  },
  {
    id: "elven-union",
    name: "Elven Union",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 65_000, max: 16, ma: 6, st: 3, ag: "2+", pa: "3+", av: "8+", skills: ["Dejada"] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 75_000, max: 2, ma: 6, st: 3, ag: "2+", pa: "2+", av: "8+", skills: ["Pass", "Running Pass"] },
      { key: "catcher", name: "Catcher", role: "Catcher", cost: 100_000, max: 4, ma: 8, st: 3, ag: "2+", pa: "4+", av: "8+", skills: ["Catch", "Nerves of Steel", "Safe Pair of Hands"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 115_000, max: 4, ma: 7, st: 3, ag: "2+", pa: "3+", av: "9+", skills: ["Sidestep", "Block"] },
    ],
  },
  {
    id: "skaven",
    name: "Skaven",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 50_000, max: 16, ma: 7, st: 3, ag: "3+", pa: "4+", av: "8+", skills: [] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 80_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "2+", av: "8+", skills: ["Sure Hands", "Pass"] },
      { key: "gutter-runner", name: "Gutter Runner", role: "Runner", cost: 85_000, max: 4, ma: 9, st: 2, ag: "2+", pa: "4+", av: "8+", skills: ["Stab", "Dodge"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 90_000, max: 2, ma: 8, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Block", "Strip Ball"] },
      { key: "rat-ogre", name: "Rat Ogre", role: "Big Guy", cost: 150_000, max: 1, ma: 6, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["Prehensile Tail", "Animal Savagery", "Frenzy", "Mighty Blow (+1)", "Loner (4+)"] },
    ],
  },
  {
    id: "dark-elf",
    name: "Dark Elf",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 65_000, max: 16, ma: 6, st: 3, ag: "2+", pa: "3+", av: "9+", skills: [] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 105_000, max: 4, ma: 7, st: 3, ag: "2+", pa: "3+", av: "9+", skills: ["Block"] },
      { key: "runner", name: "Runner", role: "Runner", cost: 80_000, max: 2, ma: 7, st: 3, ag: "2+", pa: "3+", av: "8+", skills: ["Pase precipitado", "Patada de despeje"] },
      { key: "assassin", name: "Assassin", role: "Blitzer", cost: 90_000, max: 2, ma: 7, st: 3, ag: "2+", pa: "4+", av: "8+", skills: ["Stab", "Hit and Run", "Shadowing"] },
      { key: "witch-elf", name: "Witch Elf", role: "Blitzer", cost: 110_000, max: 2, ma: 7, st: 3, ag: "2+", pa: "4+", av: "8+", skills: ["Jump Up", "Dodge", "Frenzy"] },
    ],
  },
  {
    id: "shambling-undead",
    name: "Shambling Undead",
    rerollCost: 70_000,
    positionals: [
      { key: "skeleton-lineman", name: "Skeleton Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 5, st: 3, ag: "4+", pa: "6+", av: "8+", skills: ["Thick Skull", "Regeneration"] },
      { key: "zombie-lineman", name: "Zombie Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 4, st: 3, ag: "4+", pa: "6+", av: "9+", skills: ["Low Blow", "Regeneration", "Unchannelled Fury"] },
      { key: "ghoul-runner", name: "Ghoul Runner", role: "Runner", cost: 75_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "3+", av: "8+", skills: ["Dodge", "Regeneration"] },
      { key: "wight-blitzer", name: "Wight Blitzer", role: "Blitzer", cost: 95_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "5+", av: "9+", skills: ["Thick Skull", "Defensive", "Block", "Regeneration"] },
      { key: "mummy", name: "Mummy", role: "Big Guy", cost: 125_000, max: 2, ma: 3, st: 5, ag: "5+", pa: "6+", av: "10+", skills: ["Mighty Blow (+1)", "Regeneration"] },
    ],
  },
  {
    id: "chaos-chosen",
    name: "Chaos Chosen",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 55_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "3+", av: "9+", skills: ["Thick Skull", "Horns"] },
      { key: "chosen-blocker", name: "Chosen Blocker", role: "Blitzer", cost: 100_000, max: 4, ma: 5, st: 4, ag: "3+", pa: "5+", av: "10+", skills: ["Llave de brazo"] },
      { key: "chaos-troll", name: "Chaos Troll", role: "Big Guy", cost: 115_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "5+", av: "10+", skills: ["Mighty Blow (+1)", "Throw Team-mate", "Projectile Vomit", "Really Stupid", "Regeneration", "Always Hungry", "Loner (4+)"] },
      { key: "minotaur", name: "Minotaur", role: "Big Guy", cost: 150_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["Thick Skull", "Horns", "Frenzy", "Mighty Blow (+1)", "Unchannelled Fury", "Loner (4+)"] },
    ],
  },
  {
    id: "chaos-dwarf",
    name: "Chaos Dwarf",
    rerollCost: 70_000,
    positionals: [
      { key: "hobgoblin-lineman", name: "Hobgoblin Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: [] },
      { key: "sneaky-stabba", name: "Sneaky Stabba", role: "Runner", cost: 60_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "5+", av: "8+", skills: ["Apuñalar", "Perseguir"] },
      { key: "chaos-dwarf-blocker", name: "Chaos Dwarf Blocker", role: "Blocker", cost: 70_000, max: 4, ma: 4, st: 3, ag: "4+", pa: "6+", av: "10+", skills: ["Cabeza dura", "Piel férrea", "Placar"] },
      { key: "flamesmith", name: "Flamesmith", role: "Blocker", cost: 80_000, max: 2, ma: 5, st: 3, ag: "4+", pa: "6+", av: "10+", skills: ["Cabeza dura", "Exhalar fuego", "Luchador", "Presencia perturbadora"] },
      { key: "bull-centaur", name: "Bull Centaur", role: "Blitzer", cost: 130_000, max: 2, ma: 6, st: 4, ag: "4+", pa: "6+", av: "10+", skills: ["Cabeza dura", "Esprintar", "Pies firmes", "Tembloroso"] },
      { key: "minotaur", name: "Minotaur", role: "Big Guy", cost: 150_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["Cabeza dura", "Cuernos", "Furia", "Golpe mortífero", "Ira descontrolada", "Solitario (4+)"] },
    ],
  },
  // --- Additional BB2025 races ---
  {
    id: "amazon",
    name: "Amazon",
    rerollCost: 60_000,
    positionals: [
      { key: "linewoman", name: "Linewoman", role: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["Dodge"] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 80_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "3+", av: "8+", skills: ["On the Ball", "Dodge", "Pass", "Safe Pass"] },
      { key: "catcher", name: "Catcher", role: "Catcher", cost: 90_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["Hit and Run", "Jump Up", "Dodge"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 110_000, max: 4, ma: 6, st: 4, ag: "3+", pa: "4+", av: "9+", skills: ["Dodge", "Defensive"] },
    ],
  },
  {
    id: "chaos-renegade",
    name: "Chaos Renegade",
    rerollCost: 70_000,
    positionals: [
      { key: "renegade-lineman", name: "Renegade Human Lineman", role: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Animosity (all)"] },
      { key: "renegade-orc-lineman", name: "Renegade Orc Lineman", role: "Lineman", cost: 50_000, max: 2, ma: 5, st: 3, ag: "3+", pa: "4+", av: "10+", skills: ["Animosity (all)"] },
      { key: "renegade-goblin", name: "Renegade Goblin", role: "Runner", cost: 40_000, max: 2, ma: 6, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["Animosity (all)", "Dodge", "Right Stuff", "Titchy"] },
      { key: "renegade-skaven", name: "Renegade Skaven", role: "Runner", cost: 50_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["Animosity (all)"] },
      { key: "renegade-dark-elf", name: "Renegade Dark Elf", role: "Blitzer", cost: 65_000, max: 2, ma: 6, st: 3, ag: "2+", pa: "3+", av: "9+", skills: ["Animosity (all)"] },
      { key: "chaos-ogre", name: "Chaos Ogre", role: "Big Guy", cost: 140_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: ["Thick Skull", "Really Stupid", "Throw Team-mate", "Loner (4+)"] },
      { key: "renegade-troll", name: "Renegade Troll", role: "Big Guy", cost: 115_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "5+", av: "10+", skills: ["Mighty Blow (+1)", "Throw Team-mate", "Projectile Vomit", "Really Stupid", "Regeneration", "Always Hungry", "Loner (4+)"] },
      { key: "renegade-minotaur", name: "Renegade Minotaur", role: "Big Guy", cost: 150_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["Horns", "Frenzy", "Mighty Blow (+1)", "Loner (4+)"] },
      { key: "renegade-rat-ogre", name: "Renegade Rat Ogre", role: "Big Guy", cost: 150_000, max: 1, ma: 6, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["Prehensile Tail", "Frenzy", "Mighty Blow (+1)", "Loner (4+)"] },
    ],
  },
  {
    id: "halfling",
    name: "Halfling",
    rerollCost: 60_000,
    positionals: [
      { key: "hopeful", name: "Hopeful", role: "Lineman", cost: 30_000, max: 16, ma: 5, st: 2, ag: "3+", pa: "4+", av: "7+", skills: ["Dodge", "Right Stuff", "Titchy"] },
      { key: "catcher", name: "Catcher", role: "Catcher", cost: 55_000, max: 4, ma: 5, st: 2, ag: "3+", pa: "4+", av: "7+", skills: ["Catch", "Sprint", "Dodge", "Right Stuff", "Titchy"] },
      { key: "hefty", name: "Hefty", role: "Blitzer", cost: 50_000, max: 2, ma: 5, st: 2, ag: "3+", pa: "3+", av: "8+", skills: ["Dodge", "Right Stuff", "Sneaky Git"] },
      { key: "treeman", name: "Treeman", role: "Big Guy", cost: 120_000, max: 2, ma: 2, st: 6, ag: "5+", pa: "5+", av: "11+", skills: ["Strong Arm", "Thick Skull", "Take Root", "Mighty Blow (+1)", "Throw Team-mate", "Stand Firm", "Timmm-ber!"] },
    ],
  },
  {
    id: "high-elf",
    name: "High Elf",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 70_000, max: 16, ma: 6, st: 3, ag: "2+", pa: "4+", av: "8+", skills: [] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 100_000, max: 2, ma: 6, st: 3, ag: "2+", pa: "2+", av: "8+", skills: ["Pass", "Sure Hands"] },
      { key: "catcher", name: "Catcher", role: "Catcher", cost: 85_000, max: 4, ma: 8, st: 2, ag: "2+", pa: "4+", av: "8+", skills: ["Catch", "Dodge"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 110_000, max: 4, ma: 7, st: 3, ag: "2+", pa: "3+", av: "9+", skills: ["Block"] },
    ],
  },
  {
    id: "gnome",
    name: "Gnome",
    rerollCost: 50_000,
    positionals: [
      { key: "gnome-lineman", name: "Gnome Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 5, st: 2, ag: "3+", pa: "4+", av: "7+", skills: ["En pie de un salto", "Escurridizo", "Forcejear", "Humanoide bala"] },
      { key: "woodland-fox", name: "Woodland Fox", role: "Runner", cost: 50_000, max: 2, ma: 7, st: 2, ag: "2+", pa: "—", av: "6+", skills: ["Echarse a un lado", "El balón es mío", "Escurridizo", "Esquivar"] },
      { key: "gnome-illusionist", name: "Gnome Illusionist", role: "Thrower", cost: 50_000, max: 2, ma: 5, st: 2, ag: "3+", pa: "3+", av: "7+", skills: ["Embustero", "En pie de un salto", "Escurridizo", "Forcejear"] },
      { key: "gnome-beastmaster", name: "Gnome Beastmaster", role: "Blocker", cost: 55_000, max: 2, ma: 5, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["Defensa", "En pie de un salto", "Escurridizo", "Forcejear"] },
      { key: "altern-forest-treeman", name: "Altern Forest Treeman", role: "Big Guy", cost: 120_000, max: 2, ma: 2, st: 6, ag: "5+", pa: "5+", av: "11+", skills: ["Brazo fuerte", "Cabeza dura", "Echar raíces", "Golpe mortífero", "Lanzar compañero", "Mantenerse firme", "¡Tronco va!"] },
    ],
  },
  {
    id: "bretonnian",
    name: "Bretonnian",
    rerollCost: 50_000,
    positionals: [
      { key: "peasant-lineman", name: "Peasant Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["Bribery & Corruption"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 85_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Defensive", "Block"] },
      { key: "blocker", name: "Blocker", role: "Blocker", cost: 65_000, max: 4, ma: 5, st: 3, ag: "4+", pa: "6+", av: "9+", skills: ["Wrestle", "Thick Skull"] },
      { key: "ogre", name: "Ogre", role: "Big Guy", cost: 140_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: ["Thick Skull", "Really Stupid", "Mighty Blow (+1)", "Throw Team-mate", "Loner (3+)"] },
    ],
  },
  {
    id: "imperial-nobility",
    name: "Imperial Nobility",
    rerollCost: 60_000,
    positionals: [
      { key: "lackey-lineman", name: "Lackey Lineman", role: "Lineman", cost: 45_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["Fend"] },
      { key: "bodyguard", name: "Bodyguard", role: "Blocker", cost: 85_000, max: 4, ma: 5, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Wrestle", "Stand Firm"] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 75_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "2+", av: "9+", skills: ["Pass", "Running Pass"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 90_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Catch", "Block", "Pro"] },
      { key: "ogre", name: "Ogre", role: "Big Guy", cost: 140_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: ["Thick Skull", "Really Stupid", "Mighty Blow (+1)", "Throw Team-mate", "Loner (3+)"] },
    ],
  },
  {
    id: "khorne",
    name: "Khorne",
    rerollCost: 60_000,
    positionals: [
      { key: "marauder", name: "Marauder", role: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["Furia asesina"] },
      { key: "khorne-blocker", name: "Khorne Blocker", role: "Blitzer", cost: 70_000, max: 4, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Thick Skull", "Horns", "Jump Up", "Juggernaut"] },
      { key: "bloodseeker", name: "Bloodseeker", role: "Blitzer", cost: 105_000, max: 4, ma: 5, st: 4, ag: "4+", pa: "6+", av: "10+", skills: ["Furia asesina"] },
      { key: "juggernaut", name: "Juggernaut", role: "Big Guy", cost: 160_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["Frenzy", "Claws", "Mighty Blow (+1)", "Unchannelled Fury", "Loner (4+)"] },
    ],
  },
  {
    id: "lizardmen",
    name: "Lizardmen",
    rerollCost: 70_000,
    positionals: [
      { key: "skink-runner", name: "Skink Runner", role: "Runner", cost: 60_000, max: 16, ma: 8, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["Dodge", "Right Stuff"] },
      { key: "saurus-blocker", name: "Saurus Blocker", role: "Blocker", cost: 90_000, max: 6, ma: 6, st: 4, ag: "5+", pa: "6+", av: "10+", skills: ["Juggernaut", "Unchannelled Fury"] },
      { key: "kroxigor", name: "Kroxigor", role: "Big Guy", cost: 140_000, max: 2, ma: 6, st: 5, ag: "5+", pa: "6+", av: "10+", skills: ["Thick Skull", "Prehensile Tail", "Really Stupid", "Mighty Blow (+1)", "Loner (4+)"] },
    ],
  },
  {
    id: "necromantic-horror",
    name: "Necromantic Horror",
    rerollCost: 70_000,
    positionals: [
      { key: "zombie-lineman", name: "Zombie Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 4, st: 3, ag: "4+", pa: "6+", av: "9+", skills: ["Low Blow", "Regeneration", "Unchannelled Fury"] },
      { key: "werewolf", name: "Werewolf", role: "Runner", cost: 120_000, max: 2, ma: 8, st: 3, ag: "3+", pa: "3+", av: "9+", skills: ["Frenzy", "Claws", "Regeneration"] },
      { key: "flesh-golem", name: "Flesh Golem", role: "Blocker", cost: 110_000, max: 2, ma: 4, st: 4, ag: "4+", pa: "6+", av: "10+", skills: ["Thick Skull", "Stand Firm", "Regeneration", "Unchannelled Fury"] },
      { key: "wraith", name: "Wraith", role: "Blitzer", cost: 85_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "—", av: "9+", skills: ["Foul Appearance", "Sidestep", "No Hands", "Block", "Regeneration"] },
      { key: "ghoul-runner", name: "Ghoul Runner", role: "Runner", cost: 75_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "3+", av: "8+", skills: ["Dodge", "Regeneration"] },
    ],
  },
  {
    id: "norse",
    name: "Norse",
    rerollCost: 60_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["Drunkard", "Thick Skull", "Block", "Unchannelled Fury"] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 95_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "3+", av: "8+", skills: ["Dauntless", "Catch", "Pass", "Strip Ball"] },
      { key: "berserker", name: "Berserker", role: "Blitzer", cost: 90_000, max: 4, ma: 6, st: 3, ag: "3+", pa: "5+", av: "8+", skills: ["Jump Up", "Frenzy", "Block"] },
      { key: "valkyrie", name: "Valkyrie", role: "Blitzer", cost: 95_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "3+", av: "8+", skills: ["Dauntless", "Catch", "Pass", "Strip Ball"] },
      { key: "ulfwerener", name: "Ulfwerener", role: "Big Guy", cost: 105_000, max: 2, ma: 6, st: 4, ag: "4+", pa: "6+", av: "9+", skills: ["Frenzy", "Unchannelled Fury"] },
      { key: "snow-troll", name: "Snow Troll", role: "Big Guy", cost: 140_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["Frenzy", "Claws", "Unchannelled Fury", "Disturbing Presence", "Loner (4+)"] },
    ],
  },
  {
    id: "nurgle",
    name: "Nurgle",
    rerollCost: 60_000,
    positionals: [
      { key: "rotter-lineman", name: "Rotter Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 5, st: 3, ag: "4+", pa: "6+", av: "9+", skills: ["Decay", "Nurgling Infestation"] },
      { key: "pestigor", name: "Pestigor", role: "Runner", cost: 70_000, max: 4, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Thick Skull", "Horns", "Sure Feet", "Regeneration"] },
      { key: "bloater", name: "Bloater", role: "Blocker", cost: 110_000, max: 4, ma: 4, st: 4, ag: "4+", pa: "6+", av: "10+", skills: ["Foul Appearance", "Stand Firm", "Disturbing Presence", "Regeneration", "Unchannelled Fury"] },
      { key: "rotspawn", name: "Rotspawn", role: "Big Guy", cost: 140_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "6+", av: "10+", skills: ["Foul Appearance", "Mighty Blow (+1)", "Disturbing Presence", "Really Stupid", "Regeneration", "Tentacles", "Loner (4+)"] },
    ],
  },
  {
    id: "ogre",
    name: "Ogre",
    rerollCost: 70_000,
    positionals: [
      { key: "gnoblar-lineman", name: "Gnoblar Lineman", role: "Lineman", cost: 15_000, max: 16, ma: 5, st: 1, ag: "3+", pa: "4+", av: "6+", skills: ["Canijo", "Echarse a un lado", "Escurridizo", "Esquivar", "Humanoide bala"] },
      { key: "ogre-blocker", name: "Ogre Blocker", role: "Blocker", cost: 140_000, max: 5, ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: ["Cabeza dura", "Estúpido", "Golpe mortífero", "Lanzar compañero"] },
      { key: "ogre-runt-punter", name: "Ogre Runt Punter", role: "Thrower", cost: 145_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "4+", av: "10+", skills: ["Cabeza dura", "RP", "Chutar compañero", "Estúpido", "Golpe mortífero"] },
    ],
  },
  {
    id: "old-world-alliance",
    name: "Old World Alliance",
    rerollCost: 70_000,
    positionals: [
      { key: "human-lineman", name: "Human Lineman", role: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: [] },
      { key: "dwarf-lineman", name: "Dwarf Lineman", role: "Lineman", cost: 70_000, max: 6, ma: 4, st: 3, ag: "4+", pa: "5+", av: "10+", skills: ["Thick Skull", "Block", "Tackle"] },
      { key: "halfling-hopeful", name: "Halfling Hopeful", role: "Lineman", cost: 30_000, max: 4, ma: 5, st: 2, ag: "3+", pa: "4+", av: "7+", skills: ["Dodge", "Right Stuff", "Titchy"] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 75_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "3+", av: "9+", skills: ["Sure Hands", "Pass"] },
      { key: "blitzer", name: "Blitzer", role: "Blitzer", cost: 85_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Defensive", "Block"] },
      { key: "ogre", name: "Ogre", role: "Big Guy", cost: 140_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: ["Thick Skull", "Really Stupid", "Mighty Blow (+1)", "Throw Team-mate", "Loner (3+)"] },
    ],
  },
  {
    id: "snotling",
    name: "Snotling",
    rerollCost: 70_000,
    positionals: [
      { key: "snotling", name: "Snotling", role: "Lineman", cost: 15_000, max: 16, ma: 5, st: 1, ag: "3+", pa: "4+", av: "6+", skills: ["Dodge", "Right Stuff", "Side Step", "Titchy", "Swarming"] },
      { key: "fun-hoppa", name: "Fun Hoppa", role: "Runner", cost: 20_000, max: 4, ma: 6, st: 1, ag: "3+", pa: "4+", av: "6+", skills: ["Side Step", "Dodge", "Right Stuff", "Pogo Stick"] },
      { key: "stilty-runna", name: "Stilty Runna", role: "Runner", cost: 20_000, max: 4, ma: 6, st: 1, ag: "3+", pa: "4+", av: "6+", skills: ["Side Step", "Sprint", "Dodge", "Right Stuff"] },
      { key: "pump-wagon", name: "Pump Wagon", role: "Big Guy", cost: 100_000, max: 2, ma: 5, st: 5, ag: "5+", pa: "6+", av: "9+", skills: ["Mighty Blow (+1)", "Juggernaut", "Dirty Player (+1)", "Stand Firm"] },
      { key: "trained-troll", name: "Trained Troll", role: "Big Guy", cost: 115_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "5+", av: "10+", skills: ["Mighty Blow (+1)", "Throw Team-mate", "Projectile Vomit", "Really Stupid", "Regeneration", "Always Hungry", "Loner (4+)"] },
    ],
  },
  {
    id: "tomb-kings",
    name: "Tomb Kings",
    rerollCost: 60_000,
    positionals: [
      { key: "skeleton-lineman", name: "Skeleton Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 5, st: 3, ag: "4+", pa: "6+", av: "8+", skills: ["Thick Skull", "Regeneration"] },
      { key: "thro-ra", name: "Thro-Ra", role: "Thrower", cost: 65_000, max: 2, ma: 6, st: 3, ag: "4+", pa: "3+", av: "9+", skills: ["Thick Skull", "Sure Hands", "Pass", "Regeneration"] },
      { key: "blitz-ra", name: "Blitz-Ra", role: "Blitzer", cost: 85_000, max: 4, ma: 6, st: 3, ag: "4+", pa: "5+", av: "9+", skills: ["Thick Skull", "Block", "Regeneration"] },
      { key: "tomb-guardian", name: "Tomb Guardian", role: "Blocker", cost: 115_000, max: 4, ma: 4, st: 5, ag: "5+", pa: "6+", av: "10+", skills: ["Decay", "Brawler", "Regeneration"] },
    ],
  },
  {
    id: "underworld-denizens",
    name: "Underworld Denizens",
    rerollCost: 70_000,
    positionals: [
      { key: "underworld-goblin", name: "Underworld Goblin Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 6, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["Dodge", "Right Stuff", "Stunty", "Titchy"] },
      { key: "skaven-lineman", name: "Skaven Lineman", role: "Lineman", cost: 50_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["Animosity (Goblin)"] },
      { key: "skaven-thrower", name: "Skaven Thrower", role: "Thrower", cost: 80_000, max: 1, ma: 7, st: 3, ag: "3+", pa: "2+", av: "8+", skills: ["Animosity (Goblin)", "Sure Hands", "Pass"] },
      { key: "skaven-blitzer", name: "Skaven Blitzer", role: "Blitzer", cost: 90_000, max: 1, ma: 8, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Animosity (Goblin)", "Block", "Strip Ball"] },
      { key: "mutant-rat-ogre", name: "Mutant Rat Ogre", role: "Big Guy", cost: 150_000, max: 1, ma: 6, st: 5, ag: "4+", pa: "6+", av: "9+", skills: ["Prehensile Tail", "Animal Savagery", "Frenzy", "Mighty Blow (+1)", "Loner (4+)"] },
    ],
  },
  {
    id: "vampire",
    name: "Vampire",
    rerollCost: 60_000,
    positionals: [
      { key: "thrall-lineman", name: "Thrall Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: [] },
      { key: "vampire-runner", name: "Vampire Runner", role: "Runner", cost: 100_000, max: 2, ma: 8, st: 3, ag: "2+", pa: "3+", av: "8+", skills: ["Hypnotic Gaze", "Regeneration", "Blood Lust (2+)"] },
      { key: "vampire-thrower", name: "Vampire Thrower", role: "Thrower", cost: 110_000, max: 2, ma: 6, st: 4, ag: "2+", pa: "2+", av: "9+", skills: ["Hypnotic Gaze", "Pass", "Regeneration", "Blood Lust (2+)"] },
      { key: "vampire-blitzer", name: "Vampire Blitzer", role: "Blitzer", cost: 110_000, max: 2, ma: 6, st: 4, ag: "2+", pa: "4+", av: "9+", skills: ["Juggernaut", "Hypnotic Gaze", "Regeneration", "Blood Lust (3+)"] },
      { key: "vargheist", name: "Vargheist", role: "Big Guy", cost: 150_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "6+", av: "10+", skills: ["Frenzy", "Claws", "Regeneration", "Blood Lust (3+)", "Loner (4+)"] },
    ],
  },
  {
    id: "black-orc",
    name: "Black Orc",
    rerollCost: 60_000,
    positionals: [
      { key: "goblin-bruiser", name: "Goblin Bruiser Lineman", role: "Lineman", cost: 45_000, max: 16, ma: 6, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["Thick Skull", "Right Stuff", "Dodge", "Titchy"] },
      { key: "black-orc-blocker", name: "Black Orc Blocker", role: "Blocker", cost: 90_000, max: 6, ma: 4, st: 4, ag: "4+", pa: "5+", av: "10+", skills: ["Grab", "Brawler"] },
      { key: "trained-troll", name: "Trained Troll", role: "Big Guy", cost: 115_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "5+", av: "10+", skills: ["Mighty Blow (+1)", "Throw Team-mate", "Projectile Vomit", "Really Stupid", "Regeneration", "Always Hungry", "Loner (4+)"] },
    ],
  },
  {
    id: "goblin",
    name: "Goblin",
    rerollCost: 80_000,
    positionals: [
      { key: "goblin-lineman", name: "Goblin Lineman", role: "Lineman", cost: 40_000, max: 16, ma: 6, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["Dodge", "Right Stuff", "Stunty", "Titchy"] },
      { key: "fanatic", name: "Fanatic", role: "Blitzer", cost: 70_000, max: 1, ma: 3, st: 7, ag: "3+", pa: "—", av: "8+", skills: ["Secret Weapon", "Ball & Chain", "No Hands", "Stunty"] },
      { key: "loony", name: "Loony", role: "Blitzer", cost: 40_000, max: 1, ma: 6, st: 2, ag: "3+", pa: "—", av: "8+", skills: ["Secret Weapon", "Stunty", "No Hands", "Chainsaw"] },
      { key: "pogoer", name: "Pogoer", role: "Runner", cost: 75_000, max: 1, ma: 7, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["Dodge", "Right Stuff", "Pogo Stick"] },
      { key: "bombardier", name: "Bombardier", role: "Thrower", cost: 45_000, max: 1, ma: 6, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["Secret Weapon", "Bombardier", "Stunty", "Dodge"] },
      { key: "trained-troll", name: "Trained Troll", role: "Big Guy", cost: 115_000, max: 2, ma: 4, st: 5, ag: "5+", pa: "5+", av: "10+", skills: ["Mighty Blow (+1)", "Throw Team-mate", "Projectile Vomit", "Really Stupid", "Regeneration", "Always Hungry", "Loner (4+)"] },
    ],
  },
  {
    id: "wood-elf",
    name: "Wood Elf",
    rerollCost: 50_000,
    positionals: [
      { key: "lineman", name: "Lineman", role: "Lineman", cost: 65_000, max: 16, ma: 7, st: 3, ag: "2+", pa: "3+", av: "8+", skills: [] },
      { key: "thrower", name: "Thrower", role: "Thrower", cost: 85_000, max: 2, ma: 7, st: 3, ag: "2+", pa: "2+", av: "8+", skills: ["Pass", "Pro"] },
      { key: "catcher", name: "Catcher", role: "Catcher", cost: 90_000, max: 4, ma: 8, st: 2, ag: "2+", pa: "3+", av: "8+", skills: ["Catch", "Sprint", "Dodge"] },
      { key: "wardancer", name: "Wardancer", role: "Blitzer", cost: 130_000, max: 2, ma: 8, st: 3, ag: "2+", pa: "3+", av: "8+", skills: ["Dodge", "Block", "Leap"] },
      { key: "treeman", name: "Treeman", role: "Big Guy", cost: 120_000, max: 1, ma: 2, st: 6, ag: "5+", pa: "5+", av: "11+", skills: ["Strong Arm", "Thick Skull", "Take Root", "Mighty Blow (+1)", "Throw Team-mate", "Stand Firm", "Loner (4+)"] },
    ],
  },
];

export function getRaceById(id: string): Race | undefined {
  return RACES.find((race) => race.id === id);
}

/** BB2025 ruleset version marker. */
export const RULES_METADATA = { version: "BB2025" } as const;

