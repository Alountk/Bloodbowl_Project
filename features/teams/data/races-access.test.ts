import { describe, expect, it } from "vitest";
import { RACES } from "./races";

/**
 * Valid BB2025 skill-access letters (user-validated random-table categories):
 * A=Agilidad, F=Fuerza, G=Generales, M=Mutación, P=Pase, T=Triquiñuelas.
 * TourPlay exposes the same categories as G/A/S/P/M/D, where S=Strength and
 * D=Devious; both are normalized onto this set (S→F, D→T).
 */
const VALID_LETTERS = ["A", "F", "G", "M", "P", "T"] as const;
/** Canonical display order. */
const CANONICAL_ORDER: Record<string, number> = { A: 0, F: 1, G: 2, M: 3, P: 4, T: 5 };

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

  it("restricts every access letter to {A,F,G,M,P,T} across all races", () => {
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

  it("orders each access array canonically A→F→G→M→P→T", () => {
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

describe("Human access (TourPlay reference)", () => {
  it("matches exact POSICIÓN → PRIMARIAS/SECUNDARIAS", () => {
    expect(RACES.find((r) => r.id === "human")!.positionals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "lineman",
          accessPrimary: ["G"],
          accessSecondary: ["A", "F", "T"],
        }),
        expect.objectContaining({
          key: "thrower",
          accessPrimary: ["G", "P"],
          accessSecondary: ["A", "F", "T"],
        }),
        expect.objectContaining({
          key: "blitzer",
          accessPrimary: ["F", "G"],
          accessSecondary: ["A", "T"],
        }),
        expect.objectContaining({
          key: "catcher",
          accessPrimary: ["A", "G"],
          accessSecondary: ["F", "P", "T"],
        }),
        expect.objectContaining({
          key: "ogre",
          accessPrimary: ["F"],
          accessSecondary: ["A", "G"],
        }),
      ]),
    );
  });
});

describe("Orc access (TourPlay reference)", () => {
  it("matches exact POSICIÓN → PRIMARIAS/SECUNDARIAS", () => {
    expect(RACES.find((r) => r.id === "orc")!.positionals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "lineman",
          accessPrimary: ["F", "G"],
          accessSecondary: ["A", "T"],
        }),
        expect.objectContaining({
          key: "thrower",
          accessPrimary: ["G", "P"],
          accessSecondary: ["A", "F", "T"],
        }),
        expect.objectContaining({
          key: "blitzer",
          accessPrimary: ["F", "G"],
          accessSecondary: ["A", "T"],
        }),
        expect.objectContaining({
          key: "big-un-blocker",
          accessPrimary: ["F", "G"],
          accessSecondary: ["A", "T"],
        }),
        expect.objectContaining({
          key: "goblin",
          accessPrimary: ["A", "T"],
          accessSecondary: ["F", "G", "P"],
        }),
        expect.objectContaining({
          key: "troll",
          accessPrimary: ["F"],
          accessSecondary: ["A", "G", "P"],
        }),
      ]),
    );
  });
});

describe("Dwarf access (TourPlay reference)", () => {
  it("matches exact POSICIÓN → PRIMARIAS/SECUNDARIAS", () => {
    expect(RACES.find((r) => r.id === "dwarf")!.positionals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "lineman",
          accessPrimary: ["G", "T"],
          accessSecondary: ["F"],
        }),
        expect.objectContaining({
          key: "blitzer",
          accessPrimary: ["F", "G"],
          accessSecondary: ["P"],
        }),
        expect.objectContaining({
          key: "runner",
          accessPrimary: ["G", "P"],
          accessSecondary: ["A", "F"],
        }),
        expect.objectContaining({
          key: "troll-slayer",
          accessPrimary: ["F", "G"],
          accessSecondary: ["T"],
        }),
        expect.objectContaining({
          key: "deathroller",
          accessPrimary: ["F", "T"],
          accessSecondary: ["G"],
        }),
      ]),
    );
  });
});
