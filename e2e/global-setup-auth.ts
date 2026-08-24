/**
 * Warm-up for the real-DB auth E2E (globalSetup).
 *
 * The first tests of a run hit a freshly booted `next dev` (Turbopack) while up
 * to 4 parallel workers pile in; on-demand route compilation under that
 * contention stalled the landing-page waits at run start (signOut POST slow,
 * heading not yet rendered). Pre-compiling the main page routes AND the Auth.js
 * API surface here — after the webServer is up — removes that cold-start spike
 * deterministically.
 */
import { request } from "@playwright/test";

export default async function globalSetup() {
  const baseURL = "http://localhost:3000";
  const warmupEmail = `warmup-${Date.now()}@test.local`;
  const ctx = await request.newContext({ baseURL });
  try {
    // Page routes.
    await Promise.all(
      ["/", "/login", "/signup", "/teams/create", "/leagues"].map((p) =>
        ctx.get(p).catch(() => undefined),
      ),
    );
    // Auth.js API surface: the signup POST + signout POST are the two routes the
    // first spec exercises under load; compiling them here (plus the session and
    // csrf reads) removes the cold-start signOut stall. The throwaway user is a
    // per-run row in the never-wiped DB, exactly like every spec's own account.
    await Promise.all([
      ctx.get("/api/auth/csrf").catch(() => undefined),
      ctx.get("/api/auth/session").catch(() => undefined),
      ctx
        .post("/api/auth/signup", {
          data: { name: "warmup", email: warmupEmail, password: "warmup-password" },
        })
        .catch(() => undefined),
      ctx.post("/api/auth/signout", { data: {} }).catch(() => undefined),
    ]);
  } finally {
    await ctx.dispose();
  }
}
