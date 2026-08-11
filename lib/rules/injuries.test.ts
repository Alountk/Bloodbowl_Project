import { describe, expect, it } from "vitest";
import {
  resolveInjury,
  permanentAttribute,
  PERMANENT_ATTRIBUTES,
  INJURY_OUTCOMES,
} from "./injuries";
import { weatherFromRoll, WEATHER_KINDS } from "./weather";

describe("injury table (bb2025-rules R5)", () => {
  it("rolls 1-8 as Magullado (bruise)", () => {
    for (const roll of [1, 5, 8]) {
      expect(resolveInjury(roll).kind).toBe("bruise");
    }
  });

  it("rolls 9-10 as Apaleado (misses next match)", () => {
    expect(resolveInjury(9).kind).toBe("apaleado");
    expect(resolveInjury(10).kind).toBe("apaleado");
  });

  it("rolls 11-12 as Herida grave (+PE)", () => {
    expect(resolveInjury(11).kind).toBe("grave");
    expect(resolveInjury(12).kind).toBe("grave");
  });

  it("rolls 13-14 as permanent with the mapped attribute reduction", () => {
    expect(resolveInjury(13).kind).toBe("permanent");
    expect(resolveInjury(14).kind).toBe("permanent");
  });

  it("rolls 15-16 as dead (eliminated)", () => {
    const dead = resolveInjury(15);
    expect(resolveInjury(16).kind).toBe("dead");
    expect(dead.kind).toBe("dead");
  });

  it("maps the permanent 1D6 to the attribute (1-2 -AR, 3 -MV, 4 -PS, 5 -AG, 6 -ST)", () => {
    expect(permanentAttribute(1)).toBe("ar");
    expect(permanentAttribute(2)).toBe("ar");
    expect(permanentAttribute(3)).toBe("mv");
    expect(permanentAttribute(4)).toBe("ps");
    expect(permanentAttribute(5)).toBe("ag");
    expect(permanentAttribute(6)).toBe("st");
  });

  it("adds the LMC +1 modifier to a future permanent roll", () => {
    // no modifier: roll 13 stays within the permanent band [13,14]
    expect(resolveInjury(13).kind).toBe("permanent");
    // with +1, a 13 shifts into 14 (still permanent)
    expect(resolveInjury(13 + 1).kind).toBe("permanent");
    // with +1, a 15 shifts into 16 → dead
    expect(resolveInjury(15 + 1).kind).toBe("dead");
  });

  it("exposes the closed outcome and attribute enums", () => {
    expect(INJURY_OUTCOMES).toEqual(["bruise", "apaleado", "grave", "permanent", "dead"]);
    expect(PERMANENT_ATTRIBUTES).toEqual(["ar", "mv", "ps", "ag", "st"]);
  });
});

describe("weather (bb2025-rules R6)", () => {
  it("returns Calor asfixiante on 2D6 2", () => {
    const w = weatherFromRoll(2);
    expect(w.kind).toBe("heat");
    expect(w.label).toBe("Calor asfixiante");
    expect(w.heatFieldedPlayers).toBe(true);
  });

  it("returns Muy soleado on 3 with a -1 Pass penalty", () => {
    const w = weatherFromRoll(3);
    expect(w.kind).toBe("sunny");
    expect(w.label).toBe("Muy soleado");
    expect(w.passModifier).toBe(-1);
  });

  it("returns Perfecto (no effects) on rolls 4-10", () => {
    for (const roll of [4, 7, 10]) {
      const w = weatherFromRoll(roll);
      expect(w.kind).toBe("perfect");
      expect(w.label).toBe("Perfecto");
      expect(w.passModifier).toBe(0);
      expect(w.catchModifier).toBe(0);
    }
  });

  it("returns Lluvioso on 11 with a -1 catch/pick-up/intercept penalty", () => {
    const w = weatherFromRoll(11);
    expect(w.kind).toBe("rain");
    expect(w.label).toBe("Lluvioso");
    expect(w.catchModifier).toBe(-1);
  });

  it("returns Ventisca on 12 with forced-march -1 and Quick/Short passes only", () => {
    const w = weatherFromRoll(12);
    expect(w.kind).toBe("blizzard");
    expect(w.label).toBe("Ventisca");
    expect(w.forcedMarchModifier).toBe(-1);
    expect(w.passRangeRestriction).toBe("quick-short");
  });

  it("exposes the closed weather kind enum", () => {
    expect(WEATHER_KINDS).toEqual(["heat", "sunny", "perfect", "rain", "blizzard"]);
  });
});
