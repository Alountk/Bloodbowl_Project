/**
 * Warm-up for the real-DB auth E2E (globalSetup).
 *
 * The first tests of a run hit a freshly booted `next dev` (Turbopack) while up
 * to 4 parallel workers pile in; on-demand route compilation under that
 * contention stalled the landing-page waits at run start (signOut slow, heading
 * not yet rendered). Pre-compiling the main routes here — after the webServer
 * is up — removes that cold-start spike deterministically.
 */
import { request } from "@playwright/test";

export default async function globalSetup() {
  const warmPaths = ["/", "/login", "/signup", "/teams/create", "/leagues"];
  const ctx = await request.newContext({ baseURL: "http://localhost:3000" });
  try {
    // Best-effort: a redirect/error on any route still compiles it in dev.
    await Promise.all(warmPaths.map((p) => ctx.get(p).catch(() => undefined)));
  } finally {
    await ctx.dispose();
  }
}
