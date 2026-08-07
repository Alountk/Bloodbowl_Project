import { describe, expect, it } from "vitest";
import { RACES } from "./races";

/** Valid BB2025 skill-access letters. F = Fitness is a real rulebook category. */
const VALID_LETTERS = ["G", "A", "P", "S", "M", "F"] as const;
/** Canonical display order. */
const CANONICAL_ORDER: Record<string, number> = { G: 0, A: 1, P: 2, S: 3, M: 4, F: 5 };

describe("Positional skill-access invariants (all races)", () => {
  it("declares both access arrays on every positional across all races", () => {
    const withoutPrimary = RACES.flatMap((race) =>
      race.positionals
        .filter((p) => !Array.isArray(p.accessPrimary))
        .map((p) => `${race.id}/${p.key}:accessPrimary`),
    );
    const withoutSecondary = RACES.flatMap((race) =>
      race.positionals
        .filter((p) => !Array.isArray(p.accessSecondary))
        .map((p) => `${race.id}/${p.key}:accessSecondary`),
    );
    expect(withoutPrimary).toEqual([]);
    expect(withoutSecondary).toEqual([]);
  });

  it("restricts every access letter to {G,A,P,S,M,F} across all races", () => {
    const bad: string[] = [];
    for (const race of RACES) {
      for (const p of race.positionals) {
        for (const l of [...p.accessPrimary, ...p.accessSecondary]) {
          if (!VALID_LETTERS.includes(l as (typeof VALID_LETTERS)[number])) {
            bad.push(`${race.id}/${p.key}:${l}`);
          }
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("keeps each access array free of duplicates", () => {
    const dupes: string[] = [];
    for (const race of RACES) {
      for (const p of race.positionals) {
        for (const arr of [p.accessPrimary, p.accessSecondary]) {
          if (new Set(arr).size !== arr.length) dupes.push(`${race.id}/${p.key}`);
        }
      }
    }
    expect(dupes).toEqual([]);
  });

  it("orders each access array canonically G→A→P→S→M→F", () => {
    const outOfOrder: string[] = [];
    for (const race of RACES) {
      for (const p of race.positionals) {
        for (const arr of [p.accessPrimary, p.accessSecondary]) {
          for (let i = 1; i < arr.length; i++) {
            if (CANONICAL_ORDER[arr[i - 1]] > CANONICAL_ORDER[arr[i]]) {
              outOfOrder.push(`${race.id}/${p.key}:${arr.join("")}`);
              break;
            }
          }
        }
      }
    }
    expect(outOfOrder).toEqual([]);
  });

  it("never lets min exceed max when min is present", () => {
    const violations: string[] = [];
    for (const race of RACES) {
      for (const p of race.positionals) {
        if (p.min !== undefined && p.min > p.max) {
          violations.push(`${race.id}/${p.key}:${p.min}>${p.max}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("treats an absent min as 0 and never lets the default exceed max", () => {
    const violations: string[] = [];
    for (const race of RACES) {
      for (const p of race.positionals) {
        if (p.min === undefined && 0 > p.max) violations.push(`${race.id}/${p.key}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe("Human access (OCR page 180, high-confidence reference)", () => {
  it("matches exact POSICIÓN → PRIMARIAS/SECUNDARIAS", () => {
    expect(RACES.find((r) => r.id === "human")!.positionals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "lineman",
          accessPrimary: ["G"],
          accessSecondary: ["A", "F"],
        }),
        expect.objectContaining({
          key: "thrower",
          accessPrimary: ["G", "P"],
          accessSecondary: ["A", "F"],
        }),
        expect.objectContaining({
          key: "blitzer",
          accessPrimary: ["G", "F"],
          accessSecondary: ["A"],
        }),
        expect.objectContaining({
          key: "catcher",
          accessPrimary: ["G", "A"],
          accessSecondary: ["P"],
        }),
        expect.objectContaining({
          key: "ogre",
          accessPrimary: ["F"],
          accessSecondary: ["G", "A", "M"],
        }),
      ]),
    );
  });
});

describe("Orc access (OCR page 189, high-confidence reference)", () => {
  it("matches exact POSICIÓN → PRIMARIAS/SECUNDARIAS", () => {
    expect(RACES.find((r) => r.id === "orc")!.positionals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "lineman",
          accessPrimary: ["G"],
          accessSecondary: ["A"],
        }),
        expect.objectContaining({
          key: "thrower",
          accessPrimary: ["G", "P"],
          accessSecondary: ["A", "F"],
        }),
        expect.objectContaining({
          key: "blitzer",
          accessPrimary: ["G", "F"],
          accessSecondary: ["A"],
        }),
        expect.objectContaining({
          key: "big-un-blocker",
          accessPrimary: ["G", "F"],
          accessSecondary: ["A"],
        }),
        expect.objectContaining({
          key: "goblin",
          accessPrimary: ["A"],
          accessSecondary: ["G", "P", "F"],
        }),
        expect.objectContaining({
          key: "troll",
          accessPrimary: ["F"],
          accessSecondary: ["G", "A", "P"],
        }),
      ]),
    );
  });
});

describe("Dwarf access (OCR page 175, high-confidence reference)", () => {
  it("matches exact POSICIÓN → PRIMARIAS/SECUNDARIAS", () => {
    expect(RACES.find((r) => r.id === "dwarf")!.positionals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "lineman",
          accessPrimary: ["G"],
          accessSecondary: ["F"],
        }),
        expect.objectContaining({
          key: "runner",
          accessPrimary: ["G", "P"],
          accessSecondary: ["F"],
        }),
        expect.objectContaining({
          key: "blitzer",
          accessPrimary: ["G", "F"],
          accessSecondary: ["P"],
        }),
        expect.objectContaining({
          key: "troll-slayer",
          accessPrimary: ["G", "F"],
          accessSecondary: [],
        }),
        expect.objectContaining({
          key: "deathroller",
          accessPrimary: ["F"],
          accessSecondary: [],
        }),
      ]),
    );
  });
});
