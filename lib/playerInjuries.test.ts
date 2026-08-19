import { describe, expect, it } from "vitest";
import {
  clearSuspensionUpdate,
  injurySuspensionUpdate,
  isLastingBand,
  LASTING_BANDS,
} from "./playerInjuries";

describe("isLastingBand (RAU-12)", () => {
  it("classifies apaleado, grave and permanent as lasting", () => {
    expect(LASTING_BANDS).toEqual(["apaleado", "grave", "permanent"]);
    for (const band of LASTING_BANDS) {
      expect(isLastingBand(band)).toBe(true);
    }
  });

  it("does NOT classify bruise or dead as lasting", () => {
    expect(isLastingBand("bruise")).toBe(false);
    expect(isLastingBand("dead")).toBe(false);
  });

  it("is false for unknown bands (defensive)", () => {
    expect(isLastingBand("mangled")).toBe(false);
    expect(isLastingBand("")).toBe(false);
  });
});

describe("injurySuspensionUpdate (RAU-12 set step)", () => {
  it("flags a lasting-band victim as missing the next match, alive unchanged", () => {
    expect(injurySuspensionUpdate("apaleado", true)).toEqual({ missNextMatch: true, alive: true });
    expect(injurySuspensionUpdate("grave", true)).toEqual({ missNextMatch: true, alive: true });
    expect(injurySuspensionUpdate("permanent", true)).toEqual({ missNextMatch: true, alive: true });
  });

  it("leaves a bruise victim selectable (missNextMatch false), alive unchanged", () => {
    expect(injurySuspensionUpdate("bruise", true)).toEqual({ missNextMatch: false, alive: true });
  });

  it("keeps a dead victim dead with missNextMatch false (the flag is irrelevant once dead)", () => {
    expect(injurySuspensionUpdate("dead", true)).toEqual({ missNextMatch: false, alive: false });
  });
});

describe("clearSuspensionUpdate (RAU-12 clear step)", () => {
  it("returns the shared clear map for a served suspension", () => {
    expect(clearSuspensionUpdate()).toEqual({ missNextMatch: false });
  });
});
