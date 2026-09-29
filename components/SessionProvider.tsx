"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

/**
 * Client-side wrapper around Auth.js's SessionProvider so it can be mounted
 * from the (server) root layout. Makes `useSession` available app-wide.
 *
 * `session` is the session the root layout already resolved server-side via
 * `auth()`. Passing it is what makes the first paint real markup:
 *
 * - With a value (a `Session` or `null`) Auth.js initialises `loading` to
 *   `false`, so `useSession()` reports `authenticated`/`unauthenticated`
 *   synchronously on the very first render — during SSR as well as on
 *   hydration. `SessionAppProvider` therefore renders the actual shell instead
 *   of its "Loading…" placeholder, and no `/api/auth/session` round-trip is
 *   needed before the page is usable.
 * - Leaving it `undefined` keeps the legacy behaviour: status starts at
 *   `loading` and every non-exempt route server-renders only "Loading…".
 *
 * The prop must stay optional because the root layout is the only caller that
 * has a server-resolved session; tests and stories may render the wrapper
 * without one.
 */
export function SessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session?: Session | null;
}) {
  return (
    <NextAuthSessionProvider session={session}>{children}</NextAuthSessionProvider>
  );
}
