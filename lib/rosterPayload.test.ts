import { describe, expect, it } from "vitest";
import {
  MAX_ROSTER_ENTRY_NAME_LENGTH,
  MAX_ROSTER_ID_LENGTH,
  MAX_ROSTER_JSON_BYTES,
  validateRosterPayload,
} from "./rosterPayload";

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: "p1",
    name: "Lineman 1",
    positionalKey: "lineman",
    ...overrides,
  };
}

describe("validateRosterPayload", () => {
  it("accepts a well-formed roster", () => {
    const roster = Array.from({ length: 11 }, (_, i) =>
      entry({ id: `p${i + 1}`, name: `Player ${i + 1}` }),
    );
    const result = validateRosterPayload(roster);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.roster).toHaveLength(11);
  });

  it("rejects a non-array roster", () => {
    expect(validateRosterPayload({ id: "p1" })).toEqual({
      ok: false,
      error: "roster must be an array",
    });
    expect(validateRosterPayload(null).ok).toBe(false);
    expect(validateRosterPayload("nope").ok).toBe(false);
  });

  it("rejects an entry that is not an object", () => {
    expect(validateRosterPayload(["p1"]).ok).toBe(false);
    expect(validateRosterPayload([null]).ok).toBe(false);
  });

  it("rejects missing or non-string identity fields", () => {
    expect(validateRosterPayload([entry({ id: "" })]).ok).toBe(false);
    expect(validateRosterPayload([entry({ id: 42 })]).ok).toBe(false);
    expect(validateRosterPayload([entry({ name: "   " })]).ok).toBe(false);
    expect(validateRosterPayload([entry({ name: 7 })]).ok).toBe(false);
    expect(validateRosterPayload([entry({ positionalKey: "" })]).ok).toBe(false);
  });

  it("rejects ids, names, and positional keys over their caps", () => {
    expect(
      validateRosterPayload([entry({ id: "i".repeat(MAX_ROSTER_ID_LENGTH + 1) })]).ok,
    ).toBe(false);
    expect(
      validateRosterPayload([
        entry({ name: "n".repeat(MAX_ROSTER_ENTRY_NAME_LENGTH + 1) }),
      ]).ok,
    ).toBe(false);
    expect(
      validateRosterPayload([
        entry({ positionalKey: "k".repeat(MAX_ROSTER_ID_LENGTH + 1) }),
      ]).ok,
    ).toBe(false);
  });

  it("rejects malformed optional fields", () => {
    expect(validateRosterPayload([entry({ hired: "yes" })]).ok).toBe(false);
    expect(validateRosterPayload([entry({ pe: -1 })]).ok).toBe(false);
    expect(validateRosterPayload([entry({ pe: Number.NaN })]).ok).toBe(false);
    expect(validateRosterPayload([entry({ hired: true, pe: 3 })]).ok).toBe(true);
  });

  it("rejects a roster whose JSON exceeds the byte cap", () => {
    const huge = [
      entry({
        name: "n".repeat(MAX_ROSTER_ENTRY_NAME_LENGTH),
        // Padding that still passes field checks (extra unknown keys are
        // allowed to be dropped later) but blows the size budget.
        pad: "x".repeat(MAX_ROSTER_JSON_BYTES),
      }),
    ];
    const result = validateRosterPayload(huge);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("exceeds");
  });
});
