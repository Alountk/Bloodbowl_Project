import type { Race } from "../types";

export const RACES: Race[] = [
  {
    id: "human",
    name: "Human",
    positionals: [
      { key: "lineman", name: "Lineman", cost: 50_000, max: 16, ma: 6, st: 3, ag: "3+", pa: "4+", av: "8+", skills: [] },
      { key: "thrower", name: "Thrower", cost: 80_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "2+", av: "8+", skills: ["Pass", "Sure Hands"] },
      { key: "blitzer", name: "Blitzer", cost: 90_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Block"] },
      { key: "catcher", name: "Catcher", cost: 65_000, max: 4, ma: 8, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["Catch", "Dodge"] },
      { key: "ogre", name: "Ogre", cost: 140_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "5+", av: "10+", skills: ["Bone Head", "Mighty Blow (+1)", "Thick Skull", "Throw Team-mate", "Loner (4+)"] },
    ],
  },
  {
    id: "orc",
    name: "Orc",
    positionals: [
      { key: "lineman", name: "Lineman", cost: 50_000, max: 16, ma: 5, st: 3, ag: "3+", pa: "4+", av: "9+", skills: [] },
      { key: "thrower", name: "Thrower", cost: 70_000, max: 2, ma: 5, st: 3, ag: "3+", pa: "3+", av: "9+", skills: ["Pass", "Sure Hands"] },
      { key: "blitzer", name: "Blitzer", cost: 80_000, max: 4, ma: 6, st: 3, ag: "3+", pa: "4+", av: "10+", skills: ["Block"] },
      { key: "big-un-blocker", name: "Big Un Blocker", cost: 90_000, max: 4, ma: 5, st: 4, ag: "4+", pa: "4+", av: "10+", skills: [] },
      { key: "goblin", name: "Goblin", cost: 40_000, max: 4, ma: 6, st: 2, ag: "3+", pa: "4+", av: "8+", skills: ["Dodge", "Right Stuff", "Stunty"] },
      { key: "troll", name: "Troll", cost: 115_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "4+", av: "10+", skills: ["Always Hungry", "Loner (4+)", "Mighty Blow (+1)", "Really Stupid", "Regeneration", "Throw Team-mate"] },
    ],
  },
  {
    id: "dwarf",
    name: "Dwarf",
    positionals: [
      { key: "lineman", name: "Lineman", cost: 70_000, max: 16, ma: 4, st: 3, ag: "4+", pa: "4+", av: "10+", skills: ["Block", "Tackle", "Thick Skull"] },
      { key: "blitzer", name: "Blitzer", cost: 80_000, max: 4, ma: 5, st: 3, ag: "3+", pa: "4+", av: "10+", skills: ["Block", "Thick Skull"] },
      { key: "runner", name: "Runner", cost: 85_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Sure Hands", "Thick Skull"] },
      { key: "troll-slayer", name: "Troll Slayer", cost: 95_000, max: 2, ma: 5, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Block", "Dauntless", "Frenzy", "Thick Skull"] },
      { key: "deathroller", name: "Deathroller", cost: 170_000, max: 1, ma: 4, st: 7, ag: "5+", pa: "—", av: "11+", skills: ["Break Tackle", "Dirty Player (+1)", "Juggernaut", "Loner (4+)", "Mighty Blow (+1)", "No Hands", "Secret Weapon", "Stand Firm"] },
    ],
  },
  {
    id: "elven-union",
    name: "Elven Union",
    positionals: [
      { key: "lineman", name: "Lineman", cost: 60_000, max: 16, ma: 6, st: 3, ag: "2+", pa: "4+", av: "8+", skills: [] },
      { key: "thrower", name: "Thrower", cost: 80_000, max: 2, ma: 6, st: 3, ag: "2+", pa: "3+", av: "8+", skills: ["Pass", "Sure Hands"] },
      { key: "catcher", name: "Catcher", cost: 75_000, max: 4, ma: 8, st: 2, ag: "2+", pa: "4+", av: "8+", skills: ["Catch", "Dodge"] },
      { key: "blitzer", name: "Blitzer", cost: 110_000, max: 4, ma: 7, st: 3, ag: "2+", pa: "3+", av: "9+", skills: ["Block", "Sidestep"] },
    ],
  },
  {
    id: "skaven",
    name: "Skaven",
    positionals: [
      { key: "lineman", name: "Lineman", cost: 50_000, max: 16, ma: 7, st: 3, ag: "3+", pa: "4+", av: "8+", skills: [] },
      { key: "thrower", name: "Thrower", cost: 85_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "2+", av: "8+", skills: ["Pass", "Sure Hands"] },
      { key: "gutter-runner", name: "Gutter Runner", cost: 85_000, max: 4, ma: 9, st: 2, ag: "2+", pa: "4+", av: "8+", skills: ["Dodge"] },
      { key: "blitzer", name: "Blitzer", cost: 90_000, max: 2, ma: 7, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Block"] },
      { key: "rat-ogre", name: "Rat Ogre", cost: 150_000, max: 1, ma: 6, st: 5, ag: "4+", pa: "4+", av: "9+", skills: ["Animal Savagery", "Frenzy", "Loner (4+)", "Mighty Blow (+1)", "Prehensile Tail"] },
    ],
  },
  {
    id: "dark-elf",
    name: "Dark Elf",
    positionals: [
      { key: "lineman", name: "Lineman", cost: 70_000, max: 16, ma: 6, st: 3, ag: "2+", pa: "4+", av: "9+", skills: [] },
      { key: "blitzer", name: "Blitzer", cost: 100_000, max: 4, ma: 7, st: 3, ag: "2+", pa: "4+", av: "9+", skills: ["Block"] },
      { key: "runner", name: "Runner", cost: 80_000, max: 2, ma: 7, st: 3, ag: "2+", pa: "3+", av: "8+", skills: ["Dodge"] },
      { key: "assassin", name: "Assassin", cost: 85_000, max: 2, ma: 7, st: 3, ag: "2+", pa: "4+", av: "8+", skills: ["Shadowing", "Stab"] },
      { key: "witch-elf", name: "Witch Elf", cost: 110_000, max: 2, ma: 7, st: 3, ag: "2+", pa: "4+", av: "8+", skills: ["Dodge", "Frenzy", "Jump Up"] },
    ],
  },
  {
    id: "shambling-undead",
    name: "Shambling Undead",
    positionals: [
      { key: "skeleton-lineman", name: "Skeleton Lineman", cost: 40_000, max: 16, ma: 5, st: 3, ag: "4+", pa: "5+", av: "8+", skills: ["Regeneration", "Thick Skull"] },
      { key: "zombie-lineman", name: "Zombie Lineman", cost: 40_000, max: 16, ma: 4, st: 3, ag: "4+", pa: "4+", av: "9+", skills: ["Regeneration"] },
      { key: "ghoul-runner", name: "Ghoul Runner", cost: 75_000, max: 4, ma: 7, st: 3, ag: "3+", pa: "4+", av: "8+", skills: ["Dodge"] },
      { key: "wight-blitzer", name: "Wight Blitzer", cost: 90_000, max: 2, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Block", "Regeneration"] },
      { key: "mummy", name: "Mummy", cost: 125_000, max: 2, ma: 3, st: 5, ag: "5+", pa: "4+", av: "10+", skills: ["Mighty Blow (+1)", "Regeneration"] },
    ],
  },
  {
    id: "chaos-chosen",
    name: "Chaos Chosen",
    positionals: [
      { key: "lineman", name: "Lineman", cost: 60_000, max: 16, ma: 5, st: 3, ag: "3+", pa: "4+", av: "9+", skills: [] },
      { key: "chosen-blocker", name: "Chosen Blocker", cost: 100_000, max: 4, ma: 5, st: 4, ag: "3+", pa: "4+", av: "10+", skills: [] },
      { key: "beastman-runner", name: "Beastman Runner", cost: 60_000, max: 12, ma: 6, st: 3, ag: "3+", pa: "4+", av: "9+", skills: ["Horns"] },
      { key: "chaos-troll", name: "Chaos Troll", cost: 115_000, max: 1, ma: 4, st: 5, ag: "5+", pa: "4+", av: "10+", skills: ["Always Hungry", "Disturbing Presence", "Loner (4+)", "Mighty Blow (+1)", "Really Stupid", "Regeneration", "Throw Team-mate"] },
      { key: "minotaur", name: "Minotaur", cost: 150_000, max: 1, ma: 5, st: 5, ag: "4+", pa: "5+", av: "9+", skills: ["Animal Savagery", "Frenzy", "Horns", "Loner (4+)", "Mighty Blow (+1)", "Thick Skull"] },
    ],
  },
];

export function getRaceById(id: string): Race | undefined {
  return RACES.find((race) => race.id === id);
}
