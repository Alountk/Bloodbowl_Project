/**
 * Auth-mode switch.
 *
 * The application can run in two modes:
 * - `local` (default): authentication is DISABLED. No session is expected, the
 *   proxy gate allows every route, and the store falls back to LocalStorage.
 *   This is the anonymous mode used by existing unit/e2e suites.
 * - `auth`: authentication is ENABLED. The proxy gates all application routes
 *   and the store uses the user-scoped API.
 *
 * Production/CI must set `AUTH_MODE=auth` (documented in README/ops notes).
 */

export type AuthMode = "local" | "auth";

export function isAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = (env.AUTH_MODE ?? "local").toLowerCase();
  return raw === "auth";
}

/**
 * A pure decision for proxy route gating.
 *
 * @returns "allow" to continue, "redirect-login" when an unauthenticated user
 *   hits a protected route, or "redirect-home" when an authenticated user hits
 *   an auth-only page.
 */
export function resolveAuthGate(params: {
  auth: unknown;
  pathname: string;
  authEnabled: boolean;
}): "allow" | "redirect-login" | "redirect-home" {
  if (!params.authEnabled) return "allow";

  const isAuthenticated = params.auth != null;
  const isAuthPage = params.pathname === "/login" || params.pathname === "/signup";

  if (isAuthenticated && isAuthPage) return "redirect-home";
  if (!isAuthenticated && !isAuthPage) return "redirect-login";
  return "allow";
}
