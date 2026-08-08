import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("lowercases and trims a mixed-case email", () => {
    expect(normalizeEmail("  UserA@Test.Local ")).toBe("usera@test.local");
  });

  it("handles an already-lowercase email", () => {
    expect(normalizeEmail("user@test.local")).toBe("user@test.local");
  });

  it("returns an empty string for blank input", () => {
    expect(normalizeEmail("   ")).toBe("");
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(null as unknown as string)).toBe("");
  });
});
