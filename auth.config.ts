import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";
import { isAuthEnabled, resolveAuthGate } from "@/lib/auth-mode";

/**
 * Edge-safe Auth.js configuration.
 *
 * This module must only import code that runs on the Edge runtime: no Prisma,
 * no bcryptjs (Node-only). The Credentials `authorize` (which needs the database)
 * is injected in `auth.ts` which runs in the Node runtime.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  // Credentials `authorize` is added in auth.ts (Node runtime).
  providers: [],
  callbacks: {
    /**
     * Persist the database user id into the JWT at sign-in so the session
     * carries the id the user-scoped /api/teams routes depend on. NextAuth's
     * default JWT only maps the first sign-in `user`, and DROPS `user.id`
     * unless copied here — without this the scoped API would always see
     * `session.user.id == null` and return 401.
     */
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        // Keep `sub` stable (the AuthorizationId) alongside the app id.
        token.sub = user.id;
      }
      // RAU-52: role rides the JWT so the client nav can show/hide the dev
      // section. Snapshot at sign-in (promotion needs re-login for the nav);
      // the dev API routes always re-check the DB role.
      if (user && "role" in user && typeof (user as { role?: unknown }).role === "string") {
        token.role = (user as { role: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) {
        session.user = { ...session.user, id: token.id as string };
      }
      if (typeof token.role === "string") {
        session.user = { ...session.user, role: token.role };
      }
      return session;
    },
    authorized({ auth, request }) {
      const action = resolveAuthGate({
        auth,
        pathname: request.nextUrl.pathname,
        authEnabled: isAuthEnabled(),
      });

      if (action === "redirect-login") {
        return NextResponse.redirect(new URL("/login", request.nextUrl));
      }
      if (action === "redirect-home") {
        return NextResponse.redirect(new URL("/", request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
