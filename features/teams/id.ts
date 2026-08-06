/**
 * Generates a unique identifier.
 *
 * `crypto.randomUUID()` is only available in secure contexts (https or
 * localhost), so it fails when the app is served over plain http on a LAN IP
 * during development. Falls back to a timestamp + random suffix in those
 * cases.
 */
export function createId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
