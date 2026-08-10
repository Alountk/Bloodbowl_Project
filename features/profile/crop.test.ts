import { describe, expect, it } from "vitest";
import { exportCanvasSize } from "./crop";

/**
 * Contract for the client-side export cap (task 3.1 / R2). The cropped area in
 * source pixels is resized so the larger side never exceeds 1024px, keeping the
 * wire payload inside the server's 2MB cap.
 */
describe("exportCanvasSize", () => {
  it("keeps a cropped area already under 1024px unchanged", () => {
    expect(exportCanvasSize({ width: 600, height: 600 })).toEqual({
      width: 600,
      height: 600,
    });
  });

  it("scales down a square crop whose side exceeds 1024px", () => {
    const size = exportCanvasSize({ width: 2048, height: 2048 });
    expect(size.width).toBeLessThanOrEqual(1024);
    expect(size.height).toBeLessThanOrEqual(1024);
    expect(size.width).toBe(size.height);
  });

  it("caps only the longer side, preserving aspect ratio", () => {
    const size = exportCanvasSize({ width: 3000, height: 2000 });
    // The 3000px side maps to 1024; height follows the same ratio.
    expect(size.width).toBeLessThanOrEqual(1024);
    expect(size.width).toBeGreaterThan(size.height);
  });

  it("returns at least 1x1 for a non-empty area", () => {
    const size = exportCanvasSize({ width: 1, height: 1 });
    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });
});
