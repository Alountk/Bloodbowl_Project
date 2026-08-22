import { describe, expect, it } from "vitest";
import {
  isPasswordLongEnough,
  MIN_PASSWORD_LENGTH,
  PASSWORD_SALT_ROUNDS,
} from "./password";

describe("isPasswordLongEnough (the single account-password rule)", () => {
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
