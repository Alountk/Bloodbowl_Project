/**
 * Auth-mode switch.
 *
 * The application can run in two modes:
 * - `local` (default): authentication is DISABLED. No session is expected, the
 *   proxy gate allows every route, and the store falls back to LocalStorage.
 *   This is the anonymous mode used by existing unit/e2e suites.
 * - `auth`: authentication is ENABLED. The proxy gates all application routes
 *   AND protected `/api/*` paths (401 JSON, not a redirect), and the store
 *   uses the user-scoped API.
 *
 * Production/CI must set `AUTH_MODE=auth` (documented in README/ops notes).
 */

export type AuthMode = "local" | "auth";

export function isAuthEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = (env.AUTH_MODE ?? "local").toLowerCase();
  return raw === "auth";
}

/**
 * API paths the proxy must never deny: Auth.js itself, the public
 * capability-token share reads, and the logout cookie-clear helper. Kept in
 * sync with the `proxy.ts` matcher allowlist.
 */
export function isPublicApiPath(pathname: string): boolean {
  return (
    pathname === "/api/auth" ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/watch" ||
    pathname.startsWith("/api/watch/") ||
    pathname === "/api/logout"
  );
}

/** True for any `/api` path (exactly `/api` or `/api/...`). */
export function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

/**
 * A pure decision for proxy route gating.
 *
 * @returns "allow" to continue, "redirect-login" when an unauthenticated user
 *   hits a protected page route, "redirect-home" when an authenticated user
 *   hits an auth-only page, or "deny-api" when an unauthenticated user hits a
 *   protected API path (the caller must answer 401 JSON, never redirect).
 *   The root path "/" is public: anonymous users reach the Landing there
 *   instead of being bounced to /login.
 */
export function resolveAuthGate(params: {
  auth: unknown;
  pathname: string;
  authEnabled: boolean;
}): "allow" | "redirect-login" | "redirect-home" | "deny-api" {
  if (!params.authEnabled) return "allow";

  const isAuthenticated = params.auth != null;
  const isAuthPage = params.pathname === "/login" || params.pathname === "/signup";
  // The public landing: anonymous users may reach "/" (the page itself renders
  // the Landing for them). Every other protected route keeps redirecting.
  const isPublicLanding = params.pathname === "/";
  // RAU-7: the public share prefix — `/watch` and any `/watch/*` path is open to
  // BOTH anonymous guests and authenticated coaches (a logged-in coach must
  // still be able to open a share link). A path that merely starts with the word
  // (e.g. `/watchdog`) is NOT the prefix and stays protected.
  const isPublicShare = params.pathname === "/watch" || params.pathname.startsWith("/watch/");
  const isPublic = isPublicLanding || isPublicShare;

  // API paths: public prefixes (Auth.js/watch/logout) allow immediately;
  // every other /api/* path is either allowed (session present) or denied
  // with 401 JSON — never bounced to the HTML login page.
  if (isApiPath(params.pathname)) {
    if (isPublicApiPath(params.pathname)) return "allow";
    return isAuthenticated ? "allow" : "deny-api";
  }

  if (isAuthenticated && isAuthPage) return "redirect-home";
  if (!isAuthenticated && !isAuthPage && !isPublic) return "redirect-login";
  return "allow";
}
