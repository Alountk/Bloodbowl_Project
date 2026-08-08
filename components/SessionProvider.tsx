"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";

/**
 * Client-side wrapper around Auth.js's SessionProvider so it can be mounted
 * from the (server) root layout. Makes `useSession` available app-wide.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return <NextAuthSessionProvider>{children}</NextAuthSessionProvider>;
}
