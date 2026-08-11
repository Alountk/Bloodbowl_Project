import { describe, expect, it, vi, afterEach } from "vitest";
import { rollD3, rollD6, rollD16 } from "./random";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("server-owned dice (bb2025)", () => {
  it("keeps each die within its range", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(rollD3()).toBe(1);
    expect(rollD6()).toBe(1);
    expect(rollD16()).toBe(1);

    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    expect(rollD3()).toBe(3);
    expect(rollD6()).toBe(6);
    expect(rollD16()).toBe(16);
  });
});
