import { describe, expect, it } from "vitest";
import {
  isPasswordAcceptable,
  isPasswordLongEnough,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  PASSWORD_SALT_ROUNDS,
} from "./password";

describe("isPasswordLongEnough (the shared minimum)", () => {
  it("enforces the shared minimum length", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(isPasswordLongEnough("")).toBe(false);
    expect(isPasswordLongEnough("short7")).toBe(false);
    expect(isPasswordLongEnough("12345678")).toBe(true);
    expect(isPasswordLongEnough("SuperSecret123!")).toBe(true);
  });

  it("keeps the signup salt-rounds constant available to both routes", () => {
    expect(PASSWORD_SALT_ROUNDS).toBe(10);
  });
});

describe("isPasswordAcceptable (min AND max)", () => {
  it("accepts lengths inside the bounded window", () => {
    expect(MAX_PASSWORD_LENGTH).toBe(128);
    expect(isPasswordAcceptable("12345678")).toBe(true);
    expect(isPasswordAcceptable("a".repeat(MAX_PASSWORD_LENGTH))).toBe(true);
  });

  it("rejects too-short and too-long passwords", () => {
    expect(isPasswordAcceptable("short")).toBe(false);
    expect(isPasswordAcceptable("a".repeat(MAX_PASSWORD_LENGTH + 1))).toBe(false);
    // bcrypt only hashes 72 bytes — longer is pure CPU burn.
    expect(isPasswordAcceptable("x".repeat(10_000))).toBe(false);
  });
});
