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
Object.assign(globalThis, { EventSource: NoopEventSource });
