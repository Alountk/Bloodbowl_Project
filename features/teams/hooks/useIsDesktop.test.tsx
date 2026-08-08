import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { mockMatchMedia } from "../test/matchMedia";
import { useIsDesktop } from "./useIsDesktop";

afterEach(() => {
  vi.restoreAllMocks();
  // Remove the matchMedia stub installed by mockMatchMedia.
  // @ts-expect-error cleanup restores the pristine jsdom window.
  delete window.matchMedia;
});

describe("useIsDesktop", () => {
  it("defaults to true (desktop) when matchMedia is unavailable", () => {
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it("stays true when matchMedia reports a desktop-width viewport", () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
  });

  it("flips to false when matchMedia reports a mobile-width viewport", () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
  });

  it("reacts to a matchMedia change event (mobile -> desktop)", () => {
    const { setMatches } = mockMatchMedia(false);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(false);
    act(() => setMatches(true));
    expect(result.current).toBe(true);
  });

  it("reacts to a matchMedia change event (desktop -> mobile)", () => {
    const { setMatches } = mockMatchMedia(true);
    const { result } = renderHook(() => useIsDesktop());
    expect(result.current).toBe(true);
    act(() => setMatches(false));
    expect(result.current).toBe(false);
  });

  it("removes its change listener when the hook unmounts", () => {
    const removeEventListener = vi.fn();
    const addEventListener = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: () => ({
        matches: false,
        media: "(min-width: 768px)",
        addEventListener,
        removeEventListener,
        onchange: null,
      }),
    });

    const { unmount } = renderHook(() => useIsDesktop());
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    unmount();
    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
