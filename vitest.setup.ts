Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * jsdom has no EventSource. Provide a harmless no-op default so any component
 * that opens an SSE stream in a test that did NOT explicitly stub it (or whose
 * per-test stub was restored by `vi.unstubAllGlobals` in a preceding afterEach)
 * does not crash with `ReferenceError: EventSource is not defined`. Tests that
 * assert SSE behavior still stub a controllable FakeEventSource per test via
 * `vi.stubGlobal("EventSource", ...)`, which overrides this default for that
 * test and is restored back to this no-op on unstub.
 */
class NoopEventSource {
  onopen: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: unknown) => void) | null = null;
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}
Object.assign(globalThis, {
  EventSource: NoopEventSource,
});

/**
 * jsdom does not implement Element.scrollBy. Provide a harmless no-op so
 * carousel code that scrolls a row does not throw in unit tests; tests that
 * assert scroll behavior spy on it via vi.spyOn(Element.prototype, "scrollBy").
 */
if (typeof Element !== "undefined" && typeof Element.prototype.scrollBy !== "function") {
  Object.assign(Element.prototype, {
    scrollBy(): void {},
  });
}

/**
 * jsdom ships no window.matchMedia (vitest's environment never added it).
 * Tests exercise reduced-motion by spying on it:
 * `vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true })`, which
 * throws "can only spy on a function. Received undefined" when the method is
 * absent. Provide an OWN, configurable no-op so vi.spyOn/restore keep working,
 * while keeping every other component at the same observable state as the
 * absent-method world: a desktop jsdom viewport (min-width queries match,
 * max-width and prefers-reduced-motion do not), mirroring useIsDesktop's
 * documented default (desktop=true without matchMedia) and the die tests'
 * default (no reduced motion). Tests needing different matches still replace
 * it per test via spyOn or the mockMatchMedia helper.
 */
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  // Standard desktop viewport for a non-visual jsdom window.
  const JSDOM_VIEWPORT_WIDTH = 1280;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value(query: string): MediaQueryList {
      const matches = (() => {
        const min = /min-width:\s*(\d+)px/.exec(query);
        if (min) return JSDOM_VIEWPORT_WIDTH >= Number(min[1]);
        const max = /max-width:\s*(\d+)px/.exec(query);
        if (max) return JSDOM_VIEWPORT_WIDTH <= Number(max[1]);
        return false; // prefers-reduced-motion, orientation, color scheme, ...
      })();
      return {
        matches,
        media: query,
        onchange: null,
        addListener(): void {},
        removeListener(): void {},
        addEventListener(): void {},
        removeEventListener(): void {},
        dispatchEvent(): boolean {
          return false;
        },
      } as MediaQueryList;
    },
  });
}
