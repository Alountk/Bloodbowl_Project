import { describe, expect, it } from "vitest";
import { formatRulebookCost } from "./format";

describe("formatRulebookCost", () => {
  it("formats a 5-digit cost with a thousands space separator", () => {
    expect(formatRulebookCost(50_000)).toBe("50 000");
  });

  it("formats a 6-digit cost as one space group and a 4-digit cost within the thousands boundary", () => {
    expect(formatRulebookCost(170_000)).toBe("170 000");
    expect(formatRulebookCost(5_000)).toBe("5 000");
  });

  it("leaves values under 1000 unchanged", () => {
    expect(formatRulebookCost(900)).toBe("900");
  });
});
