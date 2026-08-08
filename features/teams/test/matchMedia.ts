/**
 * Test helper: installs a controllable `window.matchMedia` stub so components
 * that gate on viewport width can be exercised deterministically under jsdom
 * (which ships no `matchMedia`). Returns a `setMatches` control that flips the
 * stubbed `matches` value and dispatches the `change` event to listeners, the
 * same way a real resize would.
 */
type MediaQueryListener = (event: { matches: boolean }) => void;

export function mockMatchMedia(initialMatches: boolean): {
  setMatches(matches: boolean): void;
} {
  let matches = initialMatches;
  const listeners = new Set<MediaQueryListener>();

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: () => ({
      get matches() {
        return matches;
      },
      get media() {
        return "(min-width: 768px)";
      },
      addEventListener: (_type: string, listener: MediaQueryListener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: string, listener: MediaQueryListener) => {
        listeners.delete(listener);
      },
      addListener: (listener: MediaQueryListener) => {
        listeners.add(listener);
      },
      removeListener: (listener: MediaQueryListener) => {
        listeners.delete(listener);
      },
      dispatchEvent: () => true,
      onchange: null,
    }),
  });

  return {
    /** Flips the stub's matches value and notifies every registered listener. */
    setMatches(next: boolean): void {
      if (matches === next) return;
      matches = next;
      listeners.forEach((listener) => listener({ matches }));
    },
  };
}
