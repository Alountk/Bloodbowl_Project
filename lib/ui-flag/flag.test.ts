import { describe, expect, it } from "vitest";
import { UI_FLAG_COOKIE, resolveUiFlag } from "./flag";

/**
 * ui-refresh UIR-1 resolver tests (style of `lib/auth-mode.test.ts`): a pure
 * function with injectable cookie input — no env, no DOM. The flag is ON iff
 * the `bb-ui` cookie is EXACTLY "next"; everything else (absent, empty,
 * other casing, unknown or malformed values) is OFF and nothing throws.
 */

describe("UI_FLAG_COOKIE", () => {
  it("is the bb-ui cookie key", () => {
    expect(UI_FLAG_COOKIE).toBe("bb-ui");
  });
});

describe("resolveUiFlag", () => {
  it("resolves ON for the exact 'next' value", () => {
    expect(resolveUiFlag("next")).toBe(true);
  });

  it("resolves OFF when the cookie is absent", () => {
    expect(resolveUiFlag()).toBe(false);
    expect(resolveUiFlag(undefined)).toBe(false);
  });

  it("resolves OFF for an explicit null", () => {
    expect(resolveUiFlag(null)).toBe(false);
  });

  it("resolves OFF for an empty value", () => {
    expect(resolveUiFlag("")).toBe(false);
  });

  it("resolves OFF for a differently cased value", () => {
    expect(resolveUiFlag("NEXT")).toBe(false);
    expect(resolveUiFlag("Next")).toBe(false);
  });

  it("resolves OFF for any other value", () => {
    expect(resolveUiFlag("v2")).toBe(false);
    expect(resolveUiFlag("legacy")).toBe(false);
    expect(resolveUiFlag("next-day")).toBe(false);
  });

  it("resolves OFF for padded or otherwise malformed values", () => {
    expect(resolveUiFlag(" next")).toBe(false);
    expect(resolveUiFlag("next ")).toBe(false);
    expect(resolveUiFlag("%6Eext")).toBe(false);
    expect(resolveUiFlag("next\u00A0")).toBe(false);
  });

  it("never throws for hostile input", () => {
    expect(() => resolveUiFlag(undefined)).not.toThrow();
    expect(() => resolveUiFlag(null)).not.toThrow();
    expect(() => resolveUiFlag("\u0000")).not.toThrow();
    expect(() => resolveUiFlag("x".repeat(10_000))).not.toThrow();
  });
});
