export { auth as proxy } from "./auth";

// Proxy matcher (Next 16 convention). Gate every route EXCEPT the intentionally
// public Auth.js API (`/api/auth/*`), the capability-token share reads
// (`/api/watch/*`), the logout helper (`/api/logout`), Next.js internals, and
// any URL containing a file extension (e.g. favicon.ico).
//
// `/api/*` is now MATCHED: an unauthenticated hit on a protected API path is
// denied with 401 JSON from the `authorized` callback (never a /login
// redirect). Each API route still does its own `auth()` check — the proxy is
// defense-in-depth so a forgotten guard cannot ship as a public endpoint.
// `/login` and `/signup` stay matched so authenticated users are bounced home.
export const config = {
  matcher: [
    "/((?!api/auth|api/watch|api/logout|_next/static|_next/image|.*\\..*).*)",
  ],
};
