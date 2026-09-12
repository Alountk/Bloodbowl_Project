import { describe, expect, it } from "vitest";
import { isOwnerEquivalent } from "./access";

const league = { ownerId: "u1" };

describe("isOwnerEquivalent (LAC-2 / LAC-5)", () => {
  it("treats the owner as owner-equivalent regardless of role", () => {
    expect(isOwnerEquivalent(league, "u1", "user")).toBe(true);
    expect(isOwnerEquivalent(league, "u1", null)).toBe(true);
  });

  it("treats a non-owner developer/admin as owner-equivalent", () => {
    expect(isOwnerEquivalent(league, "dev", "developer")).toBe(true);
    expect(isOwnerEquivalent(league, "adm", "admin")).toBe(true);
  });

  it("never treats a plain user as owner-equivalent", () => {
    expect(isOwnerEquivalent(league, "u2", "user")).toBe(false);
    expect(isOwnerEquivalent(league, "u2", null)).toBe(false);
    expect(isOwnerEquivalent(league, "u2", "mystery")).toBe(false);
  });

  it("handles an anonymous session without an owner match", () => {
    expect(isOwnerEquivalent(league, undefined, undefined)).toBe(false);
    // A privileged JWT snapshot still counts even with no user id (display-only).
    expect(isOwnerEquivalent(league, undefined, "admin")).toBe(true);
  });
});
