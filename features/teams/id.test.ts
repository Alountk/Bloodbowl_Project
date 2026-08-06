import { describe, expect, it, vi } from "vitest";
import { createId } from "./id";

describe("createId", () => {
  it("returns a non-empty string", () => {
    expect(typeof createId()).toBe("string");
    expect(createId().length).toBeGreaterThan(0);
  });

  it("returns unique ids across calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId()));
    expect(ids.size).toBe(100);
  });

  it("falls back when crypto.randomUUID is unavailable (non-secure context)", () => {
    vi.stubGlobal("crypto", {});
    try {
      const id = createId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
      // Fallback format: <base36 timestamp>-<random suffix>
      expect(id).toMatch(/^[0-9a-z]+-[0-9a-z]+$/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
